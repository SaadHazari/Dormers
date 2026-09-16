import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  refundable: vi.fn(),
  refund: vi.fn(),
  notify: vi.fn(),
  audit: vi.fn(),
  queue: vi.fn(),
  refundEmail: vi.fn(),
  capture: vi.fn(),
  creditNote: vi.fn(),
  findRefund: vi.fn(),
  after: vi.fn(),
}))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { m.after(fn); return fn() } }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => ({ rpc: m.rpc, from: m.from }) }))
vi.mock('@/infra/stripe/refunds', () => ({ refundableFils: m.refundable, refundPaymentFils: m.refund, findRefundByMetadata: m.findRefund }))
vi.mock('@/infra/admin-alerts/notify', () => ({ notifyAdmin: m.notify }))
vi.mock('@/contexts/admin/usecases/audit', () => ({ logAdminAction: m.audit }))
vi.mock('@/contexts/notifications/usecases/queue', () => ({ queueCustomerNotification: m.queue }))
vi.mock('@/infra/zeptomail/client', () => ({ sendRefundProcessedEmail: m.refundEmail }))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: m.capture }))
vi.mock('@/contexts/payments/usecases/refund-credit-note', () => ({ sendRefundCreditNote: m.creditNote }))

import { getPlanRefundOffer, startPlanRefund, retryPlanRefund, setRefundAllowed } from './plan-refund'

function tables(rows: Record<string, unknown>) {
  m.from.mockImplementation((table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: rows[table] ?? null, error: null }) }) }),
    update: (patch: unknown) => ({ eq: (_c: string, id: string) => { m.update(table, patch, id); return Promise.resolve({ error: null }) } }),
  }))
}

const OFFER = { order_id: 'o-1', payment_intent: 'pi_1', refunded_meals: 14, tonight_kept: true, cash_fils: 28000, credit_fils: 1400 }
const STARTED = {
  refund_id: 'r-1', subscription_id: 's-1', customer_id: 'c-1', order_id: 'o-1', plan_name: 'Monthly Max', payment_intent: 'pi_1',
  refunded_meals: 14, tonight_kept: true, cash_refund_fils: 28000, credit_share_fils: 1400, stripe_refund_id: null,
}

function rpcs(overrides: Record<string, { data?: unknown; error?: { message: string } | null }> = {}) {
  m.rpc.mockImplementation(async (fn: string) => {
    if (overrides[fn]) return { data: overrides[fn].data ?? null, error: overrides[fn].error ?? null }
    if (fn === 'plan_refund_offer') return { data: OFFER, error: null }
    if (fn === 'plan_refund_start' || fn === 'plan_refund_retry') return { data: STARTED, error: null }
    return { data: {}, error: null }
  })
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  tables({ customers: { name: 'Omar Farouk', whatsapp_number: '+971501234567', email: 'o@example.com' } })
  m.refundable.mockResolvedValue(40000)
  m.refund.mockResolvedValue('re_1')
  m.audit.mockResolvedValue(undefined)
  m.creditNote.mockResolvedValue({ ok: true, creditnoteNumber: 'CN-1', emailed: true })
  m.findRefund.mockResolvedValue(null)
  rpcs()
})

describe('getPlanRefundOffer', () => {
  it('is null when SQL has no offer (switch off or plan does not qualify)', async () => {
    rpcs({ plan_refund_offer: { data: null } })
    expect(await getPlanRefundOffer('c-1', 's-1')).toBeNull()
    expect(m.refundable).not.toHaveBeenCalled()
  })

  it('shows the offer while Stripe still allows the card share', async () => {
    expect(await getPlanRefundOffer('c-1', 's-1')).toEqual({ refundedMeals: 14, tonightKept: true, cashFils: 28000, creditFils: 1400 })
  })

  it('hides it when Stripe allows less: money already went back some other way', async () => {
    m.refundable.mockResolvedValue(20000)
    expect(await getPlanRefundOffer('c-1', 's-1')).toBeNull()
  })

  it('shows the uncapped offer when Stripe cannot be read', async () => {
    m.refundable.mockRejectedValue(new Error('timeout'))
    expect((await getPlanRefundOffer('c-1', 's-1'))?.cashFils).toBe(28000)
  })
})

