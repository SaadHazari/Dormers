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

export interface AllowlistEntry {
  id: string
  phone_digits: string
  label: string | null
  is_active: boolean
  created_at: string
}

export default async function OpsTokensPage() {
  await requireAdmin()
  const sb = createAdminSupabaseClient()
  const [{ data: tokenData }, { data: allowData }] = await Promise.all([
    sb.from('ops_tokens')
      .select('id, token, role, label, is_active, revoked_at, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    sb.from('whatsapp_rider_allowlist')
      .select('id, phone_digits, label, is_active, created_at')
      .order('created_at', { ascending: false }),
  ])
  return (
    <OpsTokensClient
      tokens={(tokenData ?? []) as OpsToken[]}
      allowlist={(allowData ?? []) as AllowlistEntry[]}
    />
  )
}
