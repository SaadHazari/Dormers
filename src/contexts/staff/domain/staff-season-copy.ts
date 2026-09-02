/**
 * How a season refusal is worded, per reader.
 *
 * An intern reading /staff/plan and an admin reading /admin/staff need
 * different things from the same fact. The intern needs to know their pay
 * isn't lost and that nothing is expected of them; the admin needs to know
 * which switch to flip. Before this, the 6-day staff option leaked the
 * customer sign-up line — "Save your spot and we will message you the day
 * we reopen" — at an employee, which reads as though their salary had been
 * turned into a waiting list.
 */

import type { StaffIntakeGate } from './staff-intake-gate'

function prettyDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AE', {
    day: 'numeric', month: 'long',
  })
}

export function staffSeasonRefusal(
  gate: Extract<StaffIntakeGate, { ok: false }>,
  reader: 'intern' | 'admin',
): string {
  if (reader === 'admin') {
    return gate.reason === 'paused'
      ? 'Meal plans are paused, so approving this would start a cycle while the kitchen is closed to everyone else. Reopen the season on /admin/season first — the renewal keeps waiting, and its first delivery day is set whenever you approve.'
      : `This cycle would run past the last delivery day${gate.lastDeliveryDay ? ` (${prettyDay(gate.lastDeliveryDay)})` : ''}, so it can't be approved for this term.`
  }
  return gate.reason === 'paused'
    ? "Meal plans are paused at the moment, so we can't start your next cycle yet. Nothing is lost and there's nothing for you to do — we'll sort it out as soon as the kitchen is back."
    : `Your next cycle would run past our last delivery day${gate.lastDeliveryDay ? ` (${prettyDay(gate.lastDeliveryDay)})` : ''}, so it'll wait until the kitchen reopens. Nothing is lost.`
}
