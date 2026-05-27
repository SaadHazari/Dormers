import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Subscription row shape as fetched from the `subscriptions` table.
 * Loose typing — Supabase generated types aren't in use yet, and the
 * dashboard reads a wide set of columns. Tighten when generated types
 * land.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SubscriptionRow = Record<string, any>

export type LoadSubscriptionResult =
    | { ok: true; subscription: SubscriptionRow }
    | { ok: false; error: string }

/**
 * Loads a subscription scoped to the calling user. Replaces the
 * `.from('subscriptions').select('*').eq('id', subId).eq('customer_id', userId).single()`
 * + null-check pattern that was duplicated across pause / resume / skip.
 *
 * Returns `{ ok: false, error: 'Subscription not found' }` for both
 * missing rows and rows owned by another user — same behaviour as the
 * inline version, with the security-relevant ownership check baked in.
 */
export async function loadOwnedSubscription(
    supabase: SupabaseClient,
    subscriptionId: string,
    userId: string,
): Promise<LoadSubscriptionResult> {
    const { data: subscription, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .eq('customer_id', userId)
        .single()

    if (error || !subscription) return { ok: false, error: 'Subscription not found' }
    return { ok: true, subscription }
}
