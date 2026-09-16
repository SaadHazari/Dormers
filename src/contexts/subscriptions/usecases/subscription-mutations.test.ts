/**
 * Integration tests for subscription mutations.
 *
 * Currently covers unskipFutureDate validation paths — the simplest of the
 * eight mutations and a good template for the rest. Mocks at the boundary:
 *   - requireUser → fake authenticated user
 *   - loadOwnedSubscription → controlled subscription row
 *   - next/cache.revalidatePath → no-op (CI has no Next runtime)
 *   - auth.supabase chain → built per-test with the methods each path uses
 *
 * Future tests for pause/resume/skip/etc. follow this pattern. The mocks
 * are local-per-test rather than a shared fixture so each test stays
 * readable as a self-contained spec of the mutation's contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/contexts/identity/usecases/require-user', () => ({
  requireUser: vi.fn(),
}))
vi.mock('@/contexts/subscriptions/domain/subscriptions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/subscriptions/domain/subscriptions')>()
  return { ...actual, loadOwnedSubscription: vi.fn() }
})
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))
// The seasonal-taper guard in changeStartDate reads the intake singleton.
// intake.ts is 'server-only' and hits a service-role client, so it is mocked
// at the boundary like every other infra dependency here.
// The closure guard reads company_closures through the service-role client;
// the tests below never schedule a closure, so an empty calendar is the truth.
vi.mock('@/infra/supabase/subscriptions-repo', () => ({
  getCompanyClosureDates: async () => [],
}))
vi.mock('@/infra/config/intake', () => ({
  getIntakeState: vi.fn(),
}))
vi.mock('@sentry/nextjs', () => ({ metrics: { count: vi.fn() } }))
vi.mock('@/shared/events/event-bus', () => ({ eventBus: { emit: vi.fn(), on: vi.fn() } }))
vi.mock('@/contexts/season/usecases/skip-season', () => ({
  loadSkipSeasonContext: vi.fn(),
  applySeasonSkip: vi.fn(),
  applySeasonUnskip: vi.fn(),
  trimSeasonBufferGrants: vi.fn(),
}))
vi.mock('@/contexts/season/usecases/season-skip-notices', () => ({
  announceSeasonSkipCredited: vi.fn(),
}))
vi.mock('@/contexts/season/usecases/release-hold', () => ({
  releaseSeasonHold: vi.fn(),
}))
// Writes run with the service role (customers have no write access), so the
// admin client hands back the same per-test fake the user client uses. The
// plan_refunds lookup in withOwnedSubscription finds no refund.
const clients = vi.hoisted(() => ({ current: null as null | { from: (t: string) => unknown } }))
vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'plan_refunds') {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: null }) }
        return chain
      }
      return clients.current!.from(table)
    },
  }),
}))

import { changeStartDate, unskipFutureDate, skipMeal, skipFutureDate, planPause, pauseSubscription, resumeSubscription } from './subscription-mutations'
import { releaseSeasonHold } from '@/contexts/season/usecases/release-hold'
import { BREAK_RESUME_COPY, BREAK_START_DATE_COPY } from '@/contexts/season/domain/season-break-errors'
import { eventBus } from '@/shared/events/event-bus'
import { loadSkipSeasonContext, applySeasonSkip, applySeasonUnskip, trimSeasonBufferGrants } from '@/contexts/season/usecases/skip-season'
import { announceSeasonSkipCredited } from '@/contexts/season/usecases/season-skip-notices'
import { SKIP_CHANGED_COPY, SKIP_ERROR_FALLBACK, SKIP_NO_VALUE_COPY } from '@/contexts/season/domain/season-skip-errors'
import { requireUser } from '@/contexts/identity/usecases/require-user'
import { getIntakeState } from '@/infra/config/intake'
import { loadOwnedSubscription } from '@/contexts/subscriptions/domain/subscriptions'
import type { Subscription } from '@/contexts/subscriptions/domain/subscriptions'

const requireUserMock = vi.mocked(requireUser)
const loadOwnedSubscriptionMock = vi.mocked(loadOwnedSubscription)
const getIntakeStateMock = vi.mocked(getIntakeState)

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
    skipped_meals_count: 1,
    created_at: '2026-04-30T00:00:00Z',
    week_type: '6DAYS',
    start_date_changed_at: null,
    veg_days: null,
    meal_preference_type: null,
    resume_cutoff_date: null,
    skipped_dates: ['2027-01-15'],
    planned_pause_start: null,
    original_start_date: '2026-05-01',
    bonus_skips: 0,
    paused_dates: [],
    start_email_sent_at: null,
    closure_days: 0,
    credited_skip_days: 0,
    credited_skip_dates: [],
    season_buffer_grants: 0,
    ...overrides,
  }
}

function authedUser(supabase: unknown = {}) {
  clients.current = supabase as { from: (t: string) => unknown }
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ok: true as const, supabase: supabase as any, user: { id: 'user-1' } as any,
  }
}

// ── Seasonal-taper fixtures ───────────────────────────────────────────────
// Dates are derived from "now" because changeStartDate's window check is
// tomorrow .. today + 31 in AE wall time — hard-coded dates would rot.

function aeTodayIso(): string {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** A date inside the pick window that is a delivery day for 6DAYS (Mon–Sat). */
function viableStartIso(): string {
  const candidate = addDaysIso(aeTodayIso(), 7)
  // Sunday (getUTCDay() === 0) is the only non-delivery day for 6DAYS.
  return new Date(candidate + 'T00:00:00Z').getUTCDay() === 0
    ? addDaysIso(candidate, 1)
    : candidate
}

