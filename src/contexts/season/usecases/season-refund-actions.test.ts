import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), refundable: vi.fn(), notify: vi.fn(), capture: vi.fn() }))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ rpc: m.rpc, from: m.from }) }))
vi.mock('@/infra/stripe/refunds', () => ({ refundableFils: m.refundable }))
vi.mock('@/infra/admin-alerts/notify', () => ({ notifyAdmin: m.notify }))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: m.capture }))
vi.mock('@/contexts/subscriptions/usecases/with-owned-subscription', () => ({
  withOwnedSubscription: (id: string, body: (ctx: unknown) => Promise<unknown>) =>
    body({ auth: { user: { id: 'user-1' } }, subscription: { id, plan_name: 'Monthly Premium', season_hold_id: id === 'sub-none' ? null : 'hold-1' } }),
}))

import { requestSeasonRefund, cancelSeasonRefundRequest } from './season-refund-actions'
import { REFUND_COPY } from '../domain/season-refund'

const HOLD = { id: 'hold-1', reason: 'season', state: 'held', held_meals: 9, meal_value_fils: 2050, order_id: 'o-1' }
const ORDER = { amount_paid_fils: 39000, credit_applied_fils: 2000, meals_count: 20, stripe_payment_id: 'pi_1', stripe_session_id: 'cs_live_1' }

function tables(rows: Record<string, unknown>) {
  m.from.mockImplementation((table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: rows[table] ?? null, error: null }) }) }),
  }))
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  tables({ season_holds: HOLD, orders: ORDER, customers: { name: 'Omar Farouk', phone: '+971501234567' } })
  m.refundable.mockResolvedValue(20000)
})

describe('requestSeasonRefund (spec §10.3 step 1)', () => {
  it('reads the Stripe cap, asks SQL with the owned ids, and tells the owner', async () => {
    m.rpc.mockResolvedValue({ data: { plan_name: 'Monthly Premium', held_meals: 9, cash_refund_fils: 17550, credit_share_fils: 900 }, error: null })
    expect(await requestSeasonRefund('sub-1')).toEqual({ success: true, message: REFUND_COPY.requested })
    expect(m.rpc).toHaveBeenCalledWith('season_request_refund', { p_customer_id: 'user-1', p_subscription_id: 'sub-1', p_refundable_cap_fils: 20000 })
    expect(m.notify).toHaveBeenCalledWith(
      'Refund requested: Omar Farouk (+971501234567), Monthly Premium, 9 held meals. AED 175.50 back to the card, AED 9 back to the wallet. Approve or decline on the Season page.',
      'season_refund',
    )
  })

  it('refuses a plan with no hold, a hold with no offer, and a test-mode order (D7) without touching SQL', async () => {
    expect(await requestSeasonRefund('sub-none')).toEqual({ error: 'This plan is not held for next semester.' })
    tables({ season_holds: { ...HOLD, reason: 'customer_pause', state: 'paused_by_customer' }, orders: ORDER })
    expect(await requestSeasonRefund('sub-1')).toEqual({ error: 'A refund is not available for this plan.' })
    tables({ season_holds: HOLD, orders: { ...ORDER, stripe_session_id: 'cs_test_1' } })
    expect(await requestSeasonRefund('sub-1')).toEqual({ error: 'A refund is not available for this plan.' })
    expect(m.rpc).not.toHaveBeenCalled()
    expect(m.refundable).not.toHaveBeenCalled()
  })

  it('does not request when Stripe cannot be read, and passes SQL refusals on in plain words', async () => {
    m.refundable.mockRejectedValue(new Error('timeout'))
    expect(await requestSeasonRefund('sub-1')).toEqual({ error: 'We could not check your payment with Stripe just now. Try again in a minute.' })
    expect(m.rpc).not.toHaveBeenCalled()
    m.refundable.mockResolvedValue(20000)
    m.rpc.mockResolvedValue({ data: null, error: { message: 'SEASON_REFUND_BAD_STATE: hold is refund_requested' } })
    expect(await requestSeasonRefund('sub-1')).toEqual({ error: REFUND_COPY.changed })
    expect(m.notify).not.toHaveBeenCalled()
  })
})

describe('cancelSeasonRefundRequest', () => {
  it('cancels through SQL and tells the owner there is nothing to do', async () => {
    m.rpc.mockResolvedValue({ data: { plan_name: 'Monthly Premium', held_meals: 9, state: 'held' }, error: null })
    expect(await cancelSeasonRefundRequest('sub-1')).toEqual({ success: true, message: 'Request cancelled. Your meals stay kept for next semester.' })
    expect(m.rpc).toHaveBeenCalledWith('season_cancel_refund_request', { p_customer_id: 'user-1', p_subscription_id: 'sub-1' })
    expect(m.notify).toHaveBeenCalledWith(expect.stringContaining('Refund request cancelled: Omar Farouk'), 'season_refund')
  })

  it('reports a request that is no longer cancellable', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'SEASON_REFUND_BAD_STATE: hold is refund_processing' } })
    expect(await cancelSeasonRefundRequest('sub-1')).toEqual({ error: REFUND_COPY.changed })
  })
})
