// Reload-flash check — run after touching anything that paints before the
// dashboard hydrates: dashboard/page.tsx's Suspense fallback, a route's
// loading.tsx, dashboard/layout.tsx, the shell and drawer, a `<style jsx>`
// block, or the root layout's StyledJsxRegistry:
//
//   npm run dev                          (in another terminal)
//   npm run check:reload-flash
//   node scripts/check-reload-flash.mjs http://localhost:3000 [route-name]
//
// WHY THIS EXISTS. Reloading the phone home painted three wrong things before
// the real page, and every screenshot of the settled page looked fine:
//   • a sharp-cornered navy box. page.tsx's Suspense fallback was a
//     full-height #091825 spinner; the server streamed it ahead of
//     ClientDashboard and React's reveal throttle held it for ~300ms.
//   • the desktop rail, and then the desktop home cards squeezed into the
//     phone. Every `<style jsx>` block (the drawer's off-canvas rule, the
//     burger, the desktop/mobile tree toggles) was client-only, because the
//     App Router does not server-render styled-jsx without a registry. That
//     lasted ~200ms on a fast machine and ~7s on a throttled one.
// This watches the document from its first byte instead.
//
// METHOD. Load each preview route at a phone viewport, then reload it with the
// CPU throttled 4x (a mid-range phone, and a wider window for a regression to
// show in) while a script installed before any page code re-checks the page
// on every DOM mutation and animation frame. A route fails if, at any moment:
//   – a near-opaque navy block covering a third of the viewport is visible
//     inside the content column;
//   – the drawer is on screen while closed;
//   – a desktop breakpoint tree (any `*-desktop` class) is visible.
// Dorm Wars is left out: its hub is navy full-bleed by design.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const ONLY = process.argv[3] ?? null

const ROUTES = [
  { name: 'home',    url: '/dashboard?preview=1&verified=1', ready: '.mhome-root' },
  { name: 'plan',    url: '/dashboard/plan?preview=1&state=active' },
  { name: 'menu',    url: '/dashboard/menu?preview=1&state=active' },
  { name: 'profile', url: '/dashboard/profile?preview=1&state=verified' },
  { name: 'history', url: '/dashboard/history?preview=1' },
  { name: 'credit',  url: '/dashboard/credit?preview=1' },
  { name: 'support', url: '/dashboard/support?preview=1' },
].filter(r => !ONLY || r.name === ONLY)

// iPhone 15 — COMPACT (see src/app/dashboard/_shared/breakpoints.ts).
const VIEWPORT = { width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true }

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

// Installed before any page code. Records the FIRST sighting of each flash.
function watchForFlashes() {
  const hits = { navy: null, drawer: null, desktopTree: null, sawShell: false }
  window.__flash = hits
  const t0 = performance.now()
  const at = () => `${Math.round(performance.now() - t0)}ms`
  const shown = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.hidden) return false
      const cs = getComputedStyle(n)
      if (cs.display === 'none' || cs.visibility === 'hidden') return false
    }
    return true
  }
  const onScreen = (el) => {
    const r = el.getBoundingClientRect()
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0)
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)
    return w > 1 && h > 1 ? w * h : 0
  }
  const look = () => {
    if (document.querySelector('.dash-page')) hits.sawShell = true
    if (!hits.drawer) {
      const s = document.querySelector('.dash-sidebar')
      if (s && s.dataset.open !== 'true' && shown(s) && onScreen(s)) {
        const r = s.getBoundingClientRect()
        hits.drawer = `${at()}: closed drawer on screen, x ${Math.round(r.left)}–${Math.round(r.right)}px`
      }
    }
    if (!hits.desktopTree) {
      for (const el of document.querySelectorAll('[class*="-desktop"]')) {
        const cls = [...el.classList].find(c => c.endsWith('-desktop'))
        if (cls && shown(el) && onScreen(el)) { hits.desktopTree = `${at()}: .${cls} painted`; break }
      }
    }
    if (!hits.navy) {
      const content = document.querySelector('.dash-content')
      if (content) for (const el of content.querySelectorAll('div, section, main')) {
        const m = getComputedStyle(el).backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/)
        if (!m || Math.max(+m[1], +m[2], +m[3]) > 40 || (m[4] !== undefined && +m[4] < 0.9)) continue
        if (onScreen(el) > innerWidth * innerHeight / 3 && shown(el)) {
          const r = el.getBoundingClientRect()
          hits.navy = `${at()}: ${getComputedStyle(el).backgroundColor} block ${Math.round(r.width)}×${Math.round(r.height)}px`
          break
        }
      }
    }
  }
  new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true })
  const loop = () => { look(); if (performance.now() - t0 < 20000) requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
}

