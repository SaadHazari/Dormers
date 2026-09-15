import { describe, it, expect } from 'vitest'
import {
  seasonKitchenGate, bufferSlotsUsed, bufferCooksOn, deliveryTickCooks, kitchenCountsPlan,
  type KitchenPlanFacts,
} from './season-kitchen'

// Anchors: Sat 3 Oct 2026 is the wrap-up day. Sun 4 Oct is not a delivery
// day. Mon 5 Oct and Tue 6 Oct are buffer days when the buffer is 2.
const NONE: ReadonlySet<string> = new Set()

describe('seasonKitchenGate', () => {
  const gate = (phase: 'open' | 'winding_down' | 'break', todayAe: string, wrapUpDay: string | null = '2026-10-03', closeDay: string | null = '2026-10-05') =>
    seasonKitchenGate({ phase, wrapUpDay, closeDay, todayAe })

  it('cooks normally while open, or winding down with no wrap-up day, or up to the wrap-up day', () => {
    expect(gate('open', '2026-10-05', null, null)).toBe('normal')
    expect(gate('winding_down', '2026-10-05', null, null)).toBe('normal')
    expect(gate('winding_down', '2026-10-03')).toBe('normal')
  })

  it('cooks only buffer grants after the wrap-up day, and nothing after the close day or during the break', () => {
    expect(gate('winding_down', '2026-10-05')).toBe('buffer_only')
    expect(gate('winding_down', '2026-10-06')).toBe('closed_for_break')
    expect(gate('break', '2026-10-06')).toBe('closed_for_break')
  })
})

describe('bufferSlotsUsed', () => {
  const used = (beforeDay: string, over: { skippedDates?: string[]; closureDates?: ReadonlySet<string>; weekType?: '5DAYS' | '6DAYS' } = {}) =>
    bufferSlotsUsed({ wrapUpDay: '2026-10-03', beforeDay, weekType: over.weekType ?? '6DAYS', skippedDates: over.skippedDates ?? [], closureDates: over.closureDates ?? NONE })

  it('counts the buffer delivery days already behind the plan', () => {
    expect(used('2026-10-05')).toBe(0)
    expect(used('2026-10-06')).toBe(1)
  })

  it('does not count a closure or a skipped buffer day', () => {
    expect(used('2026-10-06', { closureDates: new Set(['2026-10-05']) })).toBe(0)
    expect(used('2026-10-06', { skippedDates: ['2026-10-05'] })).toBe(0)
  })
})

describe('bufferCooksOn', () => {
  const cooks = (day: string, bufferGrants: number, over: { weekType?: '5DAYS' | '6DAYS'; wrapUpDay?: string; closeDay?: string } = {}) =>
    bufferCooksOn({
      day, bufferGrants, wrapUpDay: over.wrapUpDay ?? '2026-10-03', closeDay: over.closeDay ?? '2026-10-06',
      weekType: over.weekType ?? '6DAYS', skippedDates: [], closureDates: NONE,
    })

  it('cooks the first buffer days, one per grant', () => {
    expect(cooks('2026-10-05', 1)).toBe(true)
    expect(cooks('2026-10-06', 1)).toBe(false)
    expect(cooks('2026-10-06', 2)).toBe(true)
  })

  it('never cooks on the wrap-up day, after the close day, or without a grant', () => {
    expect(cooks('2026-10-03', 1)).toBe(false)
    expect(cooks('2026-10-07', 3)).toBe(false)
    expect(cooks('2026-10-05', 0)).toBe(false)
  })

  it('a Monday to Friday plan cannot use a Saturday buffer day', () => {
    expect(cooks('2026-10-03', 1, { weekType: '5DAYS', wrapUpDay: '2026-10-02', closeDay: '2026-10-03' })).toBe(false)
  })
})

describe('deliveryTickCooks (the delivery tick own conditions)', () => {
  const facts = (over: Partial<KitchenPlanFacts> = {}): KitchenPlanFacts => ({
    status: 'Active', seasonHoldId: null, weekType: '6DAYS', mealsPerDay: 1, totalMeals: 24, deliveredMeals: 20,
    creditedSkipDays: 0, skippedDates: [], bufferGrants: 0, resumeCutoffDate: null, lastDeliveryTickDate: '2026-09-26', ...over,
  })
  const MON = '2026-09-28'

  it('cooks an Active plan with meals below the credited cap on its delivery day', () => {
    expect(deliveryTickCooks(facts(), MON, NONE)).toBe(true)
  })

  it('never cooks by status alone', () => {
    expect(deliveryTickCooks(facts({ status: 'Skipped' }), MON, NONE)).toBe(false)
    expect(deliveryTickCooks(facts({ status: 'Paused' }), MON, NONE)).toBe(false)
    expect(deliveryTickCooks(facts({ seasonHoldId: 'h1' }), MON, NONE)).toBe(false)
    // Every meal delivered or credited, still reading Active for a day.
    expect(deliveryTickCooks(facts({ creditedSkipDays: 4 }), MON, NONE)).toBe(false)
  })

  it('honours the day, closures, skips and a resume after the cutoff', () => {
    expect(deliveryTickCooks(facts(), '2026-09-27', NONE)).toBe(false)
    expect(deliveryTickCooks(facts(), MON, new Set([MON]))).toBe(false)
    expect(deliveryTickCooks(facts({ skippedDates: [MON] }), MON, NONE)).toBe(false)
    expect(deliveryTickCooks(facts({ resumeCutoffDate: MON }), MON, NONE)).toBe(false)
    expect(deliveryTickCooks(facts({ resumeCutoffDate: '2026-09-26' }), MON, NONE)).toBe(true)
  })

  it('reads the same after tonight delivery is recorded', () => {
    expect(deliveryTickCooks(facts({ deliveredMeals: 24, lastDeliveryTickDate: MON }), MON, NONE)).toBe(true)
    expect(deliveryTickCooks(facts({ deliveredMeals: 24, lastDeliveryTickDate: '2026-09-26' }), MON, NONE)).toBe(false)
  })
})

describe('kitchenCountsPlan', () => {
  const plan: KitchenPlanFacts = {
    status: 'Active', seasonHoldId: null, weekType: '6DAYS', mealsPerDay: 1, totalMeals: 24, deliveredMeals: 23,
    creditedSkipDays: 0, skippedDates: [], bufferGrants: 1, resumeCutoffDate: null, lastDeliveryTickDate: '2026-10-03',
  }
  const counts = (gate: 'normal' | 'buffer_only' | 'closed_for_break', over: Partial<KitchenPlanFacts> = {}) =>
    kitchenCountsPlan({ gate, day: '2026-10-05', wrapUpDay: '2026-10-03', closeDay: '2026-10-06', closureDates: NONE, plan: { ...plan, ...over } })

  it('counts nothing while the kitchen is closed for the break', () => {
    expect(counts('closed_for_break')).toBe(false)
  })

  it('counts a plan the tick cooks, and after the wrap-up day only with a grant for today', () => {
    expect(counts('normal')).toBe(true)
    expect(counts('buffer_only')).toBe(true)
    expect(counts('buffer_only', { bufferGrants: 0 })).toBe(false)
  })
})
