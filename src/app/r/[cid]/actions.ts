'use server'

import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalisePhone } from '@/lib/phone'
import { awardCycleAndTierRewards } from '@/lib/dorm-wars/awarder'

// ── Rate-limit constants ───────────────────────────────────────────────────
const MAX_PENDING_INVITES    = 5   // inviter can have at most this many pending gifts at once
const MAX_CONVERSIONS_MONTH  = 10  // inviter earns credit on at most this many paid conversions/month
const MAX_INVITES_7_DAYS     = 20  // inviter can send at most this many invites in a rolling 7-day window

export type ClaimResult =
  | { ok: true }
  | { blocked: true; reason: string }
  | { error: string }

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

// First name sanitization mirrors src/lib/validation:sanitizeNameInput — letters
// + spaces + accent marks, single-trim, capped at 40 chars. We re-inline here
// (rather than importing the full validation module) because the action is the
// last defense at the server boundary and benefits from being self-contained.
function sanitizeFirstName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[^\p{L}\s'.\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

export async function claimGift(payload: {
  inviterCid:  string
  firstName:   string
  phone:       string
  email:       string
  dormName:    string
  preference:  string
  deviceFp?:   string
}): Promise<ClaimResult> {
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const phoneE164  = normalisePhone(payload.phone)
  const emailNorm  = normaliseEmail(payload.email)
  const inviterCid = payload.inviterCid.toUpperCase().trim()
  const firstName  = sanitizeFirstName(payload.firstName)

  if (!firstName) {
    return { blocked: true, reason: 'Please enter your first name.' }
  }

  // ── 1. Validate inviter CID exists ────────────────────────────────────────
  const { data: inviter } = await supabaseAdmin
    .from('customers')
    .select('id, cid, name')
    .eq('cid', inviterCid)
    .maybeSingle()

  if (!inviter) {
    return { blocked: true, reason: 'This referral link is invalid or has expired.' }
  }

  // ── 2. Lifetime phone dedupe — keystone constraint ─────────────────────────
  const { data: phoneClaimed } = await supabaseAdmin
    .from('referral_gifts_claimed')
    .select('id')
    .eq('phone_e164', phoneE164)
    .maybeSingle()

  if (phoneClaimed) {
    return {
      blocked: true,
      reason: "Looks like you've already had your welcome meal from us. Pick a plan to keep going.",
    }
  }

  // ── 3. Lifetime email dedupe ───────────────────────────────────────────────
  const { data: emailClaimed } = await supabaseAdmin
    .from('referral_gifts_claimed')
    .select('id')
    .eq('email_norm', emailNorm)
    .maybeSingle()

  if (emailClaimed) {
    return {
      blocked: true,
      reason: "Looks like you've already had your welcome meal from us. Pick a plan to keep going.",
    }
  }

  // ── 4. Self-referral — inviter's own phone ─────────────────────────────────
  const { data: inviterCustomer } = await supabaseAdmin
    .from('customers')
    .select('whatsapp_number, email')
    .eq('cid', inviterCid)
    .maybeSingle()

  if (inviterCustomer) {
    const inviterPhone = normalisePhone(inviterCustomer.whatsapp_number ?? '')
    if (inviterPhone && inviterPhone === phoneE164) {
      return { blocked: true, reason: 'You cannot refer yourself.' }
    }
    if (inviterCustomer.email && normaliseEmail(inviterCustomer.email) === emailNorm) {
      return { blocked: true, reason: 'You cannot refer yourself.' }
    }
  }

  // ── 5. Pair uniqueness — inviter already sent to this phone ───────────────
  const { data: pairExists } = await supabaseAdmin
    .from('referrals')
    .select('id, status')
    .eq('inviter_cid', inviterCid)
    .eq('invitee_phone', phoneE164)
    .maybeSingle()

  if (pairExists) {
    if (pairExists.status === 'blocked') {
      return { blocked: true, reason: 'This invite has been blocked.' }
    }
    return {
      blocked: true,
      reason: 'Your friend has already sent you an invite — check your WhatsApp for their message.',
    }
  }

  // ── 6. Inviter rate limits ─────────────────────────────────────────────────
  const [pendingRes, sevenDayRes] = await Promise.all([
    supabaseAdmin
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_cid', inviterCid)
      .eq('status', 'pending'),
    supabaseAdmin
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_cid', inviterCid)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  if ((pendingRes.count ?? 0) >= MAX_PENDING_INVITES) {
    return {
      blocked: true,
      reason: `Your friend has ${MAX_PENDING_INVITES} invites waiting to activate. Once a few subscribe, they can send more.`,
    }
  }
  if ((sevenDayRes.count ?? 0) >= MAX_INVITES_7_DAYS) {
    return {
      blocked: true,
      reason: 'This referral link has reached its weekly limit. Try again next week.',
    }
  }

  // ── 7. Soft signals — flag but allow through ───────────────────────────────
  const softFlags: string[] = []
  if (payload.deviceFp) {
    const { data: deviceMatch } = await supabaseAdmin
      .from('referral_gifts_claimed')
      .select('id')
      .eq('device_fp', payload.deviceFp)
      .maybeSingle()
    if (deviceMatch) softFlags.push('device_fp_reuse')
  }

  // ── 8. Write referral row ──────────────────────────────────────────────────
  const { data: referralRow, error: refErr } = await supabaseAdmin
    .from('referrals')
    .insert({
      inviter_cid:        inviterCid,
      inviter_user_id:    inviter.id,
      invitee_phone:      phoneE164,
      invitee_email:      emailNorm,
      invitee_first_name: firstName,
      status:             'gift_claimed',
      device_fp:          payload.deviceFp ?? null,
      gift_claimed_at:    new Date().toISOString(),
    })
    .select('id')
    .single()

  if (refErr || !referralRow) {
    console.error('claimGift: referral insert failed', refErr)
    return { error: 'Something went wrong. Please try again.' }
  }

  // ── 9. Write gift-claimed row — enforces UNIQUE constraints ───────────────
  const { error: claimErr } = await supabaseAdmin
    .from('referral_gifts_claimed')
    .insert({
      phone_e164:  phoneE164,
      email_norm:  emailNorm,
      dorm_name:   payload.dormName,
      device_fp:   payload.deviceFp ?? null,
    })

  if (claimErr) {
    // Race condition: another request claimed with this phone between our check
    // and insert. Roll back the referral row and surface the duplicate message.
    await supabaseAdmin.from('referrals').delete().eq('id', referralRow.id)
    return {
      blocked: true,
      reason: "Looks like you've already had your welcome meal from us. Pick a plan to keep going.",
    }
  }

  // ── 10. Flag for review if soft signals tripped ────────────────────────────
  if (softFlags.length > 0) {
    await supabaseAdmin
      .from('referral_review_queue')
      .insert({
        referral_id: referralRow.id,
        reason:      'soft_signal',
        flags:       { signals: softFlags },
      })
  }

  // ── 11. Notify ops (log is enough for MVP — hook in email/Slack later) ─────
  console.log(`🎁 Gift claimed: inviter=${inviterCid}, phone=${phoneE164}, dorm=${payload.dormName}`)

  return { ok: true }
}

// ── Conversion credit — called from the Stripe webhook ────────────────────
// Awards the inviter credit when their invitee makes their first paid order.
// Idempotent: safe to call more than once (referral status gate prevents dup credits).
export async function creditInviterOnConversion(inviteeUserId: string): Promise<void> {
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Find a gift_claimed referral for this invitee that hasn't converted yet.
  const { data: referral } = await supabaseAdmin
    .from('referrals')
    .select('id, inviter_cid, inviter_user_id')
    .eq('invitee_user_id', inviteeUserId)
    .eq('status', 'gift_claimed')
    .maybeSingle()

  if (!referral) return  // no referral, or already converted

  // Mark converted.
  await supabaseAdmin
    .from('referrals')
    .update({ status: 'converted', converted_at: new Date().toISOString() })
    .eq('id', referral.id)

  if (!referral.inviter_user_id) return

  // Count this inviter's total paid conversions this calendar month.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { count: monthCount } = await supabaseAdmin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_user_id', referral.inviter_user_id)
    .eq('status', 'converted')
    .gte('converted_at', monthStart)

  // Hard cap: no credit beyond MAX_CONVERSIONS_MONTH per calendar month.
  if ((monthCount ?? 0) > MAX_CONVERSIONS_MONTH) {
    console.log(`ℹ️  Inviter ${referral.inviter_cid} over monthly cap — no credit issued`)
    // Layer 2/3 still fire — cycle counts and lifetime tiers are NOT capped
    // (CONTEXT.md "Critical Constraints", RESEARCH Pitfall #7). Awarder no-ops
    // Layer 2 when activeSub is null; Layer 3 (07-04) will fire either way.
    const activeSub = await fetchActiveSubForAwarder(supabaseAdmin, referral.inviter_user_id)
    await awardCycleAndTierRewards(referral.inviter_user_id, activeSub?.id ?? null)
    return
  }

  // Check if soft flags warrant a hold.
  const { data: reviewItem } = await supabaseAdmin
    .from('referral_review_queue')
    .select('id')
    .eq('referral_id', referral.id)
    .maybeSingle()

  const creditStatus = reviewItem ? 'pending' : 'approved'

  await supabaseAdmin
    .from('credits')
    .insert({
      customer_id: referral.inviter_user_id,
      amount_aed:  20,
      source:      'referral_conversion',
      referral_id: referral.id,
      status:      creditStatus,
    })

  console.log(`✅ Credit AED 20 → inviter ${referral.inviter_cid} (status: ${creditStatus})`)

  // Layer 2/3 reward fire — runs AFTER the Layer 1 credit insert so the
  // cycle/lifetime counts (which both filter on referrals.status='converted')
  // include the conversion we just recorded above.
  const activeSub = await fetchActiveSubForAwarder(supabaseAdmin, referral.inviter_user_id)
  await awardCycleAndTierRewards(referral.inviter_user_id, activeSub?.id ?? null)
}

// ── Helper: locate the inviter's currently-active subscription for cycle context ──
// Per Decision #9, no active sub → Layer 2 awarder no-ops; Layer 3 (07-04) still fires.
// Statuses chosen: Active | Paused | Skipped — these are the live cycle-bearing states.
// Scheduled is intentionally excluded — a not-yet-started sub has no cycle window.
//
// Param typed with explicit generics matching what bare createAdminClient(url,key)
// actually returns (`SupabaseClient<any, "public", "public", any, any>`). A bare
// `ReturnType<typeof createAdminClient>` would narrow schema to `never` and
// reject the call site's wider client (TS overload-resolution oddity).
async function fetchActiveSubForAwarder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>,
  customerId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('customer_id', customerId)
    .in('status', ['Active', 'Paused', 'Skipped'])
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as { id: string } | null
}
