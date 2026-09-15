/**
 * One customer's held plan, for the dashboard (spec §6.3, §12.2 N8, N9).
 * Pure: the dashboard page reads season_holds and passes the row in.
 */

import type { SeasonPhase } from './season-phase'

export type CustomerHoldState = 'held' | 'paused_by_customer' | 'ready'

export interface CustomerHold {
  id: string
  subscriptionId: string
  reason: 'season' | 'customer_pause'
  state: CustomerHoldState
  heldMeals: number
  /** The waitlist credit minted with this hold, in fils; null when none was. */
  waitlistCreditFils: number | null
  planName: string
  planStatus: 'Paused' | 'Scheduled'
}

export interface CustomerBreak {
  phase: SeasonPhase
  hold: CustomerHold
}

const SHOWN: readonly string[] = ['held', 'paused_by_customer', 'ready']

export function customerHoldFrom(input: {
  hold: Record<string, unknown> | null | undefined
  sub: { id: string; plan_name: string; status: string | null; season_hold_id?: string | null } | null | undefined
  creditAmountAed: number | null
}): CustomerHold | null {
  const { hold, sub } = input
  if (!hold || !sub || !sub.season_hold_id || hold.id !== sub.season_hold_id) return null
  if (!SHOWN.includes(String(hold.state))) return null
  const status = sub.status
  if (status !== 'Paused' && status !== 'Scheduled') return null
  return {
    id: String(hold.id),
    subscriptionId: sub.id,
    reason: hold.reason === 'customer_pause' ? 'customer_pause' : 'season',
    state: hold.state as CustomerHoldState,
    heldMeals: Math.max(0, Number(hold.held_meals ?? 0)),
    waitlistCreditFils: input.creditAmountAed == null ? null : Math.round(input.creditAmountAed * 100),
    planName: sub.plan_name,
    planStatus: status,
  }
}

/** A hold shows during the break, and once ready until the customer restarts the plan. */
export function buildCustomerBreak(phase: SeasonPhase, hold: CustomerHold | null): CustomerBreak | null {
  if (!hold) return null
  if (phase !== 'break' && hold.state !== 'ready') return null
  return { phase, hold }
}
