import 'server-only'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import type { RateLimitStore } from './rate-limiter'

/**
 * Durable, cross-instance rate-limit store backed by the `rate_limit_hit()`
 * Postgres RPC (atomic fixed-window increment). The in-memory store only counts
 * per warm serverless instance — useless for real observation or enforcement
 * across many instances. This is the store that makes both work.
 *
 * On any DB error this THROWS; the RateLimiter wrapper catches it and FAILS
 * OPEN, so a store/DB outage can never block a customer (Prime Directive).
 */
export class SupabaseRateLimitStore implements RateLimitStore {
  async hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const sb = createAdminSupabaseClient()
    const windowSeconds = Math.max(1, Math.round(windowMs / 1000))
    const { data, error } = await sb.rpc('rate_limit_hit', {
      p_key: key,
      p_window_seconds: windowSeconds,
    })
    if (error) throw new Error(`rate_limit_hit failed: ${error.message}`)
    const row = (Array.isArray(data) ? data[0] : data) as
      | { hit_count: number; reset_at: string }
      | undefined
    if (!row) throw new Error('rate_limit_hit returned no row')
    return { count: row.hit_count, resetAt: new Date(row.reset_at).getTime() }
  }
}
