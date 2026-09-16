import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  refundable: vi.fn(),
  refund: vi.fn(),
  notify: vi.fn(),
  audit: vi.fn(),
  queue: vi.fn(),
  refundEmail: vi.fn(),
  seasonEmail: vi.fn(),
  capture: vi.fn(),
  creditNote: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ rpc: m.rpc, from: m.from }) }))
vi.mock('@/infra/stripe/refunds', () => ({ refundableFils: m.refundable, refundPaymentFils: m.refund }))
vi.mock('@/infra/admin-alerts/notify', () => ({ notifyAdmin: m.notify }))
vi.mock('@/contexts/admin/usecases/audit', () => ({ logAdminAction: m.audit }))
vi.mock('@/contexts/notifications/usecases/queue', () => ({ queueCustomerNotification: m.queue }))
vi.mock('@/infra/zeptomail/client', () => ({ sendRefundProcessedEmail: m.refundEmail, sendSeasonTemplateEmail: m.seasonEmail }))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: m.capture }))
vi.mock('@/contexts/payments/usecases/refund-credit-note', () => ({ sendRefundCreditNote: m.creditNote }))

import { approveSeasonRefund, declineSeasonRefund } from './season-refund-admin'

/** Tables read through .from(): season_holds (order_id), orders (stripe_payment_id), customers (name, email). */
function tables(rows: Record<string, unknown>) {
  m.from.mockImplementation((table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: rows[table] ?? null, error: null }) }) }),
  }))
}

const approved = {
  hold_id: 'h-1', subscription_id: 's-1', customer_id: 'c-1', order_id: 'o-1', plan_name: 'Monthly Premium', held_meals: 9,
  payment_intent: 'pi_1', cash_refund_fils: 17550, credit_share_fils: 900, stripe_refund_id: null,
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  tables({ season_holds: { order_id: 'o-1', state: 'refund_requested' }, orders: { stripe_payment_id: 'pi_1' }, customers: { name: 'Omar Farouk', email: 'o@example.com' } })
  m.refundable.mockResolvedValue(20000)
  m.audit.mockResolvedValue(undefined)
})

