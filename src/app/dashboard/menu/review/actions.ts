'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { createClient } from '@/utils/supabase/server'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/lib/subscription-status'
import { getSubscriptionWeeks, rewardPctForWeekEnd, weeklyReviewAed } from '@/lib/weekly-review'
import type { WeeklyReviewPayload, WeeklyReviewSubmitResult } from '../../_shared/WeeklyReviewTakeover'

/**
 * Service-role client for credit writes. The user-session client (cookie-
 * based) hits the credits table's RLS policies, which intentionally do not
 * grant customers direct INSERT/UPDATE — credits are server-controlled
 * value, not user-writable. After we've validated the user's identity via
 * getUserFromHeaders(), we use this admin client to write the credit row
 * scoped to that validated user.id.
 */
function reviewCreditsAdmin() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
    )
}

/**
 * Persist a weekly review submission.
 *
 * Route lives under /dashboard/menu/review because the entry point + visual
 * trigger now live on the Menu page (where users actively go). Previously
 * lived under /dashboard/plan when the trigger was there.
 *
 * 1. Validates the user is authenticated.
 * 2. Resolves the user's active subscription (reviews are scoped to it).
 * 3. Looks up the requested week's date range from the subscription's
 *    week breakdown — clamps invalid weeks (future, past 30 days) to a
 *    user-facing error.
 * 4. Derives `reward_pct` from the week end date — 100% inside the
 *    7-day window, 50% after. The DB layer also enforces the constraint
 *    so a tampered client can't pick its own percentage.
 * 5. Inserts the row. Unique constraint catches double-submissions.
 * 6. Revalidates the dashboard + menu routes so the just-submitted
 *    success state surfaces immediately on navigation back.
 */
