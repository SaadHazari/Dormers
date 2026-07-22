import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { PantryClient } from './PantryClient'

export const metadata = { title: 'Pantry — Dormers Admin' }
export const dynamic = 'force-dynamic'

export interface PantryRow {
  id: string
  name: string
  category: string
  brand: string
  supplier: string
  pack_qty: number | null
  pack_unit: string
  pack_cost: number | null
  pack_label: string
  is_active: boolean
  created_at: string
}

export default async function PantryPage() {
  await requireAdmin()
  const sb = createAdminSupabaseClient()
  const { data } = await sb
    .from('pantry_ingredients')
    .select('*')
    .order('category')
    .order('name')
  return <PantryClient items={(data ?? []) as PantryRow[]} />
}
