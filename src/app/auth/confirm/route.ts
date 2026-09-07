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
    const code = searchParams.get('code')
    const type = searchParams.get('type')
    const next = safeNext(searchParams.get('next') ?? '/dashboard')

    // PKCE leg. signUp runs through the @supabase/ssr server client, so the
    // emailed ConfirmationURL carries a `pkce_` token; GoTrue's /verify
    // consumes it and 303s back HERE with `?code=` — never with token_hash.
    // Before this branch existed, every click of the email's "verify in one
    // tap" button ended at the /login error below even though the account
    // was already confirmed (Supabase auth logs, Sept 1–6: all four affected
    // signups). The exchange needs the PKCE verifier cookie, so it succeeds
    // in the browser that started signup and fails for mailbox scanners and
    // cross-device clicks — those still fall through to the error redirect.
    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            return NextResponse.redirect(new URL(next, origin))
        }
    }

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
