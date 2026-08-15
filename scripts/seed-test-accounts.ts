// scripts/seed-test-accounts.ts
//
// Nine QA accounts covering every plan, week shape, food preference and
// subscription status the app can produce.
//
// Run with:
//   npx tsx scripts/seed-test-accounts.ts seed     — create all nine
//   npx tsx scripts/seed-test-accounts.ts rewind   — re-date them to today
//   npx tsx scripts/seed-test-accounts.ts purge    — delete all nine
//   npx tsx scripts/seed-test-accounts.ts list     — print the login table
//
// Prereq: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
//
// Optional env:
//   QA_EMAIL_BASE  — inbox the logins are plus-tagged from.
//                    Default saadhazari01@gmail.com, so every mail the crons
//                    send lands in one real inbox and nothing bounces.
//   QA_PASSWORD    — shared password for all nine. Default below.
//   QA_REAL_PHONE  — your WhatsApp number in E.164. Only accounts flagged
//                    `useRealPhone` get it (the two that notifications fire
//                    on). Everyone else gets an unroutable +9715000000NN so
//                    the crons cannot spam you. Unset = placeholders for all.
//
// SAFETY: rewind and purge only ever touch the exact nine emails this file
// generates. There is no wildcard delete anywhere in here.
//
// OPS COST (these accounts are seeded into the live DB, by design — there is
// no is_test flag): getKitchenCounts and getDormCounts both count rows with
// status Active | Paused | Skipped, one per SUBSCRIPTION, not per meal. The
// paused and skipped fixtures carry today in paused_dates / skipped_dates, so
// both are filtered out. That leaves the four Active fixtures on a normal day,
// and only two of those on a Saturday (the 5DAYS ones do not deliver). Run
// `list` for the exact veg / non-veg figure to subtract today — it computes
// the same filter chain rather than restating a number that moves with the
// weekday. All nine sit on dorm "Other" (is_delivery_target = false) so they
// land in their own obviously-fake bucket rather than inflating a real dorm.

import path from 'path'
import { randomUUID, createHash } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import {
  PLANS,
  planKindOf,
  totalMealsFor,
  minPriceFilsFor,
  type PlanId,
} from '@/contexts/subscriptions/domain/plans'
import { computeEndDate, isoDate, type WeekType } from '@/contexts/subscriptions/domain/end-date'
import { isVegOnDayName } from '@/contexts/subscriptions/domain/veg-day'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

// ─── config ──────────────────────────────────────────────────────────────────

const EMAIL_BASE = process.env.QA_EMAIL_BASE || 'saadhazari01@gmail.com'
const PASSWORD = process.env.QA_PASSWORD || 'DormersQA!2026'
const REAL_PHONE = process.env.QA_REAL_PHONE || null

/** Every fixture sits here. is_delivery_target = false, so the rider sees one clearly-fake group. */
const QA_DORM = 'Other'

// ─── account spec ────────────────────────────────────────────────────────────

interface AccountSpec {
  slug: string
  name: string
  /** null = no subscription at all (the shell account). */
  planId: PlanId | null
  weekType: WeekType
  /** Canonical customers.meal_preference_type value — see onboarding/data.ts. */
  preference: string
  vegDays: string[] | null
  allergens: string
  spice: string
  status: 'Active' | 'Paused' | 'Scheduled' | 'Ended' | 'Skipped' | null
  /** start_date relative to today, in days. */
  startOffset: number
  /** Entries for skipped_dates, relative to today. */
  skipOffsets: number[]
  /** Entries for paused_dates, relative to today. */
  pauseOffsets: number[]
  outOfZone: boolean
  whatsappVerified: boolean
  useRealPhone: boolean
  /** What this fixture exists to prove. Printed by `list`. */
  covers: string
}

