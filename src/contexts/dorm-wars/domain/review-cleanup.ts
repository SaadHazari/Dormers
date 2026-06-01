// src/lib/dorm-wars/review-cleanup.ts
// Phase 8K Model C — lazy reconciliation of expired pending weekly-review credits.
//
// Each weekly review submit inserts a credit row with status='pending'.
// On the 4th submission for a cycle, the submit action flips all those
// pending rows to 'approved' atomically. But if the user submits <4 by
// the time the late window closes, the pending rows are stranded.
//
// This helper finds and rejects those stranded rows for a single
// customer. It's called lazily — on hub load (Dorm Wars) and on review
// submit — instead of from a daily cron. The query is small (scoped to
// one customer + only pending review credits) so adding it to the page
// pipeline costs near-nothing.
//
// "Cycle closed" = max(week_end_date) of the customer's reviews for a
// given subscription, plus LATE_CAP_DAYS (30). After that point no more
// weekly review can be submitted for that cycle.

import type { SupabaseClient } from '@supabase/supabase-js'
import { LATE_CAP_DAYS, getSubscriptionWeeks } from '@/contexts/subscriptions/domain/weekly-review'
import { expectedReviewWeeks } from '@/contexts/subscriptions/domain/plans'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>

/**
 * Sweep stranded pending weekly-review credits for a single customer.
 * Cheap when nothing's stranded: a single SELECT returns the pending
 * rows (capped to that customer + that source) and we short-circuit if
 * empty. Idempotent: re-running on already-cleaned data is a no-op.
 *
 * Returns the count of rows transitioned (mostly useful for logging).
 */
export async function rejectExpiredWeeklyReviewPending(
  sb: AdminClient,
  customerId: string,
): Promise<number> {
  // 1. Find all pending weekly-review credits for this customer along
  //    with their linked weekly_reviews.subscription_id + week_end_date.
  //    PostgREST nested-select returns the FK row inline.
  const { data: pending, error: pendingErr } = await sb
    .from('credits')
    .select('id, weekly_review_id, weekly_reviews(subscription_id, week_end_date)')
    .eq('customer_id', customerId)
    .eq('source', 'layer4_weekly_review')
    .eq('status', 'pending')

  if (pendingErr || !pending || pending.length === 0) {
    return 0
  }

  // 2. Group pending credits by subscription_id, find each sub's cycle
  //    "closed-after" date (latest week_end_date + LATE_CAP_DAYS), and
  //    decide which subs to reject for.
  type PendingRow = {
    id: string
    weekly_review_id: string | null
    weekly_reviews: { subscription_id: string; week_end_date: string } | { subscription_id: string; week_end_date: string }[] | null
  }
  const bySub = new Map<string, { creditIds: string[]; latestWeekEnd: string }>()
  for (const row of pending as PendingRow[]) {
    // PostgREST joined row can come as object or array; handle both.
    const join = Array.isArray(row.weekly_reviews) ? row.weekly_reviews[0] : row.weekly_reviews
    if (!join) continue
    const subId = join.subscription_id
    const weekEnd = join.week_end_date
    const entry = bySub.get(subId)
    if (!entry) {
      bySub.set(subId, { creditIds: [row.id], latestWeekEnd: weekEnd })
    } else {
      entry.creditIds.push(row.id)
      if (weekEnd > entry.latestWeekEnd) entry.latestWeekEnd = weekEnd
    }
  }

  if (bySub.size === 0) return 0

  // 3. For each sub: is its cycle's late window closed?
  //    If yes AND submitted < expected → reject pending pool (forfeit).
  //    If yes AND submitted >= expected → self-heal: flip pending → approved
  //    (drift recovery — earlier submit action's threshold flip failed but
  //    the user did earn the reward).
  const now = Date.now()
  const toReject: string[] = []
  const toApprove: string[] = []

  for (const [subId, entry] of bySub) {
    const lateCutoff = new Date(entry.latestWeekEnd + 'T00:00:00Z').getTime() + LATE_CAP_DAYS * 86_400_000
    if (lateCutoff > now) continue // window still open; nothing to do yet

    // Window closed — check submission count vs expected.
    const { data: sub } = await sb
      .from('subscriptions')
      .select('start_date, plan_name')
      .eq('id', subId)
      .maybeSingle()
    if (!sub?.start_date) continue

    const startDate = new Date((sub.start_date as string).slice(0, 10) + 'T00:00:00Z')
    const weeks = getSubscriptionWeeks(startDate, expectedReviewWeeks(sub.plan_name as string | null))
    const expected = weeks.length

    const { count } = await sb
      .from('weekly_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('subscription_id', subId)

    const submitted = count ?? 0
    if (submitted < expected) {
      // User missed at least one week — forfeit the cycle's pending pool.
      toReject.push(...entry.creditIds)
    } else {
      // Drift recovery — user hit the threshold but credits are still
      // pending (earlier submit action's flip query failed). Approve
      // them now. Without this self-heal, the user would see "AED N
      // pending" forever even though they earned it.
      toApprove.push(...entry.creditIds)
      console.warn(
        `review-cleanup: drift recovery — customer=${customerId} sub=${subId} ${submitted}/${expected} reviews submitted; flipping ${entry.creditIds.length} pending credit(s) to approved`,
      )
    }
  }

  let touched = 0

  if (toReject.length > 0) {
    const { error: rejectError } = await sb
      .from('credits')
      .update({ status: 'rejected' })
      .in('id', toReject)
    if (rejectError) {
      console.error('review-cleanup: bulk reject failed', rejectError)
    } else {
      touched += toReject.length
      console.log(
        `review-cleanup: rejected ${toReject.length} stranded pending weekly-review credit(s) for customer=${customerId}`,
      )
    }
  }

  if (toApprove.length > 0) {
    const { error: approveError } = await sb
      .from('credits')
      .update({ status: 'approved' })
      .in('id', toApprove)
    if (approveError) {
      console.error('review-cleanup: bulk approve (drift recovery) failed', approveError)
    } else {
      touched += toApprove.length
      console.log(
        `review-cleanup: approved ${toApprove.length} drifted weekly-review credit(s) for customer=${customerId}`,
      )
    }
  }

  return touched
}
