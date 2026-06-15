import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export const updateSession = async (request: NextRequest) => {
    // Clone headers so we can safely mutate. Strip any client-supplied
    // x-user-* values up front — only middleware is allowed to set them.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('x-user-id');
    requestHeaders.delete('x-user-email');

    // Buffer cookies that Supabase wants to set, then apply once at the end.
    const cookiesToSetOnResponse: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                        cookiesToSetOnResponse.push({ name, value, options: (options ?? {}) as Record<string, unknown> })
                    })
                },
            },
        },
    );

    let user: { id: string; email: string } | null = null;
    try {
        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
        user = !claimsError && claimsData?.claims
            ? { id: claimsData.claims.sub, email: (claimsData.claims.email as string | undefined) ?? '' }
            : null;

        // getClaims() reads the JWT locally without refreshing. When the
        // access token is stale the email claim can be absent — the user is
        // authed (has a sub) but requireAdmin() sees an empty email and
        // bounces to /dashboard. For admin routes, fall back to getUser()
        // which validates + refreshes the session and always returns email.
        if (user && !user.email && request.nextUrl.pathname.startsWith('/admin')) {
            const { data: { user: freshUser } } = await supabase.auth.getUser();
            if (freshUser?.email) {
                user.email = freshUser.email;
            }
        }
    } catch (err) {
        console.error('middleware getClaims threw:', err);
    }

    const isPreview = process.env.NODE_ENV === 'development' && request.nextUrl.searchParams.get('preview') === '1'
    const isProtectedRoute =
        request.nextUrl.pathname.startsWith('/dashboard') ||
        request.nextUrl.pathname.startsWith('/admin');

    const applyBufferedCookies = (res: NextResponse) => {
        cookiesToSetOnResponse.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
        )
        return res
    }

    if (isProtectedRoute && !user && !isPreview) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('next', request.nextUrl.pathname);
        return applyBufferedCookies(NextResponse.redirect(url));
    }

    // Redirect already-authenticated users away from auth/onboarding pages.
    // Exception: /login?step=set-password is the magic-link landing for the
    // password-reset flow. Users who get there have a recovery session
    // (authed from middleware's POV) but still need to finish setting their
    // new password — punting them to /dashboard breaks the flow AND, when
    // triggered as a response to a server-action revalidation, surfaces as
    // "An unexpected response was received from the server" on the client.
    const isResetLanding =
        request.nextUrl.pathname.startsWith('/login') &&
        request.nextUrl.searchParams.get('step') === 'set-password';
    const isAuthPage =
        (request.nextUrl.pathname.startsWith('/login') && !isResetLanding) ||
        request.nextUrl.pathname === '/onboarding';

    if (user && isAuthPage) {
        const url = request.nextUrl.clone();
        const nextParam = request.nextUrl.searchParams.get('next');
        url.pathname = nextParam && /^\/[^/\\]/.test(nextParam) ? nextParam : '/dashboard';
        url.search = '';
        return applyBufferedCookies(NextResponse.redirect(url));
    }

    // Forward the validated user to server components so they can skip a
    // second auth.getUser() round-trip. Headers are scoped to this request only.
    if (user) {
        requestHeaders.set('x-user-id', user.id);
        if (user.email) requestHeaders.set('x-user-email', user.email);
    }

    return applyBufferedCookies(
        NextResponse.next({ request: { headers: requestHeaders } })
    )
};