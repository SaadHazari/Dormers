// Notifications context — queue use-case.
//
// Helpers for queuing outbound WhatsApp messages to customers. All inserts go
// into public.customer_notifications via a service-role client because the
// table's RLS denies non-service-role writes — notifications are
// server-controlled, never customer-writable.
//
// Two dispatch paths cover every row:
//   • On-demand kick (this file) — for rows scheduled within ~now, the
//     queue call also invokes dispatch_customer_notifications_tick directly
//     so the WhatsApp lands within seconds instead of waiting up to 5 min
//     for the next cron tick.
//   • Cron (*/5 min) — sweeps everything: future-scheduled rows whose time
//     has come (e.g. tomorrow 9 AM resume confirms), and any rows whose
//     on-demand kick failed silently.
// See supabase/migrations/20260525_customer_notifications_*.sql.

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

export type CustomerNotificationKind =
    | 'meal_skipped_confirm'
    | 'meal_resumed_confirm'
    | 'meal_skip_scheduled_confirm'
    | 'meal_skip_cancelled_confirm'
    | 'plan_paused_confirm'
    | 'plan_pause_scheduled_confirm'
    | 'plan_pause_cancelled_confirm'
    | 'plan_resumed_confirm'
    | 'plan_start_date_changed_confirm'
    | 'payment_order_confirmed'
    | 'welcome_meal_confirmed'
    | 'subscription_renew_nudge'

/**
 * Queue a WhatsApp notification for a customer.
 *
 * Inserts a row into customer_notifications with the given kind + payload.
 * The dispatcher cron picks it up and sends within ~5 minutes of
 * `scheduledFor`.
 *
 * Throws on insert failure. Callers decide whether the failure is fatal:
 *   • post-payment fanout NEEDS the throw so `whatsapp_sent_at` isn't
 *     marked done while no row was actually queued (would leave the
 *     customer without a confirmation and the retry cron blind to it).
 *   • event-bus subscribers (skip/pause/resume) catch + log so the user's
 *     primary action still succeeds when a confirmation queue fails.
 */
// How close to "due now" a row needs to be for the on-demand kick to bother
// invoking the dispatcher. Rows scheduled further out (the morning-after
// resume confirms at 9 AM AE tomorrow, etc.) are left to the cron — the
// dispatcher's `scheduled_for <= now()` filter would skip them anyway, so
// kicking it would just be a wasted RPC. 60s gives plenty of slack for
// clock skew between the app server and Postgres.
const ON_DEMAND_DISPATCH_WINDOW_MS = 60 * 1000

export async function queueCustomerNotification(
    customerId: string,
    kind: CustomerNotificationKind,
    scheduledFor: Date,
    payload: Record<string, string> = {},
): Promise<void> {
    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('customer_notifications').insert({
        customer_id:   customerId,
        kind,
        scheduled_for: scheduledFor.toISOString(),
        payload,
    })
    if (error) {
        throw new Error(
            `queueCustomerNotification failed — customer=${customerId} kind=${kind}: ${error.message}`,
        )
    }

    // On-demand dispatch for immediate-due rows. The dispatcher uses
    // FOR UPDATE SKIP LOCKED, so a concurrent cron tick can't double-send
    // the same row. pg_net.http_post inside the function is async (returns
    // after enqueueing, not after Meta responds), so this RPC adds only
    // tens of ms to the user's server action.
    //
    // Failures are swallowed: the row is durably queued and the cron will
    // pick it up on its next tick. We don't want a transient dispatch
    // hiccup to surface as the user's action failing.
    const msUntilDue = scheduledFor.getTime() - Date.now()
    if (msUntilDue <= ON_DEMAND_DISPATCH_WINDOW_MS) {
        try {
            await admin.rpc('dispatch_customer_notifications_tick')
        } catch (err) {
            console.error(
                `queueCustomerNotification: on-demand dispatch failed for customer=${customerId} kind=${kind} (cron will retry):`,
                err,
            )
        }
    }
}

/**
 * Cancel pending (unsent) notifications of the given kinds for a customer.
 *
 * Used when a later action supersedes an earlier one — e.g. pausing
 * supersedes a same-cycle skip, so the skip's queued `meal_resumed_confirm`
 * ("meals resume tonight") must not fire: it would contradict the pause AND
 * double up with the pause's own resume confirm on the day the customer
 * comes back. Last-in wins.
 *
 * We don't hard-delete. Closing the row out with sent_at + a sentinel wamid
 * (mirrors the dispatcher's 'skipped:unverified' path) keeps the ops audit
 * trail intact — "we queued this resume confirm, then the pause superseded
 * it" — and drops it from the pending partial index so the cron skips it.
 *
 * The CAS-style `.is('sent_at', null)` filter is what makes this safe against
 * the dispatcher: if the cron already grabbed and sent the row, sent_at is
 * set, this update matches zero rows, and we never stomp a real send.
 *
 * Throws on DB error so the calling subscriber can log it; the action that
 * triggered the cancel (pause) has already committed and stays successful.
 */
export async function cancelPendingCustomerNotifications(
    customerId: string,
    kinds: CustomerNotificationKind[],
): Promise<void> {
    if (kinds.length === 0) return
    const admin = createAdminSupabaseClient()
    const { error } = await admin
        .from('customer_notifications')
        .update({ sent_at: new Date().toISOString(), wamid: 'cancelled:superseded' })
        .eq('customer_id', customerId)
        .in('kind', kinds)
        .is('sent_at', null)
    if (error) {
        throw new Error(
            `cancelPendingCustomerNotifications failed — customer=${customerId} kinds=${kinds.join(',')}: ${error.message}`,
        )
    }
}

