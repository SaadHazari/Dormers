import { describe, it, expect } from 'vitest'
import {
  friendlySkipError, creditedSkipBlocksPause, SKIP_CHANGED_COPY, SKIP_NO_VALUE_COPY, SKIP_ERROR_FALLBACK,
} from './season-skip-errors'

describe('friendlySkipError', () => {
  it('turns every SQL refusal into customer copy', () => {
    expect(friendlySkipError('SEASON_SKIP_CHANGED: expected grant, found credited')).toBe(SKIP_CHANGED_COPY)
    expect(friendlySkipError('SEASON_SKIP_ALREADY')).toBe("You've already scheduled a skip for that day.")
    expect(friendlySkipError('SEASON_SKIP_NO_SKIPS_LEFT')).toBe("You've used all your skips for this cycle.")
    expect(friendlySkipError('SEASON_SKIP_BAD_STATUS: Paused on 2026-09-16')).toBe('Skips can only be scheduled on an active plan.')
    expect(friendlySkipError('SEASON_SKIP_NOT_FOUND')).toBe('Subscription not found')
    expect(friendlySkipError('SEASON_SKIP_NO_VALUE')).toBe(SKIP_NO_VALUE_COPY)
    expect(friendlySkipError('SEASON_UNSKIP_SETTLED: credit is approved')).toBe('That credit is already in your wallet, so this skip can no longer be undone.')
    expect(friendlySkipError('SEASON_UNSKIP_TOO_LATE')).toBe("Past skips and today's skip can't be undone.")
    expect(friendlySkipError('SEASON_UNSKIP_NOT_SKIPPED')).toBe("That day isn't scheduled as a skip.")
  })

  it('never shows a raw database message', () => {
    expect(friendlySkipError('connection terminated')).toBe(SKIP_ERROR_FALLBACK)
    expect(friendlySkipError(undefined)).toBe(SKIP_ERROR_FALLBACK)
  })

  it('has no dashes in customer copy', () => {
    for (const copy of [SKIP_CHANGED_COPY, SKIP_NO_VALUE_COPY, SKIP_ERROR_FALLBACK, creditedSkipBlocksPause('2026-09-22', true)]) {
      expect(copy).not.toMatch(/[–—]/)
    }
  })

  // ── Task 6 review additions ─────────────────────────────────────────────

  it('maps a bad-date skip refusal, whatever detail SQL appends', () => {
    const copy = "That day can't be skipped. Pick one of your delivery days on or before your plan's last day."
    expect(friendlySkipError('SEASON_SKIP_BAD_DATE: 2026-09-13')).toBe(copy)
    expect(friendlySkipError('SEASON_SKIP_BAD_DATE')).toBe(copy)
    expect(copy).not.toMatch(/[–—]/)
  })

  it('names the earliest credited date an undo would strand, formatted with formatShortDay', () => {
    // Mon 5 Oct 2026.
    expect(friendlySkipError('SEASON_UNSKIP_CREDITED_AFTER: 2026-10-05')).toBe(
      'First undo your skip on Mon 5 Oct, which went to your wallet as credit.',
    )
  })

  it('falls back to a dateless sentence when the credited-after date is missing or invalid', () => {
    const fallback = 'First undo your later skip that went to your wallet as credit.'
    expect(friendlySkipError('SEASON_UNSKIP_CREDITED_AFTER')).toBe(fallback)
    expect(friendlySkipError('SEASON_UNSKIP_CREDITED_AFTER: ')).toBe(fallback)
    expect(friendlySkipError('SEASON_UNSKIP_CREDITED_AFTER: 2026-13-40')).toBe(fallback)
    expect(fallback).not.toMatch(/[–—]/)
  })
})

describe('creditedSkipBlocksPause', () => {
  it('names the credited day and what to do', () => {
    // Tue 22 Sep 2026.
    expect(creditedSkipBlocksPause('2026-09-22', true)).toBe('Your skip on Tue 22 Sep is turning into wallet credit. Undo that skip first, then plan your pause.')
    expect(creditedSkipBlocksPause('2026-09-22', false)).toBe('Your skip on Tue 22 Sep is turning into wallet credit. Undo that skip first, then pause.')
  })
})
