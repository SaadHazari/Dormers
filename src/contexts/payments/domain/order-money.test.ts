import { describe, it, expect } from 'vitest'
import {
  creditUsedFils, orderMoneyColumns, redemptionFromMetadata, planOrderBackfill, creditOnlyMoney, stripeOrderMoney, isLiveStripeKey,
  envFileDefinesLiveKey, stripeErrorSummary,
} from './order-money'

describe('creditUsedFils', () => {
  it('adds up the rows redeemed in full, reading PostgREST numeric strings', () => {
    expect(creditUsedFils({ fullRowAmountsAed: [20, '15.50'], splitUseFils: null })).toBe(3550)
  })

  it('counts only the used part of a split row, never the whole row', () => {
    // A AED 5,500 row paid AED 10.24 of the plan; the other AED 5,489.76
    // went back to the wallet as a _split_remainder row.
    expect(creditUsedFils({ fullRowAmountsAed: [], splitUseFils: 1024 })).toBe(1024)
    expect(creditUsedFils({ fullRowAmountsAed: [20, 15], splitUseFils: 1024 })).toBe(4524)
  })

  it('is 0 when no credit was used', () => {
    expect(creditUsedFils({ fullRowAmountsAed: [], splitUseFils: null })).toBe(0)
  })
})

describe('orderMoneyColumns', () => {
  it('records the card charge and the credit used', () => {
    expect(orderMoneyColumns({ cardChargeFils: 41200, creditUsedFils: 2000 })).toEqual({ amount_paid_fils: 41200, credit_applied_fils: 2000 })
  })

  it('records a credit-only order as no card charge', () => {
    expect(orderMoneyColumns({ cardChargeFils: 0, creditUsedFils: 43200 })).toEqual({ amount_paid_fils: 0, credit_applied_fils: 43200 })
  })

  it('records nothing when the card charge is not known', () => {
    expect(orderMoneyColumns({ cardChargeFils: null, creditUsedFils: 2000 })).toBeNull()
    expect(orderMoneyColumns({ cardChargeFils: undefined, creditUsedFils: 0 })).toBeNull()
  })
})

describe('redemptionFromMetadata', () => {
  it('reads the rows and split the checkout route stamped on the session', () => {
    expect(redemptionFromMetadata({ applied_credit_ids: 'c1,c2', split_credit_id: 'c3', split_credit_use_fils: '1024', credit_applied_fils: '4524' }))
      .toEqual({ fullRowIds: ['c1', 'c2'], splitUseFils: 1024, hasCreditMetadata: true })
    expect(redemptionFromMetadata({ applied_credit_ids: '', split_credit_id: '', split_credit_use_fils: '0', credit_applied_fils: '0' }))
      .toEqual({ fullRowIds: [], splitUseFils: null, hasCreditMetadata: true })
  })

  it('knows when a session carries no credit metadata at all', () => {
    expect(redemptionFromMetadata({ user_id: 'u1' })).toEqual({ fullRowIds: [], splitUseFils: null, hasCreditMetadata: false })
    expect(redemptionFromMetadata(null)).toEqual({ fullRowIds: [], splitUseFils: null, hasCreditMetadata: false })
  })
})

describe('planOrderBackfill', () => {
  const order = (o: Partial<Parameters<typeof planOrderBackfill>[0]> = {}) => ({
    paymentMethod: 'stripe', stripeSessionId: null, stripePaymentId: null, amountPaidFils: null, creditAppliedFils: null, ...o,
  })

  it('leaves an order that already records its money', () => {
    expect(planOrderBackfill(order({ amountPaidFils: 44000, creditAppliedFils: 0 }))).toEqual({ kind: 'skip', reason: 'already recorded' })
  })

  it('treats test-mode payments as not money (pilot)', () => {
    expect(planOrderBackfill(order({ stripeSessionId: 'cs_test_a1', stripePaymentId: 'pi_3U9k' })))
      .toEqual({ kind: 'unresolvable', reason: 'Stripe test mode: test payments are not money' })
  })

  it('cannot resolve a card order with no Stripe ids', () => {
    expect(planOrderBackfill(order())).toEqual({ kind: 'unresolvable', reason: 'no Stripe session or payment id' })
  })

  it('reads live-mode orders from Stripe', () => {
    expect(planOrderBackfill(order({ stripeSessionId: 'cs_live_a1', stripePaymentId: 'pi_1' })))
      .toEqual({ kind: 'stripe_live', sessionId: 'cs_live_a1', paymentIntentId: 'pi_1' })
    expect(planOrderBackfill(order({ stripePaymentId: 'pi_1' })))
      .toEqual({ kind: 'stripe_live', sessionId: null, paymentIntentId: 'pi_1' })
  })

  it('reads credit-only orders from the ledger', () => {
    expect(planOrderBackfill(order({ paymentMethod: 'credit' }))).toEqual({ kind: 'credit_only' })
    expect(planOrderBackfill(order({ paymentMethod: null, stripeSessionId: 'free:9f2c' }))).toEqual({ kind: 'credit_only' })
  })
})

