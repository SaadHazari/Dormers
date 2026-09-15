#!/usr/bin/env node
/**
 * Renders /dev/season-admin in every season fixture at desktop and phone
 * width and fails when the planner is missing, a state shows the wrong
 * controls, the page scrolls sideways, or the console logs an error.
 * Needs the dev server: BASE_URL defaults to http://localhost:3000.
 * Screenshots go to SHOT_DIR when it is set.
 */
import { launchChromium } from './lib/chromium.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SHOT_DIR = process.env.SHOT_DIR ?? null

// End the season today shows wherever allowedSeasonActions offers it: the break is live (plan C).
const EXPECT = {
  open: { title: 'Open', controls: ['Schedule', 'Stop sales now', 'End the season today'], absent: ['Resume sales', 'Clear the wrap-up day'] },
  stopped: { title: 'Sales stopped, no wrap-up day', controls: ['Schedule', 'Resume sales and end the season', 'End the season today'], absent: ['Stop sales now', 'Clear the wrap-up day'] },
  scheduled: { title: 'Winding down to Wed 30 Sep', controls: ['Save new dates', 'Stop sales now', 'Clear the wrap-up day', 'End the season today'], absent: ['Resume sales'] },
  stopped_scheduled: { title: 'Winding down to Wed 30 Sep', controls: ['Save new dates', 'Resume sales', 'Clear the wrap-up day', 'End the season today'], absent: ['Stop sales now'] },
  // Wrap-up day already behind today: only Clear survives allowedSeasonActions;
  // ending today would move the wrap-up day back and reopen the kitchen.
  passed: { title: 'Winding down to Sat 12 Sep', controls: ['Clear the wrap-up day'], absent: ['Schedule', 'Save new dates', 'Stop sales now', 'Resume sales', 'Resume sales and end the season', 'End the season today'] },
  // Same snapshot as `stopped`; only intake_settings.paused disagrees, which
  // is what should light up the season-drift banner.
  drift: { title: 'Sales stopped, no wrap-up day', controls: ['Schedule', 'Resume sales and end the season', 'End the season today'], absent: ['Stop sales now', 'Clear the wrap-up day'] },
  // The break board (plan C): only Reopen, and the kitchen-halt invariant.
  break: { title: 'On the break', controls: ['Reopen'], absent: ['Schedule', 'Save new dates', 'Stop sales now', 'Resume sales', 'Clear the wrap-up day', 'End the season today'], invariant: 'Kitchen halt holding' },
  break_alert: { title: 'On the break', controls: ['Reopen'], absent: ['Schedule', 'Save new dates', 'Stop sales now', 'Resume sales', 'Clear the wrap-up day', 'End the season today'], invariant: 'Active during the break' },
  // Plan D (spec §10.3): the refund queue on the break board, and after reopening above the planner.
  break_refund: { title: 'On the break', controls: ['Reopen', 'Approve', 'Decline', 'Retry'], absent: ['Schedule', 'End the season today'], invariant: 'Kitchen halt holding', texts: ['2 refund requests waiting for you', 'Refund requested', 'Refund failed', 'charge has already been refunded', 're_3Q2fixture'] },
  open_refund: { title: 'Open', controls: ['Schedule', 'Stop sales now', 'End the season today', 'Approve', 'Decline', 'Retry'], absent: ['Resume sales', 'Clear the wrap-up day'], texts: ['2 refund requests waiting for you'] },
}
const WIDTHS = [1280, 390]

const failures = []
const browser = await launchChromium()
try {
  for (const [state, expect] of Object.entries(EXPECT)) {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      try {
        const errors = []
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
        await page.goto(`${BASE}/dev/season-admin?season=${state}`, { waitUntil: 'networkidle' })
        const label = `${state} @${width}`

        // The status title is read from SeasonPlanner's own status banner
        // (data-testid="season-status"), not from the whole page's text —
        // SeasonClient's separate "Open" KPI badge (season-data.ts's
        // waitlist status) can render the same word and would otherwise let
        // a broken SeasonPlanner title go unnoticed for the open state.
        // The banner's innerText is the title on its own line followed by
        // the status body text (separate block-level divs), and the day
        // labels are now stable (F4's formatShortDay), so the first line can
        // be matched exactly instead of just checking the title is a substring
        // somewhere in the whole banner.
        const statusEl = page.getByTestId('season-status')
        if (await statusEl.count() === 0) {
          failures.push(`${label}: missing the season-status banner (data-testid="season-status")`)
        } else {
          const statusText = await statusEl.innerText()
          const titleLine = statusText.split('\n')[0]
          if (titleLine !== expect.title) failures.push(`${label}: status title "${titleLine}", expected "${expect.title}"`)
        }

        // The drift banner (data-testid="season-drift") warns when
        // intake_settings.paused disagrees with the season's own
        // salesStopped (F3). Only the `drift` fixture state sets that up.
        const driftCount = await page.getByTestId('season-drift').count()
        if (state === 'drift' && driftCount === 0) failures.push(`${label}: missing the season-drift banner`)
        if (state !== 'drift' && driftCount > 0) failures.push(`${label}: unexpected season-drift banner`)

        const body = await page.locator('body').innerText()
        // Case-insensitive: the Fact/KitchenCalendarList labels are styled
        // with Tailwind's `uppercase` (the admin eyebrow-label convention),
        // and Playwright's innerText() renders CSS text-transform, not the
        // source case. A case-sensitive check would fail on a correctly
        // rendered page.
        const bodyLower = body.toLowerCase()
        if (expect.invariant) {
          // The break board has no planner: it shows holds and the invariant.
          for (const id of ['season-invariant', 'season-held-plans', 'season-customer-pauses']) {
            if (await page.getByTestId(id).count() === 0) failures.push(`${label}: missing ${id}`)
          }
          const invariantText = await page.getByTestId('season-invariant').innerText().catch(() => '')
          if (!invariantText.includes(expect.invariant)) failures.push(`${label}: invariant reads "${invariantText}", expected "${expect.invariant}"`)
          // Plan D: the board words refunds only where a hold offers or carries one.
          if (!expect.texts && /refund request/i.test(body)) failures.push(`${label}: the break board shows a refund queue with nothing in it`)
        } else {
          if (!bodyLower.includes('last meal on the books')) failures.push(`${label}: missing "Last meal on the books"`)
          if (!bodyLower.includes('kitchen calendar')) failures.push(`${label}: missing the kitchen calendar`)
        }
        for (const text of expect.texts ?? []) {
          if (!bodyLower.includes(text.toLowerCase())) failures.push(`${label}: missing "${text}"`)
        }
        for (const c of expect.controls) {
          if (await page.getByRole('button', { name: c, exact: true }).count() === 0) failures.push(`${label}: missing button "${c}"`)
        }
        for (const c of expect.absent) {
          if (await page.getByRole('button', { name: c, exact: true }).count() > 0) failures.push(`${label}: unexpected button "${c}"`)
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (overflow > 1) failures.push(`${label}: page scrolls sideways by ${overflow}px`)
        if (errors.length) failures.push(`${label}: console errors: ${errors.join(' | ')}`)
        if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/season-${state}-${width}.png`, fullPage: true })
      } finally {
        await page.close()
      }
    }
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`check-season-planner: ${failures.length} failure(s)\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
const renderCount = Object.keys(EXPECT).length * WIDTHS.length
console.log(`check-season-planner: ${renderCount} renders OK`)
