// Notifications context — queue use-case.
//
// Helpers for queuing outbound WhatsApp messages to customers. All inserts go
// into public.customer_notifications via a service-role client because the
// table's RLS denies non-service-role writes — notifications are
// server-controlled, never customer-writable.
//
// A 5-minute pg_cron job (dispatch_customer_notifications_tick) pulls due
// rows and dispatches them to Meta WhatsApp Cloud API via pg_net.
// See supabase/migrations/20260525_customer_notifications_*.sql.
//
// TODO Phase 11: split the Supabase admin-client create into infra/supabase/
// (deduplicate with the same helper in queries.ts and dorm-wars/repo.ts).

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

