import { describe, it, expect } from 'vitest'
import { breakBoardView, holdStateLabel, reopenConfirmLines } from './season-break-view'
import type { SeasonHoldRow, SeasonPageData, SeasonPlanRow } from './season-data'

const plan = (p: Partial<SeasonPlanRow> & Pick<SeasonPlanRow, 'id'>): SeasonPlanRow => ({
  customerId: `c-${p.id}`, planName: 'Monthly Premium', status: 'Paused', startDate: '2026-09-07', endDate: '2026-10-10',
  weekType: '6DAYS', mealsPerDay: 1, totalMeals: 24, deliveredMeals: 15, creditedSkipDays: 0, bufferGrants: 0,
  skippedDates: [], plannedPauseStart: null, staffApproval: null, lastDeliveryTickDate: '2026-10-03', resumeCutoffDate: null,
  customerName: 'Someone', dormName: null, mealValue: null, seasonHoldId: null, ...p,
})

const hold = (h: Partial<SeasonHoldRow> & Pick<SeasonHoldRow, 'id' | 'customerId'>): SeasonHoldRow => ({
  subscriptionId: `s-${h.id}`, customerName: 'Someone', planName: 'Monthly Premium', reason: 'season', state: 'held',
  heldMeals: 9, mealValueFils: null, waitlistCreditId: null, waitlistCreditFils: null, refundOffer: null, cashRefundFils: null, creditShareFils: null, stripeRefundId: null, lastError: null, refundDeclineReason: null, refundRequestedAt: null, ...h,
})

const data = (over: Partial<SeasonPageData> = {}): SeasonPageData => ({
  snapshot: { phase: 'break', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1, salesStopped: true },
  paused: true, salesStoppedAt: '2026-09-02T01:50:11Z', kitchenDailyCostAed: 500, todayAe: '2026-10-07', closureDates: [],
  cycleStartedAt: '2026-09-14T08:00:00Z', reopenTarget: 15,
  plans: [
    plan({ id: 'a', seasonHoldId: 'h-a' }),
    plan({ id: 'g', status: 'Active', deliveredMeals: 5 }),
    plan({ id: 'e', status: 'Active', deliveredMeals: 20, creditedSkipDays: 4 }),
    plan({ id: 's', status: 'Skipped', deliveredMeals: 10 }),
  ],
  holds: [
    hold({ id: 'h-a', customerId: 'c-a', waitlistCreditId: 'cr-1', waitlistCreditFils: 2000 }),
    hold({ id: 'h-b', customerId: 'c-a', heldMeals: 6, planName: 'Weekly Flex', waitlistCreditId: 'cr-1', waitlistCreditFils: 2000 }),
    hold({ id: 'h-c', customerId: 'c-c', reason: 'customer_pause', state: 'paused_by_customer', heldMeals: 14 }),
    hold({ id: 'h-r', customerId: 'c-r', state: 'released', waitlistCreditId: 'cr-9', waitlistCreditFils: 1500 }),
  ],
  savedSpotCustomerIds: ['c-a'],
  ...over,
})

describe('breakBoardView', () => {
  it('lists held plans and customer pauses still open, with who saved a spot', () => {
    const v = breakBoardView(data())
    expect(v.heldPlans.map((h) => h.id)).toEqual(['h-a', 'h-b'])
    expect(v.heldMeals).toBe(15)
    expect(v.customerPauses).toEqual([{ ...data().holds[2], savedSpot: false }])
    expect(v.readyOnReopen).toBe(3)
  })

  it('counts each waitlist credit once, across every hold of the season', () => {
    const v = breakBoardView(data())
    expect(v.creditsMinted).toBe(2)
    expect(v.creditsMintedFils).toBe(3500)
  })

  it('reads the waitlist against the reopen target', () => {
    expect(breakBoardView(data())).toMatchObject({ waitlistCount: 1, reopenTarget: 15 })
  })

  it('flags only plans the delivery tick would cook: Active and below the credited cap', () => {
    expect(breakBoardView(data()).cookingDuringBreak.map((p) => p.id)).toEqual(['g'])
  })
})

describe('labels and confirmation', () => {
  it('names every hold state in plain words', () => {
    expect(holdStateLabel('held')).toBe('Held')
    expect(holdStateLabel('paused_by_customer')).toBe('Paused by customer')
    expect(holdStateLabel('ready')).toBe('Ready')
    expect(holdStateLabel('released')).toBe('Restarted')
    expect(holdStateLabel('refund_requested')).toBe('Refund requested')
    expect(holdStateLabel('refund_failed')).toBe('Refund failed')
  })

  it('says what reopening does, promises no message and no refund', () => {
    const lines = reopenConfirmLines(breakBoardView(data()))
    expect(lines).toEqual([
      'Sales open straight away.',
      '3 held plans become ready. Each customer restarts by tapping Resume, or by picking a start date for a plan that had not started. Nothing restarts on its own.',
      'Reopening sends no message to customers yet. Send the reopening broadcast yourself afterwards.',
    ])
    expect(lines.join(' ')).not.toMatch(/refund|[–—]/i)
  })
})
