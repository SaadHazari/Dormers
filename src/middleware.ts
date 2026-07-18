import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
    // Browsers fetch web-app manifests WITHOUT cookies, so the auth gate
    // would redirect this to /login and serve HTML as the manifest —
    // silently breaking home-screen installs. Skip the session check.
    if (request.nextUrl.pathname === '/dashboard/manifest.webmanifest') {
        return NextResponse.next()
    }
    return await updateSession(request)
}

export const config = {
    // Only run middleware on routes that need session gating. Every match
    // performs an auth.getUser() round-trip to Supabase, so we keep this
    // narrow on purpose.
    //   /dashboard/:path*  → redirect to /login if not authed
    //   /admin/:path*      → session needed so requireAdmin() can read x-user-email
    //   /api/admin/:path*  → same: admin API routes read x-user-email and 401
    //                        on their own (they still re-check the allowlist)
    //   /login             → redirect authed users to /dashboard (or ?next)
    //   /onboarding        → same redirect-when-authed treatment
    // Public pages, other API routes (which do their own auth), the Supabase
    // auth callback, and static assets are intentionally excluded.
    matcher: [
        '/dashboard/:path*',
        '/admin/:path*',
        '/api/admin/:path*',
        '/login',
        '/onboarding',
    ],
}