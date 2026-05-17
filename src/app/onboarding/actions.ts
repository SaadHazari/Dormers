'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isAlphaName, isPasswordStrong, PASSWORD_RULES_TEXT } from '@/lib/validation'
import { generateCid } from '@/lib/customer-cid'
import { DORMS } from './data'

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
    /** '5DAYS' (Mon–Fri) or '6DAYS' (Mon–Sat). Optional in payload; defaults to 6DAYS. */
    weekType?: '5DAYS' | '6DAYS'
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

// generateCid + DORM_CODES extracted to @/lib/customer-cid so the referral
// trial-claim flow can reuse the same formula. Same cid format whether the
// customer arrives via main onboarding or a referral claim.

function validateOnboardingPayload(p: OnboardingPayload): string | null {
    if (!p.email || !/^\S+@\S+\.\S+$/.test(p.email)) return 'Invalid email address.'
    if (!isPasswordStrong(p.password ?? '')) return PASSWORD_RULES_TEXT
    if (!p.name?.trim()) return 'Name is required.'
    if (!isAlphaName(p.name)) return 'Name can only contain letters and spaces.'
    if (!p.phone?.trim()) return 'Phone number is required.'
    if (!p.dorm?.trim()) return 'Please select your dorm.'
    if (!p.university?.trim()) return 'Please select your university.'
    if (!p.preference?.trim()) return 'Please select a meal preference.'
    if (!p.spiceLevel?.trim()) return 'Please pick a spice level.'
    // Allergens may be empty (defaults to "None" downstream), but if the array
    // is empty the user never clicked anything — block that.
    if (!Array.isArray(p.allergens) || p.allergens.length === 0) {
        return 'Please confirm your allergies (or select "None").'
    }
    // Religious preference requires at least one veg day picked.
    if (p.preference?.toLowerCase().includes('religious') && (!p.vegDays || p.vegDays.length === 0)) {
        return 'Pick at least one veg day for the religious mix.'
    }
    if (p.weekType && p.weekType !== '5DAYS' && p.weekType !== '6DAYS') {
        return 'Invalid delivery week.'
    }
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

    // A dorm not in the canonical DORMS list (i.e. submitted via the "Other"
    // text input at onboarding) sits outside our delivery radius until
    // customer-service confirms coverage. Flagging here gates checkout and
    // surfaces the WhatsApp-contact banner on the dashboard.
    const dormListed = DORMS.includes(payload.dorm) && payload.dorm !== 'Other'

    // Religious-mix users pick their veg days during onboarding (Step 1.5).
    // Persist to customer.veg_days so the choice survives across the user's
    // very first checkout — pre-filling both the vegDayCount picker and the
    // specific-day picker on /dashboard/plan with what they already told us
    // here. Non-religious users get null so a future preference flip doesn't
    // carry stale day picks forward.
    const isReligiousOnboarding = /religious/i.test(payload.preference)
    const cleanVegDays = isReligiousOnboarding && Array.isArray(payload.vegDays)
        ? payload.vegDays.filter(d =>
            ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].includes(d),
          )
        : []

    // Upsert the customer profile (trigger may or may not have run yet)
    await supabaseAdmin.from('customers').upsert({
        id: userId,
        cid: generateCid(payload.dorm),
        email: payload.email,
        name: payload.name,
        whatsapp_number: payload.phone,
        whatsapp_verified: true,
        whatsapp_verified_at: new Date().toISOString(),
        dorm_name: payload.dorm,
        meal_preference_type: payload.preference,
        allergens: payload.allergens.length ? payload.allergens.join(', ') : 'None',
        spice_level_preference: payload.spiceLevel,
        // Phase 1 column — defaults to 6DAYS until the onboarding step is built.
        week_type: payload.weekType ?? '6DAYS',
        veg_days: cleanVegDays.length > 0 ? cleanVegDays : null,
        out_of_zone: !dormListed,
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
    // Email OTP is exactly 6 digits — configured in Supabase Dashboard →
    // Auth → Email OTP length. If you change the dashboard setting, also
    // bump EmailStep.tsx OTP_LENGTH and this regex AND the matching regex
    // in src/app/r/[cid]/actions.ts verifyTrialEmailOtp.
    if (!email?.trim() || !/^\d{6}$/.test(token ?? '')) {
        return { error: 'Enter the 6-digit code from your email.' }
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
