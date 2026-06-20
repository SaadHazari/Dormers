'use server'

import crypto from 'crypto'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'

export async function rotateOpsToken(
  oldTokenId: string,
  role: 'kitchen' | 'rider',
  label: string,
): Promise<{ ok: boolean; newToken?: string; newUrl?: string; message: string }> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()
  const newToken = crypto.randomBytes(16).toString('hex') // 32-char hex — matches TOK-01 convention

  // Revoke old token first
  const { error: revokeErr } = await sb
    .from('ops_tokens')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', oldTokenId)
  if (revokeErr) return { ok: false, message: `Revoke failed: ${revokeErr.message}` }

  // Insert new active token with same role + label
  const { data, error: insertErr } = await sb
    .from('ops_tokens')
    .insert({ token: newToken, role, label, is_active: true })
    .select('id, token')
    .single()
  if (insertErr || !data) return { ok: false, message: `Insert failed: ${insertErr?.message ?? 'no data'}` }

  const basePath = role === 'kitchen' ? 'kitchen' : 'ops'
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://dormers.ae'
  const newUrl = `${baseUrl}/${basePath}/${data.token}`

  await logAdminAction(admin.email, 'ops_token_rotated', 'ops_token', oldTokenId, { role, label, newId: data.id })
  return { ok: true, newToken: data.token, newUrl, message: 'Token rotated successfully' }
}

export async function addAllowlistEntry(
  phoneDigits: string,
  label: string,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()
  const digits = phoneDigits.replace(/[^0-9]/g, '')
  if (digits.length < 8) return { ok: false, message: 'Phone number too short' }

  const { error } = await sb
    .from('whatsapp_rider_allowlist')
    .insert({ phone_digits: digits, label: label || null, is_active: true })
  if (error?.code === '23505') return { ok: false, message: 'Number already exists' }
  if (error) return { ok: false, message: error.message }

  await logAdminAction(admin.email, 'rider_allowlist_added', 'whatsapp_rider_allowlist', digits, { label })
  return { ok: true, message: 'Number added' }
}

export async function toggleAllowlistEntry(
  id: string,
  isActive: boolean,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()
  const { error } = await sb
    .from('whatsapp_rider_allowlist')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) return { ok: false, message: error.message }

  await logAdminAction(admin.email, isActive ? 'rider_allowlist_enabled' : 'rider_allowlist_disabled', 'whatsapp_rider_allowlist', id)
  return { ok: true, message: isActive ? 'Enabled' : 'Disabled' }
}