describe('approveSeasonRefund (spec §10.3 steps 2 to 4)', () => {
  it('reads the Stripe cap, moves the hold to processing, refunds with the hold-scoped key, then finishes', async () => {
    m.rpc.mockImplementation(async (fn: string) => fn === 'season_approve_refund' ? { data: approved, error: null } : { data: {}, error: null })
    m.refund.mockResolvedValue('re_1')

    const result = await approveSeasonRefund('saad@dormers.ae', 'h-1')

    expect(result).toEqual({ ok: true, message: 'Refunded: AED 175.50 back to the card (re_1), AED 9 back to the wallet. The plan has ended.' })
    expect(m.rpc).toHaveBeenNthCalledWith(1, 'season_approve_refund', { p_hold_id: 'h-1', p_actor: 'saad@dormers.ae', p_refundable_cap_fils: 20000 })
    expect(m.refund).toHaveBeenCalledWith('pi_1', 17550, 'refund:season:h-1')
    expect(m.rpc).toHaveBeenNthCalledWith(2, 'season_finish_refund', { p_hold_id: 'h-1', p_stripe_refund_id: 're_1' })
    expect(m.audit).toHaveBeenCalledWith('saad@dormers.ae', 'season_refund_approved', 'season_hold', 'h-1', expect.objectContaining({ stripe_refund_id: 're_1', cash_refund_fils: 17550 }))
    expect(m.creditNote).toHaveBeenCalledWith({
      kind: 'season_refund', refundId: 'h-1', orderId: 'o-1', customerId: 'c-1', refundedMeals: 9, cashFils: 17550, stripeRefundId: 're_1',
    })
    // The Stripe webhook tells the customer; nothing is sent from here for a cash refund.
    expect(m.queue).not.toHaveBeenCalled()
    expect(m.refundEmail).not.toHaveBeenCalled()
  })

  it('changes nothing when Stripe cannot be read', async () => {
    m.refundable.mockRejectedValue(new Error('timeout'))
    expect(await approveSeasonRefund('saad@dormers.ae', 'h-1')).toEqual({ error: 'Stripe could not be read just now. Nothing changed; try again in a minute.' })
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('refuses a hold with no payment behind it, and passes SQL refusals on in plain words', async () => {
    tables({ season_holds: { order_id: null } })
    expect(await approveSeasonRefund('saad@dormers.ae', 'h-1')).toEqual({ error: 'This hold has no Stripe payment behind it, so nothing can be refunded.' })
    tables({ season_holds: { order_id: 'o-1' }, orders: { stripe_payment_id: 'pi_1' } })
    m.rpc.mockResolvedValue({ data: null, error: { message: 'SEASON_REFUND_BAD_STATE: hold is refunded' } })
    expect(await approveSeasonRefund('saad@dormers.ae', 'h-1')).toEqual({ error: 'Your plan changed. Refresh and try again.' })
    expect(m.refund).not.toHaveBeenCalled()
  })

  it('marks the hold failed when Stripe refuses, keeps the plan, and tells the owner', async () => {
    m.rpc.mockImplementation(async (fn: string) => fn === 'season_approve_refund' ? { data: approved, error: null } : { data: {}, error: null })
    m.refund.mockRejectedValue(new Error('charge_already_refunded'))

    const result = await approveSeasonRefund('saad@dormers.ae', 'h-1')

    expect(result).toEqual({ error: 'Stripe refused the refund: charge_already_refunded. It is marked as failed; press Try the refund again when Stripe is working.' })
    expect(m.rpc).toHaveBeenCalledWith('season_fail_refund', { p_hold_id: 'h-1', p_error: 'Stripe: charge_already_refunded', p_stripe_refund_id: null })
    expect(m.rpc).not.toHaveBeenCalledWith('season_finish_refund', expect.anything())
    expect(m.notify).toHaveBeenCalledWith(expect.stringContaining('FAILED at Stripe'), 'season_refund')
  })

  it('keeps the Stripe refund id on the hold when only the recording failed, so Retry never pays twice', async () => {
    m.rpc.mockImplementation(async (fn: string) =>
      fn === 'season_approve_refund' ? { data: approved, error: null }
      : fn === 'season_finish_refund' ? { data: null, error: { message: 'deadlock' } }
      : { data: {}, error: null })
    m.refund.mockResolvedValue('re_1')

    const result = await approveSeasonRefund('saad@dormers.ae', 'h-1')

    expect(result).toEqual({ error: 'Stripe accepted the refund (re_1) but recording it failed: deadlock. Retry; Stripe will not pay twice.' })
    expect(m.rpc).toHaveBeenCalledWith('season_fail_refund', { p_hold_id: 'h-1', p_error: 'Recording failed after Stripe accepted re_1: deadlock', p_stripe_refund_id: 're_1' })
  })

  it('on a retry after such a failure, skips Stripe and finishes with the refund already made', async () => {
    m.rpc.mockImplementation(async (fn: string) => fn === 'season_approve_refund' ? { data: { ...approved, stripe_refund_id: 're_1' }, error: null } : { data: {}, error: null })
    const result = await approveSeasonRefund('saad@dormers.ae', 'h-1')
    expect(result).toMatchObject({ ok: true })
    expect(m.refund).not.toHaveBeenCalled()
    expect(m.rpc).toHaveBeenCalledWith('season_finish_refund', { p_hold_id: 'h-1', p_stripe_refund_id: 're_1' })
  })

  it('a credit-only refund needs no Stripe call and tells the customer itself', async () => {
    m.rpc.mockImplementation(async (fn: string) => fn === 'season_approve_refund' ? { data: { ...approved, cash_refund_fils: 0, credit_share_fils: 1800 }, error: null } : { data: {}, error: null })
    m.queue.mockResolvedValue(undefined)
    m.refundEmail.mockResolvedValue(undefined)

    const result = await approveSeasonRefund('saad@dormers.ae', 'h-1')

    expect(result).toEqual({ ok: true, message: 'Refunded: AED 0 back to the card, AED 18 back to the wallet. The plan has ended.' })
    expect(m.refund).not.toHaveBeenCalled()
    expect(m.rpc).toHaveBeenCalledWith('season_finish_refund', { p_hold_id: 'h-1', p_stripe_refund_id: '' })
    expect(m.queue).toHaveBeenCalledWith('c-1', 'refund_processed', expect.any(Date), { refund_aed: '18.00' })
    expect(m.refundEmail).toHaveBeenCalledWith(expect.objectContaining({ toEmail: 'o@example.com', firstName: 'Omar', refundAed: '18.00', creditsRestored: false }))
  })
})

describe('declineSeasonRefund (spec §10.3 step 5, N13b)', () => {
  it('needs a reason the customer will read', async () => {
    expect(await declineSeasonRefund('saad@dormers.ae', 'h-1', '   ')).toEqual({ error: 'Give the customer a reason; they read it on their plan card.' })
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('moves the hold back, emails the reason, and logs it', async () => {
    m.rpc.mockResolvedValue({ data: { subscription_id: 's-1', customer_id: 'c-1', plan_name: 'Monthly Premium', held_meals: 9, state: 'held' }, error: null })
    m.seasonEmail.mockResolvedValue(undefined)

    const result = await declineSeasonRefund('saad@dormers.ae', 'h-1', ' The card on this order has expired. ')

    expect(result).toEqual({ ok: true, message: 'Declined. The customer sees your reason on their plan card and by email.' })
    expect(m.rpc).toHaveBeenCalledWith('season_decline_refund', { p_hold_id: 'h-1', p_actor: 'saad@dormers.ae', p_reason: 'The card on this order has expired.' })
    expect(m.seasonEmail).toHaveBeenCalledWith({
      toEmail: 'o@example.com', firstName: 'Omar',
      envKey: 'ZEPTOMAIL_TPL_SEASON_REFUND_DECLINED',
      mergeInfo: { plan_name: 'Monthly Premium', held_meals: '9', reason: 'The card on this order has expired.' },
    })
    expect(m.audit).toHaveBeenCalledWith('saad@dormers.ae', 'season_refund_declined', 'season_hold', 'h-1', expect.objectContaining({ reason: 'The card on this order has expired.' }))
  })

  it('a failed email never undoes the decline', async () => {
    m.rpc.mockResolvedValue({ data: { subscription_id: 's-1', customer_id: 'c-1', plan_name: 'Monthly Premium', held_meals: 9, state: 'ready' }, error: null })
    m.seasonEmail.mockRejectedValue(new Error('zepto down'))
    expect(await declineSeasonRefund('saad@dormers.ae', 'h-1', 'No.')).toMatchObject({ ok: true })
    expect(m.capture).toHaveBeenCalled()
  })
})
