import { createAdminSupabaseClient } from './admin-client'
import type { DormLocation } from '@/shared/dorm-registry'

let _cache: { data: DormLocation[]; ts: number } | null = null
const TTL = 5 * 60 * 1000

export async function getDormLocations(): Promise<DormLocation[]> {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.data
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb
    .from('dorm_locations')
    .select('id, canonical_name, display_name, cid_code, shape, sort_order, aliases, is_delivery_target, is_active')
    .eq('is_active', true)
    .order('sort_order')
  // Never cache a failed or empty read. dorm_locations is never legitimately
  // empty, so an empty/errored result means a transient DB problem — caching it
  // would serve [] for the full TTL, silently breaking CID generation and the
  // WhatsApp dorm matcher. Fall back to the last good cache if we have one.
  if (error || !data || data.length === 0) {
    if (error) console.error('[dorm-locations] read failed:', error.message)
    return _cache?.data ?? []
  }
  _cache = { data: data as DormLocation[], ts: Date.now() }
  return _cache.data
}

export async function getAllDormLocations(): Promise<DormLocation[]> {
  const sb = createAdminSupabaseClient()
  const { data } = await sb
    .from('dorm_locations')
    .select('id, canonical_name, display_name, cid_code, shape, sort_order, aliases, is_delivery_target, is_active')
    .order('sort_order')
  return (data ?? []) as DormLocation[]
}

export function invalidateDormCache(): void {
  _cache = null
}
