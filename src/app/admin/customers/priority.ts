/**
 * Customer priority + attention rules for the admin customers list.
 *
 * The list used to arrive in signup order with no filtering, so anything
 * time-critical (a subscription ending today, a paused plan, a first day that
 * needs checking) was invisible unless you scrolled every row. These helpers
 * give each customer an urgency rank so the list can lead with what needs
 * acting on today.
 *
 * Pure module on purpose: no React, no 'use client'. The same ranking is used
 * for filtering, for sorting, and for the reason pill on each row.
 */

import type { CustomerRow } from './page'

/** Statuses that represent a subscription that is still running or about to. */
const LIVE_STATUSES = new Set(['Active', 'Paused', 'Skipped', 'Scheduled'])

/** Today in Dubai as YYYY-MM-DD. Stable across server render and hydration
 *  because the timezone is pinned, not read from the host clock. */
export function todayDubai(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. Negative when `to` is past. */
function dayDiff(from: string, to: string): number {
    const [fy, fm, fd] = from.split('-').map(Number)
    const [ty, tm, td] = to.split('-').map(Number)
    if ([fy, fm, fd, ty, tm, td].some(n => !Number.isFinite(n))) return NaN
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

export type AttentionTone = 'danger' | 'warning' | 'accent'

export interface Attention {
    label: string
    tone: AttentionTone
    /** Lower sorts first. Fractional for ending-soon so 1 day beats 3 days. */
    rank: number
    /** True when the status badge next to it already says the same thing, so
     *  the row shows the accent and the ranking but skips a duplicate pill. */
    redundantWithStatus?: boolean
}

/**
 * Why this customer needs looking at today, or null if they don't.
 * Order matters: the first rule that matches wins, most urgent first.
 */
export function getAttention(c: CustomerRow, today: string = todayDubai()): Attention | null {
    const status = c.sub_status
    if (!status || !LIVE_STATUSES.has(status)) return null

    if (c.sub_end_date) {
        const daysLeft = dayDiff(today, c.sub_end_date)
        if (Number.isFinite(daysLeft)) {
            // Still marked live but the end date has passed: a data problem that
            // silently keeps someone on the delivery list.
            if (daysLeft < 0) return { label: 'Past end date', tone: 'danger', rank: 1 }
            if (daysLeft === 0) return { label: 'Last day', tone: 'danger', rank: 2 }
            if (daysLeft <= 3) return {
                label: daysLeft === 1 ? 'Ends tomorrow' : `Ends in ${daysLeft} days`,
                tone: 'warning',
                rank: 3 + daysLeft / 10,
            }
        }
    }

    if (c.sub_start_date === today) return { label: 'First day', tone: 'accent', rank: 4 }
    if (status === 'Active' && (c.delivered_meals ?? 0) === 0) return { label: 'No meals yet', tone: 'warning', rank: 5 }
    if (status === 'Paused') return { label: 'Paused', tone: 'warning', rank: 6, redundantWithStatus: true }
    if (status === 'Skipped') return { label: 'Skipping today', tone: 'warning', rank: 7, redundantWithStatus: true }

    return null
}

/** Rank for customers with nothing urgent, so the list still reads sensibly. */
function restingRank(status: string | null): number {
    switch (status) {
        case 'Active': return 50
        case 'Scheduled': return 60
        case 'Paused': return 61
        case 'Skipped': return 62
        case 'Ended': return 80
        default: return 70 // no subscription on record
    }
}

export function urgencyRank(c: CustomerRow, today: string = todayDubai()): number {
    return getAttention(c, today)?.rank ?? restingRank(c.sub_status)
}

export type SortMode = 'urgency' | 'newest' | 'name'

export function sortCustomers(rows: CustomerRow[], mode: SortMode, today: string = todayDubai()): CustomerRow[] {
    const sorted = [...rows]
    if (mode === 'name') {
        sorted.sort((a, b) => {
            const an = a.name?.trim() || ''
            const bn = b.name?.trim() || ''
            if (!an !== !bn) return an ? -1 : 1 // unnamed customers last
            return an.localeCompare(bn, 'en')
        })
        return sorted
    }
    if (mode === 'newest') {
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
        return sorted
    }
    sorted.sort((a, b) => {
        const diff = urgencyRank(a, today) - urgencyRank(b, today)
        return diff !== 0 ? diff : b.created_at.localeCompare(a.created_at)
    })
    return sorted
}

/** Chip keys: 'attention' and 'all' are computed, the rest match sub_status. */
export type FilterKey = 'attention' | 'all' | 'Active' | 'Scheduled' | 'Paused' | 'Skipped' | 'Ended' | 'none'

export function matchesFilter(c: CustomerRow, key: FilterKey, today: string = todayDubai()): boolean {
    if (key === 'all') return true
    if (key === 'attention') return getAttention(c, today) !== null
    if (key === 'none') return !c.sub_status
    return c.sub_status === key
}
