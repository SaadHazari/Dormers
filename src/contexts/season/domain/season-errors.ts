/**
 * Admin copy for a refused season transition. The SQL functions raise
 * messages that start with a code; the admin never sees the raw text.
 */

const SEASON_ERROR_COPY: ReadonlyArray<readonly [string, string]> = [
  ['SEASON_BAD_PHASE', 'The season changed while you were looking. Refresh the page and try again.'],
  ['SEASON_INVALID_DATE', 'That wrap-up day cannot be used. Pick a Monday to Saturday date from tomorrow, within a year, with a buffer of 0 to 3 days.'],
  ['SEASON_NO_SETTINGS', 'The season settings row is missing, so nothing was changed.'],
]

export const SEASON_ERROR_FALLBACK = 'The season could not be changed and nothing was saved. Try again.'

export function friendlySeasonError(message: string | null | undefined): string {
  if (!message) return SEASON_ERROR_FALLBACK
  for (const [code, copy] of SEASON_ERROR_COPY) {
    if (message.includes(code)) return copy
  }
  return SEASON_ERROR_FALLBACK
}
