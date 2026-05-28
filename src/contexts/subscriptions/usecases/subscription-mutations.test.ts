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

import { unskipFutureDate } from './subscription-mutations'
import { requireUser } from '@/contexts/identity/usecases/require-user'
import { loadOwnedSubscription } from '@/contexts/subscriptions/domain/subscriptions'
import type { Subscription } from '@/contexts/subscriptions/domain/subscriptions'

const requireUserMock = vi.mocked(requireUser)
const loadOwnedSubscriptionMock = vi.mocked(loadOwnedSubscription)

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
    ...overrides,
  }
}

function authedUser() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ok: true as const, supabase: {} as any, user: { id: 'user-1' } as any,
  }
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
