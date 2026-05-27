/**
 * Service-role Supabase admin client — used for reads/writes that need to
 * bypass RLS (cross-dorm reads, notification queue inserts, RLS-readback
 * workarounds for the dorm-wars hub).
 *
 * Centralized in Phase 11 of the layered refactor — previously this helper
 * was duplicated across queries.ts, notifications/usecases/queue.ts, and
 * dorm-wars/domain/repo.ts. Single source of truth now lives here; the
 * three repos in infra/supabase/ + notifications/queue all use it.
 *
 * Security note: callers must never accept arbitrary user IDs. The
 * userId/customerId passed in must come from a verified server context
 * (middleware-set headers, RSC server actions, etc.). This client bypasses
 * RLS — the calling code is responsible for authorization.
 */

import { createClient } from '@supabase/supabase-js'

export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
