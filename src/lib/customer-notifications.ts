// src/lib/customer-notifications.ts
// Helpers for queuing outbound WhatsApp messages to customers.
//
// All inserts go into public.customer_notifications via a service-role
// client because the table's RLS denies non-service-role writes —
// notifications are server-controlled, never customer-writable.
//
// A 5-minute pg_cron job (dispatch_customer_notifications_tick) pulls
// due rows and dispatches them to Meta WhatsApp Cloud API via pg_net.
// See supabase/migrations/20260525_customer_notifications_*.sql.

import { createClient as createAdminClient } from '@supabase/supabase-js'

export type CustomerNotificationKind =
    | 'meal_skipped_confirm'
    | 'meal_resumed_confirm'
    | 'plan_paused_confirm'
    | 'plan_pause_scheduled_confirm'
    | 'plan_resumed_confirm'
    | 'payment_order_confirmed'

function notificationsAdmin() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
    )
}

/**
 * Queue a WhatsApp notification for a customer.
 *
 * Inserts a row into customer_notifications with the given kind + payload.
 * The dispatcher cron picks it up and sends within ~5 minutes of
 * `scheduledFor`. Fire-and-forget: if the insert fails (DB hiccup, etc.)
 * we log but don't crash the calling action — the notification is a
 * confirmation nice-to-have, not the user's primary action outcome.
 */
export async function queueCustomerNotification(
    customerId: string,
    kind: CustomerNotificationKind,
    scheduledFor: Date,
    payload: Record<string, string> = {},
): Promise<void> {
    const admin = notificationsAdmin()
    const { error } = await admin.from('customer_notifications').insert({
        customer_id:   customerId,
        kind,
        scheduled_for: scheduledFor.toISOString(),
        payload,
    })
    if (error) {
        console.error(
            `❌ queueCustomerNotification failed — customer=${customerId} kind=${kind}:`,
            error,
        )
    }
}

/**
 * Convert an AE wall date (YYYY-MM-DD) to a UTC timestamp at 9 AM Dubai.
 * Dubai is UTC+4 with no DST, so 9 AM AE = 5 AM UTC every day of the year.
 */
export function ae9amUtcOnDate(aeDateIso: string): Date {
    return new Date(aeDateIso + 'T05:00:00Z')
}

/**
 * Find the next eligible delivery day after `fromAeDateIso` for a sub
 * with the given week_type, skipped_dates, paused_dates, and end_date.
 *
 * Eligible = a day that:
 *   • Is after `fromAeDateIso`
 *   • Is a working day for the week_type (5DAYS = Mon-Fri, 6DAYS = Mon-Sat, 7DAYS = every day)
 *   • Is NOT in skipped_dates
 *   • Is NOT in paused_dates
 *   • Is on or before end_date
 *
 * Returns the ISO date string of the first match, or null if no eligible
 * day exists between `fromAeDateIso` and end_date.
 *
 * Used by skipMeal to schedule the "your meal is back on" confirmation
 * for the right day (not literally tomorrow if tomorrow is already
 * skipped/paused/non-delivery).
 */
export function nextEligibleDeliveryDay(opts: {
    fromAeDateIso:    string
    weekType:         '5DAYS' | '6DAYS' | '7DAYS'
    skippedDates:     string[]
    pausedDates:      string[]
    subEndDateIso:    string
}): string | null {
    const { fromAeDateIso, weekType, skippedDates, pausedDates, subEndDateIso } = opts
    const skipped = new Set(skippedDates)
    const paused = new Set(pausedDates)

    // Walk day by day from fromAeDateIso + 1. Cap loop at 40 iterations
    // — longest plausible search window (5-day cycle with weekends + a
    // few skips inside) is well under that.
    const start = new Date(fromAeDateIso + 'T00:00:00Z')
    for (let i = 1; i <= 40; i++) {
        const candidate = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
        const candidateIso = candidate.toISOString().slice(0, 10)

        // Past sub end_date → no eligible day inside the cycle.
        if (candidateIso > subEndDateIso) return null

        // Working day check. ISO dow: 1=Mon..7=Sun (computed from UTC
        // since we built the date at T00:00:00Z).
        const isoDow = ((candidate.getUTCDay() + 6) % 7) + 1
        const isWorkingDay =
            weekType === '7DAYS' ? true :
            weekType === '6DAYS' ? isoDow !== 7 :
            /* 5DAYS */            isoDow !== 6 && isoDow !== 7
        if (!isWorkingDay) continue

        // Skip if customer-skipped or system-paused.
        if (skipped.has(candidateIso)) continue
        if (paused.has(candidateIso)) continue

        return candidateIso
    }
    return null
}
