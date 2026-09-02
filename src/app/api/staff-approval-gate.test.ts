/**
 * The staff renewal approval gate, locked in source control.
 *
 * The gate is one condition inside subscription_status_tick. It used to
 * exist only in the live database — 20260612_staff_renewal_approval.sql
 * ends with a comment saying so, and the repo's canonical tick in
 * 20260506_cron_jobs.sql promotes every Scheduled sub whose start date has
 * arrived. Re-applying that file would have reopened the gate silently, and
 * nothing here could have told the difference.
 *
 * 20260902 mirrors the live body into the repo. These tests fail if the
 * guard, or the alerting that watches it, is ever edited away.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const GATE_SQL = readFileSync(
  resolve(ROOT, 'supabase/migrations/20260902_staff_approval_gate_and_alerts.sql'),
  'utf-8',
)

describe('subscription_status_tick holds pending staff renewals', () => {
  it('step 2 refuses to promote a sub whose approval is still pending', () => {
    expect(GATE_SQL).toContain("staff_approval IS DISTINCT FROM 'pending'")
  })

  it('the guard sits on the Scheduled → Active promotion, not somewhere else', () => {
    const step2 = GATE_SQL.slice(
      GATE_SQL.indexOf("WHERE status = 'Scheduled'"),
      GATE_SQL.indexOf('-- 3. Promote pre-registered future skips'),
    )
    expect(step2).toContain("staff_approval IS DISTINCT FROM 'pending'")
  })

  it('still carries the other four tick steps, so the mirror is the whole function', () => {
    for (const step of [
      "WHERE status = 'Skipped'",
      'ae_today() = ANY(skipped_dates)',
      "planned_pause_start = public.ae_today()",
      'delivered_meals >= total_meals',
    ]) {
      expect(GATE_SQL).toContain(step)
    }
  })
})

describe('the admin is told about renewals waiting on them', () => {
  it('alerts on pending renewals, once then daily', () => {
    expect(GATE_SQL).toContain('notify_pending_staff_renewals_tick')
    expect(GATE_SQL).toContain("staff_approval_alerted_at < now() - interval '24 hours'")
  })

  it('raises an urgent alert if a pending staff sub is ever live', () => {
    // Unreachable while the guard holds — which is exactly why it's worth
    // watching for. The kitchen label list is status = 'Active'.
    expect(GATE_SQL).toContain('URGENT - staff plan is LIVE without approval')
    expect(GATE_SQL).toContain("s.status IN ('Active', 'Paused', 'Skipped')")
  })

  it('the emergency keeps its own stamp, so the daily reminder cannot mute it', () => {
    // These shared staff_approval_alerted_at once. A renewal pinged as
    // pending less than 24h before it leaked stayed silent for the rest of
    // that window — a day of unapproved cooking, unreported.
    expect(GATE_SQL).toContain('staff_leak_alerted_at')
    expect(GATE_SQL).toContain("staff_leak_alerted_at < now() - interval '1 hour'")
    expect(GATE_SQL).toContain('UPDATE public.subscriptions SET staff_leak_alerted_at = now()')
  })

  it('counts the wait in whole days, not raw intervals', () => {
    // date_trunc('minute', age(...)) rendered as "11 days 15:46:00 ago".
    expect(GATE_SQL).toContain("format('%s days ago', days_waiting)")
    expect(GATE_SQL).not.toContain("date_trunc('minute', age(")
  })

  it('is scheduled, not just defined', () => {
    expect(GATE_SQL).toContain("cron.schedule(")
    expect(GATE_SQL).toContain('notify_pending_staff_renewals_15min')
  })
})

describe('approval creates the start date', () => {
  const ACTIONS = readFileSync(resolve(ROOT, 'src/app/admin/staff/actions.ts'), 'utf-8')

  it('approveStaffRenewal stamps a start date rather than inheriting the guess', () => {
    expect(ACTIONS).toContain('approvedRenewalStartDate')
    expect(ACTIONS).toContain('start_date: startDate')
  })

  it('moves original_start_date too, so the shift trigger cannot drag it back', () => {
    expect(ACTIONS).toContain('original_start_date: startDate')
  })

  it('the floor that makes that necessary is in the repo, not just in live', () => {
    // The claim above is only true because _subscriptions_shift_queued_scheduled
    // anchors on original_start_date. The repo's older definition did not, so
    // the migration mirrors the live body.
    expect(GATE_SQL).toContain('_subscriptions_shift_queued_scheduled')
    expect(GATE_SQL).toContain('v_anchor := COALESCE(v_queued.original_start_date, v_queued.start_date)')
    expect(GATE_SQL).toContain('v_new_start := GREATEST(v_min_start, v_anchor)')
  })

  it('creates original_start_date, which no earlier migration does', () => {
    expect(GATE_SQL).toContain('ADD COLUMN IF NOT EXISTS original_start_date date')
  })

  it('keeps the compare-and-set on the gate columns', () => {
    const fn = ACTIONS.slice(
      ACTIONS.indexOf('export async function approveStaffRenewal'),
      ACTIONS.indexOf('export async function declineStaffRenewal'),
    )
    expect(fn).toContain(".eq('staff_approval', 'pending')")
    expect(fn).toContain(".eq('status', 'Scheduled')")
  })
})
