'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { isPasswordStrong, PASSWORD_RULES_TEXT } from '@/shared/validation'

// Action result shapes are defined inline at call sites. Next.js 15 +
// Turbopack disallows non-async-function exports from 'use server' files.

const E164 = /^\+\d{8,15}$/

// ─── Email change ─────────────────────────────────────────────────────────
//
// Triggers Supabase's email-change verification flow. Supabase emails a
// 6-digit code ({{ .Token }}) to the NEW address; the change takes effect
// once confirmEmailChange() below verifies it. With "Secure email change"
// enabled in Supabase Auth settings a second code goes to the CURRENT
// address and the change lands only after both are confirmed — the sheet
// asks for that second code when the first one didn't flip the email.
//
// Code, not link: mailbox scanners on university domains prefetch anything
// clickable in an auth email and burn the single-use token (see the OTP
// saga on the signup template). The email-change template is code-only.

export async function requestEmailChange(newEmail: string) {
  const trimmed = (newEmail || '').trim().toLowerCase()
  if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
    return { error: 'Enter a valid email address.' }
  }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return { error: 'Not signed in.' }
  if (userData.user.email?.toLowerCase() === trimmed) {
    return { error: 'That is already your email.' }
  }

  const { error } = await supabase.auth.updateUser({ email: trimmed })
  if (error) {
    // Common: "User already registered" if the new email is taken.
    return { error: error.message }
  }

  return {
    ok: true as const,
    message: `We emailed a 6-digit code to ${trimmed}. Enter it below to confirm the change.`,
  }
}

// ─── Confirm email change with the emailed code ───────────────────────────
//
// `email` is the inbox the code came from: the NEW address for the first
// code, the CURRENT address for the second one under secure email change.
// `done` tells the sheet whether the account email has actually flipped.

