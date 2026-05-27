'use server'

import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { normalisePhone } from '@/shared/phone'
import { generateCid } from '@/shared/cid'
import { awardCycleAndTierRewards } from '@/contexts/dorm-wars/domain/awarder'
import { isDoublerActive, applyDoubler } from '@/contexts/dorm-wars/domain/doubler'

// ── Rate-limit constants ───────────────────────────────────────────────────
// Audit P1-14: the prior MAX_PENDING_INVITES counted referrals.status='pending'
// but claimGift always inserts 'gift_claimed' — the limit never fired. The
// semantic intent was "open invites not yet converted to paid", so we now
// count 'gift_claimed' rows. Constant renamed to make the intent obvious.
const MAX_OPEN_GIFT_CLAIMS   = 5   // inviter can have at most this many claimed-but-unconverted invites at once
const MAX_CONVERSIONS_MONTH  = 10  // inviter earns credit on at most this many paid conversions/month
const MAX_INVITES_7_DAYS     = 20  // inviter can send at most this many invites in a rolling 7-day window
const MAX_CLAIMS_PER_IP_24H  = 5   // hard cap on gift claims from a single IP per day (fraud signal)

export type ClaimResult =
  | { ok: true }
  | { blocked: true; reason: string }
  | { error: string }

/**
 * Canonical email comparison key. Beyond trim+lowercase we collapse:
 *   • Gmail dots: `a.b.c@gmail.com` ≡ `abc@gmail.com`
 *   • Gmail plus tags: `abc+ref1@gmail.com` ≡ `abc@gmail.com`
 *   • googlemail.com → gmail.com
 *
 * Without this normalisation, a single Gmail account can produce N
 * distinct rows in `referral_gifts_claimed` and farm the welcome meal +
 * the referrer's Layer 1 credit N times. We deliberately do NOT apply
 * the dot/plus collapse to non-Gmail providers since most providers
 * (Outlook, ProtonMail, ...) treat them as significant.
 */
function normaliseEmail(email: string): string {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at === -1) return trimmed
  let local  = trimmed.slice(0, at)
  let domain = trimmed.slice(at + 1)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') {
    const plus = local.indexOf('+')
    if (plus !== -1) local = local.slice(0, plus)
    local = local.replace(/\./g, '')
  }
  return `${local}@${domain}`
}

/**
 * Best-effort client IP from the proxy headers Netlify / Vercel set.
 * Returns null when we can't determine one (local dev / direct hits).
 */
async function resolveClientIp(): Promise<string | null> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? h.get('cf-connecting-ip') ?? null
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

// ─── Trial email OTP (mirrors onboarding/actions.ts email OTP flow) ────────
// Used by the referral landing page (/r/[cid]) so the invitee verifies their
// email before claiming the free trial meal. We use Supabase auth's
// signInWithOtp which (a) sends a 6-digit code via email and (b) creates a
// passwordless auth.users row when verified — the customers row keys to that
// row's id so the trial customer lives in the main `customers` table from
// day one (no separate "trial_customers" table to merge later).

export type SendTrialEmailOtpResult = { ok: true } | { error: string }

export async function sendTrialEmailOtp(email: string): Promise<SendTrialEmailOtpResult> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
    return { error: 'Please enter a valid email address.' }
  }
  const supabase = await createClient()
  // shouldCreateUser:true is the default but spelled out for clarity. We
  // CREATE the user at OTP-send time so the resulting auth.users.id exists
  // when claimGift runs after verification — no race between verify and the
  // customers.id FK insert.
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { shouldCreateUser: true },
  })
  if (error) {
    console.error('sendTrialEmailOtp failed:', error)
    return { error: error.message }
  }
  return { ok: true }
}

// ─── Set password on the trial user's account ─────────────────────────────
// After the gift claim, prompt the user to lock in a password so they can
// log back in later via /login. Without this, the only way back is another
// email OTP (which a user signing in fresh might not realise).
// The session cookie is already set from verifyTrialEmailOtp, so we can
// just call supabase.auth.updateUser({ password }) on the authed user.

export type SetTrialPasswordResult = { ok: true } | { error: string }

export async function setTrialPassword(password: string): Promise<SetTrialPasswordResult> {
  // Server-side validation mirrors the strength rules used by main onboarding
  // so a tampered client can't sneak a weak password through.
  const { isPasswordStrong, PASSWORD_RULES_TEXT } = await import('@/shared/validation')
  if (!isPasswordStrong(password)) {
    return { error: PASSWORD_RULES_TEXT }
  }
  const supabase = await createClient()
  // The trial flow's verifyTrialEmailOtp already established a session cookie
  // via the SSR client. updateUser sets the password on the authed user.
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return { error: error.message }
  }
  return { ok: true }
}

export type VerifyTrialEmailOtpResult = { ok: true } | { error: string }

