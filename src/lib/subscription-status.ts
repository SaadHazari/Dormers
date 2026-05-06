/**
 * Persisted subscription / order statuses. Was a string-literal pile-up
 * across webhook, dashboard/actions, PlanClient, ClientDashboard, and
 * the preview fixtures — a typo would silently miss a status check.
 */

export const SUBSCRIPTION_STATUS = {
    ACTIVE: 'Active',
    PAUSED: 'Paused',
    SCHEDULED: 'Scheduled',
    ENDED: 'Ended',
    /**
     * Set when the user skips today's meal. Auto-reverts to ACTIVE at midnight
     * Asia/Dubai via the subscription_status_tick cron, so the next delivery
     * day proceeds normally. `last_skipped_date` stays as audit trail.
     */
    SKIPPED: 'Skipped',
} as const

export type SubscriptionStatus =
    (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS]

/**
 * Statuses that count as "live" / in-flight. Used by the webhook to find
 * overlapping subscriptions that need to be ended when a new checkout
 * lands, and by getActiveSubscription to pick the user's primary sub.
 *
 * SKIPPED is included: a sub that's skipped today is still live, just
 * paused for the day. The dashboard renders it (with the "Skipped today"
 * hero state) rather than falling back to NoPlanView.
 */
export const LIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.PAUSED,
    SUBSCRIPTION_STATUS.SKIPPED,
]

export const INVOICE_STATUS = {
    PAID: 'Paid',
} as const

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS]
