import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    // Only run middleware on routes that need session gating. Every match
    // performs an auth.getUser() round-trip to Supabase, so we keep this
    // narrow on purpose.
    //   /dashboard/:path*  → redirect to /login if not authed
    //   /login             → redirect authed users to /dashboard (or ?next)
    //   /onboarding        → same redirect-when-authed treatment
    // Public pages, API routes (which do their own auth), the Supabase auth
    // callback, and static assets are intentionally excluded.
    matcher: [
        '/dashboard/:path*',
        '/login',
        '/onboarding',
    ],
}