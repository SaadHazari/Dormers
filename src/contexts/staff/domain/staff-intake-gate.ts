/**
 * Does the season allow this staff cycle to begin?
 *
 * Staff meals are remuneration rather than a sale, and for a long time the
 * staff paths reflected that by ignoring the season entirely — no file in
 * this context mentioned intake. The result was incoherent rather than
 * generous: during a pause the free 5-day plan was created happily while
 * the 6-day option beside it, which goes through normal checkout, refused
 * the same intern with customer sign-up copy. And with a last delivery day
 * set, a staff cycle could be scheduled to run past the day the kitchen
 * shuts, promising meals on days nobody is cooking.
 *
 * Staff now follow the same rule as everyone: no new cycle while sign-ups
 * are paused, and no cycle that outlives the season.
 *
 * This returns the FACT, not the wording. An intern and an admin need to
 * hear different things — "we'll set it up when we're back" versus "reopen
 * the season first" — so each caller words it for its own reader.
 *
 * Fails open by construction: getIntakeState returns paused:false and
 * pauseScheduledFor:null when the settings row is missing or unreadable, so
 * a blip reading a settings row never withholds an intern's pay.
 */

export type StaffIntakeGate =
  | { ok: true }
  | { ok: false; reason: 'paused' | 'season-ending'; lastDeliveryDay: string | null }

export function staffIntakeGate({
  paused,
  pauseScheduledFor,
  cycleEndIso,
}: {
  paused: boolean
  pauseScheduledFor: string | null
  /** End date of the cycle being started, or null when there isn't one to
   *  judge yet — the pause check still applies. */
  cycleEndIso: string | null
}): StaffIntakeGate {
  // The pause is the harder stop: it refuses regardless of dates, so it is
  // the honest thing to report when both apply.
  if (paused) return { ok: false, reason: 'paused', lastDeliveryDay: pauseScheduledFor }

  // A cycle ending ON the last delivery day is fine — that day still cooks.
  if (pauseScheduledFor && cycleEndIso && cycleEndIso > pauseScheduledFor) {
    return { ok: false, reason: 'season-ending', lastDeliveryDay: pauseScheduledFor }
  }

  return { ok: true }
}
