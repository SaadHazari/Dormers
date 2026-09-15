/**
 * The break board's numbers (spec §11.3), pure so vitest covers them.
 * No refund figures: the refund flow is Plan D.
 */

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
  }
}

const STATE_LABEL: Record<string, string> = {
  held: 'Held',
  paused_by_customer: 'Paused by customer',
  ready: 'Ready',
  released: 'Restarted',
}

export function holdStateLabel(state: string): string {
  return STATE_LABEL[state] ?? state.replace(/_/g, ' ')
}

export function reopenConfirmLines(view: BreakBoardView): string[] {
  const n = view.readyOnReopen
  return [
    'Sales open straight away.',
    `${n} held ${n === 1 ? 'plan becomes' : 'plans become'} ready. Each customer restarts by tapping Resume, or by picking a start date for a plan that had not started. Nothing restarts on its own.`,
    'Reopening sends no message to customers yet. Send the reopening broadcast yourself afterwards.',
  ]
}
