'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { isPasswordStrong, PASSWORD_RULES_TEXT } from '@/shared/validation'

export async function login(formData: FormData) {
    const supabase = await createClient()

    const data = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    }

    const { error } = await supabase.auth.signInWithPassword(data)

    if (error) {
        const params = new URLSearchParams({ error: error.message, email: data.email })
        redirect(`/login?${params.toString()}`)
    }

    revalidatePath('/', 'layout')
    const nextUrl = formData.get('next_url') as string || '/dashboard'
    redirect(nextUrl)
}

export async function signup(formData: FormData) {
    const supabase = await createClient()

    const data = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    }

    const { data: authData, error } = await supabase.auth.signUp(data)

    if (error) {
        redirect(`/login?error=${encodeURIComponent(error.message)}`)
    }

    // If email confirmation is required, session will be null — prompt the user to check their inbox
    if (!authData.session) {
        redirect(`/login?message=${encodeURIComponent('Account created! Check your email to confirm before signing in.')}`)
    }

    revalidatePath('/', 'layout')
    const nextUrl = formData.get('next_url') as string || '/dashboard'
    redirect(nextUrl)
}

export async function signout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
}

// ─── Password reset flow ──────────────────────────────────────────────────
// Three server actions for the in-app reset flow that replaces the previous
// "click the link, end up nowhere useful" UX:
//
//   1. requestPasswordReset — emails the user a code (and a fallback link)
//   2. verifyResetOtp       — exchanges the code for a recovery session
//   3. updatePassword       — uses that session to set a new password
//
// The fallback link in the email points at /auth/confirm?next=/login?step=set-password,
// which lands magic-link clickers in the same set-password UI as OTP-typers.

// Internal-only result shape. Must NOT be exported — Next.js 15 / Turbopack
// disallows non-async-function exports from 'use server' files and throws
// "An unexpected response was received from the server" at render time when
// it sees a `type` export here. If a client component needs the shape, mirror
// it inline at the call site.
type ResetResult = { ok: true } | { error: string }

export async function requestPasswordReset(email: string): Promise<ResetResult> {
    const trimmed = (email || '').trim()
    if (!trimmed) return { error: 'Please enter your email address.' }

    const supabase = await createClient()
    const baseUrl  = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3004'
    const next     = encodeURIComponent('/login?step=set-password')

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${baseUrl}/auth/confirm?next=${next}`,
    })

    // Don't disclose whether the email exists. Log non-rate-limit errors
    // for ourselves, return success either way so the UI can advance to the
    // OTP entry phase. (If the email isn't registered, no email is sent —
    // user just sees "no code arrived" and can correct the address.)
    if (error && !/rate/i.test(error.message)) {
        console.error('resetPasswordForEmail error:', error)
    }
    return { ok: true }
}

export async function verifyResetOtp(email: string, token: string): Promise<ResetResult> {
    const trimmed = (email || '').trim()
    // Supabase OTP length is 6–10 digits depending on Auth → Settings.
    if (!trimmed || !/^\d{6,10}$/.test(token ?? '')) {
        return { error: 'Enter the verification code from your email.' }
    }
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
        email: trimmed,
        token,
        type: 'recovery',
    })
    if (error) return { error: error.message }

    // Do NOT call revalidatePath here. verifyOtp already wrote the recovery
    // session cookie via the SSR client — the next server action
    // (updatePassword) reads it directly. Revalidating the root layout
    // races the auth-page redirect in middleware.ts: the recovery user is
    // technically "authed", /login is treated as an auth page, and the
    // revalidation response gets rewritten to a /dashboard redirect — which
    // the client component (still mid-flow) reads as a mismatched payload
    // and Next.js surfaces as "An unexpected response was received from
    // the server".
    return { ok: true }
}

export async function updatePassword(newPassword: string): Promise<ResetResult> {
    if (!isPasswordStrong(newPassword ?? '')) {
        return { error: PASSWORD_RULES_TEXT }
    }
    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
        // Most common failure: recovery session expired. Surface a useful
        // message so the user knows to restart the flow.
        if (/session|jwt|auth/i.test(error.message)) {
            return { error: 'Your reset session expired. Start over and request a new code.' }
        }
        return { error: error.message }
    }
    // Same reasoning as verifyResetOtp: the client follows up with
    // router.replace('/dashboard'), which SSRs /dashboard fresh with the
    // updated cookies. Revalidating /login's layout here would race
    // middleware's auth-page redirect and surface the same client error.
    return { ok: true }
}