import { createClient } from '@/utils/supabase/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'

/**
 * Resolves the authenticated user for a server action / route handler.
 *
 * Returns a discriminated union — narrow on `ok` to access `supabase`/`user`:
 *
 * ```ts
 * const auth = await requireUser()
 * if (!auth.ok) return { error: auth.error }
 * // auth.supabase, auth.user are typed
 * ```
 *
 * Replaces the 3-line `createClient + getUser + 401` boilerplate that was
 * duplicated across every server action.
 *
 * Side effect: when an authenticated user is found, tags the current Sentry
 * scope with their id + email. Every issue, breadcrumb, trace, and replay
 * captured during this request is then attributed to that user in Sentry's
 * UI — so "this error fired for 23 unique users" tells you who, and a
 * customer-support ticket can be cross-referenced to the actual events.
 */
export type RequireUserResult =
    | { ok: true; supabase: SupabaseClient; user: User }
    | { ok: false; error: string }

export async function requireUser(): Promise<RequireUserResult> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Unauthorized' }

    // Attribute every subsequent Sentry capture during this request to
    // the customer. Sentry.setUser is a no-op when Sentry isn't initialized,
    // so this is safe even without SENTRY_DSN set.
    Sentry.setUser({
        id: user.id,
        email: user.email,
    })

    return { ok: true, supabase, user }
}
