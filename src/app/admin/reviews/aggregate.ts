/**
 * Pure, client-side aggregation over the detailed review arrays returned by
 * getReviewsOverview(). Keeping it here (not in the repo) means the dashboard's
 * numbers and its drill-downs are computed from the exact same records, so a
 * bar that reads "3" always opens to 3 matching reviews.
 */

import type { OverviewWeekly, OverviewMonthly } from '@/infra/supabase/reviews-repo'

export interface DishStat {
    id: string
    name: string
    favorites: number
    misses: number
    /** Miss-reason → count, e.g. { "Too mild": 2 }. */
    missReasons: Record<string, number>
}

export interface KitchenAgg {
    total: number
    avgRating: number | null
    /** Always 5 buckets (rating 1–5), zero-filled, high→low handled by the view. */
    distribution: Array<{ rating: number; count: number }>
    /** Avg rating per week_start_date, oldest first. */
    trend: Array<{ weekStart: string; avgRating: number; count: number }>
    topLoved: DishStat[]
    topMissed: DishStat[]
    deliveryDownCount: number
    deliveryDownRate: number
    deliveryReasonCounts: Record<string, number>
    packagingDownCount: number
    packagingDownRate: number
    packagingReasonCounts: Record<string, number>
}

export interface RetentionAgg {
    total: number
    renewalIntentCounts: Record<string, number>
    recommendCounts: Record<string, number>
    alternativeCounts: Record<string, number>
    costCounts: Record<string, number>
    signupTriggerCounts: Record<string, number>
    jobCounts: Record<string, number>
}

function bump(counts: Record<string, number>, key: string | null | undefined) {
    if (!key) return
    counts[key] = (counts[key] ?? 0) + 1
}

export function computeKitchen(weekly: OverviewWeekly[]): KitchenAgg {
    const distribution = [1, 2, 3, 4, 5].map(rating => ({ rating, count: 0 }))
    let ratingSum = 0
    const trendMap = new Map<string, { sum: number; count: number }>()
    const dishes = new Map<string, DishStat>()
    const deliveryReasonCounts: Record<string, number> = {}
    const packagingReasonCounts: Record<string, number> = {}
    let deliveryDownCount = 0
    let packagingDownCount = 0

    const ensureDish = (id: string, name: string): DishStat => {
        let s = dishes.get(id)
        if (!s) { s = { id, name, favorites: 0, misses: 0, missReasons: {} }; dishes.set(id, s) }
        return s
    }

    for (const w of weekly) {
        ratingSum += w.rating
        const bucket = distribution.find(b => b.rating === w.rating)
        if (bucket) bucket.count++

        if (w.weekStart) {
            const agg = trendMap.get(w.weekStart) ?? { sum: 0, count: 0 }
            agg.sum += w.rating; agg.count++
            trendMap.set(w.weekStart, agg)
        }

        for (const f of w.favorites) ensureDish(f.id, f.name).favorites++
        for (const m of w.misses) {
            const stat = ensureDish(m.id, m.name)
            stat.misses++
            for (const reason of m.reasons) stat.missReasons[reason] = (stat.missReasons[reason] ?? 0) + 1
        }
        if (w.deliveryThumbs === 'down') {
            deliveryDownCount++
            for (const reason of w.deliveryReasons) bump(deliveryReasonCounts, reason)
        }
        if (w.packagingThumbs === 'down') {
            packagingDownCount++
            for (const reason of w.packagingReasons) bump(packagingReasonCounts, reason)
        }
    }

    const all = [...dishes.values()]
    const total = weekly.length
    return {
        total,
        avgRating: total ? Math.round((ratingSum / total) * 100) / 100 : null,
        distribution,
        trend: [...trendMap.entries()]
            .map(([weekStart, { sum, count }]) => ({ weekStart, avgRating: Math.round((sum / count) * 100) / 100, count }))
            .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
        topLoved: all.filter(d => d.favorites > 0).sort((a, b) => b.favorites - a.favorites).slice(0, 8),
        topMissed: all.filter(d => d.misses > 0).sort((a, b) => b.misses - a.misses).slice(0, 8),
        deliveryDownCount,
        deliveryDownRate: total ? Math.round((deliveryDownCount / total) * 100) : 0,
        deliveryReasonCounts,
        packagingDownCount,
        packagingDownRate: total ? Math.round((packagingDownCount / total) * 100) : 0,
        packagingReasonCounts,
    }
}

export function computeRetention(monthly: OverviewMonthly[]): RetentionAgg {
    const renewalIntentCounts: Record<string, number> = {}
    const recommendCounts: Record<string, number> = {}
    const alternativeCounts: Record<string, number> = {}
    const costCounts: Record<string, number> = {}
    const signupTriggerCounts: Record<string, number> = {}
    const jobCounts: Record<string, number> = {}

    for (const m of monthly) {
        bump(renewalIntentCounts, m.renewalIntent)
        bump(recommendCounts, m.recommend)
        bump(alternativeCounts, m.alternative)
        bump(costCounts, m.alternativeCostAed)
        for (const trigger of m.signupTriggers) bump(signupTriggerCounts, trigger)
        for (const job of m.jobs) bump(jobCounts, job)
    }

    return { total: monthly.length, renewalIntentCounts, recommendCounts, alternativeCounts, costCounts, signupTriggerCounts, jobCounts }
}