function intakeState(pauseScheduledFor: string | null) {
  return {
    paused: false, headline: '', body: '',
    creditNonvegAed: 20, creditVegAed: 15, creditReligiousAed: 20,
    cycleStartedAt: null, cycleEndedAt: null,
    pauseScheduledFor,
    phase: pauseScheduledFor ? ('winding_down' as const) : ('open' as const),
    wrapUpDay: pauseScheduledFor,
    bufferDays: 0,
    closeDay: pauseScheduledFor,
    salesStopped: false,
  }
}

/**
 * Minimal chainable Supabase stub: every builder method returns itself, and
 * the terminal awaits resolve to `result`. Enough for the two queries
 * changeStartDate runs past the taper guard (primary-overlap lookup, then
 * the update), which is all these tests need to prove the guard let the
 * request THROUGH.
 */
function supabaseChain(result: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    from: () => chain, select: () => chain, update: () => chain,
    eq: () => chain, neq: () => chain, in: () => chain, is: () => chain, or: () => chain,
    order: () => chain, limit: () => chain,
    maybeSingle: async () => result,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('unskipFutureDate — validation paths', () => {
  it('rejects when subscription is Ended', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true, subscription: fakeSub({ status: 'Ended' }),
    })

    const result = await unskipFutureDate('sub-1', '2027-01-15')

    expect(result).toEqual({ error: 'Cannot un-skip on an inactive subscription.' })
  })

  it('rejects malformed date strings', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: fakeSub() })

    const result = await unskipFutureDate('sub-1', 'not-a-date')

    expect(result).toEqual({ error: 'Invalid date format.' })
  })

  it('rejects past dates (same-day un-skip is not supported per kitchen-ops policy)', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: fakeSub() })

    const result = await unskipFutureDate('sub-1', '2020-01-01')

    expect(result).toEqual({ error: 'Past skips and today\'s skip can\'t be undone.' })
  })

  it('rejects dates not actually in skipped_dates', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true, subscription: fakeSub({ skipped_dates: ['2027-02-10'] }),
    })

    const result = await unskipFutureDate('sub-1', '2027-01-15')

    expect(result).toEqual({ error: 'That day isn\'t scheduled as a skip.' })
  })

  it('returns auth error when unauthenticated; never reads the subscription', async () => {
    requireUserMock.mockResolvedValue({ ok: false, error: 'Unauthorized' })

    const result = await unskipFutureDate('sub-1', '2027-01-15')

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(loadOwnedSubscriptionMock).not.toHaveBeenCalled()
  })
})

// ── changeStartDate — seasonal-taper guard ────────────────────────────────
// The client clamps its date picker, but that is courtesy: a stale tab or a
// direct server-action call must not be able to move a Scheduled sub's start
// past the term's last delivery day. These tests pin the authoritative gate.

