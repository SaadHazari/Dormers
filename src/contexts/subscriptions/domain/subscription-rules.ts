/**
 * Subscriptions context — domain rules.
 *
 * Pure validation functions that previously lived inline inside the 8
 * server actions in subscription-mutations. Pulling them into named
 * predicates / "can do X" checks does three things:
 *
 *   1. Mutations stop being a wall of nested-if validation; their happy
 *      path becomes visible at a glance
 *   2. Rules become individually testable without spinning up Supabase
 *   3. Two mutations that share a rule (e.g. canPause is needed by both
 *      pauseSubscription and planPause) read from the same source
 *
 * Result shape: discriminated union `{ ok: true } | { ok: false; error }`.
 * The error string is user-facing copy — returned verbatim by the
 * mutation when it rejects. Centralising the copy here also centralises
 * the wording.
 *
 * Per DDD: this is the "anemic-to-rich" upgrade for the Subscription
 * type. Subscription stays a typed value (no class instance ceremony for
 * a DB row), but the rules that previously scattered across 8 functions
 * now live with the thing they describe.
 */

import type { Subscription } from './subscriptions'
import { resolvePlan } from './plans'
import { SUBSCRIPTION_STATUS } from './subscription-status'

export type RuleResult = { ok: true } | { ok: false; error: string }
const ok: RuleResult = { ok: true }
const fail = (error: string): RuleResult => ({ ok: false, error })

/**
 * Can the user pause this subscription immediately?
 *
 * Used by:
 *   - pauseSubscription (Active → Paused, now)
 *   - planPause (queue future pause start)
 *
 * Rules:
 *   - Plan must allow pause (Monthly Premium / Max only)
 *   - Sub must not already be paused
 *   - Sub must not be ended
 *   - The 1-pause-per-cycle credit must not be spent (has_paused_before
 *     plus no planned_pause_start)
 *   - Today must not be the last delivery day (no future meal to protect)
 *
 * `today` is passed in (AE-wall YYYY-MM-DD) so the rule stays pure —
 * the caller does the clock-read so tests can pin time.
 */
export function canPause(sub: Subscription, today: string): RuleResult {
  if (sub.status === SUBSCRIPTION_STATUS.PAUSED) return fail('Subscription is already paused.')
  if (sub.status === SUBSCRIPTION_STATUS.ENDED) return fail('Cannot pause an ended subscription.')
  if (!resolvePlan(sub.plan_name)?.canPause) {
    return fail('Only Monthly Premium and Monthly Max plans can be paused.')
  }
  // has_paused_before WITH planned_pause_start = credit consumed by a queued
  // pause that hasn't activated; an immediate pause overrides the plan. Without
  // planned_pause_start, the credit is already spent.
  if (sub.has_paused_before && !sub.planned_pause_start) {
    return fail('You have already used your 1 allowed pause for this subscription.')
  }
  if (sub.end_date && today >= sub.end_date) {
    return fail('Can\'t pause on your last delivery day — there\'s no future meal to protect.')
  }
  return ok
}

/**
 * Can the user SCHEDULE a future pause? Stricter than canPause —
 * requires the pause credit to be fully unspent (no existing planned
 * pause, no historical pause-and-resume).
 */
export function canPlanPause(sub: Subscription): RuleResult {
  if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE && sub.status !== SUBSCRIPTION_STATUS.SKIPPED) {
    return fail('Pauses can only be scheduled on an active subscription.')
  }
  if (!resolvePlan(sub.plan_name)?.canPause) {
    return fail('Only Monthly Premium and Monthly Max plans can be paused.')
  }
  if (sub.planned_pause_start) {
    return fail('You already have a pause scheduled. Cancel it first to pick a different date.')
  }
  if (sub.has_paused_before) {
    return fail('You\'ve already used your 1 allowed pause for this subscription.')
  }
  return ok
}

/**
 * Can the user skip a meal on this subscription?
 *
 * Used by both skipMeal (same-day) and skipFutureDate. The skip-credit
 * cap check accounts for the Dorm Wars milestone-15 bonus_skips.
 *
 * Same-day-specific rules (status === ACTIVE, 14:00 AE cutoff, today is
 * a delivery day) are NOT here — they belong in skipMeal alone. This
 * rule is the lower-bound "is the sub even eligible to take more skips."
 */
export function canSkip(sub: Subscription): RuleResult {
  if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE && sub.status !== SUBSCRIPTION_STATUS.SKIPPED) {
    return fail('Skips can only be scheduled on an active subscription.')
  }
  const baseMaxSkips = resolvePlan(sub.plan_name)?.maxSkips ?? 0
  const maxSkips = baseMaxSkips + sub.bonus_skips
  if (sub.skipped_meals_count >= maxSkips) {
    return fail(`You've used all ${maxSkips} of your skips for this cycle.`)
  }
  return ok
}

/**
 * Can the user resume this subscription right now?
 *
 * Rules:
 *   - Must currently be paused
 *   - Same-day resume is locked (mirrors the kitchen-ops UI gate)
 *
 * `today` is the AE-wall YYYY-MM-DD; `pauseDateAeIso` is the pause_date
 * column converted to the same AE-wall date so callers do the timezone
 * work once and the rule stays pure.
 */
export function canResume(
  sub: Subscription,
  today: string,
  pauseDateAeIso: string | null,
): RuleResult {
  if (sub.status !== SUBSCRIPTION_STATUS.PAUSED) {
    return fail('Subscription is not currently paused.')
  }
  if (pauseDateAeIso && pauseDateAeIso === today) {
    return fail('Your plan was paused today — resume becomes available tomorrow.')
  }
  return ok
}