describe('startPlanRefund', () => {
  it('starts under lock, refunds with the row-scoped key, finishes, sends the credit note and tells the owner', async () => {
    const result = await startPlanRefund('c-1', 's-1')

    expect(result).toEqual({ ok: true, message: expect.stringContaining('AED 280 back to your card and AED 14 to your wallet') })
    expect(m.rpc).toHaveBeenCalledWith('plan_refund_start', { p_customer_id: 'c-1', p_subscription_id: 's-1', p_refundable_cap_fils: 40000 })
    expect(m.findRefund).toHaveBeenCalledWith('pi_1', 'plan_refund_id', 'r-1')
    expect(m.refund).toHaveBeenCalledWith('pi_1', 28000, 'refund:plan:r-1', { plan_refund_id: 'r-1' })
    expect(m.after).toHaveBeenCalledTimes(1)
    expect(m.rpc).toHaveBeenCalledWith('plan_refund_finish', { p_refund_id: 'r-1', p_stripe_refund_id: 're_1' })
    expect(m.creditNote).toHaveBeenCalledWith({
      kind: 'plan_refund', refundId: 'r-1', orderId: 'o-1', customerId: 'c-1', refundedMeals: 14, cashFils: 28000, stripeRefundId: 're_1',
    })
    expect(m.notify).toHaveBeenCalledWith(expect.stringContaining("Plan refunded: Omar Farouk (+971501234567), Monthly Max, 14 meals. AED 280 to the card (re_1), AED 14 to the wallet. Tonight's dinner still goes out"), 'plan_refund')
    // The Stripe webhook tells the customer about a cash refund.
    expect(m.queue).not.toHaveBeenCalled()
  })

  it('changes nothing when there is no offer or Stripe cannot be read', async () => {
    rpcs({ plan_refund_offer: { data: null } })
    expect(await startPlanRefund('c-1', 's-1')).toEqual({ error: 'A refund is not available for this plan.' })
    rpcs()
    m.refundable.mockRejectedValue(new Error('timeout'))
    expect(await startPlanRefund('c-1', 's-1')).toEqual({ error: expect.stringContaining('Nothing changed') })
    expect(m.rpc).not.toHaveBeenCalledWith('plan_refund_start', expect.anything())
  })

  it('uses a Stripe refund an earlier attempt already made instead of paying again', async () => {
    m.findRefund.mockResolvedValue('re_earlier')
    await startPlanRefund('c-1', 's-1')
    expect(m.refund).not.toHaveBeenCalled()
    expect(m.rpc).toHaveBeenCalledWith('plan_refund_finish', { p_refund_id: 'r-1', p_stripe_refund_id: 're_earlier' })
  })

  it('tells the owner when Stripe already gave part of the payment back', async () => {
    rpcs({ plan_refund_start: { error: { message: 'PLAN_REFUND_STRIPE_CHANGED: Stripe allows 1 of 2 fils' } } })
    expect(await startPlanRefund('c-1', 's-1')).toEqual({ error: expect.stringContaining('already refunded') })
    expect(m.notify).toHaveBeenCalledWith(expect.stringContaining('Plan refund REFUSED for Omar Farouk'), 'plan_refund')
    expect(m.refund).not.toHaveBeenCalled()
  })

  it('passes SQL refusals on in plain words', async () => {
    rpcs({ plan_refund_start: { error: { message: 'PLAN_REFUND_NOT_ALLOWED: the refund switch is off' } } })
    expect(await startPlanRefund('c-1', 's-1')).toEqual({ error: expect.stringContaining('not available for your plan right now') })
    expect(m.refund).not.toHaveBeenCalled()
  })

  it('marks the refund failed when Stripe refuses and tells the owner, never the raw error to the customer', async () => {
    m.refund.mockRejectedValue(new Error('charge_disputed'))
    const result = await startPlanRefund('c-1', 's-1')
    expect(result).toEqual({ error: 'Your plan has ended and we are finishing your refund by hand. We will message you on WhatsApp.' })
    expect(m.rpc).toHaveBeenCalledWith('plan_refund_fail', { p_refund_id: 'r-1', p_error: 'Stripe: charge_disputed', p_stripe_refund_id: null })
    expect(m.rpc).not.toHaveBeenCalledWith('plan_refund_finish', expect.anything())
    expect(m.notify).toHaveBeenCalledWith(expect.stringContaining('Plan refund FAILED at Stripe'), 'plan_refund')
    expect(m.creditNote).not.toHaveBeenCalled()
  })

  it('keeps the Stripe refund id when only the recording fails', async () => {
    rpcs({ plan_refund_finish: { error: { message: 'deadlock' } } })
    await startPlanRefund('c-1', 's-1')
    expect(m.rpc).toHaveBeenCalledWith('plan_refund_fail', { p_refund_id: 'r-1', p_error: expect.stringContaining('re_1'), p_stripe_refund_id: 're_1' })
    expect(m.creditNote).not.toHaveBeenCalled()
  })

  it('a credit-only refund skips Stripe and tells the customer itself', async () => {
    rpcs({ plan_refund_start: { data: { ...STARTED, cash_refund_fils: 0 } } })
    const result = await startPlanRefund('c-1', 's-1')
    expect(result).toEqual({ ok: true, message: expect.stringContaining('AED 14 back to your wallet') })
    expect(m.refund).not.toHaveBeenCalled()
    expect(m.rpc).toHaveBeenCalledWith('plan_refund_finish', { p_refund_id: 'r-1', p_stripe_refund_id: '' })
    expect(m.creditNote).not.toHaveBeenCalled()
    expect(m.queue).toHaveBeenCalledWith('c-1', 'refund_processed', expect.any(Date), { refund_aed: '14.00' })
    expect(m.refundEmail).toHaveBeenCalledWith(expect.objectContaining({ toEmail: 'o@example.com', firstName: 'Omar', refundAed: '14.00' }))
  })
})

