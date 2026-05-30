import { createClient as createAdmin } from '@supabase/supabase-js'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import QueueClient from './QueueClient'
import type { Layer4Kind } from '@/contexts/dorm-wars/domain/layer4'

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
  /** Snippet of the extracted review body (for at-a-glance dedup comparison). */
  extracted_review_text: string | null
  /** When the verifier or backfill found a colliding approved claim. */
  duplicate_of:   { row_id: string; matched_on: 'text_hash' | 'reviewer_name' } | null
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
    .select('id, customer_id, kind, value_aed, notes, claimed_at, extracted_review_text, extracted_text_hash, extracted_reviewer_name')
    .eq('status', 'pending')
    .order('claimed_at', { ascending: false })

  const rows = (pendingRows ?? []) as Array<{
    id: string; customer_id: string; kind: Layer4Kind; value_aed: number;
    notes: string | null; claimed_at: string;
    extracted_review_text: string | null;
    extracted_text_hash: string | null;
    extracted_reviewer_name: string | null;
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

  // ── Collision lookup: for every pending row with an extracted hash,
  // find any prior approved/auto_approved row sharing the same hash. One
  // batched IN-query keeps it to a single round-trip regardless of queue
  // size. Reviewer-name collisions are the secondary signal — a separate
  // batched query keyed by name.
  const hashesToCheck = rows
    .map(r => r.extracted_text_hash)
    .filter((h): h is string => !!h)
  const namesToCheck = rows
    .map(r => r.extracted_reviewer_name)
    .filter((n): n is string => !!n)

  const hashOwner = new Map<string, string>()     // hash → colliding row id
  const nameOwner = new Map<string, { row_id: string; customer_id: string }>()

  if (hashesToCheck.length > 0) {
    const { data: hashMatches } = await sb
      .from('layer4_rewards')
      .select('id, extracted_text_hash')
      .eq('kind', 'google_review')
      .in('status', ['approved', 'auto_approved'])
      .in('extracted_text_hash', hashesToCheck)
    for (const m of (hashMatches ?? []) as Array<{ id: string; extracted_text_hash: string }>) {
      // First match wins per hash. (Multiple legit approved rows with the
      // same hash shouldn't happen because we force manual_review on
      // collision; if it does the first one we see is fine.)
      if (!hashOwner.has(m.extracted_text_hash)) {
        hashOwner.set(m.extracted_text_hash, m.id)
      }
    }
  }

  if (namesToCheck.length > 0) {
    const { data: nameMatches } = await sb
      .from('layer4_rewards')
      .select('id, customer_id, extracted_reviewer_name')
      .eq('kind', 'google_review')
      .in('status', ['approved', 'auto_approved'])
      .in('extracted_reviewer_name', namesToCheck)
    for (const m of (nameMatches ?? []) as Array<{ id: string; customer_id: string; extracted_reviewer_name: string }>) {
      if (!nameOwner.has(m.extracted_reviewer_name)) {
        nameOwner.set(m.extracted_reviewer_name, { row_id: m.id, customer_id: m.customer_id })
      }
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

    // Resolve the duplicate match. Hash collision wins over name collision.
    // Skip the trivial self-match (current row's own hash references itself).
    let duplicate_of: PendingRow['duplicate_of'] = null
    if (r.extracted_text_hash) {
      const hit = hashOwner.get(r.extracted_text_hash)
      if (hit && hit !== r.id) {
        duplicate_of = { row_id: hit, matched_on: 'text_hash' }
      }
    }
    if (!duplicate_of && r.extracted_reviewer_name) {
      const hit = nameOwner.get(r.extracted_reviewer_name)
      if (hit && hit.row_id !== r.id && hit.customer_id !== r.customer_id) {
        duplicate_of = { row_id: hit.row_id, matched_on: 'reviewer_name' }
      }
    }

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
      extracted_review_text: r.extracted_review_text,
      duplicate_of,
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
