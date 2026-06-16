// src/contexts/ops/domain/dorm-name-fuzzy-match.ts
// Phase 8: Fuzzy dorm name matching for WhatsApp inbound trigger (WAI-05, WAI-06).
//
// Two-stage matching:
//   Stage 1: alias table lookup (exact, case-insensitive) — handles common shorthand
//   Stage 2: Levenshtein distance against canonical names (≤ 2 edits, min 3-char input)
//
// Five canonical dorm names (excluding 'Other') from src/shared/dorm-shapes.ts.
// No npm package needed — hand-rolled Levenshtein, ~20 lines.

export type FuzzyResult =
  | { match: string; confidence: 'exact' | 'alias' | 'fuzzy' }
  | { match: null; candidates: string[] } // [] = no match, [x,y] = ambiguous

// Canonical dorm names — source of truth: DORM_SHAPE_MAP keys (excluding 'Other')
const CANONICAL_DORMS: string[] = [
  'The Myriad',
  'KSK Homes',
  'Yugo',
  'DSOA Residence',
  'Study World',
]

// Alias table: normalised (lowercase, trimmed) → canonical dorm name.
// Evaluated before Levenshtein — alias matches are exact by design.
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

// Conservative threshold: inputs within this many edits of a canonical name qualify.
// ≤ 2 is tight enough to prevent "ksk" → "Yugo" false positives.
const MAX_DISTANCE = 2

// Hand-rolled Levenshtein (Wagner-Fischer DP, ~20 lines).
// No npm package needed for a domain of 5 known strings.
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/**
 * Match a rider's free-text input to a canonical dorm name.
 *
 * Returns:
 *   { match: string; confidence: 'alias' | 'fuzzy' }  — unambiguous match
 *   { match: null; candidates: string[] }              — no match (empty) or ambiguous (2+ candidates)
 *
 * Minimum input length: 3 characters. Shorter inputs always return no match
 * to prevent single-letter inputs colliding with multiple canonical names.
 */
export function matchDormName(input: string): FuzzyResult {
  const normalised = input.trim().toLowerCase()

  // Minimum length gate (Pitfall 6 from research)
  if (normalised.length < 3) {
    return { match: null, candidates: [] }
  }

  // Stage 1: alias table (WAI-05 — alias match)
  if (ALIASES[normalised]) {
    return { match: ALIASES[normalised], confidence: 'alias' }
  }

  // Stage 2: Levenshtein against canonical names (WAI-05 — fuzzy match)
  // Compare normalised input against normalised canonical names to be case-insensitive
  const distances = CANONICAL_DORMS.map((dorm) => ({
    dorm,
    dist: levenshtein(normalised, dorm.toLowerCase()),
  }))

  const minDist = Math.min(...distances.map((d) => d.dist))

  // No match: closest dorm is further than the threshold
  if (minDist > MAX_DISTANCE) {
    return { match: null, candidates: [] }
  }

  const matches = distances.filter((d) => d.dist === minDist)

  // Ambiguous: two or more dorms at the same minimum distance (WAI-06)
  if (matches.length > 1) {
    return { match: null, candidates: matches.map((m) => m.dorm) }
  }

  // Unambiguous fuzzy match
  return { match: matches[0].dorm, confidence: 'fuzzy' }
}
