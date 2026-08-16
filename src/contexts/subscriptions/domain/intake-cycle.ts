/**
 * Which pause cycle does a waitlist join belong to?
 *
 * Pulled out of join-intake-waitlist.ts into its own pure module because
 * that file carries the `'use server'` directive, and Next.js only permits
 * async function exports from a `'use server'` module — `resolveJoinCycle`
 * is synchronous. See the header comment on
 * src/app/dashboard/_shared/intake-join-outcome.ts for the same constraint
 * applied to another pure helper.
 */

export type JoinCycle =
  | { ok: true; cycleStartedAt: string }
  | { ok: false; reason: 'not_paused' | 'no_cycle' }

/**
 * Which pause cycle is this join for?
 *
 * Pure so the rule is testable without Supabase. A join is only valid while
 * intake is paused AND that pause stamped a cycle. `intake_waitlist.cycle_started_at`
 * is NOT NULL, so an unstamped pause must be refused rather than inserted with
 * a null that would throw at the database.
 */
export function resolveJoinCycle(intake: { paused: boolean; cycleStartedAt: string | null }): JoinCycle {
  if (!intake.paused) return { ok: false, reason: 'not_paused' }
  if (!intake.cycleStartedAt) return { ok: false, reason: 'no_cycle' }
  return { ok: true, cycleStartedAt: intake.cycleStartedAt }
}
