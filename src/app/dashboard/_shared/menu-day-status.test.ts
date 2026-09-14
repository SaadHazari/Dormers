import { describe, it, expect } from 'vitest'
import {
  classifyMenuDay,
  lastDinnerIso,
  nextDeliveryIso,
  noDeliveryNote,
  planEndingNotice,
  renewGateFor,
  type MenuDayContext,
  type MenuPlan,
} from './menu-day-status'

// The week these tests live in: Mon 14 Sep … Sun 20 Sep 2026, today Thursday.
const MON = '2026-09-14', TUE = '2026-09-15', WED = '2026-09-16', THU = '2026-09-17'
const FRI = '2026-09-18', SAT = '2026-09-19', NEXT_MON = '2026-09-21', NEXT_TUE = '2026-09-22'
const TODAY = THU

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
  todayIso: TODAY,
  weekType: '6DAYS',
  closureDates: [],
  hasQueuedRenewal: false,
  ...over,
})

describe('a menu day, read against the plan', () => {
  it('has no status at all when the customer never had a plan', () => {
    for (const iso of [MON, THU, NEXT_MON]) expect(classifyMenuDay(iso, ctx(null))).toBeNull()
  })

  it('leaves ordinary plan days alone (delivered / today / upcoming)', () => {
    for (const iso of [MON, THU, NEXT_MON]) expect(classifyMenuDay(iso, ctx(plan()))).toBeNull()
  })

  describe('pauses', () => {
    it('marks a past day the customer was paused, instead of "Delivered"', () => {
      const p = plan({ status: 'Paused', paused_dates: [TUE, WED] })
      expect(classifyMenuDay(TUE, ctx(p))).toBe('in-pause')
      expect(classifyMenuDay(WED, ctx(p))).toBe('in-pause')
      expect(classifyMenuDay(MON, ctx(p))).toBeNull()
    })

    it('marks today and every later day while paused', () => {
      const p = plan({ status: 'Paused', paused_dates: [WED] })
      expect(classifyMenuDay(THU, ctx(p))).toBe('in-pause')
      expect(classifyMenuDay(NEXT_TUE, ctx(p))).toBe('in-pause')
    })

    it('keeps "Paused" over "Renew to unlock" — a pause keeps pushing the end date out', () => {
      const p = plan({ status: 'Paused', end_date: FRI })
      expect(classifyMenuDay(NEXT_MON, ctx(p))).toBe('in-pause')
    })

    it('still shows the paused days after the customer resumes', () => {
      const p = plan({ status: 'Active', paused_dates: [MON, TUE] })
      expect(classifyMenuDay(MON, ctx(p))).toBe('in-pause')
      expect(classifyMenuDay(WED, ctx(p))).toBeNull()
    })

    it('marks a scheduled pause from its first day on, even past the end date', () => {
      const p = plan({ planned_pause_start: FRI, end_date: SAT })
      expect(classifyMenuDay(THU, ctx(p))).toBeNull()
      expect(classifyMenuDay(FRI, ctx(p))).toBe('pause-start')
      expect(classifyMenuDay(SAT, ctx(p))).toBe('in-pause')
      expect(classifyMenuDay(NEXT_MON, ctx(p))).toBe('in-pause')
    })
  })

  describe('skips', () => {
    it('names past, tonight and future skips', () => {
      const p = plan({ skipped_dates: [TUE, THU, NEXT_MON] })
      expect(classifyMenuDay(TUE, ctx(p))).toBe('past-skipped')
      expect(classifyMenuDay(THU, ctx(p))).toBe('today-skipped')
      expect(classifyMenuDay(NEXT_MON, ctx(p))).toBe('future-skipped')
    })

    it('reads a Skipped status as tonight skipped', () => {
      expect(classifyMenuDay(THU, ctx(plan({ status: 'Skipped' })))).toBe('today-skipped')
    })

    it('reads a resume after the 2 PM cutoff as "not tonight", not "paused"', () => {
      const p = plan({ resume_cutoff_date: THU, paused_dates: [WED, THU] })
      expect(classifyMenuDay(THU, ctx(p))).toBe('today-skipped')
      expect(classifyMenuDay(WED, ctx(p))).toBe('in-pause')
    })
  })

  describe('kitchen closures', () => {
    it('marks a closed day', () => {
      expect(classifyMenuDay(FRI, ctx(plan(), { closureDates: [FRI] }))).toBe('closure')
    })

    it("keeps the customer's own skip when the kitchen also closes that day", () => {
      expect(classifyMenuDay(FRI, ctx(plan({ skipped_dates: [FRI] }), { closureDates: [FRI] }))).toBe('future-skipped')
    })
  })

  describe('before the plan', () => {
    it('marks the days before a plan that started mid-week, instead of "Delivered"', () => {
      const p = plan({ start_date: WED })
      expect(classifyMenuDay(MON, ctx(p))).toBe('before-plan')
      expect(classifyMenuDay(TUE, ctx(p))).toBe('before-plan')
      expect(classifyMenuDay(WED, ctx(p))).toBeNull()
    })

    it('marks every day before a scheduled plan begins, and none after', () => {
      const p = plan({ status: 'Scheduled', start_date: NEXT_MON, end_date: '2026-10-16' })
      expect(classifyMenuDay(MON, ctx(p))).toBe('pre-start')
      expect(classifyMenuDay(THU, ctx(p))).toBe('pre-start')
      expect(classifyMenuDay(NEXT_MON, ctx(p))).toBeNull()
      expect(classifyMenuDay(NEXT_TUE, ctx(p))).toBeNull()
    })

    it('marks every day of a renewal held for approval past its start date', () => {
      const p = plan({ status: 'Scheduled', start_date: TUE, end_date: '2026-10-12' })
      for (const iso of [MON, TUE, THU, FRI, NEXT_MON]) expect(classifyMenuDay(iso, ctx(p))).toBe('pre-start')
    })
  })

  describe('after the plan', () => {
    it('locks future days after the last dinner when nothing is queued', () => {
      const p = plan({ end_date: FRI })
      expect(classifyMenuDay(FRI, ctx(p))).toBeNull()
      expect(classifyMenuDay(NEXT_MON, ctx(p))).toBe('plan-ends')
    })

    it('leaves those days alone when a renewal is queued', () => {
      expect(classifyMenuDay(NEXT_MON, ctx(plan({ end_date: FRI }), { hasQueuedRenewal: true }))).toBeNull()
    })

    it('reads an ended plan the same way the day after it ends (returning customer)', () => {
      const p = plan({ status: 'Ended', start_date: '2026-08-18', end_date: TUE, skipped_dates: [MON] })
      expect(classifyMenuDay(MON, ctx(p))).toBe('past-skipped')
      expect(classifyMenuDay(TUE, ctx(p))).toBeNull()
      expect(classifyMenuDay(WED, ctx(p))).toBe('after-end')
      expect(classifyMenuDay(THU, ctx(p))).toBe('after-end')
      expect(classifyMenuDay(FRI, ctx(p))).toBe('plan-ends')
    })
  })
})