const ACCOUNTS: AccountSpec[] = [
  {
    slug: 'max',
    name: 'QA Max Active',
    planId: 'monthly-max',
    weekType: '6DAYS',
    preference: 'Non Veg',
    vegDays: null,
    allergens: 'Nuts, Dairy',
    spice: 'Medium',
    status: 'Active',
    startOffset: -11,
    skipOffsets: [-4],
    pauseOffsets: [],
    outOfZone: false,
    whatsappVerified: true,
    useRealPhone: true,
    covers: 'Biggest plan, 2 meals/day, mid-cycle, 1 of 3 skips used, allergens shown. Referrer of qa-gift.',
  },
  {
    slug: 'paused',
    name: 'QA Premium Paused',
    planId: 'monthly-premium',
    weekType: '5DAYS',
    preference: 'Religious Preference',
    vegDays: ['Monday', 'Wednesday'],
    allergens: 'None',
    spice: 'Mild',
    status: 'Paused',
    startOffset: -19,
    skipOffsets: [],
    // Includes today, which is what a genuinely paused sub looks like after
    // the daily pause tick — and what keeps it out of the kitchen count.
    pauseOffsets: [-2, -1, 0],
    outOfZone: false,
    whatsappVerified: true,
    useRealPhone: false,
    covers: '5-day week math, religious mix with veg days, Paused state and the resume path.',
  },
  {
    slug: 'weekly',
    name: 'QA Weekly Skipped',
    planId: 'weekly-flex',
    weekType: '6DAYS',
    preference: 'Veg',
    vegDays: null,
    allergens: 'None',
    spice: 'Extra Hot',
    status: 'Skipped',
    startOffset: -3,
    // Today, so the hero renders "skipped today" and the count excludes it.
    skipOffsets: [0],
    pauseOffsets: [],
    outOfZone: false,
    whatsappVerified: true,
    useRealPhone: false,
    covers: 'Weekly plan, no allergens, skipped today, skip allowance used up, pause button disabled.',
  },
  {
    slug: 'trial',
    name: 'QA Trial Today',
    planId: 'trial',
    weekType: '6DAYS',
    preference: 'Non Veg',
    vegDays: null,
    allergens: 'None',
    spice: 'Hot',
    status: 'Active',
    startOffset: 0,
    skipOffsets: [],
    pauseOffsets: [],
    outOfZone: false,
    whatsappVerified: true,
    useRealPhone: false,
    covers: 'One-meal trial dashboard. No pause, no skips. Expires tonight — rerun rewind to revive it.',
  },
  {
    slug: 'renewal',
    name: 'QA Premium Renewal',
    planId: 'monthly-premium',
    weekType: '6DAYS',
    preference: 'Veg',
    vegDays: null,
    allergens: 'Gluten',
    spice: 'Medium',
    status: 'Active',
    startOffset: -25,
    skipOffsets: [-12, -8, -5],
    pauseOffsets: [],
    outOfZone: false,
    whatsappVerified: true,
    useRealPhone: true,
    covers: 'Near end of cycle: renewal nudge, monthly wrap, all 3 skips spent so the skip button is dead.',
  },
  {
    slug: 'ended',
    name: 'QA Ended With Credit',
    planId: 'monthly-max',
    weekType: '5DAYS',
    preference: 'Non Veg',
    vegDays: null,
    allergens: 'Shellfish',
    spice: 'Medium',
    status: 'Ended',
    startOffset: -30,
    skipOffsets: [],
    pauseOffsets: [],
    outOfZone: false,
    whatsappVerified: true,
    useRealPhone: false,
    covers: 'Ended plan holding unapplied credit. Past plans card, renewal with credit, and the intake-pause takeover.',
  },
  {
    slug: 'gift',
    name: 'QA Welcome Gift',
    planId: 'welcome-gift',
    weekType: '6DAYS',
    preference: 'Veg',
    vegDays: null,
    allergens: 'None',
    spice: 'Mild',
    status: 'Scheduled',
    startOffset: 2,
    skipOffsets: [],
    pauseOffsets: [],
    outOfZone: false,
    whatsappVerified: true,
    useRealPhone: false,
    covers: 'Gift plan, Scheduled "starts in N days" hero. Referee of qa-max, referral sits at gift_claimed.',
  },
  {
    slug: 'staff',
    name: 'QA Staff Intern',
    planId: 'staff-monthly',
    weekType: '5DAYS',
    preference: 'Veg',
    vegDays: null,
    allergens: 'None',
    spice: 'Mild',
    status: 'Active',
    startOffset: -9,
    skipOffsets: [],
    pauseOffsets: [],
    outOfZone: false,
    whatsappVerified: true,
    useRealPhone: false,
    covers: 'Intern plan with a live staff_members row. Checkout staff gate, no pause, skips intact.',
  },
  {
    slug: 'shell',
    name: 'QA Blocked Shell',
    planId: null,
    weekType: '6DAYS',
    preference: 'Non Veg',
    vegDays: null,
    allergens: 'None',
    spice: 'Medium',
    status: null,
    startOffset: 0,
    skipOffsets: [],
    pauseOffsets: [],
    outOfZone: true,
    whatsappVerified: false,
    useRealPhone: false,
    covers: 'No plan at all. NoPlanView, out-of-zone banner, and the checkout gate forcing phone re-verification.',
  },
]

