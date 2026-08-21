/**
 * Past plans — the one calculation behind every finished-plan surface.
 *
 * Five surfaces touch this record: the profile glimpse (its permanent home),
 * the desktop and mobile plan pages, the no-plan view, and /dashboard/history
 * itself. Before this module each one filtered and ordered its own way, so
 * the profile glimpse could have shown a different pair than the top of the
 * history page it links to. Selection, order, and the summary sentence live
 * here so those five can only ever agree.
 */

import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'

/** The shape every past-plans surface reads. Widened by callers as needed. */
type EndedShape = {
  status: string
  end_date: string | null
  delivered_meals?: number | null
}

/** All the summary line needs — status and order are already settled by the
 *  time a caller has a list of finished plans. */
type SummaryShape = { delivered_meals?: number | null }

/**
 * The minimum a past-plan tile renders. Both the dashboard's `Subscription`
 * and the history page's `EndedPlan` satisfy it structurally, so a consumer
 * that only draws tiles can ask for this instead of a fat subscription row.
 */
export type PastPlanRow = {
  id: string
  plan_name: string
  start_date: string
  end_date: string
  total_meals: number
  delivered_meals: number
}

/**
 * How many tiles the profile glimpse shows before deferring to the full page.
 * Two is enough to prove the section is a real record without turning the
 * profile into a second history page.
 */
export const GLIMPSE_COUNT = 2

/**
 * Finished plans, most recently finished first — the order /dashboard/history
 * already reads in. Rows with no end date on file sort last rather than
 * throwing off the comparison; they are data faults, not the newest plan.
 */
export function endedPlansFrom<T extends EndedShape>(subs: readonly T[]): T[] {
  return subs
    .filter(s => s.status === SUBSCRIPTION_STATUS.ENDED)
    .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''))
}

/**
 * The record line above the glimpse tiles, as segments rather than a finished
 * string: "3 finished plans" · "73 dinners delivered".
 *
 * Segments because every equity line in this product renders its numbers in
 * navy against muted words (the dashboard greeting, the no-plan greeting, the
 * mobile home value line) and a flat string cannot express that. Grammar and
 * pluralisation still live here, so the two profile trees can only ever agree
 * on the wording; they decide the emphasis themselves.
 *
 * Returns null when there is nothing to summarise, so the caller renders no
 * line at all rather than an empty one. A plan can finish having delivered
 * nothing (refund, out-of-zone cancel), so the dinner segment drops out at
 * zero instead of printing "0 dinners delivered" under a heading meant to
 * read as accumulated equity.
 */
export function pastPlansSummary(plans: readonly SummaryShape[]): { n: number; label: string }[] | null {
  if (plans.length === 0) return null

  const out = [{ n: plans.length, label: `finished plan${plans.length === 1 ? '' : 's'}` }]
  const dinners = plans.reduce((n, p) => n + (p.delivered_meals ?? 0), 0)
  if (dinners > 0) out.push({ n: dinners, label: `dinner${dinners === 1 ? '' : 's'} delivered` })

  return out
}

/**
 * Label for the link out to /dashboard/history. Naming the total is the
 * signal that more sits behind the link, so it only appears when more
 * actually does — "See all 2" beside exactly two tiles reads as a lie.
 */
export function seeAllLabel(count: number): string {
  return count > GLIMPSE_COUNT ? `See all ${count}` : 'See all'
}