export async function confirmEmailChange(email: string, token: string) {
  const trimmed = (email || '').trim().toLowerCase()
  if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
    return { error: 'Enter a valid email address.' }
  }
  // Supabase OTP length is 6–10 digits depending on Auth → Settings.
  if (!/^\d{6,10}$/.test(token ?? '')) {
    return { error: 'Enter the code from your email.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type: 'email_change', email: trimmed, token })
  if (error) {
    return {
      error: /expired|invalid/i.test(error.message)
        ? 'That code is wrong or has expired. Send a fresh one and try again.'
        : error.message,
    }
  }

  const { data: userData } = await supabase.auth.getUser()
  const done = userData?.user?.email?.toLowerCase() === trimmed
  if (done) {
    revalidatePath('/dashboard', 'layout')
    return { ok: true as const, done: true as const, message: 'Email updated.' }
  }
  // Secure email change: the current address got a code too, and the
  // change lands once that one is confirmed as well.
  return {
    ok: true as const,
    done: false as const,
    message: 'One more step — enter the code we sent to your current address.',
  }
}

// ─── Password change ──────────────────────────────────────────────────────
//
// Requires the user to type their current password as a re-authentication
// step. Without that, anyone with a hijacked session could lock the real
// owner out by changing the password silently. We re-auth via
// signInWithPassword (does NOT replace the current session — the SSR
// client just verifies the credentials), then call updateUser({ password }).

export async function changePassword(currentPassword: string, newPassword: string) {
  if (!currentPassword) return { error: 'Enter your current password to continue.' }
  if (!isPasswordStrong(newPassword ?? '')) return { error: PASSWORD_RULES_TEXT }
  if (currentPassword === newPassword) {
    return { error: 'Pick a new password that is different from your current one.' }
  }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const email = userData?.user?.email
  if (!email) return { error: 'Not signed in.' }

  // Re-authentication step. signInWithPassword on the SSR client refreshes
  // the session if successful — equivalent to a silent re-login. If the
  // password is wrong, we abort before mutating anything.
  const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (reauthError) {
    return { error: 'Current password is incorrect.' }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
  if (updateError) return { error: updateError.message }

  revalidatePath('/', 'layout')
  return { ok: true as const, message: 'Password updated.' }
}

// ─── Send password-reset link (alternative to in-app change) ──────────────
//
// Useful for "I don't remember my current password" — same flow as the
// /login forgot-password path, but pre-fills the user's signed-in email
// so they don't have to retype it.

export async function sendPasswordResetForSelf() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const email = userData?.user?.email
  if (!email) return { error: 'Not signed in.' }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3004'
  const next = encodeURIComponent('/login?step=set-password')
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/auth/confirm?next=${next}`,
  })
  if (error && !/rate/i.test(error.message)) {
    // A genuine send failure (provider/SMTP issue) — don't claim the link was
    // sent. Rate-limit errors are intentionally swallowed below (the link from
    // the earlier request is already on its way).
    console.error('sendPasswordResetForSelf error:', error)
    return { ok: true as const, message: 'We had trouble sending the link just now — please try again in a moment.' }
  }
  return { ok: true as const, message: `Reset link sent to ${email}.` }
}

// ─── WhatsApp verify / change ─────────────────────────────────────────────
//
// The customer's phone number lives on customers.whatsapp_number; the
// verification status on customers.whatsapp_verified +
// customers.whatsapp_verified_at. The OTP itself is handled by the
// existing /api/whatsapp/start + /api/whatsapp/check endpoints (used by
// onboarding). This action is the FINAL step — once a fresh verified OTP
// row exists in whatsapp_otps for the given phone, we mark the customer
// row as verified and persist the new number.
//
// Mirrors the isPhoneVerified() check in onboarding/actions.ts: the
// verified row must be within the last 30 minutes so a stale verification
// can't be replayed.

export async function markWhatsappVerified(phone: string) {
  const trimmed = (phone || '').trim()
  if (!E164.test(trimmed)) return { error: 'Invalid phone number.' }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return { error: 'Not signed in.' }

  const supabaseAdmin = createAdminSupabaseClient()
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: otp } = await supabaseAdmin
    .from('whatsapp_otps')
    .select('id, verified_at')
    .eq('phone', trimmed)
    .gte('verified_at', cutoff)
    .is('consumed_at', null)
    .order('verified_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!otp) {
    return { error: 'Verification expired or not found. Send a fresh code and try again.' }
  }

  const nowIso = new Date().toISOString()
  // Write the verified-phone fields with the service-role client, not the
  // user-JWT client. whatsapp_verified gates trust, so direct client UPDATE
  // on it (and whatsapp_number / whatsapp_verified_at) is revoked at the DB
  // grant level — the write must flow through the admin client, gated by the
  // fresh-OTP check above. (Auth is already established via getUser().)
  const { error: updateError, data: rows } = await supabaseAdmin
    .from('customers')
    .update({
      whatsapp_number: trimmed,
      whatsapp_verified: true,
      whatsapp_verified_at: nowIso,
    })
    .eq('id', userData.user.id)
    .select('id')

  if (updateError) return { error: updateError.message }
  if (!rows || rows.length === 0) {
    return { error: 'Could not save the verified number. Refresh and try again.' }
  }

  // Consume the OTP — single-use, so this verification can't be replayed to
  // re-attach the number elsewhere within the 30-min window.
  await supabaseAdmin
    .from('whatsapp_otps')
    .update({ consumed_at: nowIso })
    .eq('id', otp.id)
    .is('consumed_at', null)

  revalidatePath('/dashboard', 'layout')
  return { ok: true as const, message: 'WhatsApp verified.' }
}

// ─── Resend signup confirmation email ─────────────────────────────────────
//
// For users whose email is still unconfirmed (auth.users.email_confirmed_at
// is null). Triggers a fresh confirmation email so they can verify without
// having to start over.

export async function resendSignupConfirmation() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user || !user.email) return { error: 'Not signed in.' }
  if (user.email_confirmed_at) {
    return { error: 'Your email is already verified.' }
  }

  const { error } = await supabase.auth.resend({ type: 'signup', email: user.email })
  if (error) return { error: error.message }
  return { ok: true as const, message: `Confirmation code sent to ${user.email} — enter it on the sign-in page.` }
}
