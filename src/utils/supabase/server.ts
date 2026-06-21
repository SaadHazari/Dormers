import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchWithTimeout } from "@/infra/http/fetch-with-timeout";

// Release It! L1 (Phase 1): the user-scoped client sits behind every
// authenticated dashboard + funnel read, and previously had NO per-call
// timeout — a slow Supabase (Ohio) region could hang an RSC render or server
// action until the Netlify wall-clock, browning out the page. Wrap fetch with
// the same 15s ceiling the service-role admin client already enforces. On a
// slow DB the call now fails fast: PostgREST surfaces an aborted fetch as a
// normal query `error` (handled by existing `if (error)` paths) and any harder
// throw is caught by the route's error.tsx boundary — a friendly retry instead
// of a hung page. Happy-path behavior is unchanged.
const SUPABASE_TIMEOUT_MS = 15_000;

export const createClient = async () => {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
            global: {
                fetch: (url, init) =>
                    fetchWithTimeout(url as string, init as RequestInit, { timeoutMs: SUPABASE_TIMEOUT_MS }),
            },
        },
    );
};