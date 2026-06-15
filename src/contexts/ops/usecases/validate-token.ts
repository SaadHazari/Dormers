import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import type { OpsToken, OpsRole } from '@/contexts/ops/domain/ops-token'
import { isTokenValid } from '@/contexts/ops/domain/ops-token'

export async function validateOpsToken(
  tokenString: string,
  requiredRole?: OpsRole,
): Promise<OpsToken | null> {
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('ops_tokens')
    .select('id, token, role, label, is_active, created_at, revoked_at')
    .eq('token', tokenString)
    .single()

  if (error || !data) return null

  const opsToken = data as OpsToken

  if (!isTokenValid(opsToken)) return null
  if (requiredRole && opsToken.role !== requiredRole) return null

  return opsToken
}
