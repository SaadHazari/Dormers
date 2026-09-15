/**
 * What customers and admins read when the break refuses a restart, and when
 * releasing a held plan does not go through (spec §7.5, §7.6, §11.5). SQL
 * raises messages that start with a code; nobody sees the raw text.
 */

export const BREAK_RESUME_COPY = "The kitchen is closed between semesters. Your plan can resume once we're back."
export const BREAK_START_DATE_COPY = "The kitchen is closed between semesters, so your start date can't change yet. You can pick it once we're back."
export const ADMIN_BREAK_RESUME_COPY = 'Cannot resume: the kitchen is closed for the semester break. This plan can resume after you reopen on the Season page.'
export const RELEASE_CHANGED_COPY = 'Your plan changed. Refresh and try again.'
export const RELEASE_ERROR_FALLBACK = "Your plan didn't restart. Refresh and try again, or message us on WhatsApp."

const RELEASE_ERROR_COPY: ReadonlyArray<readonly [string, string]> = [
  ['SEASON_BREAK', BREAK_RESUME_COPY],
  ['SEASON_RELEASE_NOT_READY', RELEASE_CHANGED_COPY],
  ['SEASON_RELEASE_NOT_HELD', RELEASE_CHANGED_COPY],
  ['SEASON_RELEASE_BAD_STATUS', RELEASE_CHANGED_COPY],
  ['SEASON_RELEASE_NOT_FOUND', 'Subscription not found'],
  ['SEASON_RELEASE_BAD_INPUT', RELEASE_ERROR_FALLBACK],
]

export function friendlyReleaseError(message: string | null | undefined): string {
  if (!message) return RELEASE_ERROR_FALLBACK
  for (const [code, copy] of RELEASE_ERROR_COPY) {
    if (message.includes(code)) return copy
  }
  return RELEASE_ERROR_FALLBACK
}

/** The G2 trigger or season_release_hold refused because the break is on. */
export function isSeasonBreakError(message: string | null | undefined): boolean {
  return !!message && message.startsWith('SEASON_BREAK')
}
