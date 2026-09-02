/**
 * Tests for the centralised Subscription rules. These run as pure unit
 * tests — no mocking, no Supabase. Each rule maps to one or more test
 * cases per branch, locking in the user-facing error copy.
 */

import { describe, it, expect } from 'vitest'
import { canPause, canPlanPause, canSkip, canResume, skipCapFor, hasNotStartedYet, isHeldPastStartDate } from './subscription-rules'
import { PLANS, noPauseNote } from './plans'
import type { Subscription } from './subscriptions'

function fakeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    customer_id: 'user-1',
    plan_name: 'Monthly Premium',
    status: 'Active',
    start_date: '2026-05-01',
    end_date: '2026-12-31',
    meals_per_day: 1,
    total_meals: 24,
    delivered_meals: 5,
    paused_days: 0,
    pause_date: null,
    has_paused_before: false,
    last_skipped_date: null,
    skipped_meals_count: 0,
    created_at: '2026-04-30T00:00:00Z',
    week_type: '6DAYS',
    start_date_changed_at: null,
    veg_days: null,
    resume_cutoff_date: null,
    skipped_dates: [],
    planned_pause_start: null,
    original_start_date: '2026-05-01',
    bonus_skips: 0,
    paused_dates: [],
    start_email_sent_at: null,
    closure_days: 0,
    ...overrides,
  }
}

describe('canPause', () => {
  it('passes for an Active Monthly Premium with credit unspent', () => {
    expect(canPause(fakeSub(), '2026-06-01')).toEqual({ ok: true })
  })

  it('rejects an already-paused sub', () => {
    expect(canPause(fakeSub({ status: 'Paused' }), '2026-06-01'))
      .toEqual({ ok: false, error: 'Subscription is already paused.' })
  })

  it('rejects an ended sub', () => {
    expect(canPause(fakeSub({ status: 'Ended' }), '2026-06-01'))
      .toEqual({ ok: false, error: 'Cannot pause an ended subscription.' })
  })

  it('rejects plans that cannot pause, in that plan\u2019s own words', () => {
    expect(canPause(fakeSub({ plan_name: 'Weekly Flex' }), '2026-06-01'))
      .toEqual({ ok: false, error: 'Pausing comes with Monthly Premium and Monthly Max.' })
    // An intern has nothing to upgrade to, so they must never be sold to.
    expect(canPause(fakeSub({ plan_name: 'Staff Monthly' }), '2026-06-01'))
      .toEqual({ ok: false, error: 'Your plan runs with your work month, so it can\u2019t be paused.' })
  })

  it('rejects when pause credit is already spent (paused-and-resumed earlier this cycle)', () => {
    expect(canPause(fakeSub({ has_paused_before: true, planned_pause_start: null }), '2026-06-01'))
      .toEqual({ ok: false, error: 'You have already used your 1 allowed pause for this subscription.' })
  })

  it('allows immediate pause to override a queued plan (has_paused_before + planned_pause_start)', () => {
    expect(canPause(fakeSub({ has_paused_before: true, planned_pause_start: '2026-07-01' }), '2026-06-01'))
      .toEqual({ ok: true })
  })

  it('rejects pause on the literal last delivery day', () => {
    expect(canPause(fakeSub({ end_date: '2026-06-01' }), '2026-06-01'))
      .toEqual({ ok: false, error: 'Can\'t pause on your last delivery day — there\'s no future meal to protect.' })
  })
})

describe('canPlanPause', () => {
  it('passes on Active with no existing plan', () => {
    expect(canPlanPause(fakeSub())).toEqual({ ok: true })
  })

  it('rejects when an existing plan_pause is already queued', () => {
    expect(canPlanPause(fakeSub({ planned_pause_start: '2026-07-01' })))
      .toEqual({ ok: false, error: 'You already have a pause scheduled. Cancel it first to pick a different date.' })
  })

  it('rejects on Paused or Ended subs', () => {
    expect(canPlanPause(fakeSub({ status: 'Paused' })))
      .toEqual({ ok: false, error: 'Pauses can only be scheduled on an active subscription.' })
  })

  it('rejects when credit already spent', () => {
    expect(canPlanPause(fakeSub({ has_paused_before: true })))
      .toEqual({ ok: false, error: 'You\'ve already used your 1 allowed pause for this subscription.' })
  })
})

