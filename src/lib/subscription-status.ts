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
} as const

export type SubscriptionStatus =
    (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS]

/**
 * Statuses that count as "live" / in-flight. Used by the webhook to find
 * overlapping subscriptions that need to be ended when a new checkout
 * lands.
 */
export const LIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.PAUSED,
]

export const INVOICE_STATUS = {
    PAID: 'Paid',
} as const

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS]
