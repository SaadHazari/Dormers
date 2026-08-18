/**
 * Season-taper selectors — the thin layer the customer-facing plan surfaces
 * sit on so the desktop grid, the mobile grid, and three independent date
 * pickers all answer "can this plan still be bought this term, and how late
 * can it start?" with the SAME arithmetic.
 *
 * Pure and client-importable (same rule as season-horizon.ts): no server
 * modules, no process.env, no Intl-dependent branching.
 *
 * The server (checkout's INTAKE_ENDING 409) stays authoritative. Everything
 * here is the courtesy layer that keeps a customer from reaching a refusal
 * they could have been shown up front.
 */

import { isoDate } from './end-date'
import type { WeekType } from './end-date'
import { latestViableStart } from './season-horizon'
import type { PlanId } from './plans'

/** Asia/Dubai is UTC+4 year-round (no DST) — the offset every AE-wall-date
 *  derivation in this codebase uses. */
const AE_OFFSET_MS = 4 * 60 * 60 * 1000

/** The kitchen's same-day cutoff, in AE wall hours. Past it, tonight's run
 *  is already prepping and the earliest start is tomorrow. */
const AE_CUTOFF_HOUR = 14

export interface TaperWindow {
  /** ISO date (YYYY-MM-DD) — earliest start the surface would offer. */
  minStart: string
  /** ISO date (YYYY-MM-DD) — latest start the surface would offer. */
  maxStart: string
}

/**
 * The start-date window the plan surfaces shop against: earliest allowed
 * start through earliest + 30 days. Mirrors CheckoutPanel's `computeMinIso`
 * + 30-day cap, with one deliberate difference — every date here is derived
 * in AE wall time (UTC+4) rather than the runtime's local timezone, so the
 * SSR pass (UTC) and the browser (Asia/Dubai) always agree on which calendar
 * day is "today". That matters because this window drives per-card DIMMING,
 * which is server-rendered; the pickers compute their own window at
 * interaction time and are unaffected.
 *
 * @param activeEndDate `end_date` of the live/queued subscription, or null.
 */
export function taperWindow(activeEndDate: string | null | undefined): TaperWindow {
  const ae = new Date(Date.now() + AE_OFFSET_MS)
  let min: Date
  if (activeEndDate) {
    // No overlap with the running plan — the next one starts the day after.
    min = new Date(`${activeEndDate.slice(0, 10)}T00:00:00Z`)
    min.setUTCDate(min.getUTCDate() + 1)
  } else {
    min = new Date(Date.UTC(ae.getUTCFullYear(), ae.getUTCMonth(), ae.getUTCDate()))
    if (ae.getUTCHours() >= AE_CUTOFF_HOUR) min.setUTCDate(min.getUTCDate() + 1)
  }
  const max = new Date(min)
  max.setUTCDate(max.getUTCDate() + 30)
  return { minStart: isoDate(min), maxStart: isoDate(max) }
}

export interface TaperedMaxStartInput {
  planId: PlanId
  weekType: WeekType
  /** ISO date — the surface's existing earliest allowed start. */
  minStart: string
  /** ISO date — the surface's existing latest allowed start (the +30 cap). */
  maxStart: string
  /** ISO date of the season's last delivery day, or null when no pause is
   *  scheduled (nothing to taper against). */
  lastDeliveryDay: string | null | undefined
}

/**
 * The latest start date a surface may still offer for one plan:
 *
 *   • no scheduled pause  → `maxStart` unchanged (the +30 cap wins)
 *   • pause scheduled     → min(maxStart, latest start whose journey still
 *                           ends on or before the last delivery day)
 *   • null                → NO start in the window fits. The plan is done
 *                           for this term: its card renders the unavailable
 *                           state and its checkout path is closed.
 *
 * One function serves both jobs on purpose — a date picker asks it for the
 * clamped maximum, a plan card asks it whether the answer is null — so the
 * two can never disagree about which plans are still sellable.
 */
export function taperedMaxStart(input: TaperedMaxStartInput): string | null {
  if (!input.lastDeliveryDay) return input.maxStart
  return latestViableStart({
    planId: input.planId,
    weekType: input.weekType,
    minStart: input.minStart,
    maxStart: input.maxStart,
    lastDeliveryDay: input.lastDeliveryDay,
  })
}
