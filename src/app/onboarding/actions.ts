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

function validateOnboardingPayload(p: OnboardingPayload): string | null {
    if (!p.email || !/^\S+@\S+\.\S+$/.test(p.email)) return 'Invalid email address.'
    if (!p.password || p.password.length < 8) return 'Password must be at least 8 characters.'
    if (!p.name?.trim()) return 'Name is required.'
    if (!p.phone?.trim()) return 'Phone number is required.'
    if (!p.dorm?.trim()) return 'Please select your dorm.'
    if (!p.preference?.trim()) return 'Please select a meal preference.'
    return null
}

export async function createAccount(
    payload: OnboardingPayload
): Promise<CreateAccountResult> {
    const validationError = validateOnboardingPayload(payload)
    if (validationError) return { error: validationError }

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
            const params = new URLSearchParams({
                email: payload.email,
                message: 'You already have an account — sign in below.',
            })
            redirect(`/login?${params.toString()}`)
        }
        return { error: error.message }
    }

    const userId = authData.user?.id
    if (!userId) return { error: 'Account creation failed. Please try again.' }

    // Upsert the customer profile (trigger may or may not have run yet)
    await supabaseAdmin.from('customers').upsert({
        id: userId,
        email: payload.email,
        name: payload.name,
        whatsapp_number: payload.phone,
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
