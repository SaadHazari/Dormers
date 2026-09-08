// Waitlist-gate fit check — run after touching IntakePausedGate or the
// mobile plan page's empty state:
//
//   npm run dev                              (in another terminal)
//   npm run check:waitlist-gate-fit
//   node scripts/check-waitlist-gate-fit.mjs http://localhost:3000
//
// WHY THIS EXISTS. IntakePausedGate frosts whatever surface it is mounted
// over with an overlay sized to THAT surface — while the waitlist card
// inside it is sized to its own content. On desktop the gate covers the
// tall plan hero and the card fits with room to spare. On the mobile plan
// page it covers the short "No active plan" card (~290px) while the card
// needs ~400px, and because an overlay contributes nothing to layout, the
// excess silently painted 83px deep into the "Your setup" card below —
// burying its header, the Adjust button, and the Dorm/Spice labels.
//
// The contract: on the compact plan page, the waitlist card stays inside
// its own frosted backdrop, and neither the card nor the frost intrudes
// into the "Your setup" card below.
//
// No unit test can see this. It is two content-sized boxes and a z-index
// on a real viewport; the same markup passes on desktop and fails on a phone.
//
// METHOD. Load the plan page's fixture states (?preview=1&state=…) for both
// waitlist looks at three phone widths and compare the painted boxes.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:3000'

// Both looks of the gate — the join offer is ~90px taller than the joined
// confirmation, so the offer is the one that breaks first.
const STATES = ['waitlist', 'waitlist-joined']

const VIEWPORTS = [
  { label: '360', width: 360, height: 780 },
  { label: '390', width: 390, height: 844 },
  { label: '430', width: 430, height: 932 },
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

// Runs in the page: the gate card vs its frosted backdrop vs the setup card.
// Data-attribute-free on purpose — this reads the same DOM a customer's
// browser paints.
function gateBoxes() {
  const root = document.querySelector('.plan-mobile')
  if (!root) return { error: 'no .plan-mobile tree' }
  const painted = [...root.querySelectorAll('div,section')]
    .filter(el => el.getBoundingClientRect().height > 0)
  // The waitlist card is the gate's one sticky child, in either look.
  const card = painted.find(el =>
    getComputedStyle(el).position === 'sticky' &&
    /Save my spot|You are on our waitlist/.test(el.textContent))
  if (!card) return { error: 'gate card not painted' }
  // Its parent is the frosted backdrop, however that backdrop is positioned.
  const frost = card.parentElement
  // The setup card is the innermost container holding the whole setup block.
  const setup = painted.filter(el =>
    el.textContent.includes('Your setup') && el.textContent.includes('Allergens')).pop()
  if (!setup) return { error: 'setup card not painted' }
  const r = el => { const b = el.getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY } }
  return { card: r(card), frost: r(frost), setup: r(setup) }
}

const exe = resolveChrome()
if (!exe) {
  console.error('✗ No Chrome/Chromium found for puppeteer-core.\n' +
    '  Install once with:  npx @puppeteer/browsers install chrome@stable\n' +
    '  (or set PUPPETEER_EXECUTABLE_PATH to a Chrome binary).')
  process.exit(1)
}

try {
  const res = await fetch(`${BASE}/dashboard/plan?preview=1`, { redirect: 'manual' })
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
      // report the tree before the gate mounts, and a thin reading would let
      // a regression slip through green.
      let boxes = { error: 'never measured' }
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await page.goto(`${BASE}/dashboard/plan?preview=1&state=${state}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
          await page.waitForFunction(() =>
            /Save my spot|You are on our waitlist/.test(document.querySelector('.plan-mobile')?.textContent ?? ''),
            { timeout: 20_000 }).catch(() => {})
          await new Promise(r => setTimeout(r, 1200))   // entry animation settles
          boxes = await page.evaluate(gateBoxes)
          if (!boxes.error) break
        } catch (err) {
          if (attempt === 3) throw err
        }
        await new Promise(r => setTimeout(r, 2000))
      }
      if (boxes.error) {
        failures.push(`${state} @ ${vp.label} — could not measure: ${boxes.error}`)
        console.log(`  ✗ ${state} @ ${vp.label} — ${boxes.error}`)
        continue
      }
      checked++
      const hits = []
      // Sub-pixel layout rounding is not an intrusion; a buried row is >1px.
      const pastFrost = boxes.card.bottom - boxes.frost.bottom
      if (pastFrost > 1) hits.push(`card ${Math.round(pastFrost)}px past its frost`)
      const intoSetupCard = boxes.card.bottom - boxes.setup.top
      if (intoSetupCard > 1) hits.push(`card ${Math.round(intoSetupCard)}px into "Your setup"`)
      const intoSetupFrost = boxes.frost.bottom - boxes.setup.top
      if (intoSetupFrost > 1) hits.push(`frost ${Math.round(intoSetupFrost)}px into "Your setup"`)
      if (hits.length) {
        failures.push(`${state} @ ${vp.label} — ${hits.join(', ')}`)
        console.log(`  ✗ ${state} @ ${vp.label} — ${hits.join(', ')}`)
      } else {
        console.log(`  ✓ ${state} @ ${vp.label} — card inside its frost, setup card clear`)
      }
    }
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} waitlist-gate reading(s) intrude on the card below.\n` +
    '  The gate must take real layout height on the compact plan page — see\n' +
    '  the stacked variant in src/app/dashboard/_shared/IntakePausedGate.tsx\n' +
    '  and the grid wrapper in src/app/dashboard/_mobile/MobilePlan.tsx.')
  process.exit(1)
}
console.log(`\n✓ ${checked} waitlist-gate reading(s) stay inside their own card.`)
