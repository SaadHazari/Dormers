import 'server-only'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

/**
 * Instant feature kill-switches (Release It! L7 / Phase 8).
 *
 * Reads `public.feature_flags.enabled` at runtime with a short in-memory cache,
 * so an operator can pause a runaway/abused feature by flipping a row to
 * `false` — no redeploy needed (propagates within CACHE_TTL_MS).
 *
 * FAIL OPEN: if the flag read errors, or the row is missing, the feature stays
 * ENABLED. A flags-table outage must never take a live feature down — the
 * kill-switch is for deliberate pausing, not a hard dependency.
 */

const CACHE_TTL_MS = 30_000
const cache = new Map<string, { enabled: boolean; at: number }>()

export type FeatureFlagKey = 'chat' | 'staff_program' | 'referral_claims' | 'mobile_dashboard_prices'

export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.enabled

  try {
    const sb = createAdminSupabaseClient()
    const { data, error } = await sb
      .from('feature_flags')
      .select('enabled')
      .eq('key', key)
      .maybeSingle()
    if (error) throw error
    // Missing row → treat as enabled (fail open); only an explicit false pauses.
    const enabled = data ? (data as { enabled: boolean }).enabled !== false : true
    cache.set(key, { enabled, at: Date.now() })
    return enabled
  } catch {
    return true // fail open — never let a flag-read failure disable a feature
  }
}

/** Drop one flag from this instance's cache — admin writes call this so the
 *  operator's own next read is never stale. Other instances converge within
 *  CACHE_TTL_MS. */
export function invalidateFeatureFlag(key: FeatureFlagKey): void {
  cache.delete(key)
}

/** Test seam — clear the in-memory cache between tests. */
export function __resetFeatureFlagCache(): void {
  cache.clear()
}
