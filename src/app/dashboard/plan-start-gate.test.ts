/**
 * Regression lock: no dashboard surface may decide "has this plan begun?"
 * from the calendar alone.
 *
 * The staff renewal approval gate holds a subscription at Scheduled past its
 * start_date until an admin approves it — subscription_status_tick skips
 * Scheduled staff subs while staff_approval = 'pending'. Every surface that
 * asked `new Date(sub.start_date) > Date.now()` therefore flipped to "plan
 * running" on the calendar date: hero countdown, tonight's dish, an Active
 * badge and a days-left tile, for a cycle the kitchen never started and for
 * which no meal was ever delivered.
 *
 * The answer lives in one place now — hasNotStartedYet, which reads status
 * first. These are source-level assertions because the dashboard surfaces are
 * client components with no DOM test harness in this project.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8')

/** The exact shape of the bug: a start-date comparison used as the verdict. */
const DATE_ONLY_VERDICT =
  /const\s+(startsInFuture|isStartingSoon|isScheduled)\s*=\s*(!!subStartDate\s*&&\s*)?new Date\(/

const SURFACES = [
  'src/app/dashboard/ActiveDashboard.tsx',
  'src/app/dashboard/HeroToday.tsx',
  'src/app/dashboard/StatRow.tsx',
  'src/app/dashboard/PlanProgress.tsx',
  'src/app/dashboard/plan/PlanClient.tsx',
]

describe('a plan held at the approval gate is never rendered as started', () => {
  it.each(SURFACES)('%s does not derive the verdict from start_date alone', (file) => {
    expect(read(file)).not.toMatch(DATE_ONLY_VERDICT)
  })

  it.each([
    'src/app/dashboard/StatRow.tsx',
    'src/app/dashboard/PlanProgress.tsx',
    'src/app/dashboard/plan/PlanClient.tsx',
  ])('%s asks the domain instead', (file) => {
    expect(read(file)).toContain('hasNotStartedYet')
  })

  it('ActiveDashboard, which feeds the hero and the mobile bridge, asks the domain', () => {
    expect(read('src/app/dashboard/ActiveDashboard.tsx')).toContain('hasNotStartedYet(sub)')
  })

  it('surfaces that quote a start date have a held-state branch that does not', () => {
    // start_date is a day that already passed once a plan is held, so none of
    // these may state it as a future promise.
    for (const file of ['src/app/dashboard/HeroToday.tsx', 'src/app/dashboard/StatRow.tsx',
      'src/app/dashboard/PlanProgress.tsx', 'src/app/dashboard/plan/PlanClient.tsx']) {
      expect(read(file)).toMatch(/startHeld/)
    }
  })
})
