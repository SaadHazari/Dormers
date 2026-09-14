import { describe, it, expect } from 'vitest'
import { friendlySeasonError, SEASON_ERROR_FALLBACK } from './season-errors'

describe('friendlySeasonError', () => {
  it('explains a refused phase change', () => {
    expect(friendlySeasonError('SEASON_BAD_PHASE: cannot move from open (wrap-up day <NULL>)'))
      .toBe('The season changed while you were looking. Refresh the page and try again.')
  })

  it('explains a refused date', () => {
    expect(friendlySeasonError('SEASON_INVALID_DATE: wrap-up day 2026-10-04 is a Sunday'))
      .toBe('That wrap-up day cannot be used. Pick a Monday to Saturday date from tomorrow, within a year, with a buffer of 0 to 3 days.')
  })

  it('explains a missing settings row', () => {
    expect(friendlySeasonError('SEASON_NO_SETTINGS')).toBe('The season settings row is missing, so nothing was changed.')
  })

  it('never shows a raw database message', () => {
    expect(friendlySeasonError('connection terminated unexpectedly')).toBe(SEASON_ERROR_FALLBACK)
    expect(friendlySeasonError(null)).toBe(SEASON_ERROR_FALLBACK)
  })
})