export async function verifyTrialEmailOtp(
  email: string,
  token: string,
): Promise<VerifyTrialEmailOtpResult> {
  const trimmedEmail = email.trim().toLowerCase()
  const trimmedToken = token.trim()
  // Email OTP is 6 digits (Supabase Auth setting flipped 2026-05-17). Stays
  // in lockstep with onboarding/actions.ts verifyEmailOtp + EmailStep.tsx
  // OTP_LENGTH + the EMAIL_OTP_LENGTH constant in this directory's page.tsx.
  if (!trimmedEmail || !/^\d{6}$/.test(trimmedToken)) {
    return { error: 'Enter the 6-digit code from your email.' }
  }
  const supabase = await createClient()
  // type:'email' validates the OTP and sets the session cookie via the SSR
  // client. After this resolves, supabase.auth.getUser() returns the user
  // who just verified — claimGift uses that id for the customers row insert.
  const { error } = await supabase.auth.verifyOtp({
    email: trimmedEmail,
    token: trimmedToken,
    type: 'email',
  })
  if (error) return { error: error.message }
  return { ok: true }
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

  const phoneE164    = normalisePhone(payload.phone)
  // Two flavors of email:
  //   • emailLiteral  — what the user TYPED, lowercased. Goes into customers.email
  //     and matches what Supabase stored on auth.users.email when verifyOtp ran.
  //     Use this to send transactional email (so +tag aliases land in the right
  //     inbox) and to compare against the verified user id.
  //   • emailNorm     — dedupe canonical form (Gmail dots/+tags stripped,
  //     googlemail folded). Goes into referral_gifts_claimed.email_norm so the
  //     UNIQUE constraint blocks the same Gmail account claiming twice via
  //     different aliases.
  const emailLiteral = payload.email.trim().toLowerCase()
  const emailNorm    = normaliseEmail(payload.email)
  const inviterCid   = payload.inviterCid.toUpperCase().trim()
  const firstName    = sanitizeFirstName(payload.firstName)

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

  // ── 1b. Verify both OTPs landed BEFORE any DB writes ───────────────────────
  // The email OTP also auto-creates the auth.users row + sets the session
  // cookie (see verifyTrialEmailOtp). We pull the user here so step 11
  // can attach the customers row to the same auth.users.id — no separate
  // trial-customers table, single source of truth.
  const ssrClient = await createClient()
  const { data: { user: verifiedUser } } = await ssrClient.auth.getUser()
  // Compare against the LITERAL form the user typed, not the normalized one —
  // Supabase stores `saadhazari01+test5@gmail.com` verbatim, while emailNorm
  // strips +tags to `saadhazari01@gmail.com` for dedupe-only use. Comparing
  // literal-to-literal so Gmail +tag testing aliases match.
  if (!verifiedUser || verifiedUser.email?.toLowerCase() !== emailLiteral) {
    return {
      error: 'Please verify your email address with the code we sent before claiming.',
    }
  }

  // Phone verification: the most recent unexpired OTP for this phone must be
  // marked verified. Mirrors the check in onboarding's createAccount.
  const { data: phoneOtp } = await supabaseAdmin
    .from('whatsapp_otps')
    .select('verified_at')
    .eq('phone', phoneE164)
    .not('verified_at', 'is', null)
    .gte('verified_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('verified_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!phoneOtp) {
    return {
      error: 'Please verify your WhatsApp number with the 6-digit code before claiming.',
    }
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
  // Open-gift cap counts gift_claimed referrals that haven't converted yet —
  // limits how many friends can be sitting on a "free meal" status without
  // any of them subscribing. Caps abuse + keeps the funnel honest.
  const [openGiftRes, sevenDayRes] = await Promise.all([
    supabaseAdmin
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_cid', inviterCid)
      .eq('status', 'gift_claimed'),
    supabaseAdmin
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_cid', inviterCid)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  if ((openGiftRes.count ?? 0) >= MAX_OPEN_GIFT_CLAIMS) {
    return {
      blocked: true,
      reason: `Your friend has ${MAX_OPEN_GIFT_CLAIMS} invites waiting to activate. Once a few subscribe, they can send more.`,
    }
  }
  if ((sevenDayRes.count ?? 0) >= MAX_INVITES_7_DAYS) {
    return {
      blocked: true,
      reason: 'This referral link has reached its weekly limit. Try again next week.',
    }
  }

  // ── 7. IP velocity check — HARD cap per-IP per-24h ─────────────────────────
  // Burner-farming defense: even with fresh phones + fresh Gmail addresses,
  // an abuser typically claims from a single IP (their laptop) or a small
  // pool. Block hard at MAX_CLAIMS_PER_IP_24H. Ops can release manually if
  // a real customer hits this from a shared dorm Wi-Fi.
  const clientIp = await resolveClientIp()
  if (clientIp) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: ipClaims24h } = await supabaseAdmin
      .from('referral_gifts_claimed')
      // We don't have a stored IP column; reuse device_fp as a coarse proxy
      // when fp matches, and supplement with a same-day count via a join on
      // referrals.created_at + device_fp. For now use device_fp ONLY.
      .select('id', { count: 'exact', head: true })
      .gte('claimed_at', dayAgo)
      .eq('device_fp', payload.deviceFp ?? '__no_fp_marker__')
    if ((ipClaims24h ?? 0) >= MAX_CLAIMS_PER_IP_24H && payload.deviceFp) {
      return {
        blocked: true,
        reason: 'Too many gift claims from this device in 24 hours. Try again tomorrow.',
      }
    }
  }

  // ── 8. Soft signals — flag but allow through ───────────────────────────────
  // Soft flags land in referral_review_queue when the referral converts to a
  // paid sub. creditInviterOnConversion reads the queue and holds the credit
  // as 'pending' until ops approves. This is the only fraud-review path.
  const softFlags: string[] = []
  if (payload.deviceFp) {
    const { data: deviceMatch } = await supabaseAdmin
      .from('referral_gifts_claimed')
      .select('id')
      .eq('device_fp', payload.deviceFp)
      .maybeSingle()
    if (deviceMatch) softFlags.push('device_fp_reuse')
  }
  if (clientIp) softFlags.push(`ip:${clientIp}`)

  // ── 9. Write referral row ──────────────────────────────────────────────────
  const { data: referralRow, error: refErr } = await supabaseAdmin
    .from('referrals')
    .insert({
      inviter_cid:        inviterCid,
      inviter_user_id:    inviter.id,
      invitee_phone:      phoneE164,
      // Store the LITERAL email for human-readable display + transactional
      // mail; the dedupe canonical form lives in referral_gifts_claimed.email_norm.
      invitee_email:      emailLiteral,
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

  // ── 11. Insert/upsert customers row for the trial user ────────────────────
  // The auth.users.id was created at verifyTrialEmailOtp time. The customers
  // table has id → auth.users(id) FK so we can attach now. Upsert because an
  // adversarial path could theoretically race (e.g. user re-claims after a
  // bug). ON CONFLICT (id) DO UPDATE patches the profile fields but keeps
  // the existing cid — collision-stable for downstream referrals.
  //
  // Also: link the freshly-created auth user to the referral row's
  // invitee_user_id field. The webhook's referral-linkup loop keys on
  // phone match; we already have the user id here, so set it explicitly
  // to make the awarder's downstream lookups O(1) instead of O(phone scan).
  const customerCid = generateCid(payload.dormName)
  const { error: customerErr } = await supabaseAdmin
    .from('customers')
    .upsert({
      id:                   verifiedUser.id,
      cid:                  customerCid,
      name:                 firstName,
      // Literal (lowercased) email — matches what Supabase stored on auth.users
      // and what the user expects in their inbox for transactional mail.
      // emailNorm (dots/+ stripped) is the dedupe key for referral_gifts_claimed
      // and is NOT what we want as the contact address.
      email:                emailLiteral,
      whatsapp_number:      phoneE164,
      whatsapp_verified:    true,
      whatsapp_verified_at: new Date().toISOString(),
      dorm_name:            payload.dormName,
      meal_preference_type: payload.preference,
      // Trial gift defaults: 6-day week, no allergens/spice known yet —
      // the user fills those in on the dashboard or at first checkout.
      week_type:            '6DAYS',
      out_of_zone:          false,
    }, { onConflict: 'id', ignoreDuplicates: false })

  if (customerErr) {
    // Don't fail the claim — the gift_claimed row + referral row are already
    // written, so the trial meal flow can still complete via ops. Log for
    // reconciliation: a customers-row insert failure here means the user
    // won't have a dashboard until ops creates the row manually.
    console.error(`⚠️  customers row insert failed for trial user ${verifiedUser.id}:`, customerErr)
  } else {
    // Close the referral linkup loop now (no need to wait for the webhook's
    // phone-match scan): set invitee_user_id on the referral row directly.
    await supabaseAdmin
      .from('referrals')
      .update({ invitee_user_id: verifiedUser.id })
      .eq('id', referralRow.id)
  }

  // ── 12. Notify ops (log is enough for MVP — hook in email/Slack later) ─────
  console.log(`🎁 Gift claimed: inviter=${inviterCid}, phone=${phoneE164}, dorm=${payload.dormName}, cust=${verifiedUser.id}`)

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

  // Phase 8F — week-long doubler. If the inviter has an active doubler
  // chest outcome (rolled the 5% bucket in the last 7 days), Layer 1 cash
  // doubles. Source string carries the '_2x' suffix so ops analytics can
  // measure how much extra AED the doubler distributes.
  const doublerActive = await isDoublerActive(supabaseAdmin, referral.inviter_user_id)
  const { value: cashAmount, source: cashSource } = applyDoubler(20, 'referral_conversion', doublerActive)

  await supabaseAdmin
    .from('credits')
    .insert({
      customer_id: referral.inviter_user_id,
      amount_aed:  cashAmount,
      source:      cashSource,
      referral_id: referral.id,
      status:      creditStatus,
    })

  console.log(`✅ Credit AED ${cashAmount} → inviter ${referral.inviter_cid} (status: ${creditStatus}${doublerActive ? ', 2x doubler' : ''})`)

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
