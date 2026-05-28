/**
 * Integration tests for withOwnedSubscription — the auth + ownership-load
 * wrapper used by all 8 subscription mutations.
 *
 * Establishes the module-mocking pattern for testing server-side use-cases
 * without spinning up Supabase. Mocks `requireUser` and `loadOwnedSubscription`
 * at the import boundary, then asserts the wrapper's contract:
 *   - Unauthenticated → returns the requireUser error verbatim, body never runs
 *   - Subscription not found / not owned → returns loadOwnedSubscription error
 *   - Both checks pass → body runs with the typed context
 *
 * Future use-case tests follow this same pattern: mock the boundary modules,
 * call the public function, assert the return + side-effects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/contexts/identity/usecases/require-user', () => ({
  requireUser: vi.fn(),
}))
vi.mock('@/contexts/subscriptions/domain/subscriptions', () => ({
  loadOwnedSubscription: vi.fn(),
}))

import { withOwnedSubscription } from './with-owned-subscription'
import { requireUser } from '@/contexts/identity/usecases/require-user'
import { loadOwnedSubscription } from '@/contexts/subscriptions/domain/subscriptions'
import type { Subscription } from '@/contexts/subscriptions/domain/subscriptions'

const requireUserMock = vi.mocked(requireUser)
const loadOwnedSubscriptionMock = vi.mocked(loadOwnedSubscription)

const fakeSubscription: Subscription = {
  id: 'sub-1',
  customer_id: 'user-1',
  plan_name: 'Monthly Premium',
  status: 'Active',
  start_date: '2026-05-01',
  end_date: '2026-05-30',
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
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('withOwnedSubscription', () => {
  it('returns the requireUser error verbatim when unauthenticated; body never runs', async () => {
    requireUserMock.mockResolvedValue({ ok: false, error: 'Unauthorized' })
    const body = vi.fn()

    const result = await withOwnedSubscription('sub-1', body)

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(body).not.toHaveBeenCalled()
    expect(loadOwnedSubscriptionMock).not.toHaveBeenCalled()
  })

  it('returns the loadOwnedSubscription error when sub is missing or not owned', async () => {
    requireUserMock.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ok: true, supabase: {} as any, user: { id: 'user-1' } as any,
    })
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: false, error: 'Subscription not found' })
    const body = vi.fn()

    const result = await withOwnedSubscription('sub-1', body)

    expect(result).toEqual({ error: 'Subscription not found' })
    expect(body).not.toHaveBeenCalled()
  })

  it('passes typed context to the body and returns the body result on the happy path', async () => {
    requireUserMock.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ok: true, supabase: { name: 'sb' } as any, user: { id: 'user-1' } as any,
    })
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: fakeSubscription })

    const result = await withOwnedSubscription('sub-1', async (ctx) => {
      expect(ctx.auth.user.id).toBe('user-1')
      expect(ctx.subscription.id).toBe('sub-1')
      expect(ctx.subscription.status).toBe('Active')
      return { success: true }
    })

    expect(result).toEqual({ success: true })
  })

  it('forwards subscriptionId argument to loadOwnedSubscription', async () => {
    requireUserMock.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ok: true, supabase: {} as any, user: { id: 'user-1' } as any,
    })
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: fakeSubscription })

    await withOwnedSubscription('passed-sub-id', async () => ({ success: true }))

    expect(loadOwnedSubscriptionMock).toHaveBeenCalledWith(
      expect.anything(),
      'passed-sub-id',
      'user-1',
    )
  })

  it('propagates body errors as { error }', async () => {
    requireUserMock.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ok: true, supabase: {} as any, user: { id: 'user-1' } as any,
    })
    loadOwnedSubscriptionMock.mockResolvedValue({ ok: true, subscription: fakeSubscription })

    const result = await withOwnedSubscription('sub-1', async () => ({ error: 'Validation failed' }))

    expect(result).toEqual({ error: 'Validation failed' })
  })
})
