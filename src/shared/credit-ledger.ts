/**
 * Customer-facing vocabulary for the credits ledger.
 *
 * The `credits.source` column is written by several contexts (referrals,
 * dorm-wars, subscriptions, admin) with machine tags. Every surface that
 * shows a credit to a customer translates through here, so the same row
 * is never called two different things on two screens.
 *
 * Lives in the shared kernel because the vocabulary genuinely crosses
 * contexts: minted in three, spent by payments, displayed by the dashboard.
 * No imports on purpose.
 */

export type CreditSourceCategory = 'referral' | 'season' | 'reward' | 'admin' | 'other'

export interface CreditSourceInfo {
  label: string
  category: CreditSourceCategory
}

const EXACT: Record<string, CreditSourceInfo> = {
  intake_waitlist:       { label: 'Season pause credit',  category: 'season' },
  referral_conversion:   { label: 'Referral reward',      category: 'referral' },
  streak_chest:          { label: 'Dorm Wars reward',     category: 'reward' },
  tier_4_meals:          { label: 'Dorm Wars reward',     category: 'reward' },
  tier_3_jacket:         { label: 'Dorm Wars reward',     category: 'reward' },
  layer4_weekly_review:  { label: 'Weekly review reward', category: 'reward' },
  layer4_monthly_review: { label: 'Monthly wrap reward',  category: 'reward' },
  layer4_anniversary:    { label: 'Anniversary reward',   category: 'reward' },
}

const FALLBACK: CreditSourceInfo = { label: 'Credit', category: 'other' }

/** Strip the composable machine suffixes: a purchase that uses part of a
 *  credit re-deposits the rest as `<source>_split_remainder`, and the
 *  doubler tags payouts with `_2x` (applyDoubler). Order matters — the
 *  remainder suffix is appended to the already-tagged source. */
function baseSource(source: string): string {
  let s = source
  if (s.endsWith('_split_remainder')) s = s.slice(0, -'_split_remainder'.length)
  if (s.endsWith('_2x')) s = s.slice(0, -'_2x'.length)
  return s
}

export function classifyCreditSource(source: string | null | undefined): CreditSourceInfo {
  if (!source) return FALLBACK
  const base = baseSource(source)
  const exact = EXACT[base]
  if (exact) return exact
  if (base.startsWith('cycle_milestone_')) return { label: 'Dorm Wars reward', category: 'reward' }
  if (base.startsWith('admin_manual_'))    return { label: 'Credit from Dormers', category: 'admin' }
  return FALLBACK
}

/**
 * True when a credit counts as money the customer EARNED playing — referral
 * conversions and Dorm Wars rewards. The Refer & Earn badge and the Dorm Wars
 * hub wallet sum only these, so season pause credit and admin grants can
 * never dress up as winnings.
 *
 * Null/unknown sources stay included on purpose: rows minted before the
 * source column existed are all referral / Dorm Wars payouts, and excluding
 * them would silently shrink long-time customers' wallets.
 */
export function countsAsGameEarnings(source: string | null | undefined): boolean {
  const { category } = classifyCreditSource(source)
  return category !== 'season' && category !== 'admin'
}
