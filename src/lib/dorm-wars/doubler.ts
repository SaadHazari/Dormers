// src/lib/dorm-wars/doubler.ts
// Phase 8F — Streak Chest "week-long doubler" outcome (5% RNG bucket).
//
// When a customer opens a chest and rolls the 'doubler' bucket, the chest
// row carries doubler_expires_at = now() + 7 days. While that timestamp is
// in the future, every Layer 1 (per-conversion AED) and Layer 2 (cycle
// milestone) deposit doubles. Layer 3 lifetime tiers are NOT doubled —
// the doubler is a referral / engagement boost, not a tier accelerator.
//
// Active-state resolution is point-in-time: each award checks at fire-time.
// If two milestones fire in the same call and the doubler expires between
// them (extremely rare; sub-second), each is evaluated independently. No
// retroactive un-doubling.
//
// Source string suffix: when doubled, callers tag the credits.source with
// '_2x' (e.g. 'referral_conversion_2x', 'cycle_milestone_6_2x') for ops
// analytics. Lets us measure how much extra AED the doubler distributes
// without joining back to streak_chests.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any }

/**
 * Returns true if the customer has a doubler that hasn't expired yet.
 * Cheap query: looks at the single most-recent doubler chest and compares
 * its expiry to now(). The UNIQUE(customer_id, streak_day) constraint on
 * streak_chests + the 8-day cooldown mean a customer can't have two
 * active doublers at once, so "most recent" is sufficient.
 */
export async function isDoublerActive(
  sb: Sb,
  customerId: string,
): Promise<boolean> {
  const { data } = await sb
    .from('streak_chests')
    .select('doubler_expires_at')
    .eq('customer_id', customerId)
    .eq('rng_bucket', 'doubler')
    .order('claimed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const expires = data?.doubler_expires_at as string | null | undefined
  if (!expires) return false
  return new Date(expires).getTime() > Date.now()
}

/**
 * Returns the active doubler's expiry timestamp + remaining ms, or null.
 * Used by the UI to render "2× rewards · Nd left" banners.
 */
export async function getActiveDoublerExpiry(
  sb: Sb,
  customerId: string,
): Promise<{ expiresAt: string; msRemaining: number } | null> {
  const { data } = await sb
    .from('streak_chests')
    .select('doubler_expires_at')
    .eq('customer_id', customerId)
    .eq('rng_bucket', 'doubler')
    .order('claimed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const expires = data?.doubler_expires_at as string | null | undefined
  if (!expires) return null
  const expiryMs = new Date(expires).getTime()
  const ms = expiryMs - Date.now()
  if (ms <= 0) return null
  return { expiresAt: expires, msRemaining: ms }
}

/**
 * Applies the doubler multiplier to a base AED value.
 * Returns { value, source } where source carries the '_2x' suffix when
 * doubled — caller pipes both straight into the credits insert.
 */
export function applyDoubler(
  baseAed: number,
  baseSource: string,
  doublerActive: boolean,
): { value: number; source: string } {
  if (!doublerActive) return { value: baseAed, source: baseSource }
  return { value: baseAed * 2, source: `${baseSource}_2x` }
}