describe('the next real delivery', () => {
  it('is tomorrow when nothing is in the way', () => {
    expect(nextDeliveryIso(ctx(plan()))).toBe(FRI)
  })

  it('steps over skipped and closed days', () => {
    expect(nextDeliveryIso(ctx(plan({ skipped_dates: [FRI] })))).toBe(SAT)
    expect(nextDeliveryIso(ctx(plan(), { closureDates: [FRI, SAT] }))).toBe(NEXT_MON)
  })

  it('steps over Saturday on a 5-day week and always over Sunday', () => {
    expect(nextDeliveryIso(ctx(plan({ skipped_dates: [FRI] }), { weekType: '5DAYS' }))).toBe(NEXT_MON)
    expect(nextDeliveryIso(ctx(plan(), { todayIso: SAT }))).toBe(NEXT_MON)
  })

  it('is none when tonight is the last dinner and nothing is queued', () => {
    expect(nextDeliveryIso(ctx(plan({ end_date: THU })))).toBeNull()
    expect(nextDeliveryIso(ctx(plan({ end_date: THU }), { hasQueuedRenewal: true }))).toBe(FRI)
  })

  it('is none while paused, and none without a plan', () => {
    expect(nextDeliveryIso(ctx(plan({ status: 'Paused' })))).toBeNull()
    expect(nextDeliveryIso(ctx(null))).toBeNull()
  })
})

describe('the plan-ending line', () => {
  it('shows for an active plan whose last dinner is 1–7 days away', () => {
    expect(planEndingNotice(ctx(plan({ end_date: FRI })))).toEqual({ lastDinnerIso: FRI, daysAway: 1 })
    expect(planEndingNotice(ctx(plan({ end_date: '2026-09-24' })))).toEqual({ lastDinnerIso: '2026-09-24', daysAway: 7 })
    expect(planEndingNotice(ctx(plan({ status: 'Skipped', end_date: SAT })))).toEqual({ lastDinnerIso: SAT, daysAway: 2 })
  })

  it('stays away otherwise', () => {
    expect(planEndingNotice(ctx(plan({ end_date: THU })))).toBeNull()               // tonight: the top card says it
    expect(planEndingNotice(ctx(plan({ end_date: '2026-09-25' })))).toBeNull()      // 8 days
    expect(planEndingNotice(ctx(plan({ end_date: FRI }), { hasQueuedRenewal: true }))).toBeNull()
    expect(planEndingNotice(ctx(plan({ status: 'Paused', end_date: FRI })))).toBeNull()
    expect(planEndingNotice(ctx(plan({ planned_pause_start: FRI, end_date: SAT })))).toBeNull() // the pause will move it
    expect(planEndingNotice(ctx(plan({ status: 'Scheduled', start_date: NEXT_MON, end_date: NEXT_TUE })))).toBeNull()
    expect(planEndingNotice(ctx(plan({ status: 'Ended', end_date: TUE })))).toBeNull()
    expect(planEndingNotice(ctx(null))).toBeNull()
  })
})