describe('creditOnlyMoney', () => {
  it('records no card charge and the credit applied to the order', () => {
    expect(creditOnlyMoney({ creditUsedFils: 43200, splitRemainderNearby: false })).toEqual({ amount_paid_fils: 0, credit_applied_fils: 43200 })
  })

  it('gives up when a split remainder hides how much of a row was used, or the rows could not be read', () => {
    expect(creditOnlyMoney({ creditUsedFils: 550000, splitRemainderNearby: true })).toBeNull()
    expect(creditOnlyMoney({ creditUsedFils: null, splitRemainderNearby: false })).toBeNull()
  })
})

describe('stripeOrderMoney', () => {
  const input = (i: Partial<Parameters<typeof stripeOrderMoney>[0]> = {}) => ({
    amountReceivedFils: 41200, sessionAmountTotalFils: 41200, hasCreditMetadata: true, creditUsedFils: 0, creditsAppliedToOrder: 0, ...i,
  })

  it('takes the amount the PaymentIntent received plus the credit used', () => {
    expect(stripeOrderMoney(input({ creditUsedFils: 2000, creditsAppliedToOrder: 1 })))
      .toEqual({ amount_paid_fils: 41200, credit_applied_fils: 2000 })
  })

  it('falls back to the session total when there is no intent', () => {
    expect(stripeOrderMoney(input({ amountReceivedFils: null, sessionAmountTotalFils: 43200, hasCreditMetadata: false, creditUsedFils: null })))
      .toEqual({ amount_paid_fils: 43200, credit_applied_fils: 0 })
  })

  it('gives up without an amount', () => {
    expect(stripeOrderMoney(input({ amountReceivedFils: null, sessionAmountTotalFils: null })))
      .toEqual({ unresolvable: 'Stripe has no amount for this order' })
  })

  it('gives up when credit was used but the session never said how', () => {
    expect(stripeOrderMoney(input({ hasCreditMetadata: false, creditUsedFils: null, creditsAppliedToOrder: 2 })))
      .toEqual({ unresolvable: 'credit was used but the session has no credit metadata' })
  })

  it('gives up when the credit rows could not be read', () => {
    expect(stripeOrderMoney(input({ creditUsedFils: null, creditsAppliedToOrder: 1 })))
      .toEqual({ unresolvable: 'the credit rows this order used could not be read' })
  })
})

describe('isLiveStripeKey', () => {
  it('only accepts live secret or restricted keys', () => {
    expect(isLiveStripeKey('sk_live_abc')).toBe(true)
    expect(isLiveStripeKey('rk_live_abc')).toBe(true)
    expect(isLiveStripeKey('sk_test_abc')).toBe(false)
    expect(isLiveStripeKey(undefined)).toBe(false)
  })
})

describe('envFileDefinesLiveKey', () => {
  it('finds the live key name in an env file, however the line is written', () => {
    expect(envFileDefinesLiveKey('NEXT_PUBLIC_SUPABASE_URL=x\nSTRIPE_LIVE_SECRET_KEY=abc\n')).toBe(true)
    expect(envFileDefinesLiveKey('export STRIPE_LIVE_SECRET_KEY = "abc"')).toBe(true)
  })

  it('ignores other keys, comments and a missing file', () => {
    expect(envFileDefinesLiveKey('STRIPE_SECRET_KEY=abc\n# STRIPE_LIVE_SECRET_KEY=abc\nMY_STRIPE_LIVE_SECRET_KEY=abc')).toBe(false)
    expect(envFileDefinesLiveKey(null)).toBe(false)
  })
})

describe('stripeErrorSummary', () => {
  it('reports only the type and code, never the message', () => {
    const authErr = Object.assign(new Error('Invalid API Key provided: sk_live_****wxyz'), { type: 'StripeAuthenticationError' })
    expect(stripeErrorSummary(authErr)).toBe('Stripe read failed (type StripeAuthenticationError, code none)')
    expect(stripeErrorSummary(authErr)).not.toContain('sk_live_')
    expect(stripeErrorSummary({ type: 'StripeInvalidRequestError', code: 'resource_missing', message: 'No such payment_intent' }))
      .toBe('Stripe read failed (type StripeInvalidRequestError, code resource_missing)')
  })

  it('copes with a failure that is not a Stripe error', () => {
    expect(stripeErrorSummary(null)).toBe('Stripe read failed (type unknown, code none)')
  })
})
