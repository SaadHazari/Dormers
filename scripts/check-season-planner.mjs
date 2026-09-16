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
  open: { title: 'Open as normal', controls: ['Set the last dinner day', 'Pause new orders', 'Close the kitchen tonight'], absent: ['Take new orders again', 'Cancel the season end'] },
  stopped: { title: 'New orders paused, no end date yet', controls: ['Set the last dinner day', 'Take new orders again', 'Close the kitchen tonight'], absent: ['Pause new orders', 'Cancel the season end'] },
  // "Change the last dinner day" appears once a different day is tapped (pickDay below).
  scheduled: { title: 'Season ends Wed 30 Sep', pickDay: 'Tue 29 Sep', controls: ['Pause new orders', 'Cancel the season end', 'Close the kitchen tonight'], absent: ['Take new orders again'] },
  stopped_scheduled: { title: 'Season ends Wed 30 Sep', pickDay: 'Tue 29 Sep', controls: ['Take new orders again', 'Cancel the season end', 'Close the kitchen tonight'], absent: ['Pause new orders'] },
  // Wrap-up day already behind today: only Clear survives allowedSeasonActions;
  // ending today would move the wrap-up day back and reopen the kitchen.
  passed: { title: 'Season ends Sat 12 Sep', controls: ['Cancel the season end'], absent: ['Set the last dinner day', 'Change the last dinner day', 'Pause new orders', 'Take new orders again', 'Take new orders again', 'Close the kitchen tonight'] },
  // Same snapshot as `stopped`; only intake_settings.paused disagrees, which
  // is what should light up the season-drift banner.
  drift: { title: 'New orders paused, no end date yet', controls: ['Set the last dinner day', 'Take new orders again', 'Close the kitchen tonight'], absent: ['Pause new orders', 'Cancel the season end'] },
  // The break board (plan C): only Reopen, and the kitchen-halt invariant.
  break: { title: 'Closed for the semester break', controls: ['Reopen the kitchen'], absent: ['Set the last dinner day', 'Change the last dinner day', 'Pause new orders', 'Take new orders again', 'Cancel the season end', 'Close the kitchen tonight'], invariant: 'no plan is set to cook' },
  break_alert: { title: 'Closed for the semester break', controls: ['Reopen the kitchen'], absent: ['Set the last dinner day', 'Change the last dinner day', 'Pause new orders', 'Take new orders again', 'Cancel the season end', 'Close the kitchen tonight'], invariant: 'would cook during the break' },
  // Plan D (spec §10.3): the refund queue on the break board, and after reopening above the planner.
  break_refund: { title: 'Closed for the semester break', controls: ['Reopen the kitchen', 'Give the refund', 'Say no', 'Try the refund again'], absent: ['Set the last dinner day', 'Close the kitchen tonight'], invariant: 'no plan is set to cook', texts: ['2 refund requests waiting for you', 'Refund requested', 'Refund failed', 'charge has already been refunded', 're_3Q2fixture'] },
  open_refund: { title: 'Open as normal', controls: ['Set the last dinner day', 'Pause new orders', 'Close the kitchen tonight', 'Give the refund', 'Say no', 'Try the refund again'], absent: ['Take new orders again', 'Cancel the season end'], texts: ['2 refund requests waiting for you'] },
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
        // Clear and End today live in the closed "More moves" drawer; open it
        // so the button checks below can see them.
        for (const summary of await page.locator('details > summary').all()) await summary.click()
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
          if (!bodyLower.includes('last dinner day') && !bodyLower.includes('last meal anyone has paid for')) failures.push(`${label}: missing the season end panel`)
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
        // The calendar is the date control: tapping a day drafts the new end.
        if (expect.pickDay) {
          if (await page.getByRole('button', { name: 'Change the last dinner day', exact: true }).count() > 0) failures.push(`${label}: "Change the last dinner day" shows before anything changed`)
          await page.locator(`button[aria-label^="${expect.pickDay}:"]`).click()
          const change = page.getByRole('button', { name: 'Change the last dinner day', exact: true })
          if (await change.count() === 0) failures.push(`${label}: tapping ${expect.pickDay} did not offer "Change the last dinner day"`)
          else {
            // Every change opens a dialog that says what happens and whether it can be undone.
            await change.click()
            const dialog = page.getByRole('dialog')
            const text = (await dialog.innerText().catch(() => '')).toLowerCase()
            if (!text.includes('what happens') || !text.includes('can i undo this?')) failures.push(`${label}: the change dialog does not explain itself`)
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
          }
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
