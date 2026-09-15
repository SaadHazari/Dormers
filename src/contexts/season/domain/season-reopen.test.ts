import { describe, it, expect } from 'vitest'
import { reopenSummaryFrom } from './season-reopen'

describe('reopenSummaryFrom', () => {
  it('reads the holds that became ready', () => {
    expect(reopenSummaryFrom({ phase: 'open', ready_holds: 3, ready_customer_pauses: 1 })).toEqual({ readyHolds: 3, readyCustomerPauses: 1 })
  })

  it('reads anything else as zero', () => {
    expect(reopenSummaryFrom(null)).toEqual({ readyHolds: 0, readyCustomerPauses: 0 })
    expect(reopenSummaryFrom({ ready_holds: '2', ready_customer_pauses: -1 })).toEqual({ readyHolds: 0, readyCustomerPauses: 0 })
  })
})