describe('retryPlanRefund', () => {
  it('keeps the amount, looks for an earlier Stripe refund, then pays', async () => {
    tables({ customers: { name: 'Omar' } })
    const result = await retryPlanRefund('saad@dormers.ae', 'r-1')
    expect(result).toEqual({ ok: true, message: 'Refunded: AED 280 to the card, AED 14 to the wallet.' })
    expect(m.rpc).toHaveBeenCalledWith('plan_refund_retry', { p_refund_id: 'r-1', p_refundable_cap_fils: null })
    expect(m.findRefund).toHaveBeenCalledWith('pi_1', 'plan_refund_id', 'r-1')
    expect(m.refund).toHaveBeenCalledWith('pi_1', 28000, 'refund:plan:r-1', { plan_refund_id: 'r-1' })
    expect(m.audit).toHaveBeenCalledWith('saad@dormers.ae', 'plan_refund_retried', 'plan_refund', 'r-1', { ok: true })
  })

  it('never calls Stripe again once a refund went through', async () => {
    tables({ customers: { name: 'Omar' } })
    rpcs({ plan_refund_retry: { data: { ...STARTED, stripe_refund_id: 're_1' } } })
    await retryPlanRefund('saad@dormers.ae', 'r-1')
    expect(m.findRefund).not.toHaveBeenCalled()
    expect(m.refund).not.toHaveBeenCalled()
    expect(m.rpc).toHaveBeenCalledWith('plan_refund_finish', { p_refund_id: 'r-1', p_stripe_refund_id: 're_1' })
  })
})

describe('setRefundAllowed', () => {
  it('stamps who turned it on, clears it when off, and audits both', async () => {
    expect(await setRefundAllowed('saad@dormers.ae', 'c-1', true)).toEqual({ ok: true, message: expect.stringContaining('Refund allowed') })
    expect(m.update).toHaveBeenCalledWith('customers', { refund_allowed_at: expect.any(String), refund_allowed_by: 'saad@dormers.ae' }, 'c-1')
    expect(m.audit).toHaveBeenCalledWith('saad@dormers.ae', 'plan_refund_allowed', 'customer', 'c-1')

    await setRefundAllowed('saad@dormers.ae', 'c-1', false)
    expect(m.update).toHaveBeenLastCalledWith('customers', { refund_allowed_at: null, refund_allowed_by: null }, 'c-1')
    expect(m.audit).toHaveBeenLastCalledWith('saad@dormers.ae', 'plan_refund_disallowed', 'customer', 'c-1')
  })
})
