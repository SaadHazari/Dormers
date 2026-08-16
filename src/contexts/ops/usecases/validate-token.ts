import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpsToken, OpsRole } from '@/contexts/ops/domain/ops-token'
import { isTokenValid } from '@/contexts/ops/domain/ops-token'

const TOKEN_COLUMNS = 'id, token, role, label, is_active, created_at, revoked_at, last_used_at'

/**
 * How stale `last_used_at` must be before we bother rewriting it.
 *
 * A kitchen tablet sits on the counter reloading its display all day; without
 * a throttle every one of those renders would be a write. Ten minutes is fine
 * for the only question this column answers on /admin/ops-tokens — "is anyone
 * actually using this link, or is it a leftover?".
 */
const TOUCH_THROTTLE_MS = 10 * 60 * 1000

/**
 * Stamp last_used_at, skipping the write if it was stamped recently.
 *
 * Awaited rather than fired-and-forgotten: a floating promise can be killed
 * when the Lambda freezes, and at one write per ten minutes the latency is
 * not worth the lost signal. Failures are swallowed — this is telemetry, it
 * must never block a rider from opening their page.
 */
async function touchLastUsed(
  supabase: SupabaseClient,
  token: OpsToken,
): Promise<void> {
  const last = token.last_used_at ? Date.parse(token.last_used_at) : 0
  if (Number.isFinite(last) && Date.now() - last < TOUCH_THROTTLE_MS) return

  try {
    await supabase
      .from('ops_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', token.id)
  } catch {
    // Advisory only — never fail a page load over it.
  }
}

export async function validateOpsToken(
  tokenString: string,
  requiredRole?: OpsRole,
): Promise<OpsToken | null> {
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('ops_tokens')
    .select(TOKEN_COLUMNS)
    .eq('token', tokenString)
    .single()

  if (error || !data) return null

  const opsToken = data as OpsToken

  if (!isTokenValid(opsToken)) return null
  if (requiredRole && opsToken.role !== requiredRole) return null

  await touchLastUsed(supabase, opsToken)

  return opsToken
}

/**
 * Validate an ops token by its primary-key id (UUID).
 *
 * Rider/kitchen clients receive `opsToken.id` from the RSC — not the secret
 * token string — so server actions and data-write endpoints authenticate by
 * id. Same active/role checks as {@link validateOpsToken}.
 */
export async function validateOpsTokenById(
  id: string,
  requiredRole?: OpsRole,
): Promise<OpsToken | null> {
  if (!id) return null

  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('ops_tokens')
    .select(TOKEN_COLUMNS)
    .eq('id', id)
    .single()

  if (error || !data) return null

  const opsToken = data as OpsToken

  if (!isTokenValid(opsToken)) return null
  if (requiredRole && opsToken.role !== requiredRole) return null

  return opsToken
}
