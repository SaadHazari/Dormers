import { createClient as createAdmin } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/auth'
import QueueClient from './QueueClient'
import type { Layer4Kind } from '@/lib/dorm-wars/layer4'

export const metadata = { title: 'Layer 4 Queue — Dormers admin' }
export const dynamic = 'force-dynamic'

export interface PendingRow {
  id:             string
  customer_id:    string
  customer_name:  string | null
  customer_email: string | null
  kind:           Layer4Kind
  value_aed:      number
  notes:          string | null
  claimed_at:     string
  screenshot_url: string | null
}

const SCREENSHOT_BUCKET = 'review-screenshots'
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour — fine for an admin browse session

export default async function Layer4QueuePage() {
  // Page-level admin gate. requireAdmin() redirects to /dashboard if the
  // current user isn't in the ADMIN_EMAILS allowlist. Server actions
  // re-check independently so direct POSTs are blocked too.
  await requireAdmin()

  const sb = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: pendingRows } = await sb
    .from('layer4_rewards')
    .select('id, customer_id, kind, value_aed, notes, claimed_at')
    .eq('status', 'pending')
    .order('claimed_at', { ascending: false })

  const rows = (pendingRows ?? []) as Array<{
    id: string; customer_id: string; kind: Layer4Kind; value_aed: number; notes: string | null; claimed_at: string
  }>

  // Batch-resolve customer name + email for the rows in one read.
  const customerIds = Array.from(new Set(rows.map(r => r.customer_id)))
  const customerMap = new Map<string, { name: string | null; email: string | null }>()
  if (customerIds.length > 0) {
    const { data: customers } = await sb
      .from('customers')
      .select('id, name, email')
      .in('id', customerIds)
    for (const c of (customers ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
      customerMap.set(c.id, { name: c.name, email: c.email })
    }
  }

  // For google_review rows, generate signed URLs for the screenshot.
  // Other kinds don't have screenshots so we skip the lookup. Try common
  // extensions in order — the upload route picks one based on MIME type.
  const enriched: PendingRow[] = []
  for (const r of rows) {
    let screenshot_url: string | null = null
    if (r.kind === 'google_review') {
      screenshot_url = await tryFindScreenshot(sb, r.customer_id, r.id)
    }
    const cust = customerMap.get(r.customer_id) ?? { name: null, email: null }
    enriched.push({
      id:             r.id,
      customer_id:    r.customer_id,
      customer_name:  cust.name,
      customer_email: cust.email,
      kind:           r.kind,
      value_aed:      Number(r.value_aed),
      notes:          r.notes,
      claimed_at:     r.claimed_at,
      screenshot_url,
    })
  }

  return <QueueClient rows={enriched} />
}

// Probe for the screenshot under common extensions and return a signed
// URL. The upload route writes `{customer_id}/{row_id}.{ext}` where ext
// is derived from MIME (jpg, png, webp, heic). Cheap because Storage's
// createSignedUrl validates existence — first hit wins, no list call.
async function tryFindScreenshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  customerId: string,
  rowId: string,
): Promise<string | null> {
  for (const ext of ['jpg', 'png', 'webp', 'heic'] as const) {
    const path = `${customerId}/${rowId}.${ext}`
    const { data } = await sb.storage
      .from(SCREENSHOT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    if (data?.signedUrl) return data.signedUrl as string
  }
  return null
}
