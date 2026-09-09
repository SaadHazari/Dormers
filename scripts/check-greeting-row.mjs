// Greeting-row check — run after touching the dashboard home's top-of-page
// layout (NoPlanView, _mobile/MobileHome, ActiveDashboard's compact tree)
// or dashboard/layout.tsx:
//
//   npm run dev                          (in another terminal)
//   npm run check:greeting-row
//   node scripts/check-greeting-row.mjs http://localhost:3000
//
// WHY THIS EXISTS. On a phone every dashboard-home shape opens with the
// customer's greeting in the drawer burger's row — beside the button, with
// nothing above it. Two shapes broke that and no test noticed:
//   • NoPlanView greeted RETURNING customers only. A brand-new signup — most
//     real accounts at the time — got no name on the page and an empty
//     burger row above the purchase gate. The preview fixture had even been
//     made returning so the screenshot survey looked right.
//   • The active mobile home mounted its purchase gates ABOVE the greeting,
//     so a gated customer saw the banner under the burger and the greeting
//     pushed beneath it.
// _shared/greeting.test.ts pins the source. This reads what the browser
// paints, which is the only place "beside the burger" exists.
//
// METHOD. Load every dashboard-home preview shape at three phone widths and
// a portrait tablet, then check the painted tree: the first visible text on
// the page belongs to the greeting, the greeting names the customer, its
// first line sits in the burger's row to the right of the button, whatever
// must sit below it does, and no text at all intersects the button.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:3000'

// Every shape the home renders for a customer without a plan (NoPlanView)
// and with one (MobileHome). The base fixture customer is unverified, so
// the unqualified shapes also carry the profile gate — which is the point:
// the gate has to paint BELOW the greeting. `below` names the text that
// must do so; `greeting` is the whole first line, name included.
const TIME_OF_DAY = /^Good (morning|afternoon|evening), Saad$/
const STATES = [
  { name: 'new-signup',        url: '/dashboard?preview=1&nosub=1&first=1',                   greeting: /^Welcome, Saad\.$/ },
  { name: 'new-signup-paused', url: '/dashboard?preview=1&nosub=1&first=1&paused=1&joined=0', greeting: /^Welcome, Saad\.$/,      below: /Seasonal break/ },
  { name: 'returning',         url: '/dashboard?preview=1&nosub=1',                           greeting: /^Welcome back, Saad\.$/, below: /Finish your profile/ },
  { name: 'returning-paused',  url: '/dashboard?preview=1&nosub=1&paused=1',                  greeting: /^Welcome back, Saad\.$/, below: /Your spot is saved/ },
  { name: 'active-gated',      url: '/dashboard?preview=1',                                   greeting: TIME_OF_DAY,              below: /Finish your profile/ },
  { name: 'active-fresh',      url: '/dashboard?preview=1&fresh=1',                           greeting: TIME_OF_DAY,              below: /Finish your profile/ },
]

// All COMPACT (see _shared/breakpoints.ts): three phones and a portrait
// tablet, which shows the same burger over different content padding.
const VIEWPORTS = [
  { label: '360', width: 360, height: 780 },
  { label: '390', width: 390, height: 844 },
  { label: '430', width: 430, height: 932 },
  { label: '820 tablet', width: 820, height: 1180 },
]

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

