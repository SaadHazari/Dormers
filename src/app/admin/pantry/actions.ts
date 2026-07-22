'use server'

import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { invalidatePantryCache } from '@/infra/supabase/pantry'

export interface PantryInput {
  name: string
  category: string
  brand: string
  supplier: string
  pack_qty: number | null
  pack_unit: string
  pack_cost: number | null
  pack_label: string
}

type Result = { ok: boolean; message: string }

// pack_unit drives the generator's cost-per-base-unit hint (g→/kg, ml→/L,
// pcs→/pc). An unknown unit isn't fatal — costHint just returns null — but we
// keep the input constrained so the admin doesn't silently lose the price hint.
const VALID_UNITS = ['', 'g', 'ml', 'pcs']

function clean(data: PantryInput) {
  return {
    name: data.name.trim(),
    category: data.category.trim(),
    brand: data.brand.trim(),
    supplier: data.supplier.trim(),
    pack_qty: data.pack_qty,
    pack_unit: data.pack_unit.trim(),
    pack_cost: data.pack_cost,
    pack_label: data.pack_label.trim(),
  }
}

function validate(row: ReturnType<typeof clean>): string | null {
  if (!row.name) return 'Name is required'
  if (!VALID_UNITS.includes(row.pack_unit)) return 'Pack unit must be g, ml, or pcs'
  if (row.pack_qty !== null && (!Number.isFinite(row.pack_qty) || row.pack_qty < 0))
    return 'Pack quantity must be a positive number'
  if (row.pack_cost !== null && (!Number.isFinite(row.pack_cost) || row.pack_cost < 0))
    return 'Pack cost must be a positive number'
  return null
}

export async function addPantryIngredient(data: PantryInput): Promise<Result> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()

  const row = clean(data)
  const invalid = validate(row)
  if (invalid) return { ok: false, message: invalid }

  const { error } = await sb.from('pantry_ingredients').insert({
    ...row,
    is_active: true,
  })

  // name has a UNIQUE constraint — surface the collision in plain language.
  if (error?.code === '23505') return { ok: false, message: `"${row.name}" is already in the pantry` }
  if (error) return { ok: false, message: error.message }

  invalidatePantryCache()
  await logAdminAction(admin.email, 'pantry_ingredient_added', 'pantry_ingredients', row.name, row)
  return { ok: true, message: 'Ingredient added' }
}

export async function updatePantryIngredient(id: string, data: PantryInput): Promise<Result> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()

  const row = clean(data)
  const invalid = validate(row)
  if (invalid) return { ok: false, message: invalid }

  const { data: updated, error } = await sb
    .from('pantry_ingredients')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')

  if (error?.code === '23505') return { ok: false, message: `"${row.name}" is already in the pantry` }
  if (error) return { ok: false, message: error.message }
  if (!updated || updated.length === 0)
    return { ok: false, message: 'Ingredient not found — it may have been deleted. Refresh and try again.' }

  invalidatePantryCache()
  await logAdminAction(admin.email, 'pantry_ingredient_updated', 'pantry_ingredients', id, row)
  return { ok: true, message: 'Ingredient updated' }
}

export async function togglePantryActive(id: string, isActive: boolean): Promise<Result> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()

  const { data: toggled, error } = await sb
    .from('pantry_ingredients')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, message: error.message }
  if (!toggled || toggled.length === 0)
    return { ok: false, message: 'Ingredient not found — it may have been deleted. Refresh and try again.' }

  invalidatePantryCache()
  await logAdminAction(
    admin.email,
    isActive ? 'pantry_ingredient_enabled' : 'pantry_ingredient_disabled',
    'pantry_ingredients',
    id,
  )
  return { ok: true, message: isActive ? 'Back in stock' : 'Marked out of stock' }
}

export async function deletePantryIngredient(id: string): Promise<Result> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()

  // Capture the name for the audit trail before it's gone.
  const { data: existing } = await sb
    .from('pantry_ingredients')
    .select('name')
    .eq('id', id)
    .maybeSingle()

  const { data: deleted, error } = await sb
    .from('pantry_ingredients')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, message: error.message }
  if (!deleted || deleted.length === 0)
    return { ok: false, message: 'Ingredient not found — it may have already been deleted.' }

  invalidatePantryCache()
  await logAdminAction(admin.email, 'pantry_ingredient_deleted', 'pantry_ingredients', id, {
    name: existing?.name ?? null,
  })
  return { ok: true, message: 'Ingredient removed' }
}