describe('changeStartDate — seasonal taper', () => {
  const scheduled = (overrides: Partial<Subscription> = {}) => fakeSub({
    status: 'Scheduled', start_date_changed_at: null, week_type: '6DAYS', ...overrides,
  })

  it('refuses a start whose journey would run past the last delivery day', async () => {
    const start = viableStartIso()
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: scheduled() })
    // Monthly Premium runs 4 weeks — a term ending 3 days after the new
    // start cannot possibly contain it.
    getIntakeStateMock.mockResolvedValue(intakeState(addDaysIso(start, 3)))

    const result = await changeStartDate('sub-1', start)

    expect(result).toMatchObject({ error: expect.stringContaining('The semester wraps up on') })
    expect((result as { error: string }).error).toContain('Pick an earlier start so the plan finishes in time.')
  })

  it('allows a start whose journey still finishes in time', async () => {
    const start = viableStartIso()
    requireUserMock.mockResolvedValue(
      authedUser(supabaseChain({ data: null, error: { message: 'stub' } })),
    )
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: scheduled() })
    getIntakeStateMock.mockResolvedValue(intakeState(addDaysIso(start, 120)))

    const result = await changeStartDate('sub-1', start)

    // Past the guard: the run fails later, at the stubbed DB write.
    expect(result).toEqual({ error: 'Failed to update start date.' })
  })

  it('fails open when no pause is scheduled (settings blip or normal term)', async () => {
    const start = viableStartIso()
    requireUserMock.mockResolvedValue(
      authedUser(supabaseChain({ data: null, error: { message: 'stub' } })),
    )
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: scheduled() })
    getIntakeStateMock.mockResolvedValue(intakeState(null))

    const result = await changeStartDate('sub-1', start)

    expect(result).toEqual({ error: 'Failed to update start date.' })
  })

  it('treats an unresolvable plan name as the longest journey (fail-safe)', async () => {
    const start = viableStartIso()
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true, subscription: scheduled({ plan_name: 'Mystery Plan' }),
    })
    // A one-day journey would fit inside this horizon; a monthly one cannot.
    getIntakeStateMock.mockResolvedValue(intakeState(addDaysIso(start, 3)))

    const result = await changeStartDate('sub-1', start)

    expect(result).toMatchObject({ error: expect.stringContaining('The semester wraps up on') })
  })
})

// ── changeStartDate — paused primary ──────────────────────────────────────
// Behind a paused (or pause-planned) primary the queued start date is
// tentative — it shifts as the pause stretches — so the once-only change
// must not be spent on it. The queued card disables its button; this is
// the authoritative gate.

describe('changeStartDate — paused primary', () => {
  it('refuses while the customer\'s primary plan is paused', async () => {
    const start = viableStartIso()
    requireUserMock.mockResolvedValue(
      authedUser(supabaseChain({ data: [{ id: 'sub-0' }], error: null })),
    )
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true, subscription: fakeSub({ status: 'Scheduled', start_date_changed_at: null }),
    })
    getIntakeStateMock.mockResolvedValue(intakeState(null))

    const result = await changeStartDate('sub-1', start)

    expect(result).toEqual({ error: 'Your current plan is paused — the start date locks in when you resume. Change it then.' })
  })
})

// ── Season wind-down skips (spec §7.2) ────────────────────────────────────
// Anchors: 12:00 Dubai on Mon 14 Sep 2026. The plan runs Mon 7 Sep to Sat
// 3 Oct (Monday to Saturday). Wrap-up day Sat 3 Oct, buffer 1, close day
// Mon 5 Oct, so one more skip's make-up day is Mon 5 Oct.

