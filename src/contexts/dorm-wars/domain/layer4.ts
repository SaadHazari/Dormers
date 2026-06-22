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
  google_review:        10,
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
    // Self-heal: delete the just-inserted marker so its UNIQUE doesn't
    // permanently block a retry. The next hub load re-fires cleanly and
    // deposits the credit — there is no reconciliation job to back-fill an
    // orphan. Mirrors the delete-to-allow-retry pattern in
    // autoRejectLayer4Reward. (Worst case, a spurious error after the credit
    // actually committed yields a rare double AED 50 — strictly better than a
    // silent permanent loss.)
    await sb.from('layer4_rewards').delete().eq('id', inserted.id)
    // Release It! L5: throw instead of silently returning null. The marker is
    // already deleted above (so the next hub load retries cleanly), and the
    // caller — an app-layer file allowed to use infra — surfaces this to Sentry
    // + admin. Domain stays infra-free per the dependency rule.
    throw new Error(
      `anniversary credit deposit failed — customer=${customerId} year=${anniversaryYear} value=${value}: ${creditErr?.message ?? 'no row returned'}`,
    )
  }

  // Link the credit row back + stamp awarded_at.
  await sb
    .from('layer4_rewards')
    .update({ credit_id: credit.id, awarded_at: new Date().toISOString() })
    .eq('id', inserted.id)

  return { ...(inserted as Layer4Row), awarded_at: new Date().toISOString() }
}

/**
 * Phase 8K — Google review claim, scoped to ONE per monthly subscription.
 * `subscriptionId` is the active sub's id; it becomes the period_key so
 * the UNIQUE(customer_id, 'google_review', period_key) constraint allows
 * a new claim each new subscription cycle.
 *
 * Statuses returned by this call:
 *   • status='pending'        → manual queue (legacy self-attest)
 *   • status='auto_approved'  → screenshot verified by Gemini, credit deposited
 *   • status='approved'       → ops-verified later, credit deposited
 *
 * The screenshot-verify endpoint calls claimGoogleReview + then runs
 * verifyReviewScreenshot, deciding which status to set.
 */
