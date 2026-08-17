// Asserts the dashboard layout contract across 11 real device geometries.
//
// WHY THIS EXISTS. The dashboard has two layouts and one switch between them
// (src/app/dashboard/_shared/breakpoints.ts). The switch cannot be expressed
// with a width alone: iPad Pro 12.9 PORTRAIT and iPad mini LANDSCAPE are both
// exactly 1024px wide and must resolve OPPOSITE ways. Those two rows are the
// point of this file — if someone "simplifies" the contract back to a plain
// max-width, they are the assertions that fail.
//
// Screenshots cannot serve as the regression guard here: the greeting copy and
// delivery ETA move with the clock, so no two runs are pixel-comparable. This
// asserts computed layout state instead.
//
// USAGE
//   1. npm run dev                       (must be serving on :3000)
//   2. npx tsx scripts/seed-test-accounts.ts   (once, if the QA fixtures are gone)
//   3. node scripts/check-layout-contract.mjs
//
// DEPENDENCY. Uses playwright-core against the Chromium already cached at
// ~/Library/Caches/ms-playwright/. It is deliberately NOT a package.json
// dependency — this is a local verification tool, not part of the build. If the
// module is missing:
//   npm install --prefix /tmp/pw-runner playwright-core --no-save
//   cd /tmp/pw-runner && node <path-to-this-file>
// If the cached Chromium revision has moved on, update CHROME below.

import { createRequire } from 'module'
import os from 'os'
import path from 'path'

// playwright-core is intentionally not a package.json dependency (see header).
// ESM resolves relative to THIS file, not cwd, and ignores NODE_PATH — so fall
// back to an explicit module root when the repo has no local copy.
let chromium
try {
  ({ chromium } = await import('playwright-core'))
} catch {
  const root = process.env.PW_MODULES || '/tmp/pw-runner/'
  try {
    ({ chromium } = createRequire(root)('playwright-core'))
  } catch {
    console.error(
      'playwright-core not found.\n' +
      '  npm install --prefix /tmp/pw-runner playwright-core --no-save\n' +
      '  then re-run, or set PW_MODULES to a directory that has it.',
    )
    process.exit(2)
  }
}

const CHROME = process.env.PW_CHROME || path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell',
)
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const EMAIL = process.env.QA_EMAIL || 'saadhazari01+qa-max@gmail.com'
const PASSWORD = process.env.QA_PASSWORD || 'DormersQA!2026'

// expect: 'compact' = mobile tree + drawer; 'expanded' = desktop tree + rail
const CASES = [
  { name: 'iPhone portrait',         w: 390,  h: 844,  expect: 'compact' },
  { name: 'iPhone landscape',        w: 844,  h: 390,  expect: 'compact' },
  { name: 'iPad mini portrait',      w: 768,  h: 1024, expect: 'compact' },
  { name: 'iPad Air portrait',       w: 820,  h: 1180, expect: 'compact' },
  { name: 'iPad Pro 11 portrait',    w: 834,  h: 1194, expect: 'compact' },
  { name: 'iPad Pro 12.9 portrait',  w: 1024, h: 1366, expect: 'compact' },  // pair
  { name: 'iPad mini landscape',     w: 1024, h: 768,  expect: 'expanded' }, // pair
  { name: 'iPad Air landscape',      w: 1180, h: 820,  expect: 'expanded' },
  { name: 'iPad Pro 12.9 landscape', w: 1366, h: 1024, expect: 'expanded' },
  { name: 'Laptop',                  w: 1440, h: 900,  expect: 'expanded' },
  { name: 'Desktop',                 w: 1920, h: 1080, expect: 'expanded' },
]

const browser = await chromium.launch({ executablePath: CHROME })

const auth = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const ap = await auth.newPage()
ap.setDefaultTimeout(120000)
ap.setDefaultNavigationTimeout(120000)
await ap.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await ap.fill('input[name="email"]', EMAIL)
await ap.fill('input[name="password"]', PASSWORD)
await Promise.all([
  ap.waitForURL((u) => !u.pathname.includes('/login')),
  ap.click('button[type="submit"]'),
])

// Clear any once-per-cycle takeover so every case measures the dashboard
// itself. These dismissals are localStorage-only — no server mutation.
for (let i = 0; i < 3; i++) {
  await ap.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await ap.waitForTimeout(2000)
  const hit = await ap.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      /plan options|got it|continue|dismiss|okay/i.test(x.textContent || ''))
    if (b) { b.click(); return true }
    return false
  })
  if (!hit) break
  await ap.waitForTimeout(1200)
}
const storageState = await auth.storageState()
await auth.close()

const rows = []
for (const c of CASES) {
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: c.h },
    deviceScaleFactor: 1,
    hasTouch: c.w < 1400,
    isMobile: c.w < 1400,
    reducedMotion: 'reduce',
    storageState,
  })
  const page = await ctx.newPage()
  page.setDefaultTimeout(120000)
  page.setDefaultNavigationTimeout(120000)
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  const m = await page.evaluate(() => {
    const disp = (sel) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el).display : 'absent'
    }
    const sb = document.querySelector('.dash-sidebar')
    const content = document.querySelector('.dash-content')
    return {
      mobileTree: disp('.home-mobile'),
      desktopTree: disp('.home-desktop'),
      sidebarTransform: sb ? getComputedStyle(sb).transform : 'absent',
      contentMarginLeft: content ? getComputedStyle(content).marginLeft : 'absent',
      docHeight: document.documentElement.scrollHeight,
    }
  })

  // A drawer is translated fully off-canvas; a rail is not translated at all.
  const drawer = m.sidebarTransform !== 'none' && m.sidebarTransform !== 'absent'
  const actual =
    m.mobileTree === 'block' && drawer ? 'compact'
    : m.desktopTree !== 'none' && !drawer ? 'expanded'
    : 'MIXED'

  rows.push({ ...c, actual, pass: actual === c.expect, ...m })
  await ctx.close()
}

await browser.close()

let failed = 0
console.log('')
console.log('     viewport                   size        expect    actual    tree(m/d)     sidebar  margin  height')
console.log('─'.repeat(104))
for (const r of rows) {
  if (!r.pass) failed++
  console.log(
    `${r.pass ? 'PASS' : 'FAIL'} ${r.name.padEnd(26)} ${(r.w + 'x' + r.h).padEnd(11)} ` +
    `${r.expect.padEnd(9)} ${r.actual.padEnd(9)} ${(r.mobileTree + '/' + r.desktopTree).padEnd(13)} ` +
    `${(r.sidebarTransform === 'none' ? 'rail' : 'drawer').padEnd(8)} ${r.contentMarginLeft.padEnd(7)} ${r.docHeight}`,
  )
}
console.log('')
console.log(failed === 0 ? `ALL ${rows.length} PASS` : `${failed} of ${rows.length} FAILED`)
process.exit(failed === 0 ? 0 : 1)
