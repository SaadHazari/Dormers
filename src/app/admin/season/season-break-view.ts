/**
 * The break board's numbers (spec §11.3), pure so vitest covers them,
 * including the refund queue (spec §10.3: Approve and Decline on a request,
 * Retry on a failure).
 */

import { REFUND_STATE_LABEL, isRefundState } from '@/contexts/season/domain/season-refund'
import type { SeasonHoldRow, SeasonPageData, SeasonPlanRow } from './season-data'

export interface BreakBoardView {
  heldPlans: SeasonHoldRow[]
  customerPauses: Array<SeasonHoldRow & { savedSpot: boolean }>
  heldMeals: number
  creditsMinted: number
  creditsMintedFils: number
  readyOnReopen: number
  waitlistCount: number
  reopenTarget: number | null
  /** Active and below the credited cap: the delivery tick would cook them (a G10 breach). */
  cookingDuringBreak: SeasonPlanRow[]
  /** Refunds asked for, in flight or failed: the owner's queue. */
  refundQueue: SeasonHoldRow[]
  /** Refunds that went through this season. */
  refunded: SeasonHoldRow[]
}

const FINISHED = new Set(['released', 'refunded'])

export function breakBoardView(data: SeasonPageData): BreakBoardView {
  const open = data.holds.filter((h) => !FINISHED.has(h.state))
  const heldPlans = open.filter((h) => h.reason === 'season')
  const saved = new Set(data.savedSpotCustomerIds)
  const customerPauses = open
    .filter((h) => h.reason === 'customer_pause')
    .map((h) => ({ ...h, savedSpot: saved.has(h.customerId) }))

  const credits = new Map<string, number>()
  for (const h of data.holds) {
    if (h.waitlistCreditId && h.waitlistCreditFils != null) credits.set(h.waitlistCreditId, h.waitlistCreditFils)
  }

  return {
    heldPlans,
    customerPauses,
    heldMeals: heldPlans.reduce((sum, h) => sum + h.heldMeals, 0),
    creditsMinted: credits.size,
    creditsMintedFils: [...credits.values()].reduce((sum, f) => sum + f, 0),
    readyOnReopen: open.filter((h) => h.state === 'held' || h.state === 'paused_by_customer').length,
    waitlistCount: data.savedSpotCustomerIds.length,
    reopenTarget: data.reopenTarget,
    cookingDuringBreak: data.plans.filter(
      (p) => p.status === 'Active' && p.deliveredMeals < p.totalMeals - p.creditedSkipDays * p.mealsPerDay,
    ),
    refundQueue: refundQueue(data.holds),
    refunded: data.holds.filter((h) => h.state === 'refunded'),
  }
}

/** Requests first, then failures, then the ones Stripe is still processing; oldest request first. */
export function refundQueue(holds: readonly SeasonHoldRow[]): SeasonHoldRow[] {
  const rank: Record<string, number> = { refund_requested: 0, refund_failed: 1, refund_processing: 2 }
  return holds
    .filter((h) => h.state in rank)
    .sort((a, b) => (rank[a.state] - rank[b.state]) || (a.refundRequestedAt ?? '').localeCompare(b.refundRequestedAt ?? ''))
}

/** Money the queue would move if every request were approved. */
export function refundExposure(queue: readonly SeasonHoldRow[]): { cashFils: number; creditFils: number } {
  return queue.reduce(
    (sum, h) => ({ cashFils: sum.cashFils + (h.cashRefundFils ?? 0), creditFils: sum.creditFils + (h.creditShareFils ?? 0) }),
    { cashFils: 0, creditFils: 0 },
  )
}

const STATE_LABEL: Record<string, string> = {
  held: 'Kept for next semester',
  paused_by_customer: 'Paused by customer',
  ready: 'Ready to restart',
  released: 'Restarted',
}

export function holdStateLabel(state: string): string {
  if (isRefundState(state)) return REFUND_STATE_LABEL[state]
  return STATE_LABEL[state] ?? state.replace(/_/g, ' ')
}

export function reopenConfirmLines(view: BreakBoardView): string[] {
  const n = view.readyOnReopen
  return [
    'People can buy plans again straight away.',
    `**${n} kept ${n === 1 ? 'plan is' : 'plans are'}** ready to restart. Nothing restarts by itself: each customer taps Resume, or picks a start date if their plan had not started yet.`,
    'No message goes to customers yet. Press Tell customers we are open afterwards.',
    ...(view.refundQueue.length > 0
      ? [`${view.refundQueue.length} refund ${view.refundQueue.length === 1 ? 'request stays' : 'requests stay'} on this page. You still need to answer ${view.refundQueue.length === 1 ? 'it' : 'them'}.`]
      : []),
  ]
}
