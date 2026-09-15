/**
 * Which pause cycle does a waitlist join belong to, and may this customer
 * save a spot now?
 *
 * Pulled out of join-intake-waitlist.ts into its own pure module because
 * that file carries the `'use server'` directive, and Next.js only permits
 * async function exports from a `'use server'` module — `resolveJoinCycle`
 * is synchronous. See the header comment on
 * src/app/dashboard/_shared/intake-join-outcome.ts for the same constraint
 * applied to another pure helper.
 *
 * Season wind-down (spec §7.7 and §2.2): once a wrap-up day is set, a spot is
 * for customers whose dinners will not simply carry on. That is a customer
 * pause, a plan running past the wrap-up day, or no Monthly or Weekly plan
 * able to follow theirs (or start now) and still finish by it. During the
 * break anyone may save a spot. With no wrap-up day the old rule stands.
 */

import type { SeasonPhase } from '@/contexts/season/domain/season-phase'
import type { Disposition } from '@/contexts/season/domain/season-projection'
import type { WeekType } from './end-date'
import { taperWindow, taperedMaxStart } from './season-taper'

export const PLAN_CAN_FOLLOW_MESSAGE =
  'Your plan finishes before the semester wraps up and a new plan can still follow it, so there is no spot to save yet.'

export type JoinCycle =
  | { ok: true; cycleStartedAt: string }
  | { ok: false; reason: 'not_paused' | 'no_cycle' | 'plan_can_follow' }

export interface JoinCycleInput {
  paused: boolean
  cycleStartedAt: string | null
  /** Absent for callers that predate the season model; they get the old rule. */
  phase?: SeasonPhase
  wrapUpDay?: string | null
  /** Dispositions of the customer's live plans against the wrap-up day. */
  dispositions?: readonly Disposition[]
  /** No Monthly or Weekly plan could follow the customer's plans and finish by the wrap-up day. */
  noPlanCanFollow?: boolean
}

/**
 * A join is only valid while a spot can be saved AND the pause stamped a
 * cycle. `intake_waitlist.cycle_started_at` is NOT NULL, so an unstamped
 * cycle is refused rather than inserted with a null that would throw.
 */
export function resolveJoinCycle(input: JoinCycleInput): JoinCycle {
  const seasonRule = input.phase === 'break' || (input.phase === 'winding_down' && !!input.wrapUpDay)
  if (!seasonRule && !input.paused) return { ok: false, reason: 'not_paused' }
  if (!input.cycleStartedAt) return { ok: false, reason: 'no_cycle' }
  const ok: JoinCycle = { ok: true, cycleStartedAt: input.cycleStartedAt }
  if (!seasonRule || input.phase === 'break') return ok

  const dispositions = input.dispositions ?? []
  if (dispositions.includes('customer_paused') || dispositions.includes('runs_past') || input.noPlanCanFollow) return ok
  return { ok: false, reason: 'plan_can_follow' }
}

/**
 * True when no Monthly or Weekly plan bought now could start after the
 * customer's last live plan (or now, with none) and finish by the wrap-up day.
 * Uses the same taper the plan cards use, so the two never disagree. Stopped
 * sales count as "cannot follow" (owner, 2026-09-15).
 */
export function noPlanCanFollow(input: {
  salesStopped: boolean
  paused: boolean
  wrapUpDay: string
  lastLiveEndDate: string | null
  weekType: WeekType
}): boolean {
  if (input.salesStopped || input.paused) return true
  const window = taperWindow(input.lastLiveEndDate)
  const fits = (planId: 'monthly-premium' | 'weekly-flex') => taperedMaxStart({
    planId,
    weekType: input.weekType,
    minStart: window.minStart,
    maxStart: window.maxStart,
    lastDeliveryDay: input.wrapUpDay,
  }) !== null
  return !fits('monthly-premium') && !fits('weekly-flex')
}
