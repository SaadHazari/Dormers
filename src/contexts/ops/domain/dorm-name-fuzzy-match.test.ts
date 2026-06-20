import { describe, it, expect } from 'vitest'
import { matchDormNameSync } from './dorm-name-fuzzy-match'
import type { FuzzyResult } from './dorm-name-fuzzy-match'

const CANONICAL = ['The Myriad', 'KSK Homes', 'Yugo', 'DSOA Residence', 'Study World']
const ALIASES: Record<string, string> = {
  'the myriad': 'The Myriad',
  'myriad': 'The Myriad',
  'ksk homes': 'KSK Homes',
  'ksk': 'KSK Homes',
  'yugo': 'Yugo',
  'dsoa residence': 'DSOA Residence',
  'dsoa': 'DSOA Residence',
  'study world': 'Study World',
}

const match = (input: string) => matchDormNameSync(input, CANONICAL, ALIASES)

describe('matchDormNameSync', () => {
  it('matches "yugo" as alias → Yugo', () => {
    expect(match('yugo')).toEqual({ match: 'Yugo', confidence: 'alias' })
  })

  it('matches "YUGO" (uppercase) as alias → Yugo', () => {
    expect(match('YUGO')).toEqual({ match: 'Yugo', confidence: 'alias' })
  })

  it('matches "myriad" as alias → The Myriad', () => {
    expect(match('myriad')).toEqual({ match: 'The Myriad', confidence: 'alias' })
  })

  it('matches "ksk" as alias → KSK Homes', () => {
    expect(match('ksk')).toEqual({ match: 'KSK Homes', confidence: 'alias' })
  })

  it('matches "dsoa" as alias → DSOA Residence', () => {
    expect(match('dsoa')).toEqual({ match: 'DSOA Residence', confidence: 'alias' })
  })

  it('matches "study world" as alias → Study World', () => {
    expect(match('study world')).toEqual({ match: 'Study World', confidence: 'alias' })
  })

  it('matches "the myriad" as alias → The Myriad', () => {
    expect(match('the myriad')).toEqual({ match: 'The Myriad', confidence: 'alias' })
  })

  it('matches "ksk homes" as alias → KSK Homes', () => {
    expect(match('ksk homes')).toEqual({ match: 'KSK Homes', confidence: 'alias' })
  })

  it('matches "dsoa residence" as alias → DSOA Residence', () => {
    expect(match('dsoa residence')).toEqual({ match: 'DSOA Residence', confidence: 'alias' })
  })

  it('trims whitespace: "  yugo  " → Yugo (alias)', () => {
    expect(match('  yugo  ')).toEqual({ match: 'Yugo', confidence: 'alias' })
  })

  it('fuzzy matches "yug" → Yugo (distance 1)', () => {
    expect(match('yug')).toEqual({ match: 'Yugo', confidence: 'fuzzy' })
  })

  it('fuzzy matches "DSOA Residenc" → DSOA Residence (distance 1)', () => {
    expect(match('DSOA Residenc')).toEqual({ match: 'DSOA Residence', confidence: 'fuzzy' })
  })

  it('returns no match for "abc"', () => {
    expect(match('abc')).toEqual({ match: null, candidates: [] })
  })

  it('returns no match for "k" (< 3 chars)', () => {
    expect(match('k')).toEqual({ match: null, candidates: [] })
  })

  it('returns no match for "ks" (< 3 chars)', () => {
    expect(match('ks')).toEqual({ match: null, candidates: [] })
  })

  it('returns no match for empty string', () => {
    expect(match('')).toEqual({ match: null, candidates: [] })
  })

  it('returns no match for whitespace-only input', () => {
    expect(match('   ')).toEqual({ match: null, candidates: [] })
  })

  it('returns no fuzzy match for "aaaa" (beyond edit budget of all dorms)', () => {
    expect(match('aaaa')).toEqual({ match: null, candidates: [] })
  })

  it('returns candidates when equidistant from multiple dorms', () => {
    // 'cavis' is edit-distance 1 from both 'Davis' and 'Mavis' (each within budget).
    const result = matchDormNameSync('cavis', ['Davis', 'Mavis'], {})
    expect(result).toEqual({ match: null, candidates: ['Davis', 'Mavis'] })
  })

  it('returns exact for a canonical name that has no alias entry', () => {
    expect(matchDormNameSync('newdorm', ['NewDorm'], {})).toEqual({
      match: 'NewDorm',
      confidence: 'exact',
    })
  })

  it('returns FuzzyResult with confidence for alias hits', () => {
    const result: FuzzyResult = match('yugo')
    if (result.match !== null) {
      expect(['exact', 'alias', 'fuzzy']).toContain(result.confidence)
    }
  })

  it('returns FuzzyResult with candidates array for no-match', () => {
    const result: FuzzyResult = match('zzzzzzz')
    if (result.match === null) {
      expect(Array.isArray(result.candidates)).toBe(true)
    }
  })
})
