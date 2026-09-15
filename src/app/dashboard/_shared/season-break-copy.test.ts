import { describe, it, expect } from 'vitest'
import { heldCardCopy, mealsPhrase } from './season-break-copy'
import type { CustomerHold } from '@/contexts/season/domain/customer-hold'

const hold = (over: Partial<CustomerHold> = {}): CustomerHold => ({
  id: 'hold-1', subscriptionId: 'sub-1', reason: 'season', state: 'held', heldMeals: 9,
  waitlistCreditFils: 2000, planName: 'Monthly Premium', planStatus: 'Paused', ...over,
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
    })
  })

  it('a held plan that had not started, with no credit (a staff plan)', () => {
    expect(heldCardCopy({ hold: hold({ planStatus: 'Scheduled', heldMeals: 1, waitlistCreditFils: null }), alreadyJoined: false, creditAed: 20 })).toEqual({
      headline: 'Your 1 meal is kept for next semester.',
      body: "The kitchen is closed between semesters. When we're back, pick your start date.",
      creditLine: null,
      joinLine: null,
      pickDate: false,
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
