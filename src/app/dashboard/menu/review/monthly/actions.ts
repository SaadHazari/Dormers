'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { createClient } from '@/utils/supabase/server'
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import {
    MONTHLY_FULL_REWARD_WINDOW_DAYS,
    MONTHLY_LATE_CAP_DAYS,
    PRE_END_WRAP_WINDOW,
    monthlyReviewAed,
    planTierFrom,
    wrapVocabFor,
    type MonthlyReviewPayload,
    type MonthlyReviewSubmitResult,
} from '@/contexts/subscriptions/domain/monthly-review'
import { getMonthlyRevealStats } from '@/utils/supabase/monthly-review-queries'
import { getMenuDishes } from '@/infra/supabase/menu-image-overrides'

/**
 * Service-role client for credit writes. Mirrors the weekly review action
 * pattern — the credits table's RLS doesn't grant customers direct
 * INSERT/UPDATE, so after the user-session client validates identity we
 * use this admin client to write the credit row scoped to that user.id.
 */
function reviewCreditsAdmin() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
    )
}

/**
 * Persist a monthly review submission.
 *
 * Validations:
 *   1. User must be authenticated
 *   2. User must have a subscription whose cycle has ended (end_date ≤ today)
 *   3. The cycle must be within the 30-day late-cap window
 *   4. No existing monthly review for this (customer, subscription) — the
 *      unique constraint enforces this at the DB layer too
 *
 * Reward percentage is derived server-side from days-since-cycle-end so a
 * tampered client can't claim 100% reward on a late submission.
 *
 * On success, returns reveal stats so the client can transition into the
 * reveal screen without an extra round-trip.
 */
