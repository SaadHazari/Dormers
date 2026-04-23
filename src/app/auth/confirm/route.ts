import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * Handles the email confirmation link that Supabase sends after signUp().
 * The link format is:  /auth/confirm?token_hash=xxx&type=email&next=/dashboard
 *
 * In Supabase Dashboard → Authentication → URL Configuration, set:
 *   Site URL:            http://localhost:3004
 *   Redirect URLs:       http://localhost:3004/auth/confirm
 */
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as 'email' | 'signup' | null
    const next = searchParams.get('next') ?? '/dashboard'

    if (token_hash && type) {
        const supabase = await createClient()
        const { error } = await supabase.auth.verifyOtp({ type, token_hash })

        if (!error) {
            // Session is now active — redirect straight to the app
            return NextResponse.redirect(new URL(next, origin))
        }
    }

    return NextResponse.redirect(
        new URL(
            '/login?error=' + encodeURIComponent('Email confirmation failed. The link may have expired — please try signing in or creating your account again.'),
            origin
        )
    )
}
