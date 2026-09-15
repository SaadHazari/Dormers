#!/usr/bin/env node
/**
 * Renders every Plan B customer preview state at desktop and phone width and
 * fails when the season copy is missing, promises a hold before the break is
 * live, the page scrolls sideways, or the console logs an error.
 * Needs the dev server: BASE_URL defaults to http://localhost:3000.
 * Screenshots go to SHOT_DIR when it is set.
 */
import { launchChromium } from './lib/chromium.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SHOT_DIR = process.env.SHOT_DIR ?? null

// expect / absent: text on the page after it loads. tap: a control pressed
// next (its first visible match); after: text that must then be on the page.
// clock: the browser's time, for a fixture pinned with &now= so the client
// reads the same day as the server.
const STATES = [
  { id: 'n1', url: '/dashboard?preview=1&verified=1&season=scheduled', expect: ['Your meals keep coming.', 'The semester wraps up on'], tap: '#season-notice-dismiss', after: ['Semester wraps up'] },
  { id: 'n3-interim', url: '/dashboard?preview=1&verified=1&sub=paused&season=paused&paused=1&joined=0', expect: ['Your plan stays paused until you resume it.', 'Save my spot'], absent: ["until we're back", 'refund'] },
  { id: 'n3-live', url: '/dashboard?preview=1&verified=1&sub=paused&season=paused&paused=1&joined=0&release=1', expect: ["Still paused then? Your plan waits for you until we're back."] },
  { id: 'chip', url: '/dashboard?preview=1&verified=1&season=credited', expect: ['Semester wraps up'] },
  // The same-day skip sheet: the fixture is pinned to a delivery morning so the Skip action is live.
  {
    id: 'skip-credited',
    url: '/dashboard?preview=1&verified=1&season=credited&now=2026-09-17',
    clock: '2026-09-17T06:00:00Z',
    expect: ['Semester wraps up'],
    tap: 'button[aria-label="Skip today\'s meal"], [data-testid="hero-skip"]',
    after: ["There's no delivery day left before", 'goes to your wallet', 'Skip and add AED 19.80'],
  },
  {
    id: 'pause-line',
    url: '/dashboard?preview=1&verified=1&season=scheduled&now=2026-09-17',
    clock: '2026-09-17T06:00:00Z',
    expect: ['Semester wraps up'],
    tap: 'button[aria-label="Pause plan"], [data-testid="hero-pause"]',
    after: ['The semester wraps up on'],
    absent_after: ['waits for you'],
  },
  { id: 'wallet', url: '/dashboard/credit?preview=1&season=credited', expect: ['On the way', 'Skipped meal credit', 'Arrives Thu 17 Sep', 'AED 19.80'] },
  // Pinned to Thu 17 Sep 2026: the credited fixture's past skip is Wed 16 Sep.
  // Its card (desktop data-state, mobile data-reason) opens the dish with the
  // note Task 12 wrote for a past credited day.
  {
    id: 'menu',
    url: '/dashboard/menu?preview=1&state=credited&now=2026-09-17',
    clock: '2026-09-17T08:00:00Z',
    expect: [],
    tap: '[data-state="past-skipped"], [data-reason="past-skipped"]',
    after: ['You skipped this day, and its value went to your wallet.'],
  },
]

const failures = []
const browser = await launchChromium()
try {
  for (const state of STATES) {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors = []
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      const label = `${state.id} @${width}`
      try {
        if (state.clock) await page.clock.install({ time: new Date(state.clock) })
        await page.goto(`${BASE}${state.url}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(600)
        // The notice is a full-screen dialog: dismiss it when the state is about what lies behind it.
        if (!state.id.startsWith('n1') && !state.id.startsWith('n3')) {
          const dismiss = page.locator('#season-notice-dismiss >> visible=true')
          if (await dismiss.count() > 0) { await dismiss.first().click(); await page.waitForTimeout(300) }
        }
        // innerText renders CSS text-transform (the pill buttons and group
        // titles are uppercase), so every comparison ignores case.
        const body = (await page.locator('body').innerText()).toLowerCase()
        for (const text of state.expect) if (!body.includes(text.toLowerCase())) failures.push(`${label}: missing "${text}"`)
        for (const text of state.absent ?? []) if (body.includes(text.toLowerCase())) failures.push(`${label}: must not say "${text}"`)
        if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/season-customer-${state.id}-${width}.png`, fullPage: true })
        if (state.tap) {
          await page.locator(`${state.tap} >> visible=true`).first().click()
          await page.waitForTimeout(500)
          const after = (await page.locator('body').innerText()).toLowerCase()
          for (const text of state.after ?? []) if (!after.includes(text.toLowerCase())) failures.push(`${label}: after tapping ${state.tap}, missing "${text}"`)
          for (const text of state.absent_after ?? []) if (after.includes(text.toLowerCase())) failures.push(`${label}: after tapping ${state.tap}, must not say "${text}"`)
          if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/season-customer-${state.id}-after-${width}.png`, fullPage: true })
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (overflow > 1) failures.push(`${label}: page scrolls sideways by ${overflow}px`)
        if (errors.length) failures.push(`${label}: console errors: ${errors.join(' | ')}`)
      } catch (err) {
        failures.push(`${label}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
      } finally {
        await page.close()
      }
    }
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`check-season-customer: ${failures.length} failure(s)\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`check-season-customer: ${STATES.length * 2} renders OK`)