export async function submitMonthlyReview(
    payload: MonthlyReviewPayload,
): Promise<MonthlyReviewSubmitResult> {
    const user = await getUserFromHeaders()
    if (!user) return { ok: false, error: 'You need to be signed in to submit your wrap.' }

    const supabase = await createClient()

    // Mirror the eligibility query in monthly-review-queries.ts exactly:
    // same AE-adjusted "today", same pre-end window expansion, same
    // tier-specific gating. Any divergence between these two queries
    // causes the UI to show "eligible" while the submit rejects.
    const now = new Date()
    const ae = new Date(now.getTime() + 4 * 60 * 60 * 1000)
    const today = new Date(Date.UTC(ae.getUTCFullYear(), ae.getUTCMonth(), ae.getUTCDate()))
    const maxPreEnd = Math.max(...Object.values(PRE_END_WRAP_WINDOW))
    const maxFuture = new Date(today)
    maxFuture.setUTCDate(today.getUTCDate() + maxPreEnd)
    const maxFutureIso = maxFuture.toISOString().slice(0, 10)

    const { data: sub } = await supabase
        .from('subscriptions')
        .select('id, end_date, status, plan_name')
        .eq('customer_id', user.id)
        .in('status', [...LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS.SCHEDULED, SUBSCRIPTION_STATUS.ENDED])
        .lte('end_date', maxFutureIso)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (!sub) {
        return { ok: false, error: "Your cycle hasn't ended yet — come back when it wraps." }
    }

    const planTier = planTierFrom(sub.plan_name as string | null)
    const preEndWindow = PRE_END_WRAP_WINDOW[planTier]
    const endDate = new Date(sub.end_date.slice(0, 10) + 'T00:00:00Z')
    const daysSinceEnd = Math.floor((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysSinceEnd < -preEndWindow) {
        return { ok: false, error: "Your cycle hasn't ended yet — come back when it wraps." }
    }
    if (daysSinceEnd > MONTHLY_LATE_CAP_DAYS) {
        return { ok: false, error: 'The review window for this cycle has expired.' }
    }

    const rewardPct: 50 | 100 =
        daysSinceEnd <= MONTHLY_FULL_REWARD_WINDOW_DAYS ? 100 : 50

    // Validate the minimum required fields. Most fields are optional; only
    // alternative + alternative_cost + renewal_intent + recommend are
    // required by the schema constraints. Defensive client-side too.
    if (!payload.alternative) return { ok: false, error: 'Please pick an alternative.' }
    if (!payload.alternativeCostAed) return { ok: false, error: 'Please pick a cost range.' }
    if (!payload.renewalIntent) return { ok: false, error: 'Please answer the renewal question.' }
    if (!payload.recommend) return { ok: false, error: 'Please answer the recommendation question.' }

    // Insert monthly_reviews row + capture id for the FK on the credit row.
    const { data: reviewRow, error: insertError } = await supabase
        .from('monthly_reviews')
        .insert({
            customer_id:            user.id,
            subscription_id:        sub.id,
            signup_triggers:        payload.signupTriggers,
            signup_triggers_other:  payload.signupTriggersOther,
            jobs:                   payload.jobs,
            jobs_other:             payload.jobsOther,
            best_moment:            payload.bestMoment,
            friction_moment:        payload.frictionMoment,
            alternative:            payload.alternative,
            alternative_other:      payload.alternativeOther,
            alternative_cost_aed:   payload.alternativeCostAed,
            renewal_intent:         payload.renewalIntent,
            renewal_reason:         payload.renewalReason,
            recommend:              payload.recommend,
            recommend_text:         payload.recommendText,
            reward_pct:             rewardPct,
        })
        .select('id')
        .single()

    if (insertError) {
        // 23505 = unique_violation -> double-submit attempt
        if (insertError.code === '23505') {
            const vocab = wrapVocabFor(planTier)
            return { ok: false, error: `You've already submitted your ${vocab.qualifier} wrap.` }
        }
        return { ok: false, error: 'Could not save your wrap. Please try again.' }
    }

    // Phase 8K wiring — monthly wrap is single-submit, so unlike the
    // weekly all-or-nothing flow we deposit as 'approved' immediately.
    // Source 'layer4_monthly_review' triggers the celebration banner on
    // the next page load. FK to monthly_reviews keeps the audit trail
    // symmetric with the weekly path. Late submissions earn the fixed
    // LATE_REWARD_AED, not a linear scaling of MONTHLY_REWARD_AED.
    const rewardAed = monthlyReviewAed(rewardPct)
    if (reviewRow?.id) {
        // Service-role client — credits RLS doesn't grant customers
        // INSERT (see reviewCreditsAdmin() above). user.id was validated
        // upstream via getUserFromHeaders().
        const admin = reviewCreditsAdmin()
        const { error: creditError } = await admin.from('credits').insert({
            customer_id:        user.id,
            amount_aed:         rewardAed,
            source:             'layer4_monthly_review',
            status:             'approved',
            monthly_review_id:  reviewRow.id,
        })
        if (creditError) {
            console.error(
                `❌ monthly-review credit insert failed — customer=${user.id} sub=${sub.id} aed=${rewardAed}:`,
                creditError,
            )
            const { notifyAdmin } = await import('@/infra/admin-alerts/notify')
            void notifyAdmin(
                `Monthly review credit INSERT FAILED — customer ${user.id}, sub ${sub.id}, AED ${rewardAed}. ` +
                `Review saved but credit missing. Manual credit needed.`,
            )
        }
    }

    const revealStats = await getMonthlyRevealStats(user.id, sub.id)

    if (revealStats?.favoriteDish?.name) {
        const dishId = Number(revealStats.favoriteDish.name)
        const menuDishes = await getMenuDishes()
        const dish = menuDishes.find(d => d.id === dishId)
        if (dish) {
            revealStats.favoriteDish = {
                name: dish.name,
                image: typeof dish.image === 'string' ? dish.image : (dish.image as { src: string }).src,
            }
        }
    }

    // Cache invalidation is deliberately deferred to the client `onClose`
    // handler. Calling revalidatePath here triggers a router refresh that
    // re-runs the page.tsx server component, which then sees the review as
    // submitted and redirects — yanking the user off the reveal screen
    // before they can read it.
    return {
        ok: true,
        rewardPct,
        revealStats: revealStats ?? {
            planName: 'Plan',
            cycleLabel: 'cycle',
            mealsDelivered: 0,
            mealsTotal: 0,
            favoriteDish: null,
            topWeek: null,
            favoriteSocialProofPct: null,
            aedEarnedThisCycle: rewardAed,
            weeklyReviewsSubmitted: 0,
            weeklyReviewsTotal: 0,
        },
    }
}