describe('canSkip', () => {
  it('passes when under the skip cap on Active', () => {
    expect(canSkip(fakeSub())).toEqual({ ok: true })
  })

  it('rejects when skip cap reached (Monthly Premium = 3 by default)', () => {
    const max = 3  // Monthly Premium default cap, per plans.ts
    expect(canSkip(fakeSub({ skipped_meals_count: max })))
      .toEqual({ ok: false, error: `You've used all ${max} of your skips for this cycle.` })
  })

  it('counts Dorm Wars bonus_skips toward the cap', () => {
    // base 3 + 1 bonus = 4; with 3 used the user still has 1 left
    expect(canSkip(fakeSub({ skipped_meals_count: 3, bonus_skips: 1 })))
      .toEqual({ ok: true })
  })

  // Regression: the dashboard used to compute its own cap and left bonus_skips
  // out, so a customer with an earned bonus saw a disabled "None left" button
  // that this rule would have accepted. Every surface now calls skipCapFor, so
  // the figure the customer reads and the figure enforced here cannot diverge.
  it('accepts a skip at exactly the figure skipCapFor would have shown', () => {
    const sub = fakeSub({ skipped_meals_count: 3, bonus_skips: 5 })
    expect(skipCapFor(sub)).toBe(8)
    expect(Math.max(0, skipCapFor(sub) - sub.skipped_meals_count)).toBe(5)
    expect(canSkip(sub)).toEqual({ ok: true })
  })

  it('rejects on Ended subs', () => {
    expect(canSkip(fakeSub({ status: 'Ended' })))
      .toEqual({ ok: false, error: 'Skips can only be scheduled on an active subscription.' })
  })
})

describe('canResume', () => {
  it('passes on Paused with a prior pause_date', () => {
    expect(canResume(fakeSub({ status: 'Paused' }), '2026-06-02', '2026-06-01'))
      .toEqual({ ok: true })
  })

  it('rejects same-day resume (pause and resume on same AE day is locked)', () => {
    expect(canResume(fakeSub({ status: 'Paused' }), '2026-06-01', '2026-06-01'))
      .toEqual({ ok: false, error: 'Your plan was paused today — resume becomes available tomorrow.' })
  })

  it('rejects when not paused', () => {
    expect(canResume(fakeSub({ status: 'Active' }), '2026-06-02', null))
      .toEqual({ ok: false, error: 'Subscription is not currently paused.' })
  })
})

/**
 * The staff-skip bug and the bonus-skip bug were the same defect twice: a
 * dashboard control decided whether it was enabled using arithmetic the
 * server rule knew nothing about. These lock the shared source and, more
 * usefully, fail if any surface starts re-deriving it.
 */
describe('one source of truth for plan capability', () => {
  it('gives Staff Monthly the 3 skips the domain grants it', () => {
    // The original bug: an inline three-way plan-name match in the dashboard
    // returned 0 here, so the skip button rendered live and did nothing.
    expect(skipCapFor(fakeSub({ plan_name: 'Staff Monthly' }))).toBe(3)
    expect(canSkip(fakeSub({ plan_name: 'Staff Monthly', skipped_meals_count: 2 })))
      .toEqual({ ok: true })
  })

  it('gives a zero-skip plan a cap of 0, which is a disabled state not a dead one', () => {
    expect(skipCapFor(fakeSub({ plan_name: 'Welcome Meal' }))).toBe(0)
    expect(skipCapFor(fakeSub({ plan_name: 'One-Time Trial' }))).toBe(0)
  })

  it('treats a missing bonus_skips column as zero rather than NaN', () => {
    // Legacy rows predate the column; `base + undefined` would poison every
    // comparison downstream into false, silently disabling skips for them.
    const legacy = fakeSub()
    delete (legacy as Partial<Subscription>).bonus_skips
    expect(skipCapFor(legacy)).toBe(3)
  })

  it('no dashboard surface re-derives the skip cap or the pause tier', async () => {
    const { readFileSync } = await import('node:fs')
    const surfaces = [
      'src/app/dashboard/ActiveDashboard.tsx',
      'src/app/dashboard/plan/PlanClient.tsx',
      'src/app/dashboard/_mobile/MobilePlan.tsx',
    ]
    for (const file of surfaces) {
      const src = readFileSync(file, 'utf8')
      // Reading `.maxSkips` on a surface means computing a cap without the
      // bonus. Call skipCapFor instead.
      expect(src, `${file} reads .maxSkips directly — call skipCapFor(sub)`)
        .not.toMatch(/\?\.maxSkips/)
      // A plan-name match deciding a capability is how the two drift apart.
      expect(src, `${file} name-matches a plan to decide pause — read canPause`)
        .not.toMatch(/includes\('Monthly (Max|Premium)'\)/)
    }
  })
})

/**
 * A disabled control must say why it is disabled, in terms that make sense to
 * the person looking at it. These make that structural: a new plan that turns
 * pause off cannot ship without writing its own reason.
 */
