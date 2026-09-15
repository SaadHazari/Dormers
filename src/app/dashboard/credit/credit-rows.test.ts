import { describe, it, expect } from 'vitest'
import { creditRowAmount, creditRowDateLine } from './credit-rows'

const label = (iso: string) => `added ${iso.slice(0, 10)}`

describe('creditRowAmount', () => {
  it('shows fils when there are any, and marks spent credit', () => {
    expect(creditRowAmount({ amount_aed: '19.80', status: 'pending', created_at: '2026-09-14T08:00:00Z' })).toBe('AED 19.80')
    expect(creditRowAmount({ amount_aed: 20, status: 'approved', created_at: '2026-09-14T08:00:00Z' })).toBe('AED 20')
    expect(creditRowAmount({ amount_aed: 25, status: 'applied', created_at: '2026-09-14T08:00:00Z' })).toBe('AED 25 used')
  })
})

describe('creditRowDateLine', () => {
  it('says when pending skip credit arrives: the day after the skipped meal', () => {
    // Wed 16 Sep skipped, so the credit arrives Thu 17 Sep.
    expect(creditRowDateLine({ amount_aed: 19.8, status: 'pending', created_at: '2026-09-14T08:00:00Z', meal_date: '2026-09-16' }, label)).toBe('Arrives Thu 17 Sep')
  })

  it('shows when other credit was added', () => {
    expect(creditRowDateLine({ amount_aed: 19.8, status: 'approved', created_at: '2026-09-14T08:00:00Z', meal_date: '2026-09-14' }, label)).toBe('added 2026-09-14')
  })
})
