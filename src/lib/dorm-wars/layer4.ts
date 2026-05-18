// src/lib/dorm-wars/layer4.ts
// Phase 8G — Layer 4 side-reward kinds + value table + shared helpers.
//
// Layer 4 is the "more ways to earn AED" surface (Google review, weekly
// surveys, 1-year anniversary, renew-and-invite combo). Each kind has its
// own idempotency boundary tracked via the layer4_rewards.period_key column:
//   • google_review        — lifetime (period_key = null)
//   • anniversary          — per year (period_key = '1', '2', …)
//   • weekly_survey        — per ISO week (e.g. '2026-W19')
//   • renew_invite_combo   — per renewed subscription (period_key = sub id)
//
// Two paths award credit:
//   1. Auto-fire (anniversary): page-load check inserts the layer4 row +
//      credit row inside the same admin call. Status = 'auto_approved'.
//   2. Self-attest (google_review): user taps "I've reviewed", we insert
//      a layer4 row with status='pending'. Admin verifies the review on
//      Google and flips status to 'approved' → triggers credit deposit.
//
// The credit-deposit-on-approval flow is intentionally simple: the admin
// dashboard for Phase 8 isn't built yet, so for now status='approved' is
// a SQL UPDATE by ops in the Supabase console. When ops tooling ships, it
// will call a server action that does the status flip + credit insert in
// one transaction.

import type { SupabaseClient } from '@supabase/supabase-js'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>

export type Layer4Kind = 'google_review' | 'weekly_survey' | 'anniversary' | 'renew_invite_combo'

// Canonical AED values per kind. Display copy reads from this table too
// so the column UI and the awarder agree on amounts.
export const LAYER4_VALUE_AED: Record<Layer4Kind, number> = {
  google_review:        25,
  weekly_survey:        20,
  anniversary:          50,
  renew_invite_combo:   10,
}

export interface Layer4Row {
  id:         string
  kind:       Layer4Kind
  period_key: string | null
  status:     'pending' | 'auto_approved' | 'approved' | 'rejected'
  value_aed:  number
  claimed_at: string
  awarded_at: string | null
}

/**
 * Fetch all Layer 4 reward rows for a customer. Used by the hub to render
 * per-kind status (claimed/pending/locked) in the Side Rewards column.
 * Newest-first; the UI groups by kind and picks the most recent per kind.
 */
export async function getLayer4Rewards(
  sb: AdminClient,
  customerId: string,
): Promise<Layer4Row[]> {
  const { data } = await sb
    .from('layer4_rewards')
    .select('id, kind, period_key, status, value_aed, claimed_at, awarded_at')
    .eq('customer_id', customerId)
    .order('claimed_at', { ascending: false })
  return (data ?? []) as Layer4Row[]
}

/**
 * Auto-fire the 1-year anniversary reward if eligible. Idempotent: the
 * UNIQUE(customer_id, 'anniversary', '1') constraint blocks double-fires.
 *
 * Eligibility:
 *   • customer.created_at is at least 365 days old
 *   • no existing layer4_rewards row for (customer, 'anniversary', '1')
 *
 * Called from src/app/dashboard/dorm-wars/page.tsx on hub load. Cheap when
 * not eligible (single anniversary row read, no insert). The insert path
 * also deposits the credit + back-references credit_id atomically.
 *
 * Returns the new row if just-fired, the existing row if already fired,
 * or null if not yet eligible.
 */