// ─── derivations ─────────────────────────────────────────────────────────────

/** Today in UAE wall time, as a UTC-midnight Date (matches end-date.ts convention). */
function uaeToday(): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

/** True iff this date is a delivery day for the week type. Mirrors end-date.ts. */
function isDeliveryDay(d: Date, weekType: WeekType): boolean {
  const js = d.getUTCDay() // 0=Sun … 6=Sat
  if (weekType === '7DAYS') return true
  if (weekType === '6DAYS') return js !== 0
  return js !== 0 && js !== 6
}

function emailFor(slug: string): string {
  const [local, domain] = EMAIL_BASE.split('@')
  const base = local.split('+')[0]
  return `${base}+qa-${slug}@${domain}`
}

function phoneFor(spec: AccountSpec, index: number): string {
  if (spec.useRealPhone && REAL_PHONE) return REAL_PHONE
  return `+9715000000${String(index + 1).padStart(2, '0')}`
}

interface Derived {
  email: string
  phone: string
  planName: string | null
  mealsPerDay: number
  totalMeals: number
  startDate: string
  endDate: string
  skippedDates: string[]
  pausedDates: string[]
  pausedDays: number
  deliveredMeals: number
  pricePerMeal: number
}

function derive(spec: AccountSpec, index: number, today: Date): Derived {
  const email = emailFor(spec.slug)
  const phone = phoneFor(spec, index)

  if (!spec.planId) {
    return {
      email, phone,
      planName: null, mealsPerDay: 0, totalMeals: 0,
      startDate: isoDate(today), endDate: isoDate(today),
      skippedDates: [], pausedDates: [], pausedDays: 0,
      deliveredMeals: 0, pricePerMeal: 0,
    }
  }

  const def = PLANS[spec.planId]
  const start = addDays(today, spec.startOffset)
  const skippedDates = spec.skipOffsets.map((o) => isoDate(addDays(today, o)))
  const pausedDates = spec.pauseOffsets.map((o) => isoDate(addDays(today, o)))

  const end = computeEndDate({
    startDate: start,
    planKind: planKindOf(spec.planId),
    weekType: spec.weekType,
    skipCount: skippedDates.length,
    pauseDays: pausedDates.length,
  })

  const totalMeals = totalMealsFor(spec.planId, spec.weekType)

  // Delivered = delivery days elapsed before today, minus skipped and paused
  // days, times meals per day. Recomputed on every rewind so a re-dated
  // fixture never shows a progress bar that contradicts its own dates.
  let delivered = 0
  if (spec.status === 'Ended') {
    delivered = totalMeals
  } else {
    for (let d = new Date(start); d < today; d = addDays(d, 1)) {
      if (!isDeliveryDay(d, spec.weekType)) continue
      const iso = isoDate(d)
      if (skippedDates.includes(iso) || pausedDates.includes(iso)) continue
      delivered += def.mealsPerDay
    }
    delivered = Math.min(delivered, totalMeals)
  }

  // Fixture pricing uses the code-default floor for the plan and week type.
  // Deliberately not the live plan_pricing overrides — a fixture should not
  // silently change value when someone edits prices in the admin panel.
  const floorFils = minPriceFilsFor(spec.planId, spec.weekType)
  const pricePerMeal = floorFils > 0
    ? Number((floorFils / 100 / totalMeals).toFixed(2))
    : spec.planId === 'staff-monthly'
      ? Number((80 / totalMeals).toFixed(2)) // flat AED 80 intern stipend plan
      : 0                                    // welcome-gift is free

  return {
    email, phone,
    planName: def.label,
    mealsPerDay: def.mealsPerDay,
    totalMeals,
    startDate: isoDate(start),
    endDate: isoDate(end),
    skippedDates,
    pausedDates,
    pausedDays: pausedDates.length,
    deliveredMeals: delivered,
    pricePerMeal,
  }
}

