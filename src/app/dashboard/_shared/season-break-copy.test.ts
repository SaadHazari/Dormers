import { describe, it, expect } from 'vitest'
import { heldCardCopy, mealsPhrase, resumeSplitCopy, breakResumeCopy, breakNoticeCopy, breakNoticeSeenKey } from './season-break-copy'
import type { CustomerHold } from '@/contexts/season/domain/customer-hold'

const hold = (over: Partial<CustomerHold> = {}): CustomerHold => ({
  id: 'hold-1', subscriptionId: 'sub-1', reason: 'season', state: 'held', heldMeals: 9,
  waitlistCreditFils: 2000, planName: 'Monthly Premium', planStatus: 'Paused',
  refundOffer: null, refundRequested: null, refundDeclineReason: null, ...over,
})

describe('mealsPhrase', () => {
  it('counts meals', () => {
    expect(mealsPhrase(1)).toBe('1 meal')
    expect(mealsPhrase(9)).toBe('9 meals')
  })
})

describe('heldCardCopy', () => {
  it('a plan held for next semester, with its credit', () => {
    expect(heldCardCopy({ hold: hold(), alreadyJoined: true, creditAed: 20 })).toEqual({
      headline: 'Your 9 meals are kept for next semester.',
      body: "The kitchen is closed between semesters. When we're back, tap Resume.",
      creditLine: 'AED 20 is in your wallet for your next Monthly plan.',
      joinLine: null,
      pickDate: false,
      refundLine: null,
      refundAction: null,
      declineLine: null,
    })
  })

  it('a held plan that had not started, with no credit (a staff plan)', () => {
    expect(heldCardCopy({ hold: hold({ planStatus: 'Scheduled', heldMeals: 1, waitlistCreditFils: null }), alreadyJoined: false, creditAed: 20 })).toEqual({
      headline: 'Your 1 meal is kept for next semester.',
      body: "The kitchen is closed between semesters. When we're back, pick your start date.",
      creditLine: null,
      joinLine: null,
      pickDate: false,
      refundLine: null,
      refundAction: null,
      declineLine: null,
    })
  })

  it('a customer pause offers Save my spot until the customer saves one', () => {
    const paused = hold({ reason: 'customer_pause', state: 'paused_by_customer', heldMeals: 8, waitlistCreditFils: null })
    expect(heldCardCopy({ hold: paused, alreadyJoined: false, creditAed: 15 })).toEqual({
      headline: 'Your plan is paused, and the kitchen is closed between semesters.',
      body: "Your 8 meals wait for you. You can resume once we're back.",
      creditLine: null,
      joinLine: 'Save your spot for next semester and AED 15 goes to your wallet.',
      pickDate: false,
      refundLine: null,
      refundAction: null,
      declineLine: null,
    })
    expect(heldCardCopy({ hold: paused, alreadyJoined: true, creditAed: 15 })).toMatchObject({
      creditLine: 'Your spot for next semester is saved.',
      joinLine: null,
    })
  })

  it('after reopening: tap Resume, or pick a start date', () => {
    expect(heldCardCopy({ hold: hold({ state: 'ready' }), alreadyJoined: true, creditAed: 20 })).toMatchObject({
      headline: "We're back. Your 9 meals are ready.",
      body: "Tap Resume when you're ready, and your dinners start again.",
      pickDate: false,
    })
    expect(heldCardCopy({ hold: hold({ state: 'ready', planStatus: 'Scheduled' }), alreadyJoined: true, creditAed: 20 })).toMatchObject({
      body: 'Pick your start date on your plan page to begin.',
      pickDate: true,
    })
  })

  it('never mentions a refund and never uses a dash', () => {
    const states: CustomerHold['state'][] = ['held', 'paused_by_customer', 'ready']
    for (const state of states) {
      for (const planStatus of ['Paused', 'Scheduled'] as const) {
        const c = heldCardCopy({ hold: hold({ state, planStatus }), alreadyJoined: false, creditAed: 20 })
        const text = [c.headline, c.body, c.creditLine, c.joinLine].filter(Boolean).join(' ')
        expect(text).not.toMatch(/refund/i)
        expect(text).not.toMatch(/[–—]/)
      }
    }
  })
})