describe('every disabled pause explains itself', () => {
  const nonPausable = Object.values(PLANS).filter(p => !p.canPause)

  it('covers more than one plan, so the sweep below is meaningful', () => {
    expect(nonPausable.length).toBeGreaterThan(1)
  })

  it.each(nonPausable.map(p => [p.label, p] as const))('%s carries a chip and a sentence', (_label, plan) => {
    const note = plan.noPause
    if (!note) throw new Error(`${plan.label} disables pause without saying why`)
    expect(note.chip.length).toBeGreaterThan(0)
    // Short enough for the uppercase pill on the disabled Pause row.
    expect(note.chip.length).toBeLessThanOrEqual(14)
    expect(note.sentence).toMatch(/[.!]$/)
  })

  it('never tells a staff intern to upgrade', () => {
    // The whole point: Staff Monthly IS monthly, and an intern is not a buyer.
    const staff = noPauseNote('Staff Monthly')
    if (!staff) throw new Error('Staff Monthly disables pause without saying why')
    expect(staff.sentence.toLowerCase()).not.toMatch(/upgrade|monthly plan/)
    expect(staff.chip.toLowerCase()).not.toMatch(/monthly/)
  })

  it('returns null for a plan that can pause, and for an unknown plan', () => {
    expect(noPauseNote('Monthly Premium')).toBeNull()
    expect(noPauseNote('Some Plan That Does Not Exist')).toBeNull()
  })

  it('no dashboard surface hardcodes a pause reason or renders a bare dash', async () => {
    const { readFileSync } = await import('node:fs')
    for (const file of [
      'src/app/dashboard/QuickActions.tsx',
      'src/app/dashboard/ActiveDashboard.tsx',
      'src/app/dashboard/plan/PlanClient.tsx',
      'src/app/dashboard/_mobile/MobilePlan.tsx',
    ]) {
      const src = readFileSync(file, 'utf8')
      // Scoped to PAUSE copy only. The trial SKIP tooltip still says "upgrade
      // to a monthly plan", and there it is true and useful — a trial buyer
      // really can upgrade. The staff case is what this guards: a plan whose
      // pause is off for a reason no purchase can change.
      expect(src, `${file} hardcodes a pause upsell — read noPauseNote(planName)`)
        .not.toMatch(/unlock pausing/i)
      expect(src, `${file} still says "Available on monthly plans"`)
        .not.toMatch(/Available on monthly plans/)
      expect(src, `${file} hardcodes the "Monthly only" pause chip`)
        .not.toMatch(/^\s*Monthly only$/m)
    }
    // The pause stat cell must carry words, not a dash.
    for (const file of ['src/app/dashboard/plan/PlanClient.tsx', 'src/app/dashboard/_mobile/MobilePlan.tsx']) {
      const src = readFileSync(file, 'utf8')
      expect(src, `${file} renders '—' for an unavailable pause`)
        .not.toMatch(/supportsPause\s*(\?|\n\s*\?)\s*'—'/)
      expect(src).toMatch(/'Not included'/)
    }
  })
})

describe('hasNotStartedYet / isHeldPastStartDate', () => {
  // 2026-09-02, mid-morning AE.
  const NOW = new Date('2026-09-02T06:00:00Z').getTime()

  it('a Scheduled sub starting next week has not started', () => {
    expect(hasNotStartedYet(fakeSub({ status: 'Scheduled', start_date: '2026-09-09' }), NOW)).toBe(true)
  })

  it('an Active sub that began last month has started', () => {
    expect(hasNotStartedYet(fakeSub({ status: 'Active', start_date: '2026-08-09' }), NOW)).toBe(false)
  })

  it('a Scheduled sub held past its start date has STILL not started', () => {
    // The staff renewal approval gate is the one thing that keeps a sub at
    // Scheduled after start_date lands. Reading the calendar alone here is
    // what made the dashboard announce a plan the kitchen never started.
    expect(hasNotStartedYet(fakeSub({ status: 'Scheduled', start_date: '2026-08-24' }), NOW)).toBe(true)
  })

  it('flags only the held case as held', () => {
    expect(isHeldPastStartDate(fakeSub({ status: 'Scheduled', start_date: '2026-08-24' }), NOW)).toBe(true)
    expect(isHeldPastStartDate(fakeSub({ status: 'Scheduled', start_date: '2026-09-09' }), NOW)).toBe(false)
    expect(isHeldPastStartDate(fakeSub({ status: 'Active', start_date: '2026-08-24' }), NOW)).toBe(false)
  })

  it('treats the start date itself as started, not pending', () => {
    expect(hasNotStartedYet(fakeSub({ status: 'Active', start_date: '2026-09-02' }), NOW)).toBe(false)
  })
})
