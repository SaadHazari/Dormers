#!/usr/bin/env node
/**
 * Renders the My Plan refund button (the owner's refund switch) at desktop
 * and phone width and fails when its words are missing, the page scrolls
 * sideways, or the console logs an error. The confirm step is opened but
 * never confirmed: the preview has no signed-in customer.
 * Needs the dev server: BASE_URL defaults to http://localhost:3000.
 * Screenshots go to SHOT_DIR when it is set.
 */
import { launchChromium } from './lib/chromium.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SHOT_DIR = process.env.SHOT_DIR ?? null

const STATES = [
  { id: 'off', url: '/dashboard/plan?preview=1', expect: ['Your current plan'], absent: ['Refund my remaining meals'] },
  {
    id: 'before-cutoff',
    url: '/dashboard/plan?preview=1&refund=1',
    expect: ['You can refund the 16 meals you have left: AED 352 back to your card and AED 16 to your wallet.', 'Refund my remaining meals'],
    tap: '[data-testid="plan-refund-open"]',
    after: [
      'Refund your remaining meals?',
      'We refund your 16 meals left: AED 352 back to your card and AED 16 to your wallet.',
      'Your plan ends now. No more dinners will be delivered.',
      'Card refunds usually show on your statement within 5 to 10 working days.',
      'Keep my plan',
      'Yes, refund and end my plan',
    ],
  },
  {
    id: 'after-cutoff',
    url: '/dashboard/plan?preview=1&refund=tonight',
    expect: ['You can refund the 15 meals you have left'],
    tap: '[data-testid="plan-refund-open"]',
    after: ["Tonight's dinner is already being cooked, so it still arrives. Your plan ends after it."],
    absent_after: ['Your plan ends now.'],
  },
  {
    id: 'credit-only',
    url: '/dashboard/plan?preview=1&refund=credit',
    expect: ['AED 352 back to your wallet'],
    tap: '[data-testid="plan-refund-open"]',
    after: ['We refund your 16 meals left: AED 352 back to your wallet.'],
    absent_after: ['statement', 'your card'],
  },
  { id: 'last-dinner', url: '/dashboard/plan?preview=1&refund=last', expect: ["Your plan is refunded. Tonight's dinner is your last one."], absent: ['Refund my remaining meals'] },
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
        await page.goto(`${BASE}${state.url}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(500)
        const body = (await page.locator('body').innerText()).toLowerCase()
        for (const text of state.expect) if (!body.includes(text.toLowerCase())) failures.push(`${label}: missing "${text}"`)
        for (const text of state.absent ?? []) if (body.includes(text.toLowerCase())) failures.push(`${label}: must not say "${text}"`)
        if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/plan-refund-${state.id}-${width}.png`, fullPage: true })
        if (state.tap) {
          await page.locator(`${state.tap} >> visible=true`).first().click()
          await page.waitForTimeout(400)
          const after = (await page.locator('body').innerText()).toLowerCase()
          for (const text of state.after ?? []) if (!after.includes(text.toLowerCase())) failures.push(`${label}: after opening, missing "${text}"`)
          for (const text of state.absent_after ?? []) if (after.includes(text.toLowerCase())) failures.push(`${label}: after opening, must not say "${text}"`)
          if (SHOT_DIR) {
            const block = page.locator('[data-testid="plan-refund"] >> visible=true').first()
            await block.scrollIntoViewIfNeeded()
            await page.screenshot({ path: `${SHOT_DIR}/plan-refund-${state.id}-open-${width}.png` })
          }
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
  console.error(`check-plan-refund: ${failures.length} failure(s)\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`check-plan-refund: ${STATES.length} states at 2 widths passed`)
