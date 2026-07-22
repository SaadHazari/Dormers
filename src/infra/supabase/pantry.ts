// src/infra/supabase/pantry.ts
// Pantry master list reader for the AI recipe generator. The pantry rarely
// changes (owner restock decisions), so a short in-process cache keeps the
// generate call from paying an extra round-trip.

import { createAdminSupabaseClient } from './admin-client'
import type { PantryEntry } from '@/contexts/ops/domain/recipe-generate'

interface PantryRow {
  name: string
  category: string
  pack_qty: number | null
  pack_unit: string
  pack_cost: number | null
}

let _cache: { data: PantryEntry[]; ts: number } | null = null
const TTL = 5 * 60 * 1000

/**
 * Drop the in-process pantry cache so the next generator read is fresh.
 * Called from the admin pantry actions after any add/edit/toggle/delete.
 * Best-effort: only clears the cache on the instance that ran the mutation;
 * other warm Lambdas still expire naturally within TTL (pantry rarely changes).
 */
export function invalidatePantryCache(): void {
  _cache = null
}

/** Cost per kitchen-relevant base unit: "AED 2/kg", "AED 6.2/L", "AED 0.32/pc". */
function costHint(row: PantryRow): string | null {
  if (!row.pack_cost || !row.pack_qty || row.pack_qty <= 0) return null
  const per = row.pack_cost / row.pack_qty
  if (row.pack_unit === 'g') return `AED ${(per * 1000).toFixed(per * 1000 < 1 ? 2 : 1)}/kg`
  if (row.pack_unit === 'ml') return `AED ${(per * 1000).toFixed(per * 1000 < 1 ? 2 : 1)}/L`
  if (row.pack_unit === 'pcs') return `AED ${per.toFixed(2)}/pc`
  return null
}

/** Active food ingredients (equipment excluded) formatted for the generator prompt. */
export async function getPantryForGenerator(): Promise<PantryEntry[]> {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.data
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb
    .from('pantry_ingredients')
    .select('name, category, pack_qty, pack_unit, pack_cost')
    .eq('is_active', true)
    .neq('category', 'Equipment')
    .order('name')
  if (error || !data || data.length === 0) {
    if (error) console.error('[pantry] read failed:', error.message)
    return _cache?.data ?? []
  }
  const entries = (data as PantryRow[]).map(r => ({
    name: r.name,
    category: r.category,
    costHint: costHint(r),
  }))
  _cache = { data: entries, ts: Date.now() }
  return entries
}
