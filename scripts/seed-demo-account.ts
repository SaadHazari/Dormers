// scripts/seed-demo-account.ts
//
// One fully lived-in customer an investor can sign into on dormers.ae from
// their own phone: Religious Preference on Monthly Premium, about a week of
// dinners delivered with a skip and a pause in between, ten friends converted
// this cycle (third monthly milestone), fifty lifetime (tier 3, the jacket),
// and the wallet those rewards would have paid.
//
// Run with:
//   npx tsx scripts/seed-demo-account.ts seed    — create, or wipe and re-create re-dated to today
//   npx tsx scripts/seed-demo-account.ts purge   — delete the account and everything it owns
//   npx tsx scripts/seed-demo-account.ts list    — print the login
//
// `seed` is safe to re-run the morning of a demo: the login stays the same,
// every date is recomputed from today, and whatever the investor clicked last
// time is reset.
//
// Optional env: DEMO_EMAIL, DEMO_PASSWORD, DEMO_PHONE (E.164; the WhatsApp
// confirmations the investor triggers go here). Without DEMO_PHONE a re-seed
// keeps whatever number the account already has — on 2026-09-17 it was set
// straight from SQL to vault's admin_alert_phone_e164, so the number never
// sits in this repo.
//
// WHY THIS IS SAFE ON THE LIVE DATABASE: customers.is_demo = true. The season
// break rules skip the account, the kitchen and rider counts leave it out, it
// never appears in other students' activity feed, and checkout refuses it
// (supabase/migrations/20260917_demo_account.sql, intakeForCustomer). The 50
// referral rows point at no real customer. purge only touches the one email,
// and only when that customer is flagged is_demo.

import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import { totalMealsFor } from '@/contexts/subscriptions/domain/plans'
import { exactPriceFils } from '@/contexts/subscriptions/domain/pricing'
import { computeEndDate, isoDate } from '@/contexts/subscriptions/domain/end-date'
import { cashForLifetimeConversion, LIFETIME_TIERS } from '@/contexts/dorm-wars/domain/constants'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const EMAIL = process.env.DEMO_EMAIL || 'saadhazari01+demo@gmail.com'
const PASSWORD = process.env.DEMO_PASSWORD || 'DormersDemo2026!'
const PLACEHOLDER_PHONE = '+971500000090'
const NAME = 'Adam Rahman'
const DORM = 'The Myriad'
const CID = 'MYR90DEMO'
const VEG_DAYS = ['Monday', 'Thursday']
const PLAN_LABEL = 'Monthly Premium'
const WEEK = '6DAYS' as const

const CURRENT_FRIENDS = ['Omar', 'Aisha', 'Yusuf', 'Hana', 'Zain', 'Maryam', 'Rayan', 'Layla', 'Ibrahim', 'Noor']
const PAST_FRIENDS = [
  'Ali', 'Sara', 'Hamza', 'Fatima', 'Bilal', 'Amira', 'Khalid', 'Salma', 'Tariq', 'Dina',
  'Faisal', 'Rania', 'Hassan', 'Leena', 'Adil', 'Yasmin', 'Saif', 'Huda', 'Kareem', 'Nadia',
  'Imran', 'Reem', 'Majid', 'Samira', 'Nabil', 'Farah', 'Rashid', 'Mona', 'Sami', 'Dana',
  'Jamal', 'Lina', 'Nasser', 'Rula', 'Waleed', 'Iman', 'Tamer', 'Ghada', 'Ziad', 'Hiba',
]

// ─── dates ───────────────────────────────────────────────────────────────────

function uaeNow(): { today: Date; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { today: new Date(Date.UTC(get('year'), get('month') - 1, get('day'))), hour: get('hour') % 24 }
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

const isDeliveryDay = (d: Date) => d.getUTCDay() !== 0 // 6DAYS: Mon–Sat

/** A timestamp on a given day, UAE evening-ish, as ISO. */
const at = (d: Date, hourUtc = 14) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourUtc)).toISOString()

interface Plan {
  start: Date
  skip: Date
  pause: Date
  end: Date
  delivered: number
  lastTick: string | null
  deliveredDays: Date[]
}

/**
 * The last nine delivery days that have already been cooked: start on the
 * first, skip the fourth, pause the seventh (resumed the next day). Seven
 * dinners delivered. Once tonight's 20:00 tick has run, today is one of the
 * nine — the tick has already banked it, so the count must include it.
 */