// ─── supabase helpers ────────────────────────────────────────────────────────

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Finds the auth user for an email, or null. Paginates because listUsers has no email filter. */
async function findAuthUser(sb: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === target)
    if (hit) return hit.id
    if (data.users.length < 200) return null
  }
  return null
}

/** CID for a fixture. Deterministic per slug so referral links stay stable across reseeds. */
function cidFor(slug: string): string {
  const h = createHash('sha256').update(`qa:${slug}`).digest('hex').toUpperCase()
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += alphabet[parseInt(h.slice(i * 2, i * 2 + 2), 16) % alphabet.length]
  // OTH = the "Other" dorm's cid_code. 99 marks the block as QA at a glance.
  return `OTH99${suffix}`
}

// Order matters: children before parents. intake_waitlist points at credits,
// credits point at referrals, orders point at subscriptions.
const PURGE_TABLES: Array<{ table: string; column: string }> = [
  { table: 'intake_waitlist', column: 'customer_id' },
  { table: 'credits', column: 'customer_id' },
  { table: 'weekly_reviews', column: 'customer_id' },
  { table: 'monthly_reviews', column: 'customer_id' },
  { table: 'cycle_rewards', column: 'customer_id' },
  { table: 'layer4_rewards', column: 'customer_id' },
  { table: 'lifetime_rewards', column: 'customer_id' },
  { table: 'daily_drops', column: 'customer_id' },
  { table: 'streak_chests', column: 'customer_id' },
  { table: 'streaks', column: 'customer_id' },
  { table: 'customer_notifications', column: 'customer_id' },
  { table: 'comped_meal_ledger', column: 'customer_id' },
  { table: 'admin_customer_emails', column: 'customer_id' },
  { table: 'referral_gifts_claimed', column: 'user_id' },
  { table: 'referrals', column: 'invitee_user_id' },
  { table: 'referrals', column: 'inviter_user_id' },
  { table: 'orders', column: 'customer_id' },
  { table: 'subscriptions', column: 'customer_id' },
  { table: 'staff_members', column: 'customer_id' },
]

// ─── commands ────────────────────────────────────────────────────────────────

