import { describe, it, expect } from 'vitest'
import {
  seasonRefundAmounts, seasonRefundOffer, capRefund, refundableOrder, refundAmountsPhrase,
  friendlyRefundError, seasonRefundIdempotencyKey, isRefundState, isUnpaidPlanName, REFUND_COPY,
} from './season-refund'

const order = { amountPaidFils: 39000, creditAppliedFils: 2000, mealsCount: 20, stripePaymentId: 'pi_1', stripeSessionId: 'cs_live_1' }
const hold = { reason: 'season' as const, state: 'held', heldMeals: 9, mealValueFils: 2050 }

describe('refundableOrder (D7)', () => {
  it('needs recorded money, a PaymentIntent, and a live session', () => {
    expect(refundableOrder(order)).toBe(true)
    expect(refundableOrder({ ...order, stripeSessionId: null })).toBe(true)
    expect(refundableOrder({ ...order, stripeSessionId: 'cs_test_1' })).toBe(false)
    expect(refundableOrder({ ...order, stripePaymentId: null })).toBe(false)
    expect(refundableOrder({ ...order, amountPaidFils: null })).toBe(false)
    expect(refundableOrder({ ...order, mealsCount: 0 })).toBe(false)
    expect(refundableOrder(null)).toBe(false)
  })
})

describe('seasonRefundAmounts (spec §10.3)', () => {
  it('floors the held share of cash and of credit, like the SQL twin', () => {
    expect(seasonRefundAmounts(9, order)).toEqual({ cashFils: 17550, creditFils: 900 })
    expect(seasonRefundAmounts(7, { ...order, amountPaidFils: 10000, creditAppliedFils: 333, mealsCount: 3 })).toEqual({ cashFils: 23333, creditFils: 777 })
    expect(seasonRefundAmounts(0, order)).toBeNull()
    expect(seasonRefundAmounts(9, { ...order, stripeSessionId: 'cs_test_1' })).toBeNull()
  })

  it('caps the cash at what Stripe still allows, never the credit', () => {
    expect(capRefund({ cashFils: 17550, creditFils: 900 }, 10000)).toEqual({ cashFils: 10000, creditFils: 900 })
    expect(capRefund({ cashFils: 17550, creditFils: 900 }, 0)).toEqual({ cashFils: 0, creditFils: 900 })
    expect(capRefund({ cashFils: 17550, creditFils: 900 }, 99999)).toEqual({ cashFils: 17550, creditFils: 900 })
  })
})

describe('seasonRefundOffer', () => {
  it('offers on a held or ready season hold of a paid plan with real money, once refunds are live', () => {
    expect(seasonRefundOffer({ refundsLive: true, hold, planName: 'Monthly Premium', order })).toEqual({ cashFils: 17550, creditFils: 900 })
    expect(seasonRefundOffer({ refundsLive: true, hold: { ...hold, state: 'ready' }, planName: 'Monthly Premium', order })).toEqual({ cashFils: 17550, creditFils: 900 })
  })

  it('offers on a pause carried into the break (owner 2026-09-16, reversing X4)', () => {
    // That customer cannot resume while the kitchen is closed, so the wait is ours.
    expect(seasonRefundOffer({ refundsLive: true, hold: { ...hold, reason: 'customer_pause', state: 'paused_by_customer' }, planName: 'Monthly Premium', order }))
      .toEqual({ cashFils: 17550, creditFils: 900 })
    // Still nothing once it is released, refunded, or on a staff plan.
    expect(seasonRefundOffer({ refundsLive: true, hold: { ...hold, reason: 'customer_pause', state: 'released' }, planName: 'Monthly Premium', order })).toBeNull()
    expect(seasonRefundOffer({ refundsLive: true, hold: { ...hold, reason: 'customer_pause', state: 'paused_by_customer' }, planName: 'Staff Monthly', order })).toBeNull()
  })

  it('never offers when refunds are off, on a staff or welcome plan (X5), an estimate, or a request in flight', () => {
    expect(seasonRefundOffer({ refundsLive: false, hold, planName: 'Monthly Premium', order })).toBeNull()
    expect(seasonRefundOffer({ refundsLive: true, hold, planName: 'Staff Monthly', order })).toBeNull()
    expect(seasonRefundOffer({ refundsLive: true, hold, planName: 'Welcome Meal', order })).toBeNull()
    expect(seasonRefundOffer({ refundsLive: true, hold: { ...hold, mealValueFils: null }, planName: 'Monthly Premium', order })).toBeNull()
    expect(seasonRefundOffer({ refundsLive: true, hold: { ...hold, state: 'refund_requested' }, planName: 'Monthly Premium', order })).toBeNull()
    expect(seasonRefundOffer({ refundsLive: true, hold, planName: 'Monthly Premium', order: { ...order, amountPaidFils: 0, creditAppliedFils: 0 } })).toBeNull()
    expect(isUnpaidPlanName('Intern Program')).toBe(true)
    expect(isUnpaidPlanName('Monthly Max')).toBe(false)
  })
})

describe('words', () => {
  it('names the card and the wallet, with no dash', () => {
    expect(refundAmountsPhrase({ cashFils: 16200, creditFils: 0 })).toBe('AED 162 back to your card')
    expect(refundAmountsPhrase({ cashFils: 15000, creditFils: 1200 })).toBe('AED 150 back to your card and AED 12 to your wallet')
    expect(refundAmountsPhrase({ cashFils: 0, creditFils: 1200 })).toBe('AED 12 back to your wallet')
    for (const text of Object.values(REFUND_COPY)) expect(text).not.toMatch(/[–—]/)
  })

  it('turns SQL refusals into plain words', () => {
    expect(friendlyRefundError('SEASON_REFUND_BAD_STATE: hold is refund_requested')).toBe(REFUND_COPY.changed)
    expect(friendlyRefundError('SEASON_REFUND_NOT_OFFERED: the order was not paid through a live Stripe payment (D7)')).toBe('A refund is not available for this plan.')
    expect(friendlyRefundError('SEASON_REFUND_NOTHING: nothing is left')).toBe('There is nothing left to refund on this payment.')
    expect(friendlyRefundError('SEASON_REFUND_NOT_HELD: plan x has no hold')).toBe('This plan is not held for next semester.')
    expect(friendlyRefundError('something else')).toBe('Could not update the refund. Refresh and try again.')
  })

  it('keys the Stripe refund to the hold, and knows the refund states', () => {
    expect(seasonRefundIdempotencyKey('h-1')).toBe('refund:season:h-1')
    expect(isRefundState('refund_failed')).toBe(true)
    expect(isRefundState('held')).toBe(false)
  })
})