describe('resumeSplitCopy (spec §7.4, N7)', () => {
  const d = { firstDinner: '2026-10-01', wrapUpDay: '2026-10-03', heldMeals: 9, creditAed: 20 }

  it('names the dinners, the kept meals and the credit', () => {
    expect(resumeSplitCopy({ split: d, refundsLive: false, refund: null })).toEqual({
      headline: 'Resume your plan?',
      lines: ['Dinners from Thu 1 Oct to Sat 3 Oct.', 'Your other 9 meals will be kept for next semester, with AED 20 in your wallet.'],
    })
  })

  it('says so when no dinner is left before the wrap-up day', () => {
    expect(resumeSplitCopy({ split: { ...d, firstDinner: null, heldMeals: 12, creditAed: null }, refundsLive: false, refund: null }).lines).toEqual([
      'There is no delivery day left before the semester wraps up on Sat 3 Oct.',
      'Your 12 meals will be kept for next semester.',
    ])
  })

  it('offers a refund only once refunds are live and an amount is known', () => {
    expect(resumeSplitCopy({ split: d, refundsLive: false, refund: { cashFils: 16200, creditFils: 0 } }).lines.join(' ')).not.toMatch(/refund/i)
    expect(resumeSplitCopy({ split: d, refundsLive: true, refund: null }).lines.join(' ')).not.toMatch(/refund/i)
    expect(resumeSplitCopy({ split: d, refundsLive: true, refund: { cashFils: 16200, creditFils: 0 } }).lines.at(-1))
      .toBe('Once the break starts you can ask for a refund for those 9 meals instead (AED 162 back to your card).')
    expect(resumeSplitCopy({ split: d, refundsLive: true, refund: { cashFils: 15000, creditFils: 1200 } }).lines.at(-1))
      .toBe('Once the break starts you can ask for a refund for those 9 meals instead (AED 150 back to your card and AED 12 to your wallet).')
    expect(resumeSplitCopy({ split: d, refundsLive: true, refund: { cashFils: 0, creditFils: 0 } }).lines.join(' ')).not.toMatch(/refund/i)
  })
})

describe('breakResumeCopy (spec §7.5, N11)', () => {
  it('refuses kindly and offers the spot', () => {
    expect(breakResumeCopy({ alreadyJoined: false, creditAed: 15 })).toEqual({
      headline: 'The kitchen is closed between semesters.',
      lines: ["Your plan can resume once we're back."],
      joinLine: 'Save your spot for next semester and AED 15 goes to your wallet.',
    })
    expect(breakResumeCopy({ alreadyJoined: true, creditAed: 15 }).joinLine).toBeNull()
  })

  it('never uses a dash', () => {
    const texts = [
      ...resumeSplitCopy({ split: { firstDinner: '2026-10-01', wrapUpDay: '2026-10-03', heldMeals: 9, creditAed: 20 }, refundsLive: true, refund: { cashFils: 16200, creditFils: 0 } }).lines,
      ...breakResumeCopy({ alreadyJoined: false, creditAed: 15 }).lines,
    ]
    for (const t of texts) expect(t).not.toMatch(/[–—]/)
  })
})

describe('breakNoticeCopy (N8, N9)', () => {
  it('N8: the meals kept for next semester, the credit, and what to do when we are back', () => {
    expect(breakNoticeCopy({ hold: hold(), alreadyJoined: true, creditAed: 20 })).toEqual({
      headline: 'Your meals are kept for next semester.',
      lines: [
        'The kitchen is closed between semesters, so your last 9 meals of Monthly Premium are kept for you.',
        'AED 20 is in your wallet too.',
        "When we're back, tap Resume.",
      ],
      joinLine: null,
    })
  })

  it('N8 for a plan that had not started, with no credit', () => {
    expect(breakNoticeCopy({ hold: hold({ planStatus: 'Scheduled', planName: 'Weekly Flex', heldMeals: 6, waitlistCreditFils: null }), alreadyJoined: false, creditAed: 20 })).toEqual({
      headline: 'Your meals are kept for next semester.',
      lines: [
        'The kitchen is closed between semesters, so your 6 meals of Weekly Flex are kept for you.',
        "When we're back, pick your start date.",
      ],
      joinLine: null,
    })
  })

  it('N9: the pause carries over, with Save my spot until the customer saves one', () => {
    const paused = hold({ reason: 'customer_pause', state: 'paused_by_customer', waitlistCreditFils: null })
    expect(breakNoticeCopy({ hold: paused, alreadyJoined: false, creditAed: 15 })).toEqual({
      headline: 'The kitchen is closed between semesters.',
      lines: ["Your Monthly Premium is still paused, and your meals wait for you. Resume when we're back."],
      joinLine: 'Save your spot for next semester and AED 15 goes to your wallet.',
    })
    expect(breakNoticeCopy({ hold: paused, alreadyJoined: true, creditAed: 15 })?.joinLine).toBeNull()
  })

  it('shows nothing for a ready hold, and never mentions a refund or uses a dash', () => {
    expect(breakNoticeCopy({ hold: hold({ state: 'ready' }), alreadyJoined: false, creditAed: 20 })).toBeNull()
    for (const h of [hold(), hold({ reason: 'customer_pause', state: 'paused_by_customer' })]) {
      const c = breakNoticeCopy({ hold: h, alreadyJoined: false, creditAed: 20 })
      const text = [c?.headline, ...(c?.lines ?? []), c?.joinLine].filter(Boolean).join(' ')
      expect(text).not.toMatch(/refund/i)
      expect(text).not.toMatch(/[–—]/)
    }
  })

  it('is seen once per hold', () => {
    expect(breakNoticeSeenKey('hold-1')).toBe('dormers:season-break-notice-ack:hold-1')
  })
})
