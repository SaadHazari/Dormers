import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { OpsTokensClient } from './OpsTokensClient'

export const metadata = { title: 'Ops Tokens — Dormers Admin' }
export const dynamic = 'force-dynamic'

export interface OpsToken {
  id: string
  token: string
  role: 'kitchen' | 'rider'
  label: string
  is_active: boolean
  revoked_at: string | null
  created_at: string
}

export default async function OpsTokensPage() {
  await requireAdmin()
  const sb = createAdminSupabaseClient()
  const { data } = await sb
    .from('ops_tokens')
    .select('id, token, role, label, is_active, revoked_at, created_at')
    .order('created_at', { ascending: false })
  return <OpsTokensClient tokens={(data ?? []) as OpsToken[]} />
}