function planFor(today: Date, hour: number, closures: Set<string>): Plan {
  const tickRan = hour >= 20
  const days: Date[] = []
  for (let d = tickRan ? today : addDays(today, -1); days.length < 9; d = addDays(d, -1)) {
    if (isDeliveryDay(d) && !closures.has(isoDate(d))) days.unshift(d)
  }
  const [start, , , skip, , , pause] = days
  const deliveredDays = days.filter((d) => d !== skip && d !== pause)
  let closureDays = 0
  for (let d = start; d <= days[8]; d = addDays(d, 1)) if (isDeliveryDay(d) && closures.has(isoDate(d))) closureDays++
  const end = computeEndDate({ startDate: start, planKind: 'monthly', weekType: WEEK, skipCount: 1, pauseDays: 1 + closureDays })
  const lastTick = tickRan && isDeliveryDay(today) && !closures.has(isoDate(today)) ? isoDate(today) : null
  return { start, skip, pause, end, delivered: deliveredDays.length, lastTick, deliveredDays }
}

// ─── supabase ────────────────────────────────────────────────────────────────

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

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

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

/** Everything the account owns except the customers row and the login. Children first. */
async function wipeOwned(sb: SupabaseClient, id: string) {
  const byCustomer = [
    'credits', 'cycle_rewards', 'lifetime_rewards', 'layer4_rewards', 'streak_chests', 'streaks', 'daily_drops',
    'weekly_reviews', 'monthly_reviews', 'customer_notifications', 'season_notices', 'season_holds',
    'plan_refunds', 'refund_credit_notes', 'comped_meal_ledger', 'intake_waitlist', 'broadcast_sends',
  ]
  for (const table of byCustomer) await must(`wipe ${table}`, sb.from(table).delete().eq('customer_id', id))
  await must('wipe referrals', sb.from('referrals').delete().eq('inviter_user_id', id))
  await must('wipe orders', sb.from('orders').delete().eq('customer_id', id))
  await must('wipe subscriptions', sb.from('subscriptions').delete().eq('customer_id', id))
}

/** Refuses to touch a customer that is not flagged demo. */
async function assertDemo(sb: SupabaseClient, id: string) {
  const row = await must('read customer', sb.from('customers').select('is_demo').eq('id', id).maybeSingle())
  if (row && (row as { is_demo: boolean }).is_demo !== true) {
    throw new Error(`${EMAIL} exists and is NOT a demo account. Refusing to touch it.`)
  }
}

// ─── commands ────────────────────────────────────────────────────────────────

