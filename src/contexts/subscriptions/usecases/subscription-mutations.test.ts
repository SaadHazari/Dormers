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

import { describe, it, expect, vi, beforeEach } from 'vitest'

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
vi.mock('@/infra/config/intake', () => ({
  getIntakeState: vi.fn(),
}))

import { changeStartDate, unskipFutureDate } from './subscription-mutations'
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
    resume_cutoff_date: null,
    skipped_dates: ['2027-01-15'],
    planned_pause_start: null,
    original_start_date: '2026-05-01',
    bonus_skips: 0,
    paused_dates: [],
    start_email_sent_at: null,
    closure_days: 0,
    ...overrides,
  }
}

function authedUser(supabase: unknown = {}) {
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
    eq: () => chain, neq: () => chain, in: () => chain, is: () => chain,
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
