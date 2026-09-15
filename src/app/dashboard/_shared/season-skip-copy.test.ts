import { describe, it, expect } from 'vitest'
import {
  creditedSkipCopy, seasonSkipSheet, creditedSkipToast, seasonToastFor, creditedUnskipBody,
} from './season-skip-copy'

// Anchors: Sat 3 Oct 2026 is the wrap-up day; Wed 16 Sep a future skip, Thu 17 Sep the day after.
describe('creditedSkipCopy', () => {
  it('names the wrap-up day and the amount', () => {
    expect(creditedSkipCopy({ wrapUpDay: '2026-10-03', creditFils: 1980, sameDay: true })).toEqual({
      body: "There's no delivery day left before Sat 3 Oct to move this meal to. Skip it and AED 19.80 goes to your wallet.",
      cta: 'Skip and add AED 19.80',
      tileLabel: 'Wallet',
      tileValue: '+AED 19.80',
      blocked: false,
    })
  })

  it('says a plan worth nothing in cash gets no credit', () => {
    expect(creditedSkipCopy({ wrapUpDay: '2026-10-03', creditFils: 0, sameDay: false })).toEqual({
      body: "There's no delivery day left before Sat 3 Oct to move this meal to. You can still skip it, but this meal is not moved to another day.",
      cta: 'Skip this day',
      tileLabel: 'End date',
      tileValue: 'No change',
      blocked: false,
    })
  })

  it('blocks the skip when the meal value is unknown', () => {
    const copy = creditedSkipCopy({ wrapUpDay: '2026-10-03', creditFils: null, sameDay: true })
    expect(copy.blocked).toBe(true)
    expect(copy.cta).toBe('Skip tonight')
    expect(copy.body).toContain('message us on WhatsApp')
  })

  it('never uses a dash', () => {
    for (const fils of [1980, 0, null]) {
      const copy = creditedSkipCopy({ wrapUpDay: '2026-10-03', creditFils: fils, sameDay: true })
      expect(`${copy.body} ${copy.cta} ${copy.tileValue}`).not.toMatch(/[–—]/)
    }
  })
})

describe('seasonSkipSheet', () => {
  it('only rewords a credited skip', () => {
    expect(seasonSkipSheet({ kind: 'normal' }, '2026-10-03', true)).toBeNull()
    expect(seasonSkipSheet({ kind: 'grant', makeUpDay: '2026-10-05' }, '2026-10-03', true)).toBeNull()
    expect(seasonSkipSheet({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 }, '2026-10-03', false)?.cta).toBe('Skip and add AED 19.80')
    expect(seasonSkipSheet({ kind: 'credited', makeUpDay: '2026-10-05', creditFils: 1980 }, null, false)).toBeNull()
  })
})

describe('toasts', () => {
  it('says where the money is', () => {
    expect(creditedSkipToast({ outcome: 'credited', creditFils: 1980, creditStatus: 'approved', mealDate: '2026-09-14' })).toBe('Skipped. AED 19.80 is in your wallet.')
    expect(creditedSkipToast({ outcome: 'credited', creditFils: 1980, creditStatus: 'pending', mealDate: '2026-09-16' })).toBe('Skip scheduled. AED 19.80 arrives Thu 17 Sep.')
    expect(creditedSkipToast({ outcome: 'credited', creditFils: 0, creditStatus: 'none', mealDate: '2026-09-16' })).toBe('Skipped. This meal is not moved to another day.')
  })

  it('reads the notice off an action result', () => {
    expect(seasonToastFor({ success: true, seasonSkip: { outcome: 'credited', creditFils: 1980, creditStatus: 'approved', mealDate: '2026-09-14' } })).toBe('Skipped. AED 19.80 is in your wallet.')
    expect(seasonToastFor({ success: true })).toBeUndefined()
    expect(seasonToastFor(null)).toBeUndefined()
  })
})

describe('creditedUnskipBody', () => {
  it('says the credit waiting for the day is cancelled', () => {
    expect(creditedUnskipBody(1980)).toBe('Your meal for that day will be delivered, and the AED 19.80 waiting for it is cancelled.')
    expect(creditedUnskipBody(0)).toBe('Your meal for that day will be delivered.')
  })
})
