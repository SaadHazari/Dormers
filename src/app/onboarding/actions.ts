'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export interface OnboardingPayload {
    preference: string
    vegDays: string[]
    allergens: string[]
    spiceLevel: string
    dorm: string
    university: string
    name: string
    phone: string
    email: string
    password: string
}

export type CreateAccountResult =
    | { requiresConfirmation: true; email: string }
    | { error: string }

// Bounces a duplicate-signup attempt to /login with the email prefilled and
// a message explaining what happened. Throws (via redirect()) — never returns.
function redirectToLoginExisting(email: string): never {
    const params = new URLSearchParams({
        email,
        message: 'You already have an account — sign in below.',
    })
    redirect(`/login?${params.toString()}`)
}

function validateOnboardingPayload(p: OnboardingPayload): string | null {
    if (!p.email || !/^\S+@\S+\.\S+$/.test(p.email)) return 'Invalid email address.'
    if (!p.password || p.password.length < 8) return 'Password must be at least 8 characters.'
    if (!p.name?.trim()) return 'Name is required.'
    if (!p.phone?.trim()) return 'Phone number is required.'
    if (!p.dorm?.trim()) return 'Please select your dorm.'
    if (!p.preference?.trim()) return 'Please select a meal preference.'
    return null
}

// Confirm there's a fresh verified OTP for this phone — within the last 30 min,
// matching the phone the form is submitting. The client-side `phoneVerified`
// flag is UX hint only; this check is the actual gate.
async function isPhoneVerified(phone: string): Promise<boolean> {
    const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data } = await supabaseAdmin
        .from('whatsapp_otps')
        .select('id')
        .eq('phone', phone)
        .gte('verified_at', cutoff)
        .limit(1)
        .maybeSingle()
    return !!data
}

export async function createAccount(
    payload: OnboardingPayload
): Promise<CreateAccountResult> {
    const validationError = validateOnboardingPayload(payload)
    if (validationError) return { error: validationError }

    // Reject signup if the WhatsApp number wasn't verified through our OTP
    // flow. Stops scammers from putting in a fake number that bypasses the
    // delivery channel.
    if (!(await isPhoneVerified(payload.phone))) {
        return { error: 'WhatsApp number not verified. Please complete verification first.' }
    }

    const supabase = await createClient()

    // Instantiated here (not at module level) so env vars are guaranteed to be available
    const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: authData, error } = await supabase.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: {
            data: {
                name: payload.name,
                phone: payload.phone,
                dorm_name: payload.dorm,
                university: payload.university,
                meal_preference: payload.preference,
                veg_days: payload.vegDays.join(', '),
                allergens: payload.allergens.join(', '),
                spice_level: payload.spiceLevel,
            },
            emailRedirectTo: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3004'}/auth/confirm?next=/dashboard`,
        },
    })

    if (error) {
        // If the account already exists, route to /login with email prefilled
        // instead of trapping the user here. Prefer the typed `code` field
        // over message-substring matching (which breaks if Supabase ever
        // changes its wording). Keep a message fallback for older deployments
        // that still emit unstructured errors.
        const isAlreadyExists =
            error.code === 'user_already_exists' ||
            error.code === 'email_exists' ||
            /\b(already|registered|exists)\b/i.test(error.message)
        if (isAlreadyExists) {
            redirectToLoginExisting(payload.email)
        }
        return { error: error.message }
    }

    // Anti-enumeration handling. When the email already belongs to a confirmed
    // user, Supabase deliberately does NOT throw an error — it returns a
    // success response with an empty `identities` array and never sends a
    // confirmation email. Without this check the UI advances to the OTP
    // screen and waits forever for a code that will never arrive. Treat it
    // exactly like the explicit "already exists" case: bounce to /login with
    // the email prefilled and a helpful message.
    const obfuscatedExistingUser = !!(
        authData.user
        && Array.isArray(authData.user.identities)
        && authData.user.identities.length === 0
    )
    if (obfuscatedExistingUser) {
        redirectToLoginExisting(payload.email)
    }

    const userId = authData.user?.id
    if (!userId) return { error: 'Account creation failed. Please try again.' }

    // Upsert the customer profile (trigger may or may not have run yet)
    await supabaseAdmin.from('customers').upsert({
        id: userId,
        email: payload.email,
        name: payload.name,
        whatsapp_number: payload.phone,
        whatsapp_verified: true,
        whatsapp_verified_at: new Date().toISOString(),
        dorm_name: payload.dorm,
        meal_preference_type: payload.preference,
        allergens: payload.allergens.length ? payload.allergens.join(', ') : 'None',
        spice_level_preference: payload.spiceLevel,
    })

    // Email confirmation disabled — session is live, go straight to dashboard
    if (authData.session) {
        revalidatePath('/', 'layout')
        redirect('/dashboard')
    }

    return { requiresConfirmation: true, email: payload.email }
}

// ─── Email OTP verification ───────────────────────────────────────────────
// Pair of actions for the in-app email OTP flow. Replaces the old "click the
// link in your inbox" UX. Supabase already includes a 6-digit token in every
// confirmation email — we just verify it server-side instead of relying on
// the user to click a link that might land in spam or open in the wrong
// browser.
//
// The Supabase email template must expose `{{ .Token }}` for this to work —
// see the README/onboarding docs for the template snippet.

export type VerifyEmailOtpResult = { ok: true } | { error: string }

export async function verifyEmailOtp(email: string, token: string): Promise<VerifyEmailOtpResult> {
    // Supabase email OTP length is configurable in Auth settings (6–10 digits).
    // Accept any value in that range so this validator stays correct if the
    // dashboard setting changes — actual length-checking happens client-side
    // and on Supabase's verifyOtp call.
    if (!email?.trim() || !/^\d{6,10}$/.test(token ?? '')) {
        return { error: 'Enter the verification code from your email.' }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'email',
    })

    if (error) {
        // Common cases: expired (24h default), wrong code, too many attempts.
        // Surface Supabase's message — it's already user-friendly.
        return { error: error.message }
    }

    // verifyOtp() set the session cookie via the SSR client. Revalidate so
    // dashboard layouts re-render with the authed user; the client will then
    // redirect after this resolves.
    revalidatePath('/', 'layout')
    return { ok: true }
}

export type ResendEmailOtpResult = { ok: true } | { error: string }

export async function resendEmailOtp(email: string): Promise<ResendEmailOtpResult> {
    if (!email?.trim()) return { error: 'Email is required.' }
    const supabase = await createClient()
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    if (error) return { error: error.message }
    return { ok: true }
}
