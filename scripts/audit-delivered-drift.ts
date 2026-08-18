// scripts/audit-delivered-drift.ts
//
// Counter-vs-calendar reconciliation for every subscription.
//
// The dashboard progress grids (PlanProgress.tsx, MobileHome.tsx) derive each
// cell's "delivered" state from the CALENDAR: every working day in
// [start_date, end_date] before AE-today that is not in skipped_dates or
// paused_dates paints orange. The headline numbers ("N delivered", "N of M
// meals left") come from the delivered_meals COUNTER, incremented by the
// 20:00 AE subscription_delivery_tick cron. Two sources of truth: if they
// ever disagree, the customer sees a grid that contradicts its own legend
// (the Aug 2026 "20 delivered, 21 orange cells" QA bug).
//
// This script recomputes the calendar-implied count for every subscription
// and compares it to the counter. Run it:
//   npx tsx scripts/audit-delivered-drift.ts     (or npm run check:delivered-drift)
//
// Exit codes: 0 = clean, 1 = drift on a LIVE sub (Active/Paused/Skipped/
// Scheduled). Drift on Ended subs is reported but does not fail — historical
// rows (e.g. the pre-Jul-19-2026 pause off-by-one) are frozen as they were.
//
// Known legitimate divergence causes it accounts for:
//   • company_closures days — tick bails, grid must not count them either
//   • the 20:00 AE boundary — after the tick, today itself counts
//   • Monthly Max — 2 meals per delivery day
// Anything left over is real drift: a missed cron night, a manual UPDATE,
// or a seed/rewind that ignored the rules above.
//
// READ-ONLY. Makes no writes.

import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

const LIVE_STATUSES = new Set(['Active', 'Paused', 'Skipped', 'Scheduled'])

function aeNow(): { iso: string; hour: number } {
  const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
  const iso = `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`
  return { iso, hour: ae.getUTCHours() }
}

function isWorkingDay(iso: string, weekType: string | null): boolean {
  const js = new Date(iso + 'T00:00:00Z').getUTCDay() // 0=Sun..6=Sat
  if (weekType === '7DAYS') return true
  if (weekType === '5DAYS') return js !== 0 && js !== 6
  return js !== 0 // 6DAYS default
}

function* eachDay(startIso: string, endIso: string): Generator<string> {
  const d = new Date(startIso + 'T00:00:00Z')
  const end = new Date(endIso + 'T00:00:00Z')
  while (d.getTime() <= end.getTime()) {
    yield `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    d.setUTCDate(d.getUTCDate() + 1)
  }
}

async function main() {
  const { data: closures, error: cErr } = await sb
    .from('company_closures')
    .select('closure_date')
  if (cErr) throw new Error(`company_closures: ${cErr.message}`)
  const closureSet = new Set((closures ?? []).map((c) => c.closure_date as string))

  const { data: subs, error } = await sb
    .from('subscriptions')
    .select('id, plan_name, status, week_type, start_date, end_date, total_meals, delivered_meals, meals_per_day, skipped_dates, skipped_meals_count, paused_dates, paused_days, closure_days, resume_cutoff_date, last_delivery_tick_date')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`subscriptions: ${error.message}`)

  const now = aeNow()
  console.log(`AE now: ${now.iso} ${String(now.hour).padStart(2, '0')}:xx · subs: ${subs!.length} · closures on record: ${closureSet.size}`)

  let liveDrift = 0
  let endedDrift = 0
  for (const s of subs!) {
    if (!s.start_date || !s.end_date) continue
    const mpd = s.meals_per_day ?? 1
    const skipped = new Set<string>((s.skipped_dates ?? []) as string[])
    const paused = new Set<string>((s.paused_dates ?? []) as string[])

    let days = 0
    for (const iso of eachDay(s.start_date, s.end_date)) {
      // A day has "happened" once it is before AE-today, or IS today after
      // the 20:00 AE delivery tick (the grid flips today at 20:00 too).
      const happened = iso < now.iso || (iso === now.iso && now.hour >= 20)
      if (!happened) break
      if (!isWorkingDay(iso, s.week_type)) continue
      if (skipped.has(iso) || paused.has(iso) || closureSet.has(iso)) continue
      days++
    }
    const calendarMeals = Math.min(days * mpd, s.total_meals ?? Number.MAX_SAFE_INTEGER)
    const counter = s.delivered_meals ?? 0
    const delta = calendarMeals - counter
    if (delta === 0) continue

    const live = LIVE_STATUSES.has(s.status as string)
    if (live) liveDrift++
    else endedDrift++
    console.log(
      `\n${live ? 'DRIFT' : 'drift (ended, informational)'} Δ=${delta > 0 ? '+' : ''}${delta}` +
      `  [${s.status}] ${s.plan_name} ${s.id}` +
      `\n  window ${s.start_date} → ${s.end_date} (${s.week_type}, ${mpd}/day) · counter=${counter} · calendar=${calendarMeals}` +
      `\n  skips=${(s.skipped_dates ?? []).length}/${s.skipped_meals_count} paused_days=${s.paused_days} closure_days=${s.closure_days}` +
      ` resume_cutoff=${s.resume_cutoff_date} last_tick=${s.last_delivery_tick_date}`,
    )
  }

  if (liveDrift === 0 && endedDrift === 0) {
    console.log('\nAll clear: delivered_meals matches the calendar on every subscription.')
  } else {
    console.log(`\nLive drift: ${liveDrift} · Ended drift: ${endedDrift}`)
  }
  if (liveDrift > 0) {
    console.log('A live subscription\'s dashboard grid is contradicting its own legend. Investigate before it reaches a customer.')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