export async function maybeFireAnniversary(
  sb: AdminClient,
  customerId: string,
): Promise<Layer4Row | null> {
  // Cheap check first: is the customer old enough?
  const { data: customer } = await sb
    .from('customers')
    .select('created_at')
    .eq('id', customerId)
    .maybeSingle()

  if (!customer?.created_at) return null

  const createdMs = new Date(customer.created_at as string).getTime()
  const ageDays = (Date.now() - createdMs) / 86_400_000
  // Compute the anniversary year the customer has just crossed (1 = first
  // anniversary). >= 365 covers leap years close enough — being a day late
  // on someone's anniversary won't break anything; being a day early would.
  const anniversaryYear = Math.floor(ageDays / 365)
  if (anniversaryYear < 1) return null

  const periodKey = String(anniversaryYear)

  // Does the row already exist for this anniversary year?
  const { data: existing } = await sb
    .from('layer4_rewards')
    .select('id, kind, period_key, status, value_aed, claimed_at, awarded_at')
    .eq('customer_id', customerId)
    .eq('kind', 'anniversary')
    .eq('period_key', periodKey)
    .maybeSingle()
  if (existing) return existing as Layer4Row

  // Insert the layer4 row first, then the credit, then link credit_id back.
  // UNIQUE conflict short-circuits if a parallel hub-load racepre-empts us.
  const value = LAYER4_VALUE_AED.anniversary
  const { data: inserted } = await sb
    .from('layer4_rewards')
    .insert({
      customer_id: customerId,
      kind:        'anniversary',
      period_key:  periodKey,
      value_aed:   value,
      status:      'auto_approved',
      notes:       `Auto-fired at ${ageDays.toFixed(1)} days old (year ${anniversaryYear})`,
    })
    .select('id, kind, period_key, status, value_aed, claimed_at, awarded_at')
    .maybeSingle()

  if (!inserted) {
    // Concurrent insert won the UNIQUE. Re-read and return whatever lives.
    const { data: again } = await sb
      .from('layer4_rewards')
      .select('id, kind, period_key, status, value_aed, claimed_at, awarded_at')
      .eq('customer_id', customerId)
      .eq('kind', 'anniversary')
      .eq('period_key', periodKey)
      .maybeSingle()
    return (again ?? null) as Layer4Row | null
  }

  // Deposit the credit. CRITICAL: surface failure — the layer4 row is
  // already committed and its UNIQUE blocks retry, so a silent miss here
  // permanently loses the user's anniversary payout.
  const { data: credit, error: creditErr } = await sb
    .from('credits')
    .insert({
      customer_id: customerId,
      amount_aed:  value,
      source:      'layer4_anniversary',
      status:      'approved',
    })
    .select('id')
    .maybeSingle()

  if (creditErr || !credit) {
    console.error(
      `❌ anniversary credit insert failed — customer=${customerId} year=${anniversaryYear}:`,
      creditErr,
    )
    // Leave the layer4 row in place so ops can spot the orphan and back-
    // fill the credit manually. The user will see "Earned!" in the UI
    // either way; the credit will hit their wallet on next reconciliation.
    return inserted as Layer4Row
  }

  // Link the credit row back + stamp awarded_at.
  await sb
    .from('layer4_rewards')
    .update({ credit_id: credit.id, awarded_at: new Date().toISOString() })
    .eq('id', inserted.id)

  return { ...(inserted as Layer4Row), awarded_at: new Date().toISOString() }
}

/**
 * Self-attest Google review claim. User taps "I've reviewed" → we insert
 * a layer4 row with status='pending'. Credit DOES NOT deposit until an
 * admin manually verifies the review on Google and flips status='approved'.
 *
 * Returns the inserted row, or the existing row if the customer already
 * claimed (one google_review claim per customer lifetime).
 */
export async function claimGoogleReview(
  sb: AdminClient,
  customerId: string,
  notes?: string,
): Promise<{ row: Layer4Row; alreadyClaimed: boolean }> {
  // Check first to avoid an unnecessary UNIQUE-conflict-then-read round-trip.
  const { data: existing } = await sb
    .from('layer4_rewards')
    .select('id, kind, period_key, status, value_aed, claimed_at, awarded_at')
    .eq('customer_id', customerId)
    .eq('kind', 'google_review')
    .maybeSingle()

  if (existing) {
    return { row: existing as Layer4Row, alreadyClaimed: true }
  }

  const { data: inserted, error } = await sb
    .from('layer4_rewards')
    .insert({
      customer_id: customerId,
      kind:        'google_review',
      period_key:  null,
      value_aed:   LAYER4_VALUE_AED.google_review,
      status:      'pending',
      notes:       notes ?? null,
    })
    .select('id, kind, period_key, status, value_aed, claimed_at, awarded_at')
    .maybeSingle()

  if (error || !inserted) {
    throw new Error(`google review claim insert failed: ${error?.message ?? 'unknown'}`)
  }

  return { row: inserted as Layer4Row, alreadyClaimed: false }
}
