// Customer CID generator — shared between the main onboarding flow and the
// referral trial-claim flow (/r/[cid]). Mirrors the original Make.com formula:
//   upper(substring(dorm; 0; 3)) + formatDate(now; mmss)
// Produces e.g. "MYR2347" — 3-letter dorm code + zero-padded minutes + seconds.
//
// Both callers MUST share this so cid collision semantics + format stay
// consistent — a trial customer who later subscribes keeps the same cid.

const DORM_CODES: Record<string, string> = {
  'The Myriad':     'MYR',
  'KSK Homes':      'KSK',
  'Yugo':           'YUG',
  'DSOA Residence': 'DSO',
  'Study World':    'STU',
  'Other':          'OTH',
}

export function generateCid(dorm: string): string {
  const code =
    DORM_CODES[dorm] ??
    dorm
      .replace(/\b(the|and|or|of|in|at|for)\b/gi, '')
      .trim()
      .replace(/\s+/g, '')
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, 'X')
  const now = new Date()
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${code}${mm}${ss}`
}
