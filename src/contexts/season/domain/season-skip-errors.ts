/**
 * Customer copy for a refused season skip. season_skip / season_unskip raise
 * messages that start with a code; the customer never sees the raw text.
 */

import { formatShortDay } from './season-dates'

export const SKIP_CHANGED_COPY = 'Your plan changed. Refresh and try again.'
export const SKIP_NO_VALUE_COPY = "We can't work out what this meal is worth yet, so it can't go to your wallet. Message us on WhatsApp and we'll sort it out."
export const SKIP_ERROR_FALLBACK = "Skip didn't take. Refresh and try again, or message us on WhatsApp."

const SKIP_ERROR_COPY: ReadonlyArray<readonly [string, string]> = [
  ['SEASON_SKIP_CHANGED', SKIP_CHANGED_COPY],
  ['SEASON_SKIP_ALREADY', "You've already scheduled a skip for that day."],
  ['SEASON_SKIP_NO_SKIPS_LEFT', "You've used all your skips for this cycle."],
  ['SEASON_SKIP_BAD_STATUS', 'Skips can only be scheduled on an active plan.'],
  ['SEASON_SKIP_BAD_DATE', "That day can't be skipped. Pick one of your delivery days on or before your plan's last day."],
  ['SEASON_SKIP_NOT_FOUND', 'Subscription not found'],
  ['SEASON_SKIP_NO_VALUE', SKIP_NO_VALUE_COPY],
  ['SEASON_UNSKIP_SETTLED', 'That credit is already in your wallet, so this skip can no longer be undone.'],
  ['SEASON_UNSKIP_TOO_LATE', "Past skips and today's skip can't be undone."],
  ['SEASON_UNSKIP_NOT_SKIPPED', "That day isn't scheduled as a skip."],
]

// Carries a date: `SEASON_UNSKIP_CREDITED_AFTER: <yyyy-mm-dd>`, the earliest
// credited skip date that undoing this one would strand after the plan's new
// end. Handled apart from the table above because the copy names that date.
const CREDITED_AFTER_CODE = 'SEASON_UNSKIP_CREDITED_AFTER'
const ISO_DATE = /\d{4}-\d{2}-\d{2}/
const CREDITED_AFTER_FALLBACK = 'First undo your later skip that went to your wallet as credit.'

/** True for a real calendar date, not just the right shape. */
function isValidIsoDate(iso: string): boolean {
  const parsed = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso
}

export function friendlySkipError(message: string | null | undefined): string {
  if (!message) return SKIP_ERROR_FALLBACK
  if (message.includes(CREDITED_AFTER_CODE)) {
    const found = message.match(ISO_DATE)?.[0]
    return found && isValidIsoDate(found)
      ? `First undo your skip on ${formatShortDay(found)}, which went to your wallet as credit.`
      : CREDITED_AFTER_FALLBACK
  }
  for (const [code, copy] of SKIP_ERROR_COPY) {
    if (message.includes(code)) return copy
  }
  return SKIP_ERROR_FALLBACK
}

/** Why a pause cannot start while a credited skip lies inside it. */
export function creditedSkipBlocksPause(dateIso: string, planned: boolean): string {
  return `Your skip on ${formatShortDay(dateIso)} is turning into wallet credit. Undo that skip first, then ${planned ? 'plan your pause' : 'pause'}.`
}
