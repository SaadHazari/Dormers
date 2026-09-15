import { describe, it, expect } from 'vitest'
import { creditUsedFils, orderMoneyColumns } from './order-money'

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