describe('season wind-down skips', () => {
  const emitMock = vi.mocked(eventBus.emit)
  const loadSeasonMock = vi.mocked(loadSkipSeasonContext)
  const applySkipMock = vi.mocked(applySeasonSkip)
  const applyUnskipMock = vi.mocked(applySeasonUnskip)
  const announceMock = vi.mocked(announceSeasonSkipCredited)

  const WIND_DOWN = { phase: 'winding_down' as const, wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1 }
  const seasonSub = (overrides: Partial<Subscription> = {}) => fakeSub({
    status: 'Active', plan_name: 'Monthly Premium', start_date: '2026-09-07', end_date: '2026-10-03',
    week_type: '6DAYS', total_meals: 24, delivered_meals: 6, skipped_meals_count: 0, skipped_dates: [],
    credited_skip_days: 0, credited_skip_dates: [], season_buffer_grants: 0, ...overrides,
  })
  const kinds = () => emitMock.mock.calls.map((c) => (c[1] as { kind?: string }).kind)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'))
    loadSeasonMock.mockResolvedValue({ ok: true, context: { season: WIND_DOWN, closureDates: new Set(), creditFils: 1980, creditReadFailed: false } })
  })
  afterEach(() => vi.useRealTimers())

  /** A chain that records every builder call so a test can assert the compare-and-set guards. */
  function recordingChain(result: { data: unknown; error: unknown }) {
    const calls: Array<[string, unknown[]]> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {}
    for (const m of ['from', 'select', 'update', 'eq', 'neq', 'in', 'is', 'or', 'order', 'limit']) {
      chain[m] = (...args: unknown[]) => { calls.push([m, args]); return chain }
    }
    chain.maybeSingle = async () => result
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return { chain, calls }
  }

  it('a same-day skip with no make-up day left becomes credit: no skip confirmation, but meals still resume tomorrow', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ season_buffer_grants: 1 }) })
    applySkipMock.mockResolvedValue({ ok: true, outcome: 'credited', creditFils: 1980, creditStatus: 'approved' })

    const result = await skipMeal('sub-1', { outcome: 'credited', creditFils: 1980 })

    expect(result).toEqual({ success: true, seasonSkip: { outcome: 'credited', creditFils: 1980, creditStatus: 'approved', mealDate: '2026-09-14' } })
    expect(applySkipMock).toHaveBeenCalledWith({
      customerId: 'user-1', subscriptionId: 'sub-1', mealDate: '2026-09-14', sameDay: true,
      outcome: 'credited', season: WIND_DOWN, skipCap: 3, expectedCreditFils: 1980,
    })
    // Tue 15 Sep is on or before the wrap-up day, so the kitchen really cooks it.
    expect(kinds()).toEqual(['meal_resumed_confirm'])
    expect(emitMock).toHaveBeenCalledWith('subscription.notification-due', expect.objectContaining({
      kind: 'meal_resumed_confirm', payload: { resume_date: '2026-09-15' },
    }))
    expect(announceMock).toHaveBeenCalledWith([
      { subscriptionId: 'sub-1', customerId: 'user-1', mealDates: ['2026-09-14'], creditFils: 1980, source: 'customer_skip' },
    ])
  })

  it('a credited same-day skip queues no resume message for a day after the wrap-up day', async () => {
    // 12:00 Dubai on Sat 3 Oct, the wrap-up day. This plan runs to Sat 10 Oct,
    // so its next delivery day, Mon 5 Oct, is after the wrap-up day, and it
    // holds no buffer grant.
    vi.setSystemTime(new Date('2026-10-03T08:00:00Z'))
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ end_date: '2026-10-10' }) })
    applySkipMock.mockResolvedValue({ ok: true, outcome: 'credited', creditFils: 1980, creditStatus: 'approved' })

    expect(await skipMeal('sub-1', { outcome: 'credited', creditFils: 1980 })).toMatchObject({ success: true })
    expect(kinds()).toEqual([])
  })

  it('a credited same-day skip queues the resume message for a buffer day the plan holds a grant for', async () => {
    // 12:00 Dubai on Sat 3 Oct. An earlier skip took the grant for Mon 5 Oct,
    // the close day, so the plan now ends then and that dinner is cooked.
    vi.setSystemTime(new Date('2026-10-03T08:00:00Z'))
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: seasonSub({ end_date: '2026-10-05', skipped_meals_count: 1, skipped_dates: ['2026-09-30'], season_buffer_grants: 1 }),
    })
    applySkipMock.mockResolvedValue({ ok: true, outcome: 'credited', creditFils: 1980, creditStatus: 'approved' })

    expect(await skipMeal('sub-1', { outcome: 'credited', creditFils: 1980 })).toMatchObject({ success: true })
    expect(kinds()).toEqual(['meal_resumed_confirm'])
    expect(emitMock).toHaveBeenCalledWith('subscription.notification-due', expect.objectContaining({
      kind: 'meal_resumed_confirm', payload: { resume_date: '2026-10-05' },
    }))
  })

  it('refuses a credited skip the customer was not shown', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ season_buffer_grants: 1 }) })

    expect(await skipMeal('sub-1')).toEqual({ error: SKIP_CHANGED_COPY })
    expect(await skipMeal('sub-1', { outcome: 'credited', creditFils: 1800 })).toEqual({ error: SKIP_CHANGED_COPY })
    expect(applySkipMock).not.toHaveBeenCalled()
  })

  it('a skip that lands on the buffer day takes a grant and keeps the usual messages', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub() })
    applySkipMock.mockResolvedValue({ ok: true, outcome: 'grant', makeUpDay: '2026-10-05' })

    const result = await skipMeal('sub-1', { outcome: 'grant', creditFils: null })

    expect(result).toEqual({ success: true })
    expect(applySkipMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'grant', expectedCreditFils: null }))
    expect(kinds()).toEqual(['meal_skipped_confirm', 'meal_resumed_confirm'])
    expect(announceMock).not.toHaveBeenCalled()
  })

  it('outside a wind-down the skip is written exactly as before, guarded on status and the skip count', async () => {
    const { chain, calls } = recordingChain({ data: [{ id: 'sub-1' }], error: null })
    requireUserMock.mockResolvedValue(authedUser(chain))
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ skipped_meals_count: 2, skipped_dates: ['2026-09-09', '2026-09-10'] }) })
    loadSeasonMock.mockResolvedValue({ ok: true, context: { season: { phase: 'open', wrapUpDay: null, closeDay: null, bufferDays: 1 }, closureDates: new Set(), creditFils: null, creditReadFailed: false } })

    expect(await skipMeal('sub-1')).toEqual({ success: true })
    expect(applySkipMock).not.toHaveBeenCalled()
    expect(kinds()).toEqual(['meal_skipped_confirm', 'meal_resumed_confirm'])
    const update = calls.find(([m]) => m === 'update')?.[1][0]
    expect(update).toMatchObject({ status: 'Skipped', skipped_meals_count: 3, skipped_dates: ['2026-09-09', '2026-09-10', '2026-09-14'] })
    expect((update as { last_skipped_date: string }).last_skipped_date).toEqual(expect.any(String))
    expect(calls.filter(([m]) => m === 'eq').map(([, a]) => a)).toEqual([['id', 'sub-1'], ['customer_id', 'user-1'], ['status', 'Active'], ['skipped_meals_count', 2]])
  })

  it('a same-day skip whose row moved underneath it is refused, and sends nothing', async () => {
    requireUserMock.mockResolvedValue(authedUser(supabaseChain({ data: [], error: null })))
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub() })
    loadSeasonMock.mockResolvedValue({ ok: true, context: { season: { phase: 'open', wrapUpDay: null, closeDay: null, bufferDays: 1 }, closureDates: new Set(), creditFils: null, creditReadFailed: false } })

    expect(await skipMeal('sub-1')).toEqual({ error: SKIP_CHANGED_COPY })
    expect(kinds()).toEqual([])
  })

  it('refuses every skip when the season cannot be read, even if the season is really open', async () => {
    requireUserMock.mockResolvedValue(authedUser(supabaseChain({ data: [{ id: 'sub-1' }], error: null })))
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub() })
    loadSeasonMock.mockResolvedValue({ ok: false })
    const updateSpy = vi.fn()

    expect(await skipMeal('sub-1')).toEqual({ error: SKIP_ERROR_FALLBACK })
    expect(await skipFutureDate('sub-1', '2026-09-16')).toEqual({ error: SKIP_ERROR_FALLBACK })
    expect(applySkipMock).not.toHaveBeenCalled()
    expect(announceMock).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    expect(kinds()).toEqual([])
  })

  it('a credited skip whose order could not be read is refused with the fallback copy, not the no-value copy', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ season_buffer_grants: 1 }) })
    loadSeasonMock.mockResolvedValue({ ok: true, context: { season: WIND_DOWN, closureDates: new Set(), creditFils: null, creditReadFailed: true } })

    expect(await skipMeal('sub-1', { outcome: 'credited', creditFils: 1980 })).toEqual({ error: SKIP_ERROR_FALLBACK })
    expect(applySkipMock).not.toHaveBeenCalled()
  })

  it('a credited skip on a plan whose meal value is unknown is refused with the no-value copy', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ season_buffer_grants: 1 }) })
    loadSeasonMock.mockResolvedValue({ ok: true, context: { season: WIND_DOWN, closureDates: new Set(), creditFils: null, creditReadFailed: false } })

    expect(await skipMeal('sub-1', { outcome: 'credited', creditFils: null })).toEqual({ error: SKIP_NO_VALUE_COPY })
    expect(applySkipMock).not.toHaveBeenCalled()
  })

  it('a same-day grant skip whose next dinner is the buffer day promises that dinner, because the grant it just took allows it', async () => {
    // 12:00 Dubai on Sat 3 Oct, the wrap-up day; the plan held no grant before this skip.
    vi.setSystemTime(new Date('2026-10-03T08:00:00Z'))
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ end_date: '2026-10-03', season_buffer_grants: 0 }) })
    applySkipMock.mockResolvedValue({ ok: true, outcome: 'grant', makeUpDay: '2026-10-05' })

    expect(await skipMeal('sub-1', { outcome: 'grant', creditFils: null })).toEqual({ success: true })
    expect(kinds()).toEqual(['meal_skipped_confirm', 'meal_resumed_confirm'])
    expect(emitMock).toHaveBeenCalledWith('subscription.notification-due', expect.objectContaining({
      kind: 'meal_resumed_confirm', payload: { resume_date: '2026-10-05' },
    }))
  })

  it('a future normal skip is guarded on the skip count and the credited count', async () => {
    const { chain, calls } = recordingChain({ data: [{ id: 'sub-1' }], error: null })
    requireUserMock.mockResolvedValue(authedUser(chain))
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ skipped_meals_count: 1, skipped_dates: ['2026-09-09'] }) })
    loadSeasonMock.mockResolvedValue({ ok: true, context: { season: { phase: 'open', wrapUpDay: null, closeDay: null, bufferDays: 1 }, closureDates: new Set(), creditFils: null, creditReadFailed: false } })

    expect(await skipFutureDate('sub-1', '2026-09-16')).toEqual({ success: true })
    expect(calls.filter(([m]) => m === 'eq').map(([, a]) => a)).toEqual([['id', 'sub-1'], ['customer_id', 'user-1'], ['skipped_meals_count', 1], ['credited_skip_days', 0]])
  })

  it('an ordinary undo on a plan with no season state is guarded on the credited count too', async () => {
    const { chain, calls } = recordingChain({ data: [{ id: 'sub-1' }], error: null })
    requireUserMock.mockResolvedValue(authedUser(chain))
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ skipped_meals_count: 1, skipped_dates: ['2026-09-16'] }) })

    expect(await unskipFutureDate('sub-1', '2026-09-16')).toEqual({ success: true })
    expect(applyUnskipMock).not.toHaveBeenCalled()
    expect(calls.filter(([m]) => m === 'eq').map(([, a]) => a)).toEqual([['id', 'sub-1'], ['customer_id', 'user-1'], ['skipped_meals_count', 1], ['credited_skip_days', 0]])
  })

  it('a grant-only plan routes its undo through SQL so the grant is released under the row lock', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: seasonSub({ skipped_meals_count: 1, skipped_dates: ['2026-09-30'], season_buffer_grants: 1, end_date: '2026-10-05' }),
    })
    applyUnskipMock.mockResolvedValue({ ok: true, kind: 'normal' })

    expect(await unskipFutureDate('sub-1', '2026-09-30')).toEqual({ success: true })
    expect(applyUnskipMock).toHaveBeenCalledWith({ customerId: 'user-1', subscriptionId: 'sub-1', mealDate: '2026-09-30' })
    expect(kinds()).toEqual(['meal_skip_cancelled_confirm'])
  })

  it('a pause and a planned pause are guarded on the credited count', async () => {
    const pause = recordingChain({ data: [{ id: 'sub-1' }], error: null })
    requireUserMock.mockResolvedValue(authedUser(pause.chain))
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ skipped_meals_count: 0 }) })
    expect(await pauseSubscription('sub-1')).toEqual({ success: true })
    expect(pause.calls.filter(([m]) => m === 'eq').map(([, a]) => a)).toEqual([['id', 'sub-1'], ['customer_id', 'user-1'], ['status', 'Active'], ['credited_skip_days', 0]])

    const plan = recordingChain({ data: [{ id: 'sub-1' }], error: null })
    requireUserMock.mockResolvedValue(authedUser(plan.chain))
    // A planned pause starting after every credited date is allowed.
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: seasonSub({ skipped_dates: ['2026-09-16'], credited_skip_days: 1, credited_skip_dates: ['2026-09-16'], skipped_meals_count: 0 }),
    })
    expect(await planPause('sub-1', '2026-09-21')).toEqual({ success: true })
    expect(plan.calls.filter(([m]) => m === 'eq').map(([, a]) => a)).toEqual([['id', 'sub-1'], ['customer_id', 'user-1'], ['has_paused_before', false], ['skipped_meals_count', 0], ['credited_skip_days', 1]])
  })

  it('a planned pause that cancels a skip trims a buffer grant, and leaves it alone otherwise', async () => {
    const trimMock = vi.mocked(trimSeasonBufferGrants)
    trimMock.mockResolvedValue({ ok: true, grants: 0 })

    // The Wed 23 Sep skip falls inside a pause from Mon 21 Sep: it is cancelled, so the grant it used is trimmed.
    requireUserMock.mockResolvedValue(authedUser(recordingChain({ data: [{ id: 'sub-1' }], error: null }).chain))
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: seasonSub({ skipped_dates: ['2026-09-23'], skipped_meals_count: 1, season_buffer_grants: 1, end_date: '2026-10-05' }),
    })
    expect(await planPause('sub-1', '2026-09-21')).toEqual({ success: true })
    expect(trimMock).toHaveBeenCalledWith({ subscriptionId: 'sub-1' })

    // A skip before the pause stays, so nothing is trimmed.
    trimMock.mockClear()
    requireUserMock.mockResolvedValue(authedUser(recordingChain({ data: [{ id: 'sub-1' }], error: null }).chain))
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: seasonSub({ skipped_dates: ['2026-09-16'], skipped_meals_count: 1, season_buffer_grants: 1, end_date: '2026-10-05' }),
    })
    expect(await planPause('sub-1', '2026-09-21')).toEqual({ success: true })
    expect(trimMock).not.toHaveBeenCalled()
  })

  it('a future credited skip leaves its credit pending', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: seasonSub({ season_buffer_grants: 1 }) })
    applySkipMock.mockResolvedValue({ ok: true, outcome: 'credited', creditFils: 1980, creditStatus: 'pending' })

    // Wed 16 Sep.
    const result = await skipFutureDate('sub-1', '2026-09-16', { outcome: 'credited', creditFils: 1980 })

    expect(result).toEqual({ success: true, seasonSkip: { outcome: 'credited', creditFils: 1980, creditStatus: 'pending', mealDate: '2026-09-16' } })
    expect(applySkipMock).toHaveBeenCalledWith(expect.objectContaining({ mealDate: '2026-09-16', sameDay: false }))
    expect(kinds()).toEqual([])
  })

  it('undoing a credited skip goes through SQL and sends nothing', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: seasonSub({ skipped_dates: ['2026-09-16'], credited_skip_days: 1, credited_skip_dates: ['2026-09-16'] }),
    })
    applyUnskipMock.mockResolvedValue({ ok: true, kind: 'credited' })

    expect(await unskipFutureDate('sub-1', '2026-09-16')).toEqual({ success: true })
    expect(applyUnskipMock).toHaveBeenCalledWith({ customerId: 'user-1', subscriptionId: 'sub-1', mealDate: '2026-09-16' })
    expect(kinds()).toEqual([])
  })

  // Task 6's review broadened the undo routing: it is not enough for the
  // date being undone to itself be credited. Any credited date or buffer
  // grant ANYWHERE on the plan means undoing any skip needs SQL's row-locked
  // recheck, because contracting the plan could strand a later credited date
  // past the new end. Here the date being undone ('2026-09-16') is an
  // ordinary skip; the credited date ('2026-09-30') is a different one.
  it('undoing an ordinary skip still goes through SQL when the plan holds a credited date elsewhere, with no grant', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: seasonSub({
        skipped_dates: ['2026-09-16', '2026-09-30'],
        credited_skip_days: 1,
        credited_skip_dates: ['2026-09-30'],
        season_buffer_grants: 0,
      }),
    })
    applyUnskipMock.mockResolvedValue({ ok: true, kind: 'normal' })

    const result = await unskipFutureDate('sub-1', '2026-09-16')

    expect(result).toEqual({ success: true })
    expect(applyUnskipMock).toHaveBeenCalledWith({ customerId: 'user-1', subscriptionId: 'sub-1', mealDate: '2026-09-16' })
    // Not itself the credited date, so a normal-kind season undo still sends
    // the usual cancellation receipt.
    expect(kinds()).toEqual(['meal_skip_cancelled_confirm'])
  })

  it('a pause cannot swallow a credited skip', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    const credited = seasonSub({ skipped_dates: ['2026-09-22'], credited_skip_days: 1, credited_skip_dates: ['2026-09-22'] })
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: credited })

    // Planned pause from Mon 21 Sep would cover Tue 22 Sep.
    expect(await planPause('sub-1', '2026-09-21')).toEqual({
      error: 'Your skip on Tue 22 Sep is turning into wallet credit. Undo that skip first, then plan your pause.',
    })
    expect(await pauseSubscription('sub-1')).toEqual({
      error: 'Your skip on Tue 22 Sep is turning into wallet credit. Undo that skip first, then pause.',
    })
  })
})

