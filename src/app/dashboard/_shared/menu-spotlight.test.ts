import { describe, it, expect } from 'vitest'
import { spotlightFor, spotlightCopy } from './menu-spotlight'
import type { MenuDayContext, MenuPlan } from './menu-day-status'

const THU = '2026-09-17'

const plan = (over: Partial<MenuPlan> = {}): MenuPlan => ({
  status: 'Active',
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  plan_name: 'Monthly Premium',
  skipped_dates: [],
  paused_dates: [],
  planned_pause_start: null,
  resume_cutoff_date: null,
  ...over,
})

const ctx = (p: MenuPlan | null, over: Partial<MenuDayContext> = {}): MenuDayContext => ({
  plan: p,
  todayIso: THU,
  weekType: '6DAYS',
  closureDates: [],
  hasQueuedRenewal: false,
  ...over,
})

describe("the menu's top card", () => {
  it('rests on an off day, whatever the plan', () => {
    expect(spotlightFor(ctx(plan({ status: 'Paused' })), { todayIsOff: true })).toEqual({ kind: 'rest' })
  })

  it('says the kitchen is closed before anything else', () => {
    expect(spotlightFor(ctx(plan({ status: 'Paused' }), { closureDates: [THU] }), { todayIsOff: false })).toEqual({ kind: 'closure' })
    expect(spotlightFor(ctx(null, { closureDates: [THU] }), { todayIsOff: false })).toEqual({ kind: 'closure' })
  })

  it('tells a customer without a plan, and one whose plan ended, apart', () => {
    expect(spotlightFor(ctx(null), { todayIsOff: false })).toEqual({ kind: 'none' })
    expect(spotlightFor(ctx(plan({ status: 'Ended', end_date: '2026-09-15' })), { todayIsOff: false })).toEqual({ kind: 'ended' })
    // A live row whose end date passed before the midnight status tick ran.
    expect(spotlightFor(ctx(plan({ end_date: '2026-09-16' })), { todayIsOff: false })).toEqual({ kind: 'ended' })
  })

  it('knows a plan that starts later from one held past its start date', () => {
    expect(spotlightFor(ctx(plan({ status: 'Scheduled', start_date: '2026-09-21' })), { todayIsOff: false })).toEqual({ kind: 'scheduled', held: false })
    expect(spotlightFor(ctx(plan({ status: 'Scheduled', start_date: '2026-09-15' })), { todayIsOff: false })).toEqual({ kind: 'scheduled', held: true })
  })

  it('drops the dinner ticket for paused, resumed-late and skipped nights', () => {
    expect(spotlightFor(ctx(plan({ status: 'Paused' })), { todayIsOff: false })).toEqual({ kind: 'paused' })
    expect(spotlightFor(ctx(plan({ planned_pause_start: THU })), { todayIsOff: false })).toEqual({ kind: 'paused' })
    expect(spotlightFor(ctx(plan({ resume_cutoff_date: THU })), { todayIsOff: false })).toEqual({ kind: 'resumed-late' })
    expect(spotlightFor(ctx(plan({ status: 'Skipped' })), { todayIsOff: false })).toEqual({ kind: 'skipped' })
    expect(spotlightFor(ctx(plan({ skipped_dates: [THU] })), { todayIsOff: false })).toEqual({ kind: 'skipped' })
  })

  it('serves the dinner, flagging the last one when nothing is queued', () => {
    expect(spotlightFor(ctx(plan()), { todayIsOff: false })).toEqual({ kind: 'dinner', lastDinner: false })
    expect(spotlightFor(ctx(plan({ end_date: THU })), { todayIsOff: false })).toEqual({ kind: 'dinner', lastDinner: true })
    expect(spotlightFor(ctx(plan({ end_date: THU }), { hasQueuedRenewal: true }), { todayIsOff: false })).toEqual({ kind: 'dinner', lastDinner: false })
  })
})

describe('top card words', () => {
  it('never quotes a start date that has already passed', () => {
    const copy = spotlightCopy({ kind: 'scheduled', held: true }, ctx(plan({ status: 'Scheduled', start_date: '2026-09-15' })))
    expect(copy.headline).not.toMatch(/15/)
    expect(copy.body).not.toMatch(/15/)
  })

  it('names the day the plan ended', () => {
    const copy = spotlightCopy({ kind: 'ended' }, ctx(plan({ status: 'Ended', end_date: '2026-09-15' })))
    expect(copy.headline).toMatch(/ended/i)
    expect(copy.body).toMatch(/15 Sep/)
  })

  it('names the real next delivery after a skip, not "tomorrow" by default', () => {
    const copy = spotlightCopy({ kind: 'skipped' }, ctx(plan({ status: 'Skipped', skipped_dates: [THU, '2026-09-18'] })))
    expect(copy.body).toMatch(/19 Sep/)
  })

  it('does not promise a plan extension on a closed day to someone without a plan', () => {
    expect(spotlightCopy({ kind: 'closure' }, ctx(null, { closureDates: [THU] })).body).not.toMatch(/plan/i)
    expect(spotlightCopy({ kind: 'closure' }, ctx(plan(), { closureDates: [THU] })).body).toMatch(/end of your plan/i)
  })
})
