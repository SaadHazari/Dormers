/**
 * Season-horizon domain — pure checks for whether a plan journey fits
 * before a season's last delivery day. Used by scheduled-pause-with-taper
 * to decide whether a new/resumed subscription can still run to completion
 * before the season ends.
 *
 * Pure and client-importable: only imports from ./end-date and ./plans, no
 * server-only modules, no process.env.
 */

import { computeEndDate, isoDate, type WeekType } from './end-date'
import { planKindOf, type PlanId } from './plans'

export interface JourneyFitsInput {
  planId: PlanId
  weekType: WeekType
  /** ISO date (YYYY-MM-DD) the journey would start on. */
  startDate: string
  /** ISO date (YYYY-MM-DD) of the season's last delivery day. */
  lastDeliveryDay: string
}

/**
 * True when a journey starting on `startDate` projects to end on or before
 * `lastDeliveryDay`. ISO date strings compare lexicographically, so no date
 * parsing is needed for the comparison itself.
 */
export function journeyFits(input: JourneyFitsInput): boolean {
  const end = computeEndDate({
    startDate: input.startDate,
    planKind: planKindOf(input.planId),
    weekType: input.weekType,
    skipCount: 0,
    pauseDays: 0,
  })
  return isoDate(end) <= input.lastDeliveryDay
}

export interface LatestViableStartInput {
  planId: PlanId
  weekType: WeekType
  /** ISO date (YYYY-MM-DD) — earliest allowed start of the window. */
  minStart: string
  /** ISO date (YYYY-MM-DD) — latest allowed start of the window. */
  maxStart: string
  /** ISO date (YYYY-MM-DD) of the season's last delivery day. */
  lastDeliveryDay: string
}

/**
 * The latest ISO date in `[minStart, maxStart]` whose journey fits before
 * `lastDeliveryDay`, or null when none does (the plan is done for the
 * term). Scans backward from `maxStart` — the window is at most ~32 days
 * for this feature's callers, so a linear scan is fine.
 */
export function latestViableStart(input: LatestViableStartInput): string | null {
  if (input.minStart > input.maxStart) return null

  const cursor = new Date(`${input.maxStart}T00:00:00Z`)
  const floor = new Date(`${input.minStart}T00:00:00Z`)

  while (cursor >= floor) {
    const candidate = isoDate(cursor)
    if (journeyFits({ planId: input.planId, weekType: input.weekType, startDate: candidate, lastDeliveryDay: input.lastDeliveryDay })) {
      return candidate
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return null
}

/** Adds one calendar day to a UTC-parsed ISO date, returning ISO. */
function addOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return isoDate(d)
}

export interface EffectiveTaperStartInput {
  /** ISO date (YYYY-MM-DD) the customer picked at checkout, or null if the
   *  request didn't supply one. */
  requestedStart: string | null
  /** ISO date (YYYY-MM-DD) of the customer's current live/queued
   *  subscription's `end_date`, or null when they have none. */
  liveSubEndDate: string | null
}

/**
 * Predicts the start date the Stripe webhook will actually provision, so a
 * checkout-time taper guard can judge the journey the customer will really
 * get instead of trusting a POSTed `start_date` the webhook may override.
 *
 * Source of truth: `handle-stripe-event.ts`'s `handleCheckoutCompleted`
 * (~lines 137-162). When a live/queued subscription ("tail") exists, that
 * handler unconditionally queues the new one behind it —
 * `startDate = tail.end_date + 1 day` (further shifted to the next
 * delivery day inside `computeEndDate`, which this helper leaves to its
 * caller — `journeyFits` already applies that shift via `computeEndDate`'s
 * own weekType-aware S2 logic, so no special-casing is needed here; see the
 * Task 3 review note). The webhook does NOT fall back to the customer's
 * requested `start_date` in that branch — it only logs a warning and
 * proceeds with tail+1, regardless of whether the request's date was
 * earlier or later.
 *
 * This helper is deliberately more conservative than that literal branch:
 * it returns the LATER of (tail + 1 day, requestedStart) rather than always
 * discarding requestedStart. A later predicted start can only produce a
 * later-or-equal predicted end date, so this can never cause a false
 * approval of a journey the webhook would actually schedule past the
 * pause — worst case it is slightly over-cautious on a journey the real
 * tail+1 would in fact fit, never the reverse.
 *
 * When there's no live sub, the webhook honours `requestedStart` as-is (or
 * falls back to "today" when it's absent/invalid) — this helper mirrors
 * that by returning `requestedStart` unchanged, including `null`, so the
 * caller's own "today, AE-local" derivation (already computed once for the
 * start-window check) stays the single source of truth for "now" rather
 * than being duplicated here.
 */
export function effectiveTaperStart(input: EffectiveTaperStartInput): string | null {
  if (input.liveSubEndDate) {
    const tailPlusOne = addOneDay(input.liveSubEndDate)
    if (!input.requestedStart) return tailPlusOne
    return input.requestedStart > tailPlusOne ? input.requestedStart : tailPlusOne
  }
  return input.requestedStart
}

/**
 * En-GB "18 August"-style pretty date for a last-delivery-day ISO string.
 * Parsed AND formatted in UTC so the result is independent of the server's
 * local timezone — the earlier ad hoc call sites parsed without a 'Z'
 * suffix (local-time parsing), which is a latent day-off-by-one risk on any
 * host not running in UTC. Shared building block for every taper-refusal
 * message so the three call sites can never drift on wording.
 */
export function prettySeasonDate(lastDeliveryDay: string): string {
  return new Date(`${lastDeliveryDay}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

/**
 * Canonical "the season is ending" sentence, shared by the checkout route
 * and free-checkout so the copy never drifts between them. Callers may
 * append their own second sentence (the checkout route adds "Shorter plans
 * are still available."). The gift-claim path needs a different second
 * sentence entirely, so it builds its own message from `prettySeasonDate`
 * instead of this function — see `claimGift` in `r/[cid]/actions.ts`.
 */
export function seasonEndsMessage(lastDeliveryDay: string): string {
  return `The semester wraps up on ${prettySeasonDate(lastDeliveryDay)}. This plan would run past it, so it is done for this term.`
}
