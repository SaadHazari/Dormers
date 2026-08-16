'use server'

import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { opsTokenPath, type OpsRole } from '@/contexts/ops/domain/ops-token'
import { whatsAppTo } from '@/shared/contacts'

const PAGE = '/admin/ops-tokens'

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://dormers.ae').replace(/\/$/, '')
}

/** Full opening URL for a token, e.g. https://dormers.ae/ops/a1b2… */
function linkUrl(role: OpsRole, token: string): string {
  return `${baseUrl()}/${opsTokenPath(role, token)}`
}

/** 32-char hex — matches the TOK-01 convention the seed rows use. */
function mintToken(): string {
  return crypto.randomBytes(16).toString('hex')
}

export interface LinkResult {
  ok: boolean
  message: string
  newUrl?: string
  newId?: string
}

// ── Links ───────────────────────────────────────────────────────────────────

export async function createOpsToken(role: OpsRole, label: string): Promise<LinkResult> {
  const admin = await requireAdmin()
  const name = label.trim()
  if (!name) return { ok: false, message: 'Give the link a name so you can tell it apart later.' }
  if (role !== 'kitchen' && role !== 'rider') return { ok: false, message: 'Unknown link type.' }

  const sb = createAdminSupabaseClient()
  const token = mintToken()
  const { data, error } = await sb
    .from('ops_tokens')
    .insert({ token, role, label: name, is_active: true })
    .select('id, token')
    .single()

  if (error || !data) return { ok: false, message: `Could not create the link: ${error?.message ?? 'no data returned'}` }

  await logAdminAction(admin.email, 'ops_token_created', 'ops_token', data.id, { role, label: name })
  revalidatePath(PAGE)
  return { ok: true, message: `${name} is ready to share.`, newUrl: linkUrl(role, data.token), newId: data.id }
}

/**
 * Replace a link: the old URL stops working and a fresh one takes its place.
 *
 * Order matters. The old code revoked first and inserted second, so a failed
 * insert left the role with zero working links and a kitchen display that had
 * gone dark. Now the replacement is created FIRST and the old one is only
 * revoked once the new row exists. The worst case flipped from "no link at
 * all" to "two links briefly valid", which is recoverable.
 */
export async function rotateOpsToken(oldTokenId: string): Promise<LinkResult> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()

  const { data: existing, error: readErr } = await sb
    .from('ops_tokens')
    .select('id, role, label')
    .eq('id', oldTokenId)
    .single()
  if (readErr || !existing) return { ok: false, message: 'That link no longer exists. Refresh the page.' }

  const role = existing.role as OpsRole
  const label = existing.label as string

  const { data: created, error: insertErr } = await sb
    .from('ops_tokens')
    .insert({ token: mintToken(), role, label, is_active: true })
    .select('id, token')
    .single()
  if (insertErr || !created) {
    return { ok: false, message: `Nothing changed — the replacement link could not be created (${insertErr?.message ?? 'no data returned'}). The current link still works.` }
  }

  const { error: revokeErr } = await sb
    .from('ops_tokens')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', oldTokenId)
  if (revokeErr) {
    // The new link is live but the old one refused to die. Say so plainly —
    // the admin needs to know the previous URL is still an open door.
    await logAdminAction(admin.email, 'ops_token_rotate_partial', 'ops_token', oldTokenId, { role, label, newId: created.id, error: revokeErr.message })
    revalidatePath(PAGE)
    return {
      ok: false,
      message: `The new link works, but the old one could not be switched off (${revokeErr.message}). It is still usable. Try rotating again.`,
      newUrl: linkUrl(role, created.token),
      newId: created.id,
    }
  }

  await logAdminAction(admin.email, 'ops_token_rotated', 'ops_token', oldTokenId, { role, label, newId: created.id })
  revalidatePath(PAGE)
  return { ok: true, message: `${label} has a new link. The old one is dead.`, newUrl: linkUrl(role, created.token), newId: created.id }
}

/** Kill a link without minting a replacement — the "this person left" path. */
export async function revokeOpsToken(tokenId: string): Promise<LinkResult> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()

  const { data, error } = await sb
    .from('ops_tokens')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', tokenId)
    .select('label')
    .single()
  if (error) return { ok: false, message: `Could not switch that link off: ${error.message}` }

  await logAdminAction(admin.email, 'ops_token_revoked', 'ops_token', tokenId, { label: data?.label })
  revalidatePath(PAGE)
  return { ok: true, message: `${data?.label ?? 'That link'} is switched off.` }
}

// ── Sharing ─────────────────────────────────────────────────────────────────

export interface SendResult {
  ok: boolean
  message: string
  /** wa.me URL to open manually when the template send did not go through. */
  fallbackHref?: string
}

/**
 * Turn a Meta failure into one readable line.
 *
 * The raw throw carries the whole Graph error body, which is a wall of JSON —
 * useful in the audit log, unreadable in a panel the admin is trying to act
 * from. Pull out the human sentence and the numeric code (the code is what the
 * template runbook is indexed by) and drop the rest.
 */
function readableSendError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'send failed'
  const json = raw.match(/\{[\s\S]*\}/)
  if (!json) return raw

  try {
    const parsed = JSON.parse(json[0]) as { error?: { message?: string; code?: number } }
    const detail = parsed.error?.message
    const code = parsed.error?.code
    if (detail) return code ? `${detail.replace(/^\(#\d+\)\s*/, '')} (Meta ${code})` : detail
  } catch {
    // Not JSON after all — fall through to the raw text.
  }
  return raw
}

