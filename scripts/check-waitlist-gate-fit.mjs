// Waitlist-shelf check — run after touching IntakePausedGate, the mobile
// plan page's empty state, or the mobile explore stack:
//
//   npm run dev                              (in another terminal)
//   npm run check:waitlist-gate-fit
//   node scripts/check-waitlist-gate-fit.mjs http://localhost:3000
//
// WHY THIS EXISTS. During the seasonal pause the mobile plan surfaces run
// on the SHELF contract (owner call, 2026-09-08): the waitlist card renders
// IN FLOW as the hero — no frosted overlay — and everything below it stays
// readable: "Your setup" on the plan page, the priced plan stack on
// explore. The old overlay version painted up to 122px over the card below
// it (an overlay sized to one surface must be re-fitted to every surface it
// mounts on; in-flow layout cannot have that bug class), and it hid every
// price behind a blur.
//
// The contract: on the compact plan surfaces while intake is paused, the
// waitlist card sits fully ABOVE the next card with no intersection, and
// no frosted overlay exists in the mobile tree — the shelf stays readable.
//
// No unit test can see this. It is boxes and paint order on a real
// viewport; the same markup passes on desktop (which keeps its overlay)
// and used to fail on a phone.
//
// METHOD. Load the plan page's fixture states (?preview=1&state=…) for both
// waitlist looks on both mobile surfaces at three phone widths and compare
// the painted boxes.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:3000'

// Both looks of the card — offer ("Save my spot") and joined ("Your spot
// is saved") — on both mobile surfaces.
const STATES = ['waitlist', 'waitlist-joined']
const ROUTES = [
  { label: 'plan', query: '', below: 'setup' },
  { label: 'explore', query: '&explore=1', below: 'stack' },
]

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

// Runs in the page: the in-flow waitlist card vs whatever sits below it,
// plus a sweep for any frosted overlay that should no longer exist.
// Data-attribute-free on purpose — this reads the same DOM a customer's
// browser paints. `below` is 'setup' (plan page) or 'stack' (explore).
function shelfBoxes(below) {
  const root = document.querySelector('.plan-mobile')
  if (!root) return { error: 'no .plan-mobile tree' }
  const painted = [...root.querySelectorAll('*')].filter(el => el.getBoundingClientRect().height > 0)
  const card = painted.find(el =>
    el.tagName === 'SECTION' && /Save my spot|Your spot is saved/.test(el.textContent))
  if (!card) return { error: 'waitlist card not painted' }
  let next = null
  if (below === 'setup') {
    // The setup card is the innermost container holding the whole block.
    next = painted.filter(el =>
      el.textContent.includes('Your setup') && el.textContent.includes('Allergens')).pop()
    if (!next) return { error: 'setup card not painted' }
  } else {
    // The shelf's first plan card — its price must be painted (readable),
    // which the old blur made impossible to guarantee.
    next = painted.find(el => el.tagName === 'BUTTON' && /AED \/ meal/.test(el.textContent))
    if (!next) return { error: 'no readable plan card in the stack' }
  }
  // No frosted overlay may exist during the pause on this surface any more.
  const frost = painted.find(el => {
    const cs = getComputedStyle(el)
    return cs.position === 'absolute' && ((cs.backdropFilter || cs.webkitBackdropFilter || '').includes('blur'))
  })
  const r = el => { const b = el.getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY } }
  return { card: r(card), next: r(next), frosted: !!frost }
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
    for (const route of ROUTES) {
      for (const state of STATES) {
        // Three attempts — a page measured while `npm run dev` recompiles can
        // report the tree before the card mounts, and a thin reading would
        // let a regression slip through green.
        let boxes = { error: 'never measured' }
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await page.goto(`${BASE}/dashboard/plan?preview=1${route.query}&state=${state}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
            await page.waitForFunction(() =>
              /Save my spot|Your spot is saved/.test(document.querySelector('.plan-mobile')?.textContent ?? ''),
              { timeout: 20_000 }).catch(() => {})
            await new Promise(r => setTimeout(r, 1200))   // entry animation settles
            boxes = await page.evaluate(shelfBoxes, route.below)
            if (!boxes.error) break
          } catch (err) {
            if (attempt === 3) throw err
          }
          await new Promise(r => setTimeout(r, 2000))
        }
        const tag = `${route.label}/${state} @ ${vp.label}`
        if (boxes.error) {
          failures.push(`${tag} — could not measure: ${boxes.error}`)
          console.log(`  ✗ ${tag} — ${boxes.error}`)
          continue
        }
        checked++
        const hits = []
        // Sub-pixel layout rounding is not an intrusion; a buried row is >1px.
        const overlap = boxes.card.bottom - boxes.next.top
        if (overlap > 1) hits.push(`card ${Math.round(overlap)}px into the card below`)
        if (boxes.frosted) hits.push('a frosted overlay is back in the mobile tree')
        if (hits.length) {
          failures.push(`${tag} — ${hits.join(', ')}`)
          console.log(`  ✗ ${tag} — ${hits.join(', ')}`)
        } else {
          console.log(`  ✓ ${tag} — card in flow above the shelf, no frost`)
        }
      }
    }
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} shelf reading(s) violate the pause contract.\n` +
    '  While intake is paused the waitlist card renders IN FLOW above a\n' +
    '  readable surface — no overlay, no intersection. See the inline\n' +
    '  variant in src/app/dashboard/_shared/IntakePausedGate.tsx and its\n' +
    '  mounts in _mobile/MobilePlan.tsx + _mobile/MobileExplore.tsx.')
  process.exit(1)
}
console.log(`\n✓ ${checked} shelf reading(s) keep the pause surfaces in flow and readable.`)