async function cmdSeed(sb: SupabaseClient) {
  const today = uaeToday()
  console.log(`Seeding 9 QA accounts. Today in UAE is ${isoDate(today)}.\n`)

  if (!REAL_PHONE) {
    console.log('QA_REAL_PHONE not set — every account gets an unroutable placeholder number.')
    console.log('Set it if you want the notification crons to actually reach you.\n')
  }

  const ids: Record<string, string> = {}

  for (const [index, spec] of ACCOUNTS.entries()) {
    const d = derive(spec, index, today)

    // Auth user. Pre-confirmed, so there is no email link to click.
    let userId = await findAuthUser(sb, d.email)
    if (userId) {
      const { error } = await sb.auth.admin.updateUserById(userId, { password: PASSWORD })
      if (error) throw new Error(`updateUser ${d.email}: ${error.message}`)
      console.log(`  ~ ${d.email} already existed, password reset`)
    } else {
      const { data, error } = await sb.auth.admin.createUser({
        email: d.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name: spec.name, qa_fixture: spec.slug },
      })
      if (error) throw new Error(`createUser ${d.email}: ${error.message}`)
      userId = data.user.id
      console.log(`  + ${d.email}`)
    }
    ids[spec.slug] = userId

    const { error: custErr } = await sb.from('customers').upsert({
      id: userId,
      cid: cidFor(spec.slug),
      email: d.email,
      name: spec.name,
      whatsapp_number: d.phone,
      whatsapp_verified: spec.whatsappVerified,
      whatsapp_verified_at: spec.whatsappVerified ? new Date().toISOString() : null,
      dorm_name: QA_DORM,
      meal_preference_type: spec.preference,
      allergens: spec.allergens,
      spice_level_preference: spec.spice,
      week_type: spec.weekType,
      veg_days: spec.vegDays,
      out_of_zone: spec.outOfZone,
    })
    if (custErr) throw new Error(`customers upsert ${spec.slug}: ${custErr.message}`)

    if (!spec.planId || !spec.status) continue

    // Wipe any prior fixture subscription so reseeding never stacks duplicates
    // (getActiveSubscription would otherwise pick an arbitrary one).
    await sb.from('orders').delete().eq('customer_id', userId)
    await sb.from('subscriptions').delete().eq('customer_id', userId)

    const subId = randomUUID()
    const { error: subErr } = await sb.from('subscriptions').insert({
      id: subId,
      customer_id: userId,
      plan_name: d.planName,
      status: spec.status,
      start_date: d.startDate,
      end_date: d.endDate,
      week_type: spec.weekType,
      meals_per_day: d.mealsPerDay,
      total_meals: d.totalMeals,
      delivered_meals: d.deliveredMeals,
      paused_days: d.pausedDays,
      paused_dates: d.pausedDates,
      pause_date: spec.status === 'Paused' ? new Date().toISOString() : null,
      has_paused_before: d.pausedDates.length > 0,
      skipped_meals_count: d.skippedDates.length,
      skipped_dates: d.skippedDates,
      last_skipped_date: d.skippedDates.length
        ? new Date(`${d.skippedDates[d.skippedDates.length - 1]}T00:00:00Z`).toISOString()
        : null,
      veg_days: spec.vegDays,
      original_start_date: d.startDate,
      staff_approval: spec.planId === 'staff-monthly' ? 'approved' : null,
    })
    if (subErr) throw new Error(`subscriptions insert ${spec.slug}: ${subErr.message}`)

    const { error: ordErr } = await sb.from('orders').insert({
      customer_id: userId,
      subscription_id: subId,
      plan: d.planName,
      meal_preference: spec.preference,
      meals_count: d.totalMeals,
      price_per_meal: d.pricePerMeal,
      invoice_status: 'Paid',
      // Only 'stripe' | 'credit' pass orders_payment_method_check. The real
      // free/gift checkout books itself as 'credit', so the fixture matches it.
      payment_method: spec.planId === 'welcome-gift' ? 'credit' : 'stripe',
      payment_date: new Date(`${d.startDate}T06:00:00Z`).toISOString(),
      webhook_completed_at: new Date(`${d.startDate}T06:00:00Z`).toISOString(),
    })
    if (ordErr) throw new Error(`orders insert ${spec.slug}: ${ordErr.message}`)
  }

  // ── Staff record for the intern fixture ───────────────────────────────────
  await sb.from('staff_members').delete().eq('customer_id', ids.staff)
  const { error: staffErr } = await sb.from('staff_members').insert({
    name: 'QA Staff Intern',
    email: emailFor('staff'),
    whatsapp_number: phoneFor(ACCOUNTS[7], 7),
    status: 'active',
    // Never a usable code — the fixture is already claimed, and this keeps a
    // real claim code from sitting in the DB.
    claim_code_hash: createHash('sha256').update(`qa-seed-not-a-real-code:${randomUUID()}`).digest('hex'),
    code_expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    claimed_at: new Date().toISOString(),
    code_verified_at: new Date().toISOString(),
    customer_id: ids.staff,
    created_by: 'seed-test-accounts',
  })
  if (staffErr) throw new Error(`staff_members insert: ${staffErr.message}`)

  // ── Referral: qa-max invited qa-gift, who claimed the Welcome Meal ────────
  // Left at gift_claimed on purpose. 'converted' means the referee bought a
  // PAID plan, and this one holds a gift plan — marking it converted would be
  // a lie the Dorm Wars hub reads. To watch the referrer's credit land, buy a
  // plan on qa-gift in Stripe test mode and the real code path awards it.
  await sb.from('referrals').delete().eq('inviter_user_id', ids.max)
  await sb.from('referral_gifts_claimed').delete().eq('user_id', ids.gift)
  const { error: refErr } = await sb.from('referrals').insert({
    inviter_cid: cidFor('max'),
    inviter_user_id: ids.max,
    invitee_phone: phoneFor(ACCOUNTS[6], 6),
    invitee_email: emailFor('gift'),
    invitee_user_id: ids.gift,
    invitee_first_name: 'QA',
    status: 'gift_claimed',
    gift_claimed_at: new Date().toISOString(),
  })
  if (refErr) throw new Error(`referrals insert: ${refErr.message}`)

  const { error: giftErr } = await sb.from('referral_gifts_claimed').insert({
    user_id: ids.gift,
    phone_e164: phoneFor(ACCOUNTS[6], 6),
    email_norm: emailFor('gift').toLowerCase(),
    dorm_name: QA_DORM,
  })
  if (giftErr) throw new Error(`referral_gifts_claimed insert: ${giftErr.message}`)

  // ── Unapplied credit on the ended account ─────────────────────────────────
  // eligible_plan_ids null = unrestricted, so it applies to any renewal.
  await sb.from('credits').delete().eq('customer_id', ids.ended)
  const { error: credErr } = await sb.from('credits').insert({
    customer_id: ids.ended,
    amount_aed: 50,
    source: 'layer4_monthly_review',
    status: 'approved',
    eligible_plan_ids: null,
  })
  if (credErr) throw new Error(`credits insert: ${credErr.message}`)

  console.log('')
  await cmdList(sb)
}

