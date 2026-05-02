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

type OtpType = 'email' | 'signup' | 'recovery' | 'email_change'

function isValidOtpType(value: string | null): value is OtpType {
    return value === 'email' || value === 'signup' || value === 'recovery' || value === 'email_change'
}

// Same-origin path only — `new URL(next, origin)` treats absolute or
// protocol-relative values as a new origin, which would be an open redirect.
function safeNext(raw: string): string {
    return /^\/[^/\\]/.test(raw) ? raw : '/dashboard'
}

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const next = safeNext(searchParams.get('next') ?? '/dashboard')

    if (token_hash && isValidOtpType(type)) {
        const supabase = await createClient()
        const { error } = await supabase.auth.verifyOtp({ type, token_hash })

        if (!error) {
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
