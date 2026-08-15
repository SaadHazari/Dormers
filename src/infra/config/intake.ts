import 'server-only'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

/**
 * Seasonal intake pause — the operator switch that stops all new plan
 * purchases between semesters.
 *
 * Sibling of feature-flags.ts and deliberately the same shape: a short
 * in-memory cache over a service-role read, so flipping the switch in the
 * admin panel takes effect within CACHE_TTL_MS with no redeploy.
 *
 * FAIL OPEN: if the read errors or the row is missing, intake stays OPEN.
 * A settings-table outage must never block a sale — the switch exists for
 * deliberate pausing, not as a hard dependency of checkout.
 */

const CACHE_TTL_MS = 30_000

export interface IntakeState {
  paused: boolean
  headline: string
  body: string
  creditNonvegAed: number
  creditVegAed: number
  creditReligiousAed: number
  /** Stamped on every pause-ON, never cleared. Keys the "pausing" takeover's
   *  once-per-cycle dismissal flag (see ClientDashboard.tsx) — separate from
   *  paused_at, which IS cleared on resume and so cannot key it. Null until
   *  the switch has been paused at least once. */
  cycleStartedAt: string | null
  /** Stamped on every pause-OFF, never cleared. Same reasoning, keys the
   *  "reopened" takeover. Null until the switch has been reopened at least
   *  once. */
  cycleEndedAt: string | null
}

/** Used when the row is missing or unreadable. Intake stays open. */
const FAIL_OPEN: IntakeState = {
  paused: false,
  headline: '',
  body: '',
  creditNonvegAed: 20,
  creditVegAed: 15,
  creditReligiousAed: 20,
  cycleStartedAt: null,
  cycleEndedAt: null,
}

let cache: { state: IntakeState; at: number } | null = null

export async function getIntakeState(): Promise<IntakeState> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.state

  try {
    const sb = createAdminSupabaseClient()
    const { data, error } = await sb
      .from('intake_settings')
      .select('paused, headline, body, credit_nonveg_aed, credit_veg_aed, credit_religious_aed, cycle_started_at, cycle_ended_at')
      .maybeSingle()
    if (error) throw error
    if (!data) return FAIL_OPEN

    const row = data as Record<string, unknown>
    const state: IntakeState = {
      paused: row.paused === true,
      headline: String(row.headline ?? ''),
      body: String(row.body ?? ''),
      creditNonvegAed: Number(row.credit_nonveg_aed ?? FAIL_OPEN.creditNonvegAed),
      creditVegAed: Number(row.credit_veg_aed ?? FAIL_OPEN.creditVegAed),
      creditReligiousAed: Number(row.credit_religious_aed ?? FAIL_OPEN.creditReligiousAed),
      cycleStartedAt: row.cycle_started_at == null ? null : String(row.cycle_started_at),
      cycleEndedAt: row.cycle_ended_at == null ? null : String(row.cycle_ended_at),
    }
    cache = { state, at: Date.now() }
    return state
  } catch {
    return FAIL_OPEN // never let a settings-read failure close the shop
  }
}

/**
 * The waitlist credit this customer is owed, by meal preference.
 * Religious Preference takes the non-veg figure (owner decision) because
 * the plan includes non-veg days and is priced closer to non-veg than veg.
 * Unknown or missing preference errs generous rather than stingy.
 */
export function creditAedFor(
  state: IntakeState,
  mealPreferenceType: string | null | undefined,
): number {
  if (mealPreferenceType === 'Veg') return state.creditVegAed
  if (mealPreferenceType === 'Religious Preference') return state.creditReligiousAed
  return state.creditNonvegAed
}

// "Has this customer joined the waitlist" now lives on getWaitlistStatus()
// in subscriptions-repo.ts (.joined) — the single source of truth shared by
// the Now-tray entries, the plan-ending banner, and both plan-page gates.
// hasJoinedIntakeWaitlist() was removed so there's exactly one function
// computing that fact.

/** Test seam — clear the in-memory cache between tests. */
export function __resetIntakeCache(): void {
  cache = null
}
