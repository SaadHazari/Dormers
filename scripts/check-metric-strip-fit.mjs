// Metric-strip fit check — run after touching CompactMetricStrip or any
// surface that feeds it:
//
//   npm run dev                              (in another terminal)
//   npm run check:metric-strip-fit
//   node scripts/check-metric-strip-fit.mjs http://localhost:3000
//
// WHY THIS EXISTS. CompactMetricStrip is a bordered band with
// `overflow: hidden` — the clip that keeps its rounded corners honest. Its
// values were also `white-space: nowrap`, written for the short numbers the
// strip was designed around ("17/20", "3 of 3"). A value that is a WORD does
// not fit that cell: on the staff plan the Pause cell says "Not included",
// which is 121px of ink in a 95px cell on a 390px phone, and the band silently
// sliced the last letter off — the strip read "Not include". The same cell
// says "Available" on a plan that CAN pause: 87px of ink, over the edge on any
// phone narrower than ~370px.
//
// The contract: no metric value is ever cut off. A value too wide for its cell
// wraps at a space, and a word-valued metric wears the smaller prose size —
// but the ink always stays inside the band.
//
// No unit test can see this. It is a string, a font, and a cell width on a
// real viewport; the same markup passes at 430px and fails at 360px.
//
// METHOD. Sign in as each QA fixture below, walk the routes that mount a strip
// at four compact widths, and compare every value's ink box against the box
// that clips it.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const PASSWORD = process.env.QA_PASSWORD || 'DormersQA!2026'
const EMAIL_BASE = process.env.QA_EMAIL_BASE || 'saadhazari01@gmail.com'

// staff: the Pause cell reads "Not included" — the value that broke it.
// max:   the fullest plan, and the Saved tile whose value carries "AED ".
const FIXTURES = process.env.QA_ACCOUNT ? [process.env.QA_ACCOUNT] : ['staff', 'max']

const ROUTES = ['/dashboard', '/dashboard/plan', '/dashboard/history']

// Every width the strip is asked to hold three cells at: the narrowest phone
// still in the wild, the two common ones, and a portrait tablet.
const VIEWPORTS = [
  { label: '320', width: 320, height: 690 },
  { label: '360', width: 360, height: 780 },
  { label: '390', width: 390, height: 844 },
  { label: '430', width: 430, height: 932 },
  { label: '820 tablet', width: 820, height: 1180 },
]

function emailFor(slug) {
  const [local, domain] = EMAIL_BASE.split('@')
  return `${local.split('+')[0]}+qa-${slug}@${domain}`
}

function findUnder(root, names) {
  if (!existsSync(root)) return null
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (names.includes(e.name)) return p
    }
  }
  return null
}

/** Any real Chrome will do — installed, puppeteer's cache, or Playwright's. */
function resolveChrome() {
  const direct = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean)
  for (const c of direct) if (existsSync(c)) return c
  return findUnder(join(homedir(), '.cache', 'puppeteer'),
      ['Google Chrome for Testing', 'chrome', 'chrome-headless-shell', 'Chromium', 'chromium'])
    ?? findUnder(join(homedir(), 'Library', 'Caches', 'ms-playwright'),
      ['chrome-headless-shell', 'Chromium'])
}

// Runs in the page: every strip cell's value ink vs the box that clips it.
function overflowing() {
  // The strip marks itself with role="group"; every cell is a direct child
  // whose second element child is the value. Data-attribute-free on purpose —
  // this reads the same DOM a customer's browser paints.
  const strips = [...document.querySelectorAll('[role="group"]')].filter(el => {
    const cs = getComputedStyle(el)
    return cs.display === 'grid' && cs.overflow === 'hidden' && el.children.length >= 2
  })
  const hits = []
  for (const strip of strips) {
    const sr = strip.getBoundingClientRect()
    if (sr.width === 0 || sr.height === 0) continue
    for (const cell of strip.children) {
      const value = cell.children[1]
      if (!value) continue
      const cr = cell.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(value)
      const ink = range.getBoundingClientRect()
      if (ink.width === 0) continue
      // Sub-pixel layout rounding is not a clip; a sliced glyph is >1px.
      const pastCell = ink.right - cr.right
      const pastStrip = ink.right - sr.right
      if (pastCell > 1 || pastStrip > 1) {
        hits.push({
          label: (cell.children[0]?.innerText ?? '').trim(),
          value: value.innerText.trim(),
          cut: `${Math.round(Math.max(pastCell, pastStrip))}px past the ${pastStrip > 1 ? 'band' : 'cell'}`,
        })
      }
    }
  }
  return { strips: strips.length, hits }
}

