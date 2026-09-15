import { describe, it, expect } from 'vitest'
import { customerHoldFrom, buildCustomerBreak, type CustomerHold } from './customer-hold'

const sub = { id: 'sub-1', plan_name: 'Monthly Premium', status: 'Paused', season_hold_id: 'hold-1' }
const row = { id: 'hold-1', reason: 'season', state: 'held', held_meals: 9, waitlist_credit_id: 'credit-1' }

describe('customerHoldFrom', () => {
  it('maps a held plan with its waitlist credit', () => {
    expect(customerHoldFrom({ hold: row, sub, creditAmountAed: 20 })).toEqual({
      id: 'hold-1', subscriptionId: 'sub-1', reason: 'season', state: 'held', heldMeals: 9,
      waitlistCreditFils: 2000, planName: 'Monthly Premium', planStatus: 'Paused',
    })
  })

  it('maps a customer pause with no credit, and a held Scheduled plan', () => {
    expect(customerHoldFrom({ hold: { ...row, reason: 'customer_pause', state: 'paused_by_customer' }, sub, creditAmountAed: null }))
      .toMatchObject({ reason: 'customer_pause', state: 'paused_by_customer', waitlistCreditFils: null })
    expect(customerHoldFrom({ hold: { ...row, state: 'ready' }, sub: { ...sub, status: 'Scheduled' }, creditAmountAed: 20 }))
      .toMatchObject({ state: 'ready', planStatus: 'Scheduled' })
  })

  it('ignores a hold that is not this plan\'s, is finished, or sits on a plan that is not Paused or Scheduled', () => {
    expect(customerHoldFrom({ hold: { ...row, id: 'other' }, sub, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: { ...row, state: 'released' }, sub, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: { ...row, state: 'refund_requested' }, sub, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: row, sub: { ...sub, status: 'Active' }, creditAmountAed: 20 })).toBeNull()
    expect(customerHoldFrom({ hold: null, sub, creditAmountAed: null })).toBeNull()
  })
})

describe('buildCustomerBreak', () => {
  const hold = (state: CustomerHold['state']): CustomerHold => ({
    id: 'hold-1', subscriptionId: 'sub-1', reason: 'season', state, heldMeals: 9, waitlistCreditFils: 2000, planName: 'Monthly Premium', planStatus: 'Paused',
  })

  it('shows a hold during the break, and a ready hold after reopening', () => {
    expect(buildCustomerBreak('break', hold('held'))).toEqual({ phase: 'break', hold: hold('held') })
    expect(buildCustomerBreak('open', hold('ready'))).toEqual({ phase: 'open', hold: hold('ready') })
    expect(buildCustomerBreak('winding_down', hold('ready'))).toEqual({ phase: 'winding_down', hold: hold('ready') })
  })

  it('shows nothing without a hold, or for a hold still "held" outside the break', () => {
    expect(buildCustomerBreak('break', null)).toBeNull()
    expect(buildCustomerBreak('open', hold('held'))).toBeNull()
  })
})
