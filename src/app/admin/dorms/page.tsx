import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { DormsClient } from './DormsClient'

export const metadata = { title: 'Dorm Locations — Dormers Admin' }
export const dynamic = 'force-dynamic'

export interface DormRow {
  id: string
  canonical_name: string
  display_name: string
  cid_code: string
  shape: string
  sort_order: number
  aliases: string[]
  is_delivery_target: boolean
  is_active: boolean
  created_at: string
}

export default async function DormsPage() {
  await requireAdmin()
  const sb = createAdminSupabaseClient()
  const { data } = await sb
    .from('dorm_locations')
    .select('*')
    .order('sort_order')
  return <DormsClient dorms={(data ?? []) as DormRow[]} />
}