async function cmdRewind(sb: SupabaseClient) {
  const today = uaeToday()
  console.log(`Rewinding fixture dates to ${isoDate(today)} (UAE).\n`)

  for (const [index, spec] of ACCOUNTS.entries()) {
    if (!spec.planId || !spec.status) continue
    const d = derive(spec, index, today)
    const userId = await findAuthUser(sb, d.email)
    if (!userId) {
      console.log(`  ! ${d.email} not found — run seed first`)
      continue
    }
    const { error } = await sb
      .from('subscriptions')
      .update({
        status: spec.status,
        start_date: d.startDate,
        end_date: d.endDate,
        delivered_meals: d.deliveredMeals,
        skipped_dates: d.skippedDates,
        skipped_meals_count: d.skippedDates.length,
        paused_dates: d.pausedDates,
        paused_days: d.pausedDays,
        original_start_date: d.startDate,
      })
      .eq('customer_id', userId)
    if (error) throw new Error(`rewind ${spec.slug}: ${error.message}`)
    console.log(`  ~ ${spec.slug.padEnd(8)} ${d.startDate} → ${d.endDate}  (${d.deliveredMeals}/${d.totalMeals} meals)`)
  }
}

async function cmdPurge(sb: SupabaseClient) {
  console.log('Purging the 9 QA accounts. Nothing else is touched.\n')

  for (const spec of ACCOUNTS) {
    const email = emailFor(spec.slug)
    const userId = await findAuthUser(sb, email)
    if (!userId) {
      console.log(`  - ${email} not present`)
      continue
    }
    for (const { table, column } of PURGE_TABLES) {
      const { error } = await sb.from(table).delete().eq(column, userId)
      if (error) console.log(`    ! ${table}.${column}: ${error.message}`)
    }
    const { error: custErr } = await sb.from('customers').delete().eq('id', userId)
    if (custErr) console.log(`    ! customers: ${custErr.message}`)
    const { error: authErr } = await sb.auth.admin.deleteUser(userId)
    if (authErr) console.log(`    ! auth: ${authErr.message}`)
    console.log(`  x ${email}`)
  }
}

