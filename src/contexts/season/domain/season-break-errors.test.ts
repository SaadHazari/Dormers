import { describe, it, expect } from 'vitest'
import {
  friendlyReleaseError, isSeasonBreakError,
  BREAK_RESUME_COPY, BREAK_START_DATE_COPY, ADMIN_BREAK_RESUME_COPY, RELEASE_CHANGED_COPY, RELEASE_ERROR_FALLBACK,
} from './season-break-errors'

describe('season break copy', () => {
  it('says the kitchen is closed and when the plan can resume (spec §7.5)', () => {
    expect(BREAK_RESUME_COPY).toBe("The kitchen is closed between semesters. Your plan can resume once we're back.")
    expect(BREAK_START_DATE_COPY).toBe("The kitchen is closed between semesters, so your start date can't change yet. You can pick it once we're back.")
    expect(ADMIN_BREAK_RESUME_COPY).toBe('Cannot resume: the kitchen is closed for the semester break. This plan can resume after you reopen on the Season page.')
  })

  it('turns every release refusal into plain copy', () => {
    expect(friendlyReleaseError('SEASON_BREAK: plan x cannot restart during the semester break')).toBe(BREAK_RESUME_COPY)
    expect(friendlyReleaseError('SEASON_RELEASE_NOT_READY: hold is held')).toBe(RELEASE_CHANGED_COPY)
    expect(friendlyReleaseError('SEASON_RELEASE_NOT_HELD: plan x has no hold')).toBe(RELEASE_CHANGED_COPY)
    expect(friendlyReleaseError('SEASON_RELEASE_BAD_STATUS: Ended')).toBe(RELEASE_CHANGED_COPY)
    expect(friendlyReleaseError('SEASON_RELEASE_NOT_FOUND')).toBe('Subscription not found')
    expect(friendlyReleaseError('SEASON_RELEASE_BAD_INPUT: a held Scheduled plan needs a start date')).toBe(RELEASE_ERROR_FALLBACK)
    expect(friendlyReleaseError('connection reset')).toBe(RELEASE_ERROR_FALLBACK)
    expect(friendlyReleaseError(null)).toBe(RELEASE_ERROR_FALLBACK)
  })

  it('recognises the break refusal, and nothing else', () => {
    expect(isSeasonBreakError('SEASON_BREAK: plan x cannot restart during the semester break')).toBe(true)
    expect(isSeasonBreakError('SEASON_BAD_PHASE: cannot reopen from open')).toBe(false)
    expect(isSeasonBreakError(undefined)).toBe(false)
  })

  it('has no dashes', () => {
    for (const copy of [BREAK_RESUME_COPY, BREAK_START_DATE_COPY, ADMIN_BREAK_RESUME_COPY, RELEASE_CHANGED_COPY, RELEASE_ERROR_FALLBACK]) {
      expect(copy).not.toMatch(/[–—]/)
    }
  })
})