export async function claimGoogleReview(
  sb: AdminClient,
  customerId: string,
  subscriptionId: string,
  notes?: string,
): Promise<{ row: Layer4Row; alreadyClaimed: boolean }> {
  // Check first to avoid an unnecessary UNIQUE-conflict-then-read round-trip.
  // Per-sub idempotency: existence is per subscription, not per customer.
  const { data: existing } = await sb
    .from('layer4_rewards')
    .select('id, kind, period_key, status, value_aed, claimed_at, awarded_at')
    .eq('customer_id', customerId)
    .eq('kind', 'google_review')
    .eq('period_key', subscriptionId)
    .maybeSingle()

  if (existing) {
    return { row: existing as Layer4Row, alreadyClaimed: true }
  }

  const { data: inserted, error } = await sb
    .from('layer4_rewards')
    .insert({
      customer_id: customerId,
      kind:        'google_review',
      period_key:  subscriptionId,
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

export interface DuplicateMatch {
  /** Colliding row id (always set). */
  id: string
  /** Owner of the colliding row — useful for the ops note. */
  customer_id: string
  /** What caused the match — drives the admin-queue badge copy. */
  matched_on: 'text_hash' | 'reviewer_name'
}

/**
 * Look for a prior approved/auto_approved google_review claim that collides
 * with the screenshot just uploaded. Hash collision is the strong signal;
 * reviewer-name collision is the weaker secondary signal and only triggers
 * cross-user (same user submitting under their own name in a later cycle
 * is fine — they may have a paraphrased follow-up review).
 *
 * Returns the FIRST match found (hash-based check runs first, so if both
 * exist the hash match wins). Returns null if no collision.
 *
 * Caller is responsible for skipping the call when the extracted text is
 * too short to be a reliable dedup signal (see MIN_DEDUP_TEXT_LENGTH).
 */
export async function findDuplicateClaim(
  sb: AdminClient,
  textHash: string | null,
  reviewerName: string | null,
  currentCustomerId: string,
): Promise<DuplicateMatch | null> {
  // Strong signal: hash collision (same review text submitted twice).
  // We compare across ALL users including the same one — a user
  // re-uploading the same screenshot in a new sub cycle is also a
  // duplicate (they didn't write a new review).
  if (textHash) {
    const { data: hashMatch } = await sb
      .from('layer4_rewards')
      .select('id, customer_id')
      .eq('kind', 'google_review')
      .in('status', ['approved', 'auto_approved'])
      .eq('extracted_text_hash', textHash)
      .limit(1)
      .maybeSingle()
    if (hashMatch) {
      return {
        id:          hashMatch.id as string,
        customer_id: hashMatch.customer_id as string,
        matched_on:  'text_hash',
      }
    }
  }

  // Weaker signal: same reviewer name under a DIFFERENT customer_id.
  // Same customer re-using their own name is expected; cross-user is
  // suspicious (one person submitting under multiple accounts).
  if (reviewerName) {
    const { data: nameMatch } = await sb
      .from('layer4_rewards')
      .select('id, customer_id')
      .eq('kind', 'google_review')
      .in('status', ['approved', 'auto_approved'])
      .eq('extracted_reviewer_name', reviewerName)
      .neq('customer_id', currentCustomerId)
      .limit(1)
      .maybeSingle()
    if (nameMatch) {
      return {
        id:          nameMatch.id as string,
        customer_id: nameMatch.customer_id as string,
        matched_on:  'reviewer_name',
      }
    }
  }

  return null
}

/**
 * Mark an existing layer4_rewards row as auto_approved (Gemini verified
 * the screenshot) and deposit the credit. Idempotent: a second call when
 * the row is already auto_approved/approved is a no-op.
 *
 * Used by the screenshot-verify endpoint after a 'high' confidence pass.
 */
export async function autoApproveLayer4Reward(
  sb: AdminClient,
  rowId: string,
  customerId: string,
  valueAed: number,
  source: string,                // e.g. 'layer4_google_review'
  notes: string,
): Promise<void> {
  // Atomically claim the row: flip pending → auto_approved in a single
  // compare-and-swap. Only the caller whose UPDATE actually matches a still
  // 'pending' row proceeds to deposit. Concurrent callers (and replays) match
  // zero rows and no-op — this is what prevents the double-credit race, since
  // `credits` has no idempotency constraint of its own.
  const { data: claimed } = await sb
    .from('layer4_rewards')
    .update({
      status:      'auto_approved',
      awarded_at:  new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      notes,
    })
    .eq('id', rowId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (!claimed) {
    // Either the row is missing, or it was already finalized / won by a
    // concurrent caller. Distinguish so a genuinely missing row still surfaces.
    const { data: row } = await sb
      .from('layer4_rewards')
      .select('status')
      .eq('id', rowId)
      .maybeSingle()
    if (!row) throw new Error(`autoApprove: row ${rowId} not found`)
    return // already credited or won by a concurrent call
  }

  // We hold the claim. Deposit the credit; if it fails, release the row back to
  // 'pending' so the reward can be retried without an approved-but-uncredited row.
  const { data: credit, error: creditErr } = await sb
    .from('credits')
    .insert({
      customer_id: customerId,
      amount_aed:  valueAed,
      source,
      status:      'approved',
    })
    .select('id')
    .maybeSingle()
  if (creditErr || !credit) {
    await sb
      .from('layer4_rewards')
      .update({ status: 'pending', awarded_at: null, reviewed_at: null })
      .eq('id', rowId)
    throw new Error(`autoApprove: credit insert failed: ${creditErr?.message ?? 'unknown'}`)
  }

  await sb
    .from('layer4_rewards')
    .update({ credit_id: credit.id })
    .eq('id', rowId)
}

/**
 * Mark a row as rejected (Gemini high-confidence said it's not a Google
 * review screenshot). No credit deposit; user sees a "couldn't verify"
 * message and can re-claim with a better screenshot in the same cycle.
 *
 * Because the UNIQUE on (customer_id, 'google_review', period_key) would
 * block a fresh insert in the same sub, we DELETE the rejected row so the
 * user can try again with a new screenshot. The rejection reason was
 * logged in notes before delete via the verifier's auto-write — but we
 * also log to the server console for ops visibility.
 */
export async function autoRejectLayer4Reward(
  sb: AdminClient,
  rowId: string,
  reason: string,
): Promise<void> {
  console.warn(`layer4 auto-reject — row=${rowId} reason=${reason}`)
  await sb.from('layer4_rewards').delete().eq('id', rowId)
}
