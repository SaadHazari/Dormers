import { describe, it, expect } from 'vitest'
import { customerHoldFrom, buildCustomerBreak, type CustomerHold } from './customer-hold'

const sub = { id: 'sub-1', plan_name: 'Monthly Premium', status: 'Paused', season_hold_id: 'hold-1' }
const row = { id: 'hold-1', reason: 'season', state: 'held', held_meals: 9, waitlist_credit_id: 'credit-1' }

describe('customerHoldFrom', () => {
  it('maps a held plan with its waitlist credit', () => {
    expect(customerHoldFrom({ hold: row, sub, creditAmountAed: 20 })).toEqual({
      id: 'hold-1', subscriptionId: 'sub-1', reason: 'season', state: 'held', heldMeals: 9,
      waitlistCreditFils: 2000, planName: 'Monthly Premium', planStatus: 'Paused',
      refundOffer: null, refundRequested: null, refundDeclineReason: null,
    })
  })

  it('maps a customer pause with no credit, and a held Scheduled plan', () => {
    expect(customerHoldFrom({ hold: { ...row, reason: 'customer_pause', state: 'paused_by_customer' }, sub, creditAmountAed: null }))
      .toMatchObject({ reason: 'customer_pause', state: 'paused_by_customer', waitlistCreditFils: null })
    expect(customerHoldFrom({ hold: { ...row, state: 'ready' }, sub: { ...sub, status: 'Scheduled' }, creditAmountAed: 20 }))
      .toMatchObject({ state: 'ready', planStatus: 'Scheduled' })
  })

  it('ignores a hold that is not this plan\'s, is finished, or sits on a plan that is not Paused or Scheduled', () => {
    expect(customerHoldFrom({ hold: { ...row, id: 'other' }, sub, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: { ...row, state: 'released' }, sub, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: { ...row, state: 'refunded' }, sub, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: row, sub: { ...sub, status: 'Active' }, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: null, sub, creditAmountAed: null })).toBeNull()
  })
})

describe('customerHoldFrom and refunds (spec §10.3)', () => {
  const order = { amountPaidFils: 39000, creditAppliedFils: 2000, mealsCount: 20, stripePaymentId: 'pi_1', stripeSessionId: 'cs_live_1' }
  const paid = { ...row, meal_value_fils: 2050 }

  it('offers a refund on a held paid plan only once refunds are live', () => {
    expect(customerHoldFrom({ hold: paid, sub, creditAmountAed: 20, order, refundsLive: true })?.refundOffer).toEqual({ cashFils: 17550, creditFils: 900 })
    expect(customerHoldFrom({ hold: paid, sub, creditAmountAed: 20, order, refundsLive: false })?.refundOffer).toBeNull()
    expect(customerHoldFrom({ hold: paid, sub, creditAmountAed: 20, order: { ...order, stripeSessionId: 'cs_test_1' }, refundsLive: true })?.refundOffer).toBeNull()
    expect(customerHoldFrom({ hold: { ...paid, meal_value_fils: null }, sub, creditAmountAed: 20, order, refundsLive: true })?.refundOffer).toBeNull()
    // A pause carried into the break is refundable too (owner 2026-09-16, reversing X4).
    expect(customerHoldFrom({ hold: { ...paid, reason: 'customer_pause', state: 'paused_by_customer' }, sub, creditAmountAed: null, order, refundsLive: true })?.refundOffer)
      .toEqual({ cashFils: 17550, creditFils: 900 })
  })

  it('shows a request in flight with its stored amounts, and the owner\'s reason after a decline', () => {
    const requested = customerHoldFrom({ hold: { ...paid, state: 'refund_requested', cash_refund_fils: 17550, credit_share_fils: 900 }, sub, creditAmountAed: 20, order, refundsLive: true })
    expect(requested).toMatchObject({ state: 'refund_requested', refundOffer: null, refundRequested: { cashFils: 17550, creditFils: 900 } })
    expect(customerHoldFrom({ hold: { ...paid, state: 'refund_failed', cash_refund_fils: 17550, credit_share_fils: 0 }, sub, creditAmountAed: 20 })).toMatchObject({ state: 'refund_failed', refundRequested: { cashFils: 17550, creditFils: 0 } })
    expect(customerHoldFrom({ hold: { ...paid, refund_decline_reason: ' The card has expired. ' }, sub, creditAmountAed: 20, order, refundsLive: true }))
      .toMatchObject({ state: 'held', refundDeclineReason: 'The card has expired.', refundOffer: { cashFils: 17550, creditFils: 900 } })
  })
})

describe('buildCustomerBreak', () => {
  const hold = (state: CustomerHold['state']): CustomerHold => ({
    id: 'hold-1', subscriptionId: 'sub-1', reason: 'season', state, heldMeals: 9, waitlistCreditFils: 2000, planName: 'Monthly Premium', planStatus: 'Paused',
    refundOffer: null, refundRequested: null, refundDeclineReason: null,
  })

  it('shows a hold during the break, and a ready hold after reopening', () => {
    expect(buildCustomerBreak('break', hold('held'))).toEqual({ phase: 'break', hold: hold('held') })
    expect(buildCustomerBreak('open', hold('ready'))).toEqual({ phase: 'open', hold: hold('ready') })
    expect(buildCustomerBreak('winding_down', hold('ready'))).toEqual({ phase: 'winding_down', hold: hold('ready') })
  })

  it('shows a refund in flight in any phase', () => {
    expect(buildCustomerBreak('open', hold('refund_requested'))).toEqual({ phase: 'open', hold: hold('refund_requested') })
    expect(buildCustomerBreak('break', hold('refund_failed'))).toEqual({ phase: 'break', hold: hold('refund_failed') })
  })

  it('shows nothing without a hold, or for a hold still "held" outside the break', () => {
    expect(buildCustomerBreak('break', null)).toBeNull()
    expect(buildCustomerBreak('open', hold('held'))).toBeNull()
  })
})