async function cmdSeed(sb: SupabaseClient) {
  const closureRows = await must('closures', sb.from('company_closures').select('closure_date'))
  const closures = new Set((closureRows as Array<{ closure_date: string }>).map((r) => String(r.closure_date).slice(0, 10)))
  const { today, hour } = uaeNow()
  const plan = planFor(today, hour, closures)

  // Login
  let id = await findAuthUser(sb, EMAIL)
  let phone = process.env.DEMO_PHONE || PLACEHOLDER_PHONE
  if (id) {
    await assertDemo(sb, id)
    const existing = await must('read phone', sb.from('customers').select('whatsapp_number').eq('id', id).maybeSingle()) as { whatsapp_number: string | null } | null
    if (!process.env.DEMO_PHONE && existing?.whatsapp_number) phone = existing.whatsapp_number
    const { error } = await sb.auth.admin.updateUserById(id, { password: PASSWORD, email_confirm: true })
    if (error) throw new Error(`updateUser: ${error.message}`)
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { name: NAME, demo: true },
    })
    if (error) throw new Error(`createUser: ${error.message}`)
    id = data.user.id
  }

  // is_demo goes on first: the season triggers read it when the plan is inserted.
  await must('customers upsert', sb.from('customers').upsert({
    id,
    cid: CID,
    email: EMAIL,
    name: NAME,
    whatsapp_number: phone,
    whatsapp_verified: true,
    whatsapp_verified_at: at(addDays(plan.start, -40)),
    dorm_name: DORM,
    meal_preference_type: 'Religious Preference',
    veg_days: VEG_DAYS,
    allergens: 'None',
    spice_level_preference: 'Medium',
    week_type: WEEK,
    out_of_zone: false,
    is_demo: true,
    early_access: true, // lifetime tier 2 perk
    hall_wall: false,   // tier 4 only
    dorm_wars_tour_completed_at: null, // the tour plays on first visit
    created_at: '2026-01-20T09:00:00Z',
  }))

  await wipeOwned(sb, id)

  const totalMeals = totalMealsFor('monthly-premium', WEEK)
  const priceFils = exactPriceFils('Monthly Premium', 'Religious', VEG_DAYS.length, WEEK)
  const pricePerMeal = Number((priceFils / 100 / totalMeals).toFixed(2))

  // ── Last semester's plan, finished ────────────────────────────────────────
  const pastStart = new Date(Date.UTC(2026, 2, 2)) // Mon 2 Mar 2026
  const pastEnd = computeEndDate({ startDate: pastStart, planKind: 'monthly', weekType: WEEK, skipCount: 0, pauseDays: 0 })
  const pastSub = await must('past subscription', sb.from('subscriptions').insert({
    customer_id: id, plan_name: PLAN_LABEL, status: 'Ended', week_type: WEEK, meals_per_day: 1,
    start_date: isoDate(pastStart), end_date: isoDate(pastEnd), original_start_date: isoDate(pastStart),
    total_meals: totalMeals, delivered_meals: totalMeals, last_delivery_tick_date: isoDate(pastEnd),
    veg_days: VEG_DAYS, created_at: at(addDays(pastStart, -2), 8),
  }).select('id').single()) as { id: string }
  const pastOrder = await must('past order', sb.from('orders').insert({
    customer_id: id, subscription_id: pastSub.id, plan: PLAN_LABEL, meal_preference: 'Religious Preference',
    meals_count: totalMeals, price_per_meal: pricePerMeal, invoice_status: 'Paid', payment_method: 'stripe',
    amount_paid_fils: priceFils, credit_applied_fils: 0,
    payment_date: at(addDays(pastStart, -2), 8), webhook_completed_at: at(addDays(pastStart, -2), 8),
    created_at: at(addDays(pastStart, -2), 8),
  }).select('id').single()) as { id: string }

  // ── This month's plan ─────────────────────────────────────────────────────
  const bought = addDays(plan.start, -2)
  const sub = await must('subscription', sb.from('subscriptions').insert({
    customer_id: id, plan_name: PLAN_LABEL, status: 'Active', week_type: WEEK, meals_per_day: 1,
    start_date: isoDate(plan.start), end_date: isoDate(plan.end), original_start_date: isoDate(plan.start),
    total_meals: totalMeals, delivered_meals: plan.delivered, last_delivery_tick_date: plan.lastTick,
    skipped_dates: [isoDate(plan.skip)], skipped_meals_count: 1, last_skipped_date: at(plan.skip, 0),
    paused_dates: [isoDate(plan.pause)], paused_days: 1, has_paused_before: true, pause_date: null,
    last_pause_tick_date: isoDate(plan.pause),
    veg_days: VEG_DAYS, created_at: at(bought, 8),
  }).select('id, status, season_hold_id').single()) as { id: string; status: string; season_hold_id: string | null }
  if (sub.status !== 'Active' || sub.season_hold_id) {
    throw new Error(`The plan was held (status ${sub.status}). Is the demo_account migration applied?`)
  }
  await must('order', sb.from('orders').insert({
    customer_id: id, subscription_id: sub.id, plan: PLAN_LABEL, meal_preference: 'Religious Preference',
    meals_count: totalMeals, price_per_meal: pricePerMeal, invoice_status: 'Paid', payment_method: 'stripe',
    amount_paid_fils: priceFils, credit_applied_fils: 0,
    payment_date: at(bought, 8), webhook_completed_at: at(bought, 8), created_at: at(bought, 8),
  }))

  // ── Fifty friends: forty last semester, ten this cycle ────────────────────
  // Past conversions are spread over Feb–May 2026. This cycle's ten land on
  // the plan's own delivery days, so every one counts toward the cycle.
  const pastDates = PAST_FRIENDS.map((_, i) => new Date(Date.UTC(2026, 1, 3) + Math.round(i * (105 / 40)) * 86_400_000))
  const currentDates = CURRENT_FRIENDS.map((_, i) => {
    const pool = [...plan.deliveredDays, plan.skip, plan.pause].sort((a, b) => +a - +b)
    return pool[Math.min(pool.length - 1, Math.floor((i * pool.length) / CURRENT_FRIENDS.length))]
  })
  const friends = [
    ...PAST_FRIENDS.map((name, i) => ({ name, day: pastDates[i], current: false })),
    ...CURRENT_FRIENDS.map((name, i) => ({ name, day: currentDates[i], current: true })),
  ]
  const referralRows = friends.map((f, i) => ({
    inviter_cid: CID,
    inviter_user_id: id,
    invitee_phone: `+9715099${String(i + 1).padStart(5, '0')}`, // unroutable, one per friend
    invitee_first_name: f.name,
    status: 'converted',
    created_at: at(addDays(f.day, -3), 9 + (i % 5)),
    gift_claimed_at: at(addDays(f.day, -2), 9 + (i % 5)),
    converted_at: at(f.day, 9 + (i % 5)),
  }))
  const referrals = await must('referrals', sb.from('referrals').insert(referralRows).select('id, converted_at')) as Array<{ id: string; converted_at: string }>
  referrals.sort((a, b) => a.converted_at.localeCompare(b.converted_at))

  // Layer 1 cash, one row per conversion at the rung it fell into. Last
  // semester's was spent on plans; this cycle's is in the wallet.
  const credits: Array<Record<string, unknown>> = referrals.map((r, i) => {
    const current = i >= PAST_FRIENDS.length
    return {
      customer_id: id,
      amount_aed: cashForLifetimeConversion(i + 1),
      source: 'referral_conversion',
      referral_id: r.id,
      status: current ? 'approved' : 'applied',
      applied_at: current ? null : new Date(new Date(r.converted_at).getTime() + 5 * 86_400_000).toISOString(),
      created_at: r.converted_at,
    }
  })

  // Layer 2: this cycle's milestones at 3, 6 and 10 recruits.
  const cycleConv = referrals.slice(PAST_FRIENDS.length)
  const milestones = [
    { at: 3, kind: 'mystery_drop', value: 40 },
    { at: 6, kind: 'free_week', value: Math.round(pricePerMeal * 6) },
    { at: 10, kind: 'free_month', value: Math.round(pricePerMeal * totalMeals) },
  ]
  for (const m of milestones) {
    const when = cycleConv[m.at - 1].converted_at
    await must(`cycle reward ${m.at}`, sb.from('cycle_rewards').insert({
      customer_id: id, subscription_id: sub.id, milestone: m.at, kind: m.kind, value_aed: m.value, awarded_at: when,
    }))
    credits.push({
      customer_id: id, amount_aed: m.value, source: `cycle_milestone_${m.at}`, status: 'approved',
      subscription_id: sub.id, created_at: when,
    })
  }
  await must('credits', sb.from('credits').insert(credits))

  // Layer 3: lifetime tiers 1–3, each at the conversion that unlocked it.
  for (const t of LIFETIME_TIERS.filter((t) => t.tier <= 3)) {
    await must(`lifetime tier ${t.tier}`, sb.from('lifetime_rewards').insert({
      customer_id: id, tier: t.tier, perk: t.perk, awarded_at: referrals[t.at - 1].converted_at,
    }))
  }

  // Nine-day visit streak through yesterday.
  await must('streak', sb.from('streaks').insert({
    customer_id: id, count: 9, last_visit_date_utc: isoDate(addDays(today, -1)), last_chest_day: 7,
  }))

  const wallet = credits.filter((c) => c.status === 'approved').reduce((s, c) => s + Number(c.amount_aed), 0)
  console.log(`Seeded ${EMAIL} (${id}). Today in UAE is ${isoDate(today)}.`)
  console.log(`  plan     ${PLAN_LABEL}, Religious (veg ${VEG_DAYS.join(' + ')}), ${isoDate(plan.start)} → ${isoDate(plan.end)}`)
  console.log(`  meals    ${plan.delivered}/${totalMeals} delivered · skipped ${isoDate(plan.skip)} · paused ${isoDate(plan.pause)}`)
  console.log(`  friends  ${referrals.length} lifetime (tier 3) · ${cycleConv.length} this cycle (milestone 10)`)
  console.log(`  wallet   AED ${wallet} to spend · past order ${pastOrder.id.slice(0, 8)}`)
  console.log('')
  cmdList()
}

async function cmdPurge(sb: SupabaseClient) {
  const id = await findAuthUser(sb, EMAIL)
  if (!id) {
    console.log(`${EMAIL} not present.`)
    return
  }
  await assertDemo(sb, id)
  await wipeOwned(sb, id)
  await must('contacts', sb.from('contacts').delete().eq('customer_id', id))
  await must('customers', sb.from('customers').delete().eq('id', id))
  // Last, or on_auth_user_created recreates a blank customer on the next sign-in.
  const { error } = await sb.auth.admin.deleteUser(id)
  if (error) throw new Error(`deleteUser: ${error.message}`)
  console.log(`Purged ${EMAIL}.`)
}

function cmdList() {
  console.log('Investor login — https://dormers.ae/login')
  console.log(`  email     ${EMAIL}`)
  console.log(`  password  ${PASSWORD}`)
}

async function main() {
  const cmd = (process.argv[2] || 'list').toLowerCase()
  if (cmd === 'list') return cmdList()
  const sb = admin()
  console.log(`Target: ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`)
  if (cmd === 'seed') return cmdSeed(sb)
  if (cmd === 'purge') return cmdPurge(sb)
  console.error(`Unknown command "${cmd}". Use: seed | purge | list`)
  process.exit(1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
