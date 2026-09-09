// Waitlist-shelf check — run after touching IntakePausedGate or any surface
// that mounts it (mobile/desktop plan + explore, the dashboard home's
// NoPlanView):
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
// The contract splits by breakpoint (owner calls, 2026-09-08/09):
//   COMPACT — the shelf: the card sits IN FLOW fully above the content
//   below it, and no frosted overlay exists in the painted tree.
//   EXPANDED — the tease: the warm-glass pane IS present over the surface,
//   and the card sits fully INSIDE its pane (the original overlap bug was
//   exactly a card outgrowing its pane).
//
// No unit test can see this. It is boxes and paint order on a real
// viewport; the bug class it guards against only ever showed at specific
// widths.
//
// METHOD. Load the preview fixtures for both waitlist looks on every
// surface that mounts the card — plan + explore (?preview=1&state=…) and
// the dashboard home (?preview=1&paused=1&nosub=1) — at three phone widths
// and at 1280, and compare the painted boxes.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:3000'

// Both looks of the card — offer ("Save my spot") and joined ("Your spot
// is saved") — on every surface that mounts it. `anchor` names what must
// stay clear BELOW the card: the plan page's setup card, the explore
// stack's first plan card (mobile) or the #plans-grid (desktop), or
// nothing (home / desktop plan render reference content whose shape
// varies — there the contract is card-in-flow + no frost).
const MOBILE = [
  { label: '360', width: 360, height: 780, mobile: true },
  { label: '390', width: 390, height: 844, mobile: true },
  { label: '430', width: 430, height: 932, mobile: true },
]
const DESKTOP = [{ label: '1280', width: 1280, height: 900, mobile: false }]
const planStates = s => [
  { name: 'waitlist', url: `/dashboard/plan?preview=1${s}&state=waitlist` },
  { name: 'waitlist-joined', url: `/dashboard/plan?preview=1${s}&state=waitlist-joined` },
]
const homeStates = [
  { name: 'waitlist', url: '/dashboard?preview=1&paused=1&nosub=1&joined=0' },
  { name: 'waitlist-joined', url: '/dashboard?preview=1&paused=1&nosub=1' },
]
const RUNS = [
  { label: 'plan', states: planStates(''), viewports: MOBILE, anchor: 'setup' },
  { label: 'plan', states: planStates(''), viewports: DESKTOP, anchor: 'none' },
  { label: 'explore', states: planStates('&explore=1'), viewports: MOBILE, anchor: 'stackMobile' },
  { label: 'explore', states: planStates('&explore=1'), viewports: DESKTOP, anchor: 'none' },
  { label: 'home', states: homeStates, viewports: [...MOBILE, ...DESKTOP], anchor: 'none' },
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
// Scoped to the PAINTED document (height > 0), which naturally excludes
// whichever breakpoint tree is display:none. Data-attribute-free on
// purpose — this reads the same DOM a customer's browser paints.
function shelfBoxes(anchor) {
  const painted = [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().height > 0)
  // Innermost match — document order lists ancestors first, and a page
  // wrapper <section> containing the card's text must not shadow the card.
  const card = painted.filter(el =>
    el.tagName === 'SECTION' && /Save my spot|Your spot is saved/.test(el.textContent)).pop()
  if (!card) return { error: 'waitlist card not painted' }
  let next = null
  if (anchor === 'setup') {
    next = painted.filter(el =>
      el.textContent.includes('Your setup') && el.textContent.includes('Allergens')).pop()
    if (!next) return { error: 'setup card not painted' }
  } else if (anchor === 'stackMobile') {
    next = painted.find(el => el.tagName === 'BUTTON' && /AED \/ meal/.test(el.textContent))
    if (!next) return { error: 'no readable plan card in the stack' }
  } else if (anchor === 'grid') {
    next = document.getElementById('plans-grid')
    if (!next || next.getBoundingClientRect().height === 0) return { error: 'plans grid not painted' }
  }
  // No frosted overlay may exist during the pause on any surface any more.
  const frost = painted.find(el => {
    const cs = getComputedStyle(el)
    return cs.position === 'absolute' && ((cs.backdropFilter || cs.webkitBackdropFilter || '').includes('blur'))
  })
  const r = el => { const b = el.getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY } }
  return { card: r(card), next: next ? r(next) : null, frost: frost ? r(frost) : null }
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
  for (const run of RUNS) {
    for (const vp of run.viewports) {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile })
      for (const state of run.states) {
        // Three attempts — a page measured while `npm run dev` recompiles can
        // report the tree before the card mounts, and a thin reading would
        // let a regression slip through green.
        let boxes = { error: 'never measured' }
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await page.goto(`${BASE}${state.url}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
            await page.waitForFunction(() =>
              /Save my spot|Your spot is saved/.test(document.body?.textContent ?? ''),
              { timeout: 20_000 }).catch(() => {})
            await new Promise(r => setTimeout(r, 1200))   // entry animation settles
            boxes = await page.evaluate(shelfBoxes, run.anchor)
            if (!boxes.error) break
          } catch (err) {
            if (attempt === 3) throw err
          }
          await new Promise(r => setTimeout(r, 2000))
        }
        const tag = `${run.label}/${state.name} @ ${vp.label}`
        if (boxes.error) {
          failures.push(`${tag} — could not measure: ${boxes.error}`)
          console.log(`  ✗ ${tag} — ${boxes.error}`)
          continue
        }
        checked++
        const hits = []
        // Sub-pixel layout rounding is not an intrusion; a buried row is >1px.
        if (vp.mobile) {
          if (boxes.next) {
            const overlap = boxes.card.bottom - boxes.next.top
            if (overlap > 1) hits.push(`card ${Math.round(overlap)}px into the content below`)
          }
          if (boxes.frost) hits.push('a frosted overlay is in the compact tree')
        } else {
          if (!boxes.frost) hits.push('the warm-glass pane is missing')
          else {
            const spill = boxes.card.bottom - boxes.frost.bottom
            if (spill > 1) hits.push(`card ${Math.round(spill)}px past its pane`)
          }
        }
        if (hits.length) {
          failures.push(`${tag} — ${hits.join(', ')}`)
          console.log(`  ✗ ${tag} — ${hits.join(', ')}`)
        } else {
          console.log(`  ✓ ${tag} — ${vp.mobile ? 'card in flow, no frost' : 'card on its pane, pane on its surface'}`)
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
    '  readable surface — no overlay, no intersection — on every surface.\n' +
    '  See src/app/dashboard/_shared/IntakePausedGate.tsx and its mounts in\n' +
    '  _mobile/MobilePlan.tsx, _mobile/MobileExplore.tsx, NoPlanView.tsx,\n' +
    '  and plan/PlanClient.tsx.')
  process.exit(1)
}
console.log(`\n✓ ${checked} shelf reading(s) keep the pause surfaces in flow and readable.`)