async function cmdList(sb: SupabaseClient) {
  const today = uaeToday()
  console.log(`Password for all nine: ${PASSWORD}\n`)
  console.log('slug     email                                     plan             status     window')
  console.log('-'.repeat(104))
  for (const [index, spec] of ACCOUNTS.entries()) {
    const d = derive(spec, index, today)
    const window = spec.planId ? `${d.startDate} → ${d.endDate}` : '—'
    console.log(
      `${spec.slug.padEnd(8)} ${d.email.padEnd(41)} ${(d.planName ?? 'no plan').padEnd(16)} ` +
      `${(spec.status ?? '—').padEnd(10)} ${window}`,
    )
  }
  console.log('')
  for (const spec of ACCOUNTS) {
    console.log(`  ${spec.slug.padEnd(8)} ${spec.covers}`)
  }
  const { veg, nonVeg, dayName } = fixtureOpsImpact(today)
  console.log(`\nAll nine sit on dorm "Other". Today is ${dayName}, so these fixtures add`)
  console.log(`+${veg} veg and +${nonVeg} non-veg to the kitchen display, and a group of`)
  console.log(`${veg + nonVeg} under "Other" on the rider's dorm counts. Subtract those.`)
  void sb
}

/**
 * What the fixtures contribute to today's kitchen and rider counts.
 *
 * Mirrors getKitchenCounts exactly: status in Active|Paused|Skipped, minus
 * the 5DAYS Saturday rule, minus today-in-skipped_dates, minus
 * today-in-paused_dates. Computed rather than stated because the answer moves
 * with the weekday — on Saturday the two 5DAYS fixtures drop out on their own.
 */
function fixtureOpsImpact(today: Date): { veg: number; nonVeg: number; dayName: string } {
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(today)
  const todayIso = isoDate(today)
  const isSaturday = today.getUTCDay() === 6

  let veg = 0
  let nonVeg = 0
  for (const [index, spec] of ACCOUNTS.entries()) {
    if (!spec.planId || !spec.status) continue
    if (!['Active', 'Paused', 'Skipped'].includes(spec.status)) continue
    if (spec.weekType === '5DAYS' && isSaturday) continue
    const d = derive(spec, index, today)
    if (d.skippedDates.includes(todayIso) || d.pausedDates.includes(todayIso)) continue
    if (isVegOnDayName(spec.preference, spec.vegDays, dayName)) veg++
    else nonVeg++
  }
  return { veg, nonVeg, dayName }
}

// ─── entry ───────────────────────────────────────────────────────────────────

async function main() {
  const cmd = (process.argv[2] || 'list').toLowerCase()
  const sb = admin()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (cmd !== 'list') console.log(`Target: ${url}\n`)

  switch (cmd) {
    case 'seed': return cmdSeed(sb)
    case 'rewind': return cmdRewind(sb)
    case 'purge': return cmdPurge(sb)
    case 'list': return cmdList(sb)
    default:
      console.error(`Unknown command "${cmd}". Use: seed | rewind | purge | list`)
      process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
