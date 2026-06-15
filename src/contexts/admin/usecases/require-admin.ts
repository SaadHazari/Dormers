// src/lib/admin/auth.ts
// Minimal admin allowlist + guard. Used by /admin/* routes and the
// associated server actions.
//
// Source of truth: ADMIN_EMAILS env var. Comma-separated list of emails
// (case-insensitive). Empty / unset = no admins, all /admin/* routes
// redirect to /dashboard. Set in .env.local + .env.production:
//   ADMIN_EMAILS=saadhazari01@gmail.com,someoneelse@dormers.ae
//
// We deliberately do NOT use a customers.is_admin column because:
//   • The admin set is tiny + stable (the founders)
//   • Reading from env avoids a Supabase round-trip per page load
//   • Env-driven means rotation is a one-step deploy, no SQL UPDATE

import { redirect } from 'next/navigation'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { createClient } from '@/utils/supabase/server'

const ADMIN_EMAILS: Set<string> = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean),
)

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.has(email.trim().toLowerCase())
}

/**
 * Server-component / server-action guard. Throws via redirect() if the
 * caller isn't an admin — Next.js handles the redirect transparently.
 *
 * The middleware already validates the session and attaches x-user-id +
 * x-user-email headers; we just check the email against the allowlist.
 */
export async function requireAdmin(): Promise<{ id: string; email: string }> {
  let user = await getUserFromHeaders()

  // Safety net: if middleware forwarded a user ID but the email claim was
  // absent (stale JWT), fetch fresh user data from Supabase so the
  // allowlist check has something real to match against.
  if (user && !user.email) {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (data?.user?.email) {
      user = { id: user.id, email: data.user.email }
    }
  }

  if (!user) redirect('/login')
  if (!isAdminEmail(user.email)) redirect('/dashboard')
  return user
}
