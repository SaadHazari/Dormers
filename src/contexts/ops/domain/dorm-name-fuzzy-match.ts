export type FuzzyResult =
  | { match: string; confidence: 'exact' | 'alias' | 'fuzzy' }
  | { match: null; candidates: string[] }

const MAX_DISTANCE = 2

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

export function matchDormNameSync(
  input: string,
  canonicalDorms: string[],
  aliases: Record<string, string>,
): FuzzyResult {
  const normalised = input.trim().toLowerCase()

  if (normalised.length === 0) {
    return { match: null, candidates: [] }
  }

  // Alias lookup first — an alias can be shorter than the 3-char fuzzy floor
  // (e.g. a 2-letter dorm shorthand), so it must be reachable before the guard.
  if (aliases[normalised]) {
    return { match: aliases[normalised], confidence: 'alias' }
  }

  // Exact canonical match (case-insensitive) for any dorm without an alias entry.
  // Distance 0 is "exact", not "fuzzy" — without this such inputs fell through to
  // the fuzzy branch and were mislabelled (the 'exact' variant was unreachable).
  const exact = canonicalDorms.find((d) => d.toLowerCase() === normalised)
  if (exact) {
    return { match: exact, confidence: 'exact' }
  }

  // Fuzzy matching needs at least 3 chars to be meaningful.
  if (normalised.length < 3) {
    return { match: null, candidates: [] }
  }

  // Length-relative edit budget: short canonical names (<=4 chars) allow only
  // a single typo, so an unrelated 4-letter word can't fuzzy-match into them.
  const allowedFor = (s: string) => (s.length <= 4 ? 1 : MAX_DISTANCE)
  const distances = canonicalDorms.map((dorm) => ({
    dorm,
    dist: levenshtein(normalised, dorm.toLowerCase()),
    allowed: allowedFor(dorm),
  }))

  const eligible = distances.filter((d) => d.dist <= d.allowed)

  if (eligible.length === 0) {
    return { match: null, candidates: [] }
  }

  const minDist = Math.min(...eligible.map((d) => d.dist))
  const matches = eligible.filter((d) => d.dist === minDist)

  if (matches.length > 1) {
    return { match: null, candidates: matches.map((m) => m.dorm) }
  }

  return { match: matches[0].dorm, confidence: 'fuzzy' }
}