// Runs in the page. Reads the painted document only (boxes with size), which
// naturally skips whichever breakpoint tree is display:none.
function greetingRow(belowSource) {
  if (!document.querySelector('.dash-page')) return { error: 'no dashboard shell painted' }
  const burgerEl = document.querySelector('.dash-mobile-menu')
  const bb = burgerEl?.getBoundingClientRect()
  if (!bb || bb.width === 0 || bb.height === 0) return { error: 'no drawer burger painted' }
  const painted = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const ribbon = [...document.querySelectorAll('.noplan-greeting, .mhome-greeting')].find(painted)
  if (!ribbon) return { error: 'no greeting ribbon painted' }
  const line = ribbon.firstElementChild ?? ribbon
  const lr = line.getBoundingClientRect()

  // Every visible text box under the content column, in document order.
  const content = document.querySelector('.dash-content')
  const texts = []
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
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
    texts.push({ text, top: r.top, bottom: r.bottom, left: r.left, right: r.right, inRibbon: ribbon.contains(node) })
  }
  const below = belowSource ? texts.find(t => new RegExp(belowSource).test(t.text)) ?? null : null
  const onBurger = texts
    .filter(t => Math.min(bb.right, t.right) - Math.max(bb.left, t.left) > 0
              && Math.min(bb.bottom, t.bottom) - Math.max(bb.top, t.top) > 0)
    .map(t => t.text.slice(0, 40))
  return {
    burger: { top: bb.top, right: bb.right, bottom: bb.bottom },
    line: { text: line.textContent.trim(), top: lr.top, bottom: lr.bottom, left: lr.left },
    first: texts[0] ?? null,
    below: below && { text: below.text.slice(0, 40), top: below.top },
    onBurger,
  }
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
  const page = await browser.newPage()
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    for (const state of STATES) {
      // Three attempts — a page measured while `npm run dev` recompiles can
      // report the tree before the ribbon mounts, and a thin reading would
      // let a regression slip through green.
      let row = { error: 'never measured' }
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await page.goto(`${BASE}${state.url}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
          await page.waitForSelector('.noplan-greeting, .mhome-greeting', { timeout: 20_000 }).catch(() => {})
          await new Promise(r => setTimeout(r, 1500))   // entry animation settles
          row = await page.evaluate(greetingRow, state.below?.source ?? null)
          if (!row.error) break
        } catch (err) {
          if (attempt === 3) throw err
        }
        await new Promise(r => setTimeout(r, 2000))
      }
      const tag = `${state.name} @ ${vp.label}`
      if (row.error) {
        failures.push(`${tag} — could not measure: ${row.error}`)
        console.log(`  ✗ ${tag} — ${row.error}`)
        continue
      }
      checked++
      const hits = []
      if (!state.greeting.test(row.line.text)) hits.push(`greeting reads "${row.line.text}"`)
      if (!row.first) hits.push('no visible text at all')
      else if (!row.first.inRibbon) hits.push(`"${row.first.text.slice(0, 40)}" paints above the greeting`)
      const mid = (row.line.top + row.line.bottom) / 2
      if (mid < row.burger.top || mid > row.burger.bottom) hits.push(`greeting line centred at ${Math.round(mid)}px, burger row is ${Math.round(row.burger.top)}–${Math.round(row.burger.bottom)}px`)
      if (row.line.left < row.burger.right - 1) hits.push(`greeting starts ${Math.round(row.burger.right - row.line.left)}px under the burger`)
      if (state.below) {
        if (!row.below) hits.push(`"${state.below.source}" not painted`)
        else if (row.below.top < row.line.bottom - 1) hits.push(`"${row.below.text}" paints ${Math.round(row.line.bottom - row.below.top)}px into the greeting`)
      }
      if (row.onBurger.length) hits.push(`under the burger: ${row.onBurger.map(t => `"${t}"`).join(', ')}`)
      if (hits.length) {
        failures.push(`${tag} — ${hits.join('; ')}`)
        console.log(`  ✗ ${tag} — ${hits.join('; ')}`)
      } else {
        console.log(`  ✓ ${tag} — "${row.line.text}" beside the burger, nothing above it`)
      }
    }
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} greeting reading(s) break the burger-row contract.\n` +
    '  On a compact viewport the dashboard home opens with the customer\'s\n' +
    '  greeting beside the drawer burger and nothing above it, for every\n' +
    '  shape: new signup, returning, paused, and active (gated or not).\n' +
    '  See src/app/dashboard/NoPlanView.tsx, _mobile/MobileHome.tsx, and\n' +
    '  the compact tree in ActiveDashboard.tsx.')
  process.exit(1)
}
console.log(`\n✓ ${checked} greeting reading(s) sit beside the burger with nothing above them.`)
