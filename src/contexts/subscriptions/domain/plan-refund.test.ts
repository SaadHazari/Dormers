import { describe, it, expect } from 'vitest'
import {
  parsePlanRefundOffer, planRefundMoneyPhrase, planRefundConfirmLines,
  planRefundIdempotencyKey, friendlyPlanRefundError, PLAN_REFUND_COPY,
} from './plan-refund'

const raw = { order_id: 'o1', payment_intent: 'pi_1', refunded_meals: 14, tonight_kept: true, cash_fils: 28000, credit_fils: 1400 }

describe('parsePlanRefundOffer', () => {
  it('reads the SQL offer', () => {
    expect(parsePlanRefundOffer(raw)).toEqual({ refundedMeals: 14, tonightKept: true, cashFils: 28000, creditFils: 1400 })
  })

  it('is null when SQL offers nothing or nothing is worth refunding', () => {
    expect(parsePlanRefundOffer(null)).toBeNull()
    expect(parsePlanRefundOffer('x')).toBeNull()
    expect(parsePlanRefundOffer({ ...raw, refunded_meals: 0 })).toBeNull()
    expect(parsePlanRefundOffer({ ...raw, cash_fils: 0, credit_fils: 0 })).toBeNull()
  })

  it('keeps a credit-only offer', () => {
    expect(parsePlanRefundOffer({ ...raw, cash_fils: 0 })?.creditFils).toBe(1400)
  })
})

describe('customer words', () => {
  it('names the card and wallet parts', () => {
    expect(planRefundMoneyPhrase(28000, 1400)).toBe('AED 280 back to your card and AED 14 to your wallet')
    expect(planRefundMoneyPhrase(28000, 0)).toBe('AED 280 back to your card')
    expect(planRefundMoneyPhrase(0, 1400)).toBe('AED 14 back to your wallet')
  })

  it('says whether tonight still arrives', () => {
    const offer = parsePlanRefundOffer(raw)!
    expect(planRefundConfirmLines(offer)[0]).toBe('We refund your 14 meals left: AED 280 back to your card and AED 14 to your wallet.')
    expect(planRefundConfirmLines(offer)[1]).toContain("Tonight's dinner is already being cooked")
    const before = planRefundConfirmLines({ ...offer, tonightKept: false, refundedMeals: 1 })
    expect(before[0]).toContain('your 1 meal left')
    expect(before[1]).toBe('Your plan ends now. No more dinners will be delivered.')
  })

  it('only mentions card timing when money goes to the card', () => {
    const offer = parsePlanRefundOffer(raw)!
    expect(planRefundConfirmLines(offer)).toContain(PLAN_REFUND_COPY.cardTiming)
    expect(planRefundConfirmLines({ ...offer, cashFils: 0 })).not.toContain(PLAN_REFUND_COPY.cardTiming)
  })

  it('carries no dash or emoji', () => {
    const all = [
      ...Object.values(PLAN_REFUND_COPY),
      ...planRefundConfirmLines(parsePlanRefundOffer(raw)!),
      ...planRefundConfirmLines({ ...parsePlanRefundOffer(raw)!, tonightKept: false }),
      ...['NOT_ALLOWED', 'ALREADY', 'SEASON_HOLD', 'STRIPE_CHANGED', 'NOTHING', 'NOT_OFFERED', 'BAD_STATE', 'NOT_FOUND', 'other'].map((c) => friendlyPlanRefundError(`PLAN_REFUND_${c}`)),
    ]
    for (const line of all) {
      expect(line).not.toMatch(/[‒-―]/)
      expect(line).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })
})

describe('plumbing', () => {
  it('keys a Stripe refund to the refund row', () => {
    expect(planRefundIdempotencyKey('r1')).toBe('refund:plan:r1')
  })

  it('turns SQL refusals into plain words', () => {
    expect(friendlyPlanRefundError('PLAN_REFUND_NOT_ALLOWED: the refund switch is off')).toContain('not available for your plan right now')
    expect(friendlyPlanRefundError('PLAN_REFUND_SEASON_HOLD: x')).toContain('home page')
    expect(friendlyPlanRefundError('boom')).toBe('Could not refund your plan. Refresh and try again.')
  })
})
