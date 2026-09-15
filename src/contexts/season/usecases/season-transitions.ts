import 'server-only'

/**
 * Season transitions, server side (spec §5).
 *
 * The SQL functions from supabase/migrations/20260914_season_transitions.sql
 * are the authority: they lock the settings row, check the guard and keep the
 * legacy paused / pause_scheduled_for columns in step. This module validates
 * dates first (so the admin gets a precise sentence), calls the function,
 * drops the intake cache, and writes the audit entry for a transition that
 * actually happened.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { invalidateIntakeCache } from '@/infra/config/intake'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { todayAeIso, validateSeasonEnd } from '../domain/season-dates'
import { friendlySeasonError } from '../domain/season-errors'
import { receiptsFromTransition } from '../domain/season-skip-receipt'
import { announceSeasonSkipCredited } from './season-skip-notices'
import { reopenSummaryFrom } from '../domain/season-reopen'
import { announceSeasonReopened } from './season-reopen-notices'

export type SeasonTransitionResult = { ok: true } | { error: string }

type SeasonFunction =
  | 'season_schedule_end'
  | 'season_move_end'
  | 'season_clear_end'
  | 'season_stop_sales'
  | 'season_resume_sales'
  | 'season_end_today'
  | 'season_reopen'

async function runSeasonTransition(
  adminEmail: string,
  fn: SeasonFunction,
  args: Record<string, unknown>,
  auditAction: string,
  onDone?: (state: unknown) => Promise<void>,
): Promise<SeasonTransitionResult> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.rpc(fn, { ...args, p_actor: adminEmail })
  // Dropped even on failure: a refusal can mean the row moved underneath us.
  invalidateIntakeCache()
  if (error) return { error: friendlySeasonError(error.message) }
  await logAdminAction(adminEmail, auditAction, 'intake_settings', 'singleton', { ...args, state: data })
  // Scheduling or moving the wrap-up day turns skips whose make-up meal now
  // lands after it into wallet credit (spec §7.2 reconciliation).
  // The season has already changed and been audited by now: a failing notice
  // must never make the page say the schedule did not happen.
  const receipts = receiptsFromTransition(data)
  if (receipts.length > 0) {
    try {
      await announceSeasonSkipCredited(receipts)
    } catch (err) {
      console.error('season transition: credited-skip notices failed', { fn, count: receipts.length, err })
    }
  }
  if (onDone) await onDone(data)
  return { ok: true }
}

export async function scheduleSeasonEnd(adminEmail: string, wrapUpDay: string, bufferDays: number): Promise<SeasonTransitionResult> {
  const invalid = validateSeasonEnd({ wrapUpDay, bufferDays, todayAe: todayAeIso() })
  if (invalid) return { error: invalid }
  return runSeasonTransition(adminEmail, 'season_schedule_end', { p_wrap_up: wrapUpDay, p_buffer: bufferDays }, 'season_end_scheduled')
}

export async function moveSeasonEnd(adminEmail: string, wrapUpDay: string, bufferDays: number): Promise<SeasonTransitionResult> {
  const invalid = validateSeasonEnd({ wrapUpDay, bufferDays, todayAe: todayAeIso() })
  if (invalid) return { error: invalid }
  return runSeasonTransition(adminEmail, 'season_move_end', { p_wrap_up: wrapUpDay, p_buffer: bufferDays }, 'season_end_moved')
}

export async function clearSeasonEnd(adminEmail: string): Promise<SeasonTransitionResult> {
  return runSeasonTransition(adminEmail, 'season_clear_end', {}, 'season_end_cleared')
}

export async function stopSeasonSales(adminEmail: string): Promise<SeasonTransitionResult> {
  return runSeasonTransition(adminEmail, 'season_stop_sales', {}, 'season_sales_stopped')
}

export async function resumeSeasonSales(adminEmail: string): Promise<SeasonTransitionResult> {
  return runSeasonTransition(adminEmail, 'season_resume_sales', {}, 'season_sales_resumed')
}

export async function endSeasonToday(adminEmail: string): Promise<SeasonTransitionResult> {
  return runSeasonTransition(adminEmail, 'season_end_today', {}, 'season_ended_today')
}

/** break → open (spec §5): holds become ready; reopening notices are Plan F. */
export async function reopenSeason(adminEmail: string): Promise<SeasonTransitionResult> {
  return runSeasonTransition(adminEmail, 'season_reopen', {}, 'season_reopened', (state) =>
    announceSeasonReopened(reopenSummaryFrom(state)))
}
