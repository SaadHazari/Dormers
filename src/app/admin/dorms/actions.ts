'use server'

import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { invalidateDormCache } from '@/infra/supabase/dorm-locations'
import { AVAILABLE_SHAPES } from '@/shared/dorm-shapes'

// Shape is the trust boundary for the label PDF renderer: an unknown value
// makes SHAPE_PATHS[shape] undefined and crashes the daily labels for ALL dorms.
function isValidShape(shape: string): boolean {
  return (AVAILABLE_SHAPES as readonly string[]).includes(shape)
}

export async function addDormLocation(data: {
  canonical_name: string
  display_name: string
  cid_code: string
  shape: string
  sort_order: number
  aliases: string[]
  is_delivery_target: boolean
}): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()

  if (!data.canonical_name.trim()) return { ok: false, message: 'Name is required' }
  if (!data.display_name.trim()) return { ok: false, message: 'Display name is required' }
  if (!data.cid_code.trim() || data.cid_code.trim().length !== 3) return { ok: false, message: 'CID code must be exactly 3 characters' }

  // cid_code is the 3-letter prefix for every customer ID at this dorm. Two
  // dorms sharing a code would silently collide customer-ID prefixes, so it
  // must be unique. Pre-check here (admin-only, low concurrency); a DB unique
  // index is the real backstop.
  if (!isValidShape(data.shape)) return { ok: false, message: 'Invalid shape' }

  const cidCode = data.cid_code.trim().toUpperCase()
  const { data: cidClash } = await sb.from('dorm_locations').select('id').eq('cid_code', cidCode).limit(1)
  if (cidClash && cidClash.length > 0) return { ok: false, message: `CID code ${cidCode} is already used by another dorm` }

  // Assign sort_order server-side (max + 1). Seeding it from the client's SSR
  // snapshot lets two rapid adds reuse the same number — and the dorm number on
  // printed labels IS sort_order, so duplicates would print identical badges.
  const { data: maxRow } = await sb.from('dorm_locations').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextSortOrder = (maxRow?.sort_order ?? 0) + 1

  const { error } = await sb.from('dorm_locations').insert({
    canonical_name: data.canonical_name.trim(),
    display_name: data.display_name.trim().toUpperCase(),
    cid_code: cidCode,
    shape: data.shape,
    sort_order: nextSortOrder,
    aliases: data.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean),
    is_delivery_target: data.is_delivery_target,
    is_active: true,
  })

  if (error?.code === '23505') return { ok: false, message: 'A dorm with that name already exists' }
  if (error) return { ok: false, message: error.message }

  invalidateDormCache()
  await logAdminAction(admin.email, 'dorm_location_added', 'dorm_locations', data.canonical_name, data)
  return { ok: true, message: 'Dorm added' }
}

export async function updateDormLocation(
  id: string,
  data: {
    canonical_name: string
    display_name: string
    cid_code: string
    shape: string
    sort_order: number
    aliases: string[]
    is_delivery_target: boolean
  },
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()

  if (!data.canonical_name.trim()) return { ok: false, message: 'Name is required' }
  if (!data.display_name.trim()) return { ok: false, message: 'Display name is required' }
  if (!data.cid_code.trim() || data.cid_code.trim().length !== 3) return { ok: false, message: 'CID code must be exactly 3 characters' }

  if (!isValidShape(data.shape)) return { ok: false, message: 'Invalid shape' }

  // Reject a cid_code already taken by a DIFFERENT dorm (see addDormLocation).
  const cidCode = data.cid_code.trim().toUpperCase()
  const { data: cidClash } = await sb.from('dorm_locations').select('id').eq('cid_code', cidCode).neq('id', id).limit(1)
  if (cidClash && cidClash.length > 0) return { ok: false, message: `CID code ${cidCode} is already used by another dorm` }

  const { data: updated, error } = await sb
    .from('dorm_locations')
    .update({
      canonical_name: data.canonical_name.trim(),
      display_name: data.display_name.trim().toUpperCase(),
      cid_code: cidCode,
      shape: data.shape,
      sort_order: data.sort_order,
      aliases: data.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean),
      is_delivery_target: data.is_delivery_target,
    })
    .eq('id', id)
    .select('id')

  if (error?.code === '23505') return { ok: false, message: 'A dorm with that name already exists' }
  if (error) return { ok: false, message: error.message }
  if (!updated || updated.length === 0) return { ok: false, message: 'Dorm not found — it may have been deleted. Refresh and try again.' }

  invalidateDormCache()
  await logAdminAction(admin.email, 'dorm_location_updated', 'dorm_locations', id, data)
  return { ok: true, message: 'Dorm updated' }
}

export async function toggleDormActive(
  id: string,
  isActive: boolean,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()

  const { data: toggled, error } = await sb
    .from('dorm_locations')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, message: error.message }
  if (!toggled || toggled.length === 0) return { ok: false, message: 'Dorm not found — it may have been deleted. Refresh and try again.' }

  invalidateDormCache()
  await logAdminAction(admin.email, isActive ? 'dorm_location_enabled' : 'dorm_location_disabled', 'dorm_locations', id)
  return { ok: true, message: isActive ? 'Enabled' : 'Disabled' }
}
