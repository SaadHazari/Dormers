// Burger-clearance check — run after touching the dashboard shell, a
// dashboard page's top-of-page layout, or dashboard/layout.tsx:
//
//   npm run dev                                  (in another terminal)
//   npm run check:burger-clearance
//   node scripts/check-burger-clearance.mjs http://localhost:3000
//
// Why this exists: the drawer burger is a position:fixed overlay, so it takes
// no space in the flow and nothing moves out from under it on its own. In
// Aug 2026 the mobile-redesign block re-declared .dash-content's padding and
// silently dropped the 52px inset that used to reserve the burger's box. Every
// _mobile page survived (each indents its own title row past the burger), but
// NoPlanView — the one compact surface still rendering the desktop tree — spent
// months showing "Welcome back, <name>." underneath the burger on every phone.
// No unit test can see that: it is two boxes overlapping on a real viewport.
//
// The layout now reserves that box by DEFAULT (see THE BURGER CONTRACT in
// src/app/dashboard/layout.tsx). This check is the proof that it still does,
// on every dashboard route, at phone AND portrait-tablet width.
//
// Method: log in as a QA fixture account, walk the dashboard routes at two
// compact viewports, and fail if any visible text box intersects the burger's
// box. Uses the QA account whose dashboard renders the no-plan view, since that
// is the surface that has no mobile tree of its own to protect it.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const SLUG = process.env.QA_ACCOUNT || 'ended'   // renders NoPlanView (desktop tree, compact)
const PASSWORD = process.env.QA_PASSWORD || 'DormersQA!2026'
const EMAIL_BASE = process.env.QA_EMAIL_BASE || 'saadhazari01@gmail.com'

const ROUTES = [
  '/dashboard',
  '/dashboard/plan',
  '/dashboard/explore-plans',
  '/dashboard/menu',
  '/dashboard/credit',
  '/dashboard/history',
  '/dashboard/profile',
  '/dashboard/support',
  '/dashboard/dorm-wars',
]

// Both are COMPACT (see _shared/breakpoints.ts): a phone, and a portrait tablet
// — which renders the same drawer burger but a different content padding.
const VIEWPORTS = [
  { label: 'phone', width: 390, height: 844 },
  { label: 'portrait tablet', width: 820, height: 1180 },
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

// Runs in the page: the burger's box vs every visible text box on screen.
function collide() {
  // A route that fails to render (compile error, error boundary, redirect to a
  // page outside the shell) has no .dash-page. Report that instead of quietly
  // finding no burger and passing — a silent skip is how a broken page slips
  // through a green check.
  if (!document.querySelector('.dash-page')) return { shell: false, burger: null, hits: [] }
  const burger = document.querySelector('.dash-mobile-menu')
  if (!burger) return { shell: true, burger: null, hits: [] }
  const b = burger.getBoundingClientRect()
  if (b.width === 0 || b.height === 0) return { shell: true, burger: null, hits: [] }

  const hits = []
  const seen = new Set()
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walk.nextNode())) {
    const text = node.textContent.trim()
    if (!text) continue
    const el = node.parentElement
    if (!el || el.closest('.dash-mobile-menu')) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    const r = range.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const overlapX = Math.min(b.right, r.right) - Math.max(b.left, r.left)
    const overlapY = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top)
    if (overlapX > 0 && overlapY > 0) {
      const key = text.slice(0, 40)
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({ text: text.slice(0, 60), overlap: `${Math.round(overlapX)}x${Math.round(overlapY)}px` })
    }
  }
  return { shell: true, burger: [b.left, b.top, b.right, b.bottom].map(Math.round), hits }
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

const page = await browser.newPage()

try {
  // One session for the whole sweep; the viewport changes under it.
  await page.setViewport({ ...VIEWPORTS[0], deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  // Two attempts: pressing Enter before the form has hydrated submits it as a
  // plain GET and lands back on /login with the credentials in the query
  // string. Keyboard rather than click because in `npm run dev` the Next.js
  // error overlay renders a portal that can swallow pointer events.
  let signedIn = false
  for (let attempt = 1; attempt <= 2 && !signedIn; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForSelector('input[type="email"]', { timeout: 60_000 })
    await new Promise(r => setTimeout(r, attempt * 2000))   // let the form hydrate
    await page.type('input[type="email"]', emailFor(SLUG))
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
    console.error(`✗ Could not sign in as ${emailFor(SLUG)}. Check QA_PASSWORD / the fixture accounts.`)
    process.exit(1)
  }
  console.log(`• Signed in as ${emailFor(SLUG)}`)

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      // Animated greetings / banners settle in well under this.
      await new Promise(r => setTimeout(r, 2500))
      await page.evaluate(() => window.scrollTo(0, 0))
      await new Promise(r => setTimeout(r, 300))

      const { shell, burger, hits } = await page.evaluate(collide)
      if (!shell) {
        failures.push({ route, vp: vp.label, hits: [{ text: 'page did not render inside the dashboard shell', overlap: 'n/a' }] })
        console.log(`  ✗ ${route} [${vp.label}] — did not render inside the dashboard shell`)
        continue
      }
      if (!burger) {
        failures.push({ route, vp: vp.label, hits: [{ text: 'no drawer burger rendered at a compact width', overlap: 'n/a' }] })
        console.log(`  ✗ ${route} [${vp.label}] — no drawer burger at a compact width`)
        continue
      }
      if (hits.length) {
        failures.push({ route, vp: vp.label, hits })
        console.log(`  ✗ ${route} [${vp.label}] — ${hits.map(h => `"${h.text}" (${h.overlap})`).join(', ')}`)
      } else {
        console.log(`  ✓ ${route} [${vp.label}]`)
      }
    }
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} surface(s) failed.\n` +
    '  Either let the shell reserve the burger box (the default — remove the\n' +
    '  .owns-burger-row class from that page\'s root), or lay the page\'s own\n' +
    '  header out beside the burger the way _mobile/kit.tsx does.\n' +
    '  See THE BURGER CONTRACT in src/app/dashboard/layout.tsx.')
  process.exit(1)
}
console.log('\n✓ Every dashboard surface clears the drawer burger.')
