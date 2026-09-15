import { describe, it, expect } from 'vitest'
import { seasonChipLabel } from './season-notice-copy'

describe('seasonChipLabel', () => {
  it('names the wrap-up day', () => {
    // Sat 3 Oct 2026.
    expect(seasonChipLabel('2026-10-03')).toBe('Semester wraps up Sat 3 Oct')
  })
})
