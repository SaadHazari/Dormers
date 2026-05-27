import { createClient } from '@/utils/supabase/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

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
 */
export type RequireUserResult =
    | { ok: true; supabase: SupabaseClient; user: User }
    | { ok: false; error: string }

export async function requireUser(): Promise<RequireUserResult> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Unauthorized' }
    return { ok: true, supabase, user }
}
