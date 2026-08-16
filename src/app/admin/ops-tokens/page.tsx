import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { opsTokenPath, type OpsRole } from '@/contexts/ops/domain/ops-token'
import { OpsTokensClient } from './OpsTokensClient'

export const metadata = { title: 'Access Links — Dormers Admin' }
export const dynamic = 'force-dynamic'

export interface OpsToken {
  id: string
  role: OpsRole
  label: string
  created_at: string
  last_used_at: string | null
  /** Full opening URL, resolved server-side so the client never rebuilds it. */
  url: string
}

export interface CrewMember {
  id: string
  phone_digits: string
  name: string
  team: OpsRole
  /** May confirm a delivery by texting the Dormers WhatsApp number. */
  can_confirm: boolean
  created_at: string
}

export default async function OpsTokensPage() {
  await requireAdmin()
  const sb = createAdminSupabaseClient()
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://dormers.ae').replace(/\/$/, '')

  // Revoked links are deliberately never fetched — once a link is switched off
  // it disappears from the page. There is no history view by design.
  const [{ data: tokenData }, { data: crewData }] = await Promise.all([
    sb.from('ops_tokens')
      .select('id, token, role, label, created_at, last_used_at')
      .eq('is_active', true)
      .order('role', { ascending: true })
      .order('created_at', { ascending: false }),
    sb.from('whatsapp_rider_allowlist')
      .select('id, phone_digits, label, team, is_active, created_at')
      .order('team', { ascending: true })
      .order('label', { ascending: true }),
  ])

  const tokens: OpsToken[] = (tokenData ?? []).map(r => ({
    id: r.id as string,
    role: r.role as OpsRole,
    label: r.label as string,
    created_at: r.created_at as string,
    last_used_at: (r.last_used_at as string | null) ?? null,
    url: `${base}/${opsTokenPath(r.role as OpsRole, r.token as string)}`,
  }))

  const crew: CrewMember[] = (crewData ?? []).map(r => ({
    id: r.id as string,
    phone_digits: r.phone_digits as string,
    name: (r.label as string | null) ?? 'Unnamed',
    team: ((r.team as string) === 'kitchen' ? 'kitchen' : 'rider') as OpsRole,
    can_confirm: Boolean(r.is_active),
    created_at: r.created_at as string,
  }))

  return <OpsTokensClient tokens={tokens} crew={crew} />
}
