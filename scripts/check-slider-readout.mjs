// Slider-readout clearance check — run after touching any sheet that pairs a
// range slider with a number the slider changes:
//
//   npm run dev                              (in another terminal)
//   npm run check:slider-readout
//   node scripts/check-slider-readout.mjs http://localhost:3000
//
// WHY THIS EXISTS. On a phone the finger that drags a range thumb sits ON the
// track and covers roughly a fingertip's worth of screen BELOW it. The savings
// benchmark sheet ("What do you usually spend ordering dinner?") shipped with
// its live AED readout 14px under the track, so the one number the customer is
// dragging TO was hidden by their own thumb for the whole gesture — they had to
// lift off to read the value they were setting. The live preview line
// underneath had the same problem.
//
// The contract: every piece of text a slider updates live must sit ABOVE the
// track, clear of the thumb band. No unit test can see this — it is two boxes
// and a finger on a real viewport.
//
// METHOD. Sign in as a QA fixture, open the sheet at phone width, snapshot
// every visible text node in the dialog, nudge the slider, snapshot again. Text
// that CHANGED is a live readout. Fail if any live readout lands in the band
// the thumb occludes.

import { existsSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:3000'
// qa-max: biggest plan, mid-cycle — the dashboard state that shows the savings
// tile and its "adjust your usual dinner spend" link.
const SLUG = process.env.QA_ACCOUNT || 'max'
const PASSWORD = process.env.QA_PASSWORD || 'DormersQA!2026'
const EMAIL_BASE = process.env.QA_EMAIL_BASE || 'saadhazari01@gmail.com'
const SHOTS = process.env.SHOT_DIR || null

// A fingertip covers ~44px (Apple's own minimum touch target) of screen below
// the point it presses. Anything inside that band under the track is unreadable
// mid-drag.
const THUMB_BAND = 44

const VIEWPORT = { width: 390, height: 844 }

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

// Runs in the page. Every visible text node inside the dialog, keyed by a path
// that survives a re-render, plus its rect.
function snapshotText() {
  const dialog = document.querySelector('[role="dialog"]')
  if (!dialog) return null
  const out = []
  const walk = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT)
  let node
  let i = 0
  while ((node = walk.nextNode())) {
    const text = (node.textContent || '').trim()
    if (!text) continue
    const el = node.parentElement
    if (!el) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    const r = range.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    out.push({ i: i++, text, top: r.top, bottom: r.bottom, left: r.left, right: r.right })
  }
  return out
}

function trackRect() {
  const input = document.querySelector('[role="dialog"] input[type="range"]')
  if (!input) return null
  const r = input.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
}

// Move a React-controlled range input the way a real drag would.
function nudge() {
  const input = document.querySelector('[role="dialog"] input[type="range"]')
  if (!input) return false
  const min = Number(input.min || 0)
  const max = Number(input.max || 100)
  const cur = Number(input.value)
  const next = cur === max ? min : max
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, String(next))
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  return true
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
const page = await browser.newPage()
const failures = []

try {
  await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

  let signedIn = false
  for (let attempt = 1; attempt <= 2 && !signedIn; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForSelector('input[type="email"]', { timeout: 60_000 })
    await new Promise(r => setTimeout(r, attempt * 2000))
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

  // Clear once-per-cycle takeovers so the dashboard itself is on screen.
  for (let i = 0; i < 4; i++) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await new Promise(r => setTimeout(r, 2500))
    const hit = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x =>
        /not now|got it|see your plan options|dismiss|continue|okay/i.test(x.textContent || '') &&
        !/save my spot|saving your spot|renew/i.test(x.textContent || ''))
      if (b) { b.click(); return true }
      return false
    })
    if (!hit) break
    await new Promise(r => setTimeout(r, 1200))
  }

  // Open the dinner-spend sheet. Which affordance is on screen depends on
  // whether the fixture has already set a benchmark: the dotted "add/adjust
  // your usual dinner spend" link before, the (i) beside the saved figure after.
  const opened = await page.evaluate(() => {
    const link = [...document.querySelectorAll('span,button,a,div')]
      .find(x => /usual dinner spend/i.test(x.textContent || '') && x.children.length === 0)
    if (link) { link.click(); return 'link' }
    const info = document.querySelector('button[aria-label="How your savings are worked out"]')
    if (info) { info.click(); return 'info' }
    return null
  })
  if (!opened) {
    console.error('✗ Could not find the dinner-spend affordance on /dashboard at phone width.')
    process.exit(1)
  }
  console.log(`• Opened the sheet from the ${opened} affordance`)
  await page.waitForSelector('[role="dialog"] input[type="range"]', { timeout: 20_000 })
  await new Promise(r => setTimeout(r, 900))   // let the sheet finish sliding up

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: join(SHOTS, 'savings-sheet.png') })
  }

  const before = await page.evaluate(snapshotText)
  await page.evaluate(nudge)
  await new Promise(r => setTimeout(r, 400))
  const after = await page.evaluate(snapshotText)
  const track = await page.evaluate(trackRect)

  if (!before || !after || !track) {
    console.error('✗ The sheet did not expose a dialog with a range input.')
    process.exit(1)
  }

  // Text that changed when the slider moved is a live readout.
  const live = after.filter(a => {
    const b = before.find(x => x.i === a.i)
    return b && b.text !== a.text
  })
  if (!live.length) {
    console.error('✗ Nudging the slider changed no text — the probe is not measuring the real readout.')
    process.exit(1)
  }
  console.log(`• Live readouts found: ${live.map(l => JSON.stringify(l.text)).join(', ')}`)
  console.log(`• Track band: y ${Math.round(track.top)}–${Math.round(track.bottom)} ` +
    `(occluded to ${Math.round(track.bottom + THUMB_BAND)})`)

  for (const l of live) {
    const occludedTo = track.bottom + THUMB_BAND
    const overlapsBand = l.top < occludedTo && l.bottom > track.top
    const overlapsX = Math.min(track.right, l.right) - Math.max(track.left, l.left) > 0
    if (overlapsBand && overlapsX) {
      failures.push({ text: l.text, top: Math.round(l.top), under: Math.round(l.top - track.bottom) })
      console.log(`  ✗ "${l.text}" sits ${Math.round(l.top - track.bottom)}px under the track — inside the thumb band`)
    } else {
      console.log(`  ✓ "${l.text}" clears the thumb band`)
    }
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} live readout(s) sit under the slider thumb.\n` +
    '  Move every slider-driven number ABOVE the track. The finger doing the\n' +
    '  dragging covers the strip below it, so a readout there is invisible for\n' +
    '  the whole gesture — exactly when the customer needs to read it.')
  process.exit(1)
}
console.log('\n✓ Every slider-driven readout sits clear of the thumb.')