/**
 * Send an access link to one crew member over WhatsApp.
 *
 * Primary path is the approved `ops_access_link` template, sent from the
 * Dormers business number. That template has to clear Meta review before it
 * can send anything, and templates get paused or rejected without warning, so
 * every failure comes back with a wa.me fallback the admin can open and send
 * by hand. The link is never withheld just because Meta said no.
 */
export async function sendOpsLink(tokenId: string, crewId: string): Promise<SendResult> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()

  const [{ data: tok }, { data: person }] = await Promise.all([
    sb.from('ops_tokens').select('id, token, role, label, is_active').eq('id', tokenId).single(),
    sb.from('whatsapp_rider_allowlist').select('id, phone_digits, label').eq('id', crewId).single(),
  ])

  if (!tok || !tok.is_active) return { ok: false, message: 'That link is no longer active. Refresh the page.' }
  if (!person) return { ok: false, message: 'That person is not on the crew list any more.' }

  const role = tok.role as OpsRole
  const url = linkUrl(role, tok.token as string)
  const name = (person.label as string | null)?.trim() || 'there'
  const linkName = tok.label as string
  const phone = person.phone_digits as string

  // Mirrors the template copy so the fallback reads the same as the real thing.
  const fallbackText =
    `Hi ${name}, here is your Dormers ${linkName} access link. Open it and add it to your home screen so you can get back in.\n\n` +
    `${url}\n\n` +
    `Please keep it to yourself. Anyone with this link can open it.`
  const fallbackHref = whatsAppTo(phone, fallbackText)

  try {
    const { sendOpsLinkWhatsApp } = await import('@/infra/meta-whatsapp/client')
    await sendOpsLinkWhatsApp(phone, name, linkName, opsTokenPath(role, tok.token as string))
  } catch (err) {
    // Full body to the log and the audit trail, one readable line to the panel.
    console.error('sendOpsLink template send failed:', err)
    await logAdminAction(admin.email, 'ops_link_send_failed', 'ops_token', tokenId, {
      crewId,
      error: err instanceof Error ? err.message : 'send failed',
    })
    return {
      ok: false,
      message: `Automatic send did not go through. ${readableSendError(err)}. Send it yourself instead:`,
      fallbackHref,
    }
  }

  await logAdminAction(admin.email, 'ops_link_sent', 'ops_token', tokenId, { crewId, role, label: linkName })
  return { ok: true, message: `Sent to ${name} on WhatsApp.` }
}

// ── Crew ────────────────────────────────────────────────────────────────────

export interface CrewResult { ok: boolean; message: string }

/**
 * Add someone to the crew directory.
 *
 * `is_active` is the delivery-confirmation permission, NOT "is this person
 * real". Kitchen crew are added with it off: they are here so links can be
 * sent to them, and being on this list must not quietly let them close out a
 * delivery by texting the Dormers number.
 */
export async function addCrewMember(
  phone: string,
  name: string,
  team: OpsRole,
): Promise<CrewResult> {
  const admin = await requireAdmin()
  const digits = phone.replace(/\D/g, '').replace(/^00/, '')
  const cleanName = name.trim()

  if (digits.length < 8) return { ok: false, message: 'That number looks too short. Include the country code, like 971504619384.' }
  if (!cleanName) return { ok: false, message: 'Add a name so you know who you are sending to.' }
  if (team !== 'kitchen' && team !== 'rider') return { ok: false, message: 'Pick a team.' }

  const sb = createAdminSupabaseClient()
  const { error } = await sb
    .from('whatsapp_rider_allowlist')
    .insert({ phone_digits: digits, label: cleanName, team, is_active: team === 'rider' })

  if (error?.code === '23505') return { ok: false, message: 'That number is already on the crew list.' }
  if (error) return { ok: false, message: error.message }

  await logAdminAction(admin.email, 'ops_crew_added', 'whatsapp_rider_allowlist', digits, { name: cleanName, team })
  revalidatePath(PAGE)
  return { ok: true, message: `${cleanName} added.` }
}

/** Toggle the "may confirm deliveries by WhatsApp" permission for one person. */
export async function toggleCrewConfirm(id: string, isActive: boolean): Promise<CrewResult> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()
  const { error } = await sb
    .from('whatsapp_rider_allowlist')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) return { ok: false, message: error.message }

  await logAdminAction(
    admin.email,
    isActive ? 'ops_crew_confirm_enabled' : 'ops_crew_confirm_disabled',
    'whatsapp_rider_allowlist',
    id,
  )
  revalidatePath(PAGE)
  return { ok: true, message: isActive ? 'They can confirm deliveries now.' : 'Delivery confirmations switched off.' }
}

/** Remove someone from the directory entirely — they left. */
export async function removeCrewMember(id: string): Promise<CrewResult> {
  const admin = await requireAdmin()
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb
    .from('whatsapp_rider_allowlist')
    .delete()
    .eq('id', id)
    .select('label')
    .single()
  if (error) return { ok: false, message: `Could not remove them: ${error.message}` }

  await logAdminAction(admin.email, 'ops_crew_removed', 'whatsapp_rider_allowlist', id, { name: data?.label })
  revalidatePath(PAGE)
  return { ok: true, message: `${data?.label ?? 'They'} removed. Rotate any link they still hold.` }
}