const exe = resolveChrome()
if (!exe) {
  console.error('✗ No Chrome/Chromium found for puppeteer-core.\n' +
    '  Install once with:  npx @puppeteer/browsers install chrome@stable\n' +
    '  (or set PUPPETEER_EXECUTABLE_PATH to a Chrome binary).')
  process.exit(1)
}

try {
  const res = await fetch(`${BASE}/login`, { redirect: 'manual' })
  if (!res.ok && res.status < 300) throw new Error(`HTTP ${res.status}`)
} catch (err) {
  console.error(`✗ ${BASE} is not answering (${err.message}). Start the app first: npm run dev`)
  process.exit(1)
}

const browser = await puppeteer.launch({ executablePath: exe, headless: true })
const failures = []
let stripsSeen = 0

try {
  for (const slug of FIXTURES) {
    // One isolated context per fixture — a shared cookie jar keeps the first
    // fixture signed in, and /login then redirects away before the form exists.
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    await page.setViewport({ ...VIEWPORTS[0], deviceScaleFactor: 2, isMobile: true, hasTouch: true })

    // Two attempts: pressing Enter before the form has hydrated submits it as
    // a plain GET and lands back on /login. Keyboard rather than click because
    // `npm run dev` renders an error-overlay portal that swallows clicks.
    let signedIn = false
    for (let attempt = 1; attempt <= 2 && !signedIn; attempt++) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      await page.waitForSelector('input[type="email"]', { timeout: 60_000 })
      await new Promise(r => setTimeout(r, attempt * 2000))
      await page.type('input[type="email"]', emailFor(slug))
      await page.type('input[type="password"]', PASSWORD)
      await page.keyboard.press('Enter')
      try {
        await page.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 45_000 })
        signedIn = true
      } catch {
        console.log(`  … sign-in attempt ${attempt} did not land on the dashboard, retrying`)
      }
    }
    if (!signedIn) {
      console.error(`✗ Could not sign in as ${emailFor(slug)}. Check QA_PASSWORD / the fixture accounts.`)
      process.exit(1)
    }
    console.log(`\n• Signed in as ${emailFor(slug)}`)

    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
      for (const route of ROUTES) {
        // Three attempts, keeping the richest reading. A page measured while
        // `npm run dev` recompiles (or mid client-side redirect) reports
        // "0 strips clear" or throws on a detached frame — either way a clipped
        // value would slip through green, so a thin reading is retried rather
        // than trusted.
        let strips = 0
        let hits = []
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 120_000 })
            // Wait for the band itself, not a fixed sleep — it mounts with the
            // client data. Routes with no strip just spend the timeout.
            await page.waitForSelector('[role="group"]', { timeout: 15_000 }).catch(() => {})
            await new Promise(r => setTimeout(r, 1200))   // banners/greetings settle
            const seen = await page.evaluate(overflowing)
            if (seen.strips >= strips) ({ strips, hits } = seen)
            if (seen.strips > 0) break
          } catch (err) {
            if (attempt === 3) throw err
            await new Promise(r => setTimeout(r, 2000))
          }
        }
        stripsSeen += strips
        if (hits.length) {
          failures.push({ slug, route, vp: vp.label, hits })
          console.log(`  ✗ ${route} [${slug} @ ${vp.label}] — ` +
            hits.map(h => `${h.label || '?'}: "${h.value}" ${h.cut}`).join(', '))
        } else {
          console.log(`  ✓ ${route} [${slug} @ ${vp.label}] — ${strips} strip(s) clear`)
        }
      }
    }
    await page.close()
    await ctx.close()
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} strip(s) cut a value off.\n` +
    '  A metric value must fit the cell that clips it. Give word values the\n' +
    '  prose size and let them wrap at a space — see the value block in\n' +
    '  src/app/dashboard/_shared/CompactMetricStrip.tsx — or shorten the copy\n' +
    '  the caller passes.')
  process.exit(1)
}
console.log(`\n✓ ${stripsSeen} metric strip(s) render every value inside the band.`)