export async function submitWeeklyReview(
    week: number,
    payload: WeeklyReviewPayload,
): Promise<WeeklyReviewSubmitResult> {
    const user = await getUserFromHeaders()
    if (!user) return { ok: false, error: 'You need to be signed in to submit a review.' }

    if (!Number.isInteger(week) || week < 1) {
        return { ok: false, error: 'Invalid week.' }
    }

    const supabase = await createClient()

    const { data: sub } = await supabase
        .from('subscriptions')
        .select('id, start_date, end_date')
        .eq('customer_id', user.id)
        .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED])
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (!sub) return { ok: false, error: 'Could not find your active subscription.' }

    const startDate = new Date(sub.start_date.slice(0, 10) + 'T00:00:00Z')
    const endDate   = new Date(sub.end_date.slice(0, 10)   + 'T00:00:00Z')
    const weeks = getSubscriptionWeeks(startDate, endDate)
    const target = weeks.find((w) => w.number === week)
    if (!target) return { ok: false, error: 'That week is not part of your current plan.' }

    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const daysSinceWeekEnd = Math.floor((today.getTime() - target.end.getTime()) / (1000 * 60 * 60 * 24))
    if (daysSinceWeekEnd < 1) return { ok: false, error: 'This week hasn’t ended yet — come back after it wraps.' }
    if (daysSinceWeekEnd > 30) return { ok: false, error: 'The review window for this week has expired.' }

    const rewardPct = rewardPctForWeekEnd(target.end, today)

    const isoDate = (d: Date) => d.toISOString().slice(0, 10)

    // Insert weekly_reviews row + capture the new id so we can FK the
    // pending credit to it (Phase 8K Model C). RETURNING id avoids a
    // second SELECT round-trip.
    const { data: reviewRow, error: insertError } = await supabase
        .from('weekly_reviews')
        .insert({
            customer_id:        user.id,
            subscription_id:    sub.id,
            week_number:        week,
            week_start_date:    isoDate(target.start),
            week_end_date:      isoDate(target.end),
            rating:             payload.rating,
            favorites:          payload.favorites,
            misses:             payload.misses,
            miss_reasons:       payload.missReasons,
            delivery_thumbs:    payload.delivery,
            delivery_reasons:   payload.deliveryReasons,
            packaging_thumbs:   payload.packaging,
            packaging_reasons:  payload.packagingReasons,
            kitchen_note:       payload.kitchenNote,
            reward_pct:         rewardPct,
        })
        .select('id')
        .single()

    if (insertError) {
        // 23505 = unique_violation → double-submit attempt
        if (insertError.code === '23505') {
            return { ok: false, error: 'You’ve already submitted this week’s review.' }
        }
        return { ok: false, error: 'Could not save your review. Please try again.' }
    }

    // ── Phase 8K Model C — Pending → threshold-flip credit deposit ─────
    //
    // Insert this week's reward as status='pending', linked via
    // weekly_review_id so we can find it for the bulk approval (or the
    // lazy rejection sweep on cycle-close).
    //
    // After insert, count the customer's submitted reviews for THIS sub.
    // If we've now hit `weeks.length`, this submission was the final one
    // for the cycle — flip ALL the pending review credits for this sub
    // to 'approved' atomically. The wallet gets the lump sum.
    //
    // For Weekly Flex (weeks.length === 1), the threshold is met by the
    // very first submission, so this collapses to "deposit as approved
    // immediately" with no UX change.
    //
    // We never auto-reject here — that's the lazy cleanup helper's job
    // (runs on hub load + on submit, scoped to expired cycles).
    const rewardAed = weeklyReviewAed(rewardPct)
    let lumpSumApprovedAed: number | null = null
    if (reviewRow?.id) {
        // Credit writes use the service-role client because the credits
        // table's RLS intentionally doesn't grant customers direct
        // INSERT/UPDATE — see reviewCreditsAdmin() above for rationale.
        // user.id was validated server-side via getUserFromHeaders() before
        // we got here, so scoping the writes to that id is safe.
        const admin = reviewCreditsAdmin()
        const { error: creditError } = await admin.from('credits').insert({
            customer_id:       user.id,
            amount_aed:        rewardAed,
            source:            'layer4_weekly_review',
            status:            'pending',
            weekly_review_id:  reviewRow.id,
        })
        if (creditError) {
            console.error(
                `❌ weekly-review pending credit insert failed — customer=${user.id} week=${week} aed=${rewardAed}:`,
                creditError,
            )
            // Non-fatal: the weekly_reviews row is the source of truth.
            // Ops can reconcile any orphan from review-row → no-credit.
        } else {
            // Count submitted reviews for this cycle, then flip if we've
            // hit the threshold.
            const { count } = await supabase
                .from('weekly_reviews')
                .select('id', { count: 'exact', head: true })
                .eq('customer_id', user.id)
                .eq('subscription_id', sub.id)

            if ((count ?? 0) >= weeks.length) {
                // Threshold met — flip every pending review credit for this
                // sub to 'approved'. Sub-scoping via the weekly_reviews
                // join: pending credits whose linked review belongs to
                // this customer+sub.
                const { data: subReviewIds } = await supabase
                    .from('weekly_reviews')
                    .select('id')
                    .eq('customer_id', user.id)
                    .eq('subscription_id', sub.id)
                const ids = (subReviewIds ?? []).map(r => r.id as string)
                if (ids.length > 0) {
                    const { data: flipped, error: flipError } = await admin
                        .from('credits')
                        .update({ status: 'approved' })
                        .eq('customer_id', user.id)
                        .eq('source', 'layer4_weekly_review')
                        .eq('status', 'pending')
                        .in('weekly_review_id', ids)
                        .select('amount_aed')
                    if (flipError) {
                        console.error(
                            `❌ weekly-review threshold-flip failed — customer=${user.id} sub=${sub.id}:`,
                            flipError,
                        )
                    } else {
                        lumpSumApprovedAed = (flipped ?? []).reduce(
                            (sum, c) => sum + Number(c.amount_aed),
                            0,
                        )
                    }
                }
            }
        }
    }

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/menu')
    revalidatePath('/dashboard/dorm-wars')

    return { ok: true, rewardPct, lumpSumApprovedAed }
}
