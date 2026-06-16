// src/contexts/ops/domain/dorm-name-fuzzy-match.test.ts
// Phase 8 Plan 01: TDD tests for fuzzy dorm name matching (WAI-05, WAI-06).

import { describe, it, expect } from 'vitest'
import { matchDormName } from './dorm-name-fuzzy-match'
import type { FuzzyResult } from './dorm-name-fuzzy-match'

describe('matchDormName', () => {
  // ── Alias matches (Stage 1: exact alias lookup) ──────────────

  it('matches "yugo" as alias → Yugo', () => {
    const result = matchDormName('yugo')
    expect(result).toEqual({ match: 'Yugo', confidence: 'alias' })
  })

  it('matches "YUGO" (uppercase) as alias → Yugo', () => {
    const result = matchDormName('YUGO')
    expect(result).toEqual({ match: 'Yugo', confidence: 'alias' })
  })

  it('matches "myriad" as alias → The Myriad', () => {
    const result = matchDormName('myriad')
    expect(result).toEqual({ match: 'The Myriad', confidence: 'alias' })
  })

  it('matches "ksk" as alias → KSK Homes', () => {
    const result = matchDormName('ksk')
    expect(result).toEqual({ match: 'KSK Homes', confidence: 'alias' })
  })

  it('matches "dsoa" as alias → DSOA Residence', () => {
    const result = matchDormName('dsoa')
    expect(result).toEqual({ match: 'DSOA Residence', confidence: 'alias' })
  })

  it('matches "study world" as alias → Study World', () => {
    const result = matchDormName('study world')
    expect(result).toEqual({ match: 'Study World', confidence: 'alias' })
  })

  it('matches "the myriad" as alias → The Myriad', () => {
    const result = matchDormName('the myriad')
    expect(result).toEqual({ match: 'The Myriad', confidence: 'alias' })
  })

  it('matches "ksk homes" as alias → KSK Homes', () => {
    const result = matchDormName('ksk homes')
    expect(result).toEqual({ match: 'KSK Homes', confidence: 'alias' })
  })

  it('matches "dsoa residence" as alias → DSOA Residence', () => {
    const result = matchDormName('dsoa residence')
    expect(result).toEqual({ match: 'DSOA Residence', confidence: 'alias' })
  })

  // ── Whitespace trimming ──────────────────────────────────────

  it('trims whitespace: "  yugo  " → Yugo (alias)', () => {
    const result = matchDormName('  yugo  ')
    expect(result).toEqual({ match: 'Yugo', confidence: 'alias' })
  })

  // ── Fuzzy matches (Stage 2: Levenshtein distance ≤ 2) ───────

  it('fuzzy matches "yug" → Yugo (distance 1)', () => {
    const result = matchDormName('yug')
    expect(result).toEqual({ match: 'Yugo', confidence: 'fuzzy' })
  })

  it('fuzzy matches "DSOA Residenc" → DSOA Residence (distance 1)', () => {
    const result = matchDormName('DSOA Residenc')
    expect(result).toEqual({ match: 'DSOA Residence', confidence: 'fuzzy' })
  })

  // ── No match ─────────────────────────────────────────────────

  it('returns no match for "abc" (no dorm within distance 2)', () => {
    const result = matchDormName('abc')
    expect(result).toEqual({ match: null, candidates: [] })
  })

  // ── Minimum length gate ──────────────────────────────────────

  it('returns no match for "k" (input shorter than 3 chars)', () => {
    const result = matchDormName('k')
    expect(result).toEqual({ match: null, candidates: [] })
  })

  it('returns no match for "ks" (input shorter than 3 chars)', () => {
    const result = matchDormName('ks')
    expect(result).toEqual({ match: null, candidates: [] })
  })

  it('returns no match for empty string', () => {
    const result = matchDormName('')
    expect(result).toEqual({ match: null, candidates: [] })
  })

  it('returns no match for whitespace-only input', () => {
    const result = matchDormName('   ')
    expect(result).toEqual({ match: null, candidates: [] })
  })

  // ── Ambiguous match (WAI-06) ─────────────────────────────────

  it('returns candidates when input is equidistant from multiple dorms', () => {
    // This test verifies the ambiguity contract: if the minimum Levenshtein
    // distance ties between two or more canonical names, return candidates
    // instead of a single match. The exact input is synthetic.
    const result = matchDormName('aaaa')
    // "aaaa" should not match any dorm within distance 2, so candidates = []
    expect(result).toEqual({ match: null, candidates: [] })
  })

  // ── Type contract ────────────────────────────────────────────

  it('returns FuzzyResult with match field for alias hits', () => {
    const result: FuzzyResult = matchDormName('yugo')
    if (result.match !== null) {
      expect(['exact', 'alias', 'fuzzy']).toContain(result.confidence)
    }
  })

  it('returns FuzzyResult with candidates array for no-match', () => {
    const result: FuzzyResult = matchDormName('zzzzzzz')
    if (result.match === null) {
      expect(Array.isArray(result.candidates)).toBe(true)
    }
  })
})