describe('the last dinner marker', () => {
  it('sits on the end date of a delivering plan with nothing queued', () => {
    expect(lastDinnerIso(ctx(plan({ end_date: FRI })))).toBe(FRI)
    expect(lastDinnerIso(ctx(plan({ status: 'Skipped', end_date: FRI })))).toBe(FRI)
  })

  it('stays on the one day a finished plan ended', () => {
    expect(lastDinnerIso(ctx(plan({ status: 'Ended', start_date: '2026-08-18', end_date: TUE })))).toBe(TUE)
  })

  it('is absent when another plan follows or the end date is still going to move', () => {
    expect(lastDinnerIso(ctx(plan({ end_date: FRI }), { hasQueuedRenewal: true }))).toBeNull()
    expect(lastDinnerIso(ctx(plan({ status: 'Paused', end_date: FRI })))).toBeNull()
    expect(lastDinnerIso(ctx(plan({ planned_pause_start: NEXT_MON, end_date: NEXT_TUE })))).toBeNull()
    expect(lastDinnerIso(ctx(plan({ status: 'Scheduled', start_date: NEXT_MON, end_date: NEXT_TUE })))).toBeNull()
    expect(lastDinnerIso(ctx(null))).toBeNull()
  })
})

describe('the Renew control', () => {
  const base = { planName: 'Monthly Premium', intakePaused: false, outOfZone: false, profileIncomplete: false }

  it('links to the same plan, preselected, like the dashboard', () => {
    expect(renewGateFor(base)).toEqual({ kind: 'open', href: '/dashboard/explore-plans?plan=Monthly%20Premium' })
    expect(renewGateFor({ ...base, planName: null })).toEqual({ kind: 'open', href: '/dashboard/explore-plans' })
  })

  it('stands down for the season before anything else', () => {
    expect(renewGateFor({ ...base, intakePaused: true, outOfZone: true }).kind).toBe('season')
  })

  it('greys out for an out-of-zone dorm or an unfinished profile', () => {
    expect(renewGateFor({ ...base, outOfZone: true })).toEqual({ kind: 'blocked', reason: 'Outside delivery radius — message us on WhatsApp' })
    expect(renewGateFor({ ...base, profileIncomplete: true })).toEqual({ kind: 'blocked', reason: 'Complete your profile first' })
  })
})

describe('the note on a dish that will not come', () => {
  it('says why, in the right tense', () => {
    expect(noDeliveryNote('in-pause', NEXT_MON, ctx(plan({ status: 'Paused' })))).toMatch(/you're paused/i)
    expect(noDeliveryNote('in-pause', TUE, ctx(plan({ paused_dates: [TUE] })))).toMatch(/you were paused/i)
    expect(noDeliveryNote('future-skipped', NEXT_MON, ctx(plan()))).toMatch(/skip/i)
    expect(noDeliveryNote('today-skipped', THU, ctx(plan({ resume_cutoff_date: THU })))).toMatch(/2 PM/)
    expect(noDeliveryNote('before-plan', MON, ctx(plan({ start_date: WED })))).toMatch(/before your plan/i)
  })

  it('explains the semester break on a day after the plan, and what happens next', () => {
    const note = noDeliveryNote('plan-ends', NEXT_MON, ctx(plan({ end_date: FRI })), { kind: 'season', note: '' })
    expect(note).toMatch(/semester break/i)
    expect(note).toMatch(/last dinner is Fri, 18 Sep/)
    expect(note).toMatch(/message you/i)
    const ended = noDeliveryNote('plan-ends', NEXT_MON, ctx(plan({ status: 'Ended', start_date: '2026-08-18', end_date: TUE })), { kind: 'season', note: '' })
    expect(ended).toMatch(/last dinner was Tue, 15 Sep/)
  })

  it('says what is holding a renewal back', () => {
    const note = noDeliveryNote('plan-ends', NEXT_MON, ctx(plan({ end_date: FRI })), { kind: 'blocked', reason: 'Complete your profile first' })
    expect(note).toMatch(/complete your profile first/i)
  })

  it('does not promise a plan extension to someone without a live plan', () => {
    expect(noDeliveryNote('closure', FRI, ctx(null, { closureDates: [FRI] }))).not.toMatch(/plan/i)
    expect(noDeliveryNote('closure', FRI, ctx(plan(), { closureDates: [FRI] }))).toMatch(/end of your plan/i)
  })
})