// ── The season break (spec §7.5, §7.6, G9) ────────────────────────────────
// Anchors: 10:00 Dubai on Mon 12 Oct 2026. Mon 19 Oct is a delivery day inside
// the change window.

describe('resume and start date around the season break', () => {
  const releaseMock = vi.mocked(releaseSeasonHold)
  const emitMock = vi.mocked(eventBus.emit)
  const phase = (p: 'open' | 'winding_down' | 'break') => ({ ...intakeState(null), phase: p })
  const heldPaused = (over: Partial<Subscription> = {}) => fakeSub({
    status: 'Paused', pause_date: '2026-10-01T10:00:00Z', has_paused_before: true, season_hold_id: 'hold-1', ...over,
  })

  beforeEach(() => {
    releaseMock.mockReset()
    emitMock.mockClear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T06:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('refuses a resume during the break, reading the phase fresh', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: heldPaused() })
    getIntakeStateMock.mockResolvedValue(phase('break'))

    expect(await resumeSubscription('sub-1')).toEqual({ error: BREAK_RESUME_COPY, seasonBreak: true })
    expect(getIntakeStateMock).toHaveBeenCalledWith({ fresh: true })
    expect(releaseMock).not.toHaveBeenCalled()
  })

  it('after reopening, Resume releases the held plan through SQL and confirms it', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: heldPaused() })
    getIntakeStateMock.mockResolvedValue(phase('open'))
    releaseMock.mockResolvedValue({ ok: true, status: 'Active', followers: 0 })

    expect(await resumeSubscription('sub-1')).toEqual({ success: true })
    expect(releaseMock).toHaveBeenCalledWith({ customerId: 'user-1', subscriptionId: 'sub-1', startDate: null, resumeCutoff: false })
    expect(emitMock).toHaveBeenCalledWith('subscription.notification-due', expect.objectContaining({
      kind: 'plan_resumed_confirm', payload: { resume_date: '2026-10-12' },
    }))
  })

  it('a restart the database refuses reads as the break copy', async () => {
    requireUserMock.mockResolvedValue(authedUser(supabaseChain({ data: null, error: { message: 'SEASON_BREAK: plan sub-1 cannot restart during the semester break' } })))
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: heldPaused({ season_hold_id: null }) })
    getIntakeStateMock.mockResolvedValue(phase('open'))

    expect(await resumeSubscription('sub-1')).toEqual({ error: BREAK_RESUME_COPY, seasonBreak: true })
  })

  it('refuses a start date change during the break', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: fakeSub({ status: 'Scheduled', start_date: '2026-10-20', season_hold_id: 'hold-2' }) })
    getIntakeStateMock.mockResolvedValue(phase('break'))

    expect(await changeStartDate('sub-1', '2026-10-19')).toEqual({ error: BREAK_START_DATE_COPY })
    expect(releaseMock).not.toHaveBeenCalled()
  })

  it('after reopening, a held Scheduled plan picks its date without using the allowance', async () => {
    requireUserMock.mockResolvedValue(authedUser(supabaseChain({ data: null, error: null })))
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: fakeSub({ status: 'Scheduled', start_date: '2026-10-05', start_date_changed_at: '2026-09-20T10:00:00Z', season_hold_id: 'hold-2' }),
    })
    getIntakeStateMock.mockResolvedValue(phase('open'))
    releaseMock.mockResolvedValue({ ok: true, status: 'Scheduled', followers: 0 })

    expect(await changeStartDate('sub-1', '2026-10-19')).toEqual({ success: true })
    expect(releaseMock).toHaveBeenCalledWith({ customerId: 'user-1', subscriptionId: 'sub-1', startDate: '2026-10-19', resumeCutoff: false })
    expect(emitMock).toHaveBeenCalledWith('subscription.notification-due', expect.objectContaining({
      kind: 'plan_start_date_changed_confirm', payload: { start_date: '2026-10-19' },
    }))
  })

  it('a plan that is not held still gets one change only', async () => {
    requireUserMock.mockResolvedValue(authedUser())
    loadOwnedSubscriptionMock.mockResolvedValue({
      ok: true,
      subscription: fakeSub({ status: 'Scheduled', start_date: '2026-10-05', start_date_changed_at: '2026-09-20T10:00:00Z', season_hold_id: null }),
    })
    getIntakeStateMock.mockResolvedValue(phase('open'))

    expect(await changeStartDate('sub-1', '2026-10-19')).toEqual({ error: 'You can only change the start date once per plan.' })
  })
})