const exe = resolveChrome()
if (!exe) {
  console.error('✗ No Chrome/Chromium found for puppeteer-core.\n' +
    '  Install once with:  npx @puppeteer/browsers install chrome@stable\n' +
    '  (or set PUPPETEER_EXECUTABLE_PATH to a Chrome binary).')
  process.exit(1)
}

try {
  const res = await fetch(`${BASE}/dashboard?preview=1`, { redirect: 'manual' })
  if (!res.ok && res.status < 300) throw new Error(`HTTP ${res.status}`)
} catch (err) {
  console.error(`✗ ${BASE} is not answering (${err.message}). Start the app first: npm run dev`)
  process.exit(1)
}

const browser = await puppeteer.launch({ executablePath: exe, headless: true })
const failures = []
let checked = 0

try {
  for (const route of ROUTES) {
    const page = await browser.newPage()
    await page.setViewport(VIEWPORT)
    await page.evaluateOnNewDocument(watchForFlashes)
    let hits = null
    try {
      // Warm load first: `npm run dev` compiles on the first hit, and a
      // compile stall is not what a customer's reload looks like.
      await page.goto(`${BASE}${route.url}`, { waitUntil: 'load', timeout: 120_000 })
      await page.waitForSelector(route.ready ?? '.dash-content', { timeout: 30_000 })
      await new Promise(r => setTimeout(r, 1500))

      await page.emulateCPUThrottling(4)
      await page.reload({ waitUntil: 'load', timeout: 120_000 })
      await page.waitForSelector(route.ready ?? '.dash-content', { visible: true, timeout: 60_000 })
      await new Promise(r => setTimeout(r, 2500))   // hydration under throttle
      await page.emulateCPUThrottling(null)
      hits = await page.evaluate(() => window.__flash)
    } catch (err) {
      failures.push(`${route.name} — could not measure: ${err.message.split('\n')[0]}`)
      console.log(`  ✗ ${route.name} — ${err.message.split('\n')[0]}`)
      await page.close()
      continue
    }
    await page.close()

    if (!hits?.sawShell) {
      failures.push(`${route.name} — could not measure: the dashboard shell never painted`)
      console.log(`  ✗ ${route.name} — the dashboard shell never painted`)
      continue
    }
    checked++
    const found = [hits.navy, hits.drawer, hits.desktopTree].filter(Boolean)
    if (found.length) {
      failures.push(`${route.name} — ${found.join('; ')}`)
      console.log(`  ✗ ${route.name} — ${found.join('; ')}`)
    } else {
      console.log(`  ✓ ${route.name} — reload paints no navy block, no stray drawer, no desktop tree`)
    }
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} route(s) flash something wrong while reloading on a phone.\n` +
    '  A navy block means a Suspense fallback or loading state that is not the\n' +
    '  route skeleton (see dashboard/page.tsx). A stray drawer or desktop tree\n' +
    '  means a `<style jsx>` rule did not reach the server HTML — check that\n' +
    '  src/app/layout.tsx still wraps the app in StyledJsxRegistry.')
  process.exit(1)
}
console.log(`\n✓ ${checked} route(s) reload on a phone without a flash.`)
