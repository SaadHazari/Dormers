import { describe, it, expect } from 'vitest'
import { creditOutlook } from './credit-outlook'

const MONTHLY = ['monthly-max', 'monthly-premium']

describe('creditOutlook', () => {
  it('renders nothing on an empty ledger', () => {
    expect(creditOutlook([])).toEqual({
      universalAed: 0, restrictedAed: 0, restrictedIsMonthly: false,
      hasCredit: false, chip: null,
    })
  })

  // Universal credit is the ambient number: it is true no matter what the
  // customer buys next, so it is the sentence the chip leads with.
  it('leads with universal credit', () => {
    const o = creditOutlook([
      { amount_aed: 30, eligible_plan_ids: null },
      { amount_aed: 20, eligible_plan_ids: null },
    ])
    expect(o.universalAed).toBe(50)
    expect(o.restrictedAed).toBe(0)
    expect(o.hasCredit).toBe(true)
    expect(o.chip).toEqual({ amountAed: 50, sentence: 'AED 50 off your next plan' })
  })

  // The chip never blends restricted credit into the universal number — the
  // restricted story belongs to the plan cards and the statement, where the
  // condition can be shown next to the amount.
  it('keeps restricted credit out of the chip when universal credit exists', () => {
    const o = creditOutlook([
      { amount_aed: 50, eligible_plan_ids: null },
      { amount_aed: 100, eligible_plan_ids: MONTHLY },
    ])
    expect(o.universalAed).toBe(50)
    expect(o.restrictedAed).toBe(100)
    expect(o.restrictedIsMonthly).toBe(true)
    expect(o.chip).toEqual({ amountAed: 50, sentence: 'AED 50 off your next plan' })
  })

  // The pause-credit-only customer is exactly who the credit was minted to
  // bring back — their chip must not go silent, it names the condition.
  it('shows the restricted sentence when restricted credit is all there is', () => {
    const o = creditOutlook([{ amount_aed: 100, eligible_plan_ids: MONTHLY }])
    expect(o.chip).toEqual({ amountAed: 100, sentence: 'AED 100 off your next Monthly plan' })
  })

  // A restriction that is not monthly must not borrow the monthly wording —
  // the generic sentence stays honest for any future plan list.
  it('words a non-monthly restriction generically', () => {
    const o = creditOutlook([{ amount_aed: 10, eligible_plan_ids: ['weekly-flex'] }])
    expect(o.restrictedIsMonthly).toBe(false)
    expect(o.chip).toEqual({ amountAed: 10, sentence: 'AED 10 off select plans' })
  })

  // Mixed restrictions: one row unlocks on monthly, another on some other
  // plan. "Monthly" would over-promise, so the wording goes generic.
  it('goes generic when restricted rows disagree on the unlocking plan', () => {
    const o = creditOutlook([
      { amount_aed: 100, eligible_plan_ids: MONTHLY },
      { amount_aed: 10, eligible_plan_ids: ['weekly-flex'] },
    ])
    expect(o.restrictedIsMonthly).toBe(false)
    expect(o.chip).toEqual({ amountAed: 110, sentence: 'AED 110 off select plans' })
  })

  // PostgREST hands numerics back as strings — coerce or this concatenates.
  it('coerces string amounts from PostgREST', () => {
    const o = creditOutlook([
      { amount_aed: '25' as unknown as number, eligible_plan_ids: null },
      { amount_aed: '5' as unknown as number, eligible_plan_ids: null },
    ])
    expect(o.chip).toEqual({ amountAed: 30, sentence: 'AED 30 off your next plan' })
  })

  // An empty eligible list is a restriction (it applies to nothing), not
  // universal credit — same rule creditAppliesToPlan enforces at checkout.
  it('treats an empty eligible list as restricted, never universal', () => {
    const o = creditOutlook([{ amount_aed: 10, eligible_plan_ids: [] }])
    expect(o.universalAed).toBe(0)
    expect(o.restrictedAed).toBe(10)
  })
})
