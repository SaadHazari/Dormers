/**
 * Reading a deletion before doing it.
 *
 * `admin_customer_delete_impact` returns raw table names and counts. This
 * turns that into the sentence an admin actually has to agree with, and sorts
 * the selection into what will go, what cannot, and what needs a second look.
 *
 * Pure: no database, no React. The rules that decide whether a person can be
 * destroyed should be readable in one file and testable without a live row.
 */

export interface DeleteImpactRow {
    customer_id: string
    name: string | null
    email: string | null
    cid: string | null
    /** table name to row count, for every table with rows. */
    impact: Record<string, number>
    total_rows: number
    on_waitlist: boolean
    waitlist_credit_aed: number
    is_staff: boolean
    delivered_meals: number
    has_live_stripe: boolean
    blocked_reason: string | null
}

/** Table names as a person would say them. Singular and plural, because
 *  "1 subscriptions" reads like a bug in the tool you are trusting. */
const TABLE_WORDS: Record<string, [string, string]> = {
    subscriptions: ['plan', 'plans'],
    orders: ['order', 'orders'],
    credits: ['credit', 'credits'],
    contacts: ['contact', 'contacts'],
    customer_notifications: ['notification', 'notifications'],
    intake_waitlist: ['waitlist spot', 'waitlist spots'],
    comped_meal_ledger: ['free meal', 'free meals'],
    season_holds: ['season hold', 'season holds'],
    season_notices: ['season notice', 'season notices'],
    staff_members: ['staff link', 'staff links'],
    referrals: ['referral', 'referrals'],
    referral_gifts_claimed: ['claimed gift', 'claimed gifts'],
    streaks: ['streak', 'streaks'],
    streak_chests: ['streak chest', 'streak chests'],
    daily_drops: ['daily drop', 'daily drops'],
    weekly_reviews: ['weekly review', 'weekly reviews'],
    monthly_reviews: ['monthly review', 'monthly reviews'],
    cycle_rewards: ['cycle reward', 'cycle rewards'],
    lifetime_rewards: ['lifetime reward', 'lifetime rewards'],
    layer4_rewards: ['reward', 'rewards'],
    broadcast_sends: ['broadcast record', 'broadcast records'],
}

/**
 * "29 free meals, 2 credits, 1 contact" — biggest first, so the number that
 * should give someone pause is the one they read first.
 */
export function describeImpact(impact: Record<string, number>): string {
    const parts = Object.entries(impact)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([table, n]) => {
            const words = TABLE_WORDS[table]
            // An unmapped table shows its raw name rather than being dropped:
            // a row nobody can see is a row nobody can object to.
            if (!words) return `${n} ${table}`
            return `${n} ${n === 1 ? words[0] : words[1]}`
        })
    return parts.length > 0 ? parts.join(', ') : 'nothing else'
}

export interface DeletionPlan {
    /** Who would actually be deleted. */
    deletable: DeleteImpactRow[]
    /** Who the database or the rules refuse, with a reason on each row. */
    blocked: DeleteImpactRow[]
    /** Deletable people holding a waitlist spot — the second acknowledgement. */
    needsWaitlistAck: DeleteImpactRow[]
    /** Deletable people the kitchen has actually cooked for. */
    served: DeleteImpactRow[]
    /** Deletable people with a staff link. */
    staff: DeleteImpactRow[]
    totalPeople: number
    totalRows: number
    totalCreditAed: number
    requiresWaitlistAck: boolean
}

export function planDeletion(rows: DeleteImpactRow[]): DeletionPlan {
    const deletable = rows.filter(r => !r.blocked_reason)
    const blocked = rows.filter(r => r.blocked_reason)

    // Only deletable rows count towards the warnings. Warning about the credit
    // of someone who is not going anywhere is noise, and noise is what makes a
    // confirmation screen stop being read.
    const needsWaitlistAck = deletable.filter(r => r.on_waitlist)

    return {
        deletable,
        blocked,
        needsWaitlistAck,
        served: deletable.filter(r => r.delivered_meals > 0),
        staff: deletable.filter(r => r.is_staff),
        totalPeople: deletable.length,
        totalRows: deletable.reduce((n, r) => n + r.total_rows, 0),
        totalCreditAed: needsWaitlistAck.reduce((n, r) => n + (r.waitlist_credit_aed ?? 0), 0),
        requiresWaitlistAck: needsWaitlistAck.length > 0,
    }
}
