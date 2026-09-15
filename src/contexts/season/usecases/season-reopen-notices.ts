import 'server-only'

/**
 * The one place reopening is announced (spec §5 "offer the reopening notice",
 * §11.7 "Reopened", N15 to N17).
 *
 * Plan F wires it: the owner's "Reopened" WhatsApp with the holds now ready,
 * the reminder if the reopening notice is not sent within 2 hours, and the
 * customer notices on WhatsApp and email. Until then customers see their
 * ready plan in the app (HeldPlanCard) and the owner sends the reopening
 * broadcast by hand.
 */

import type { SeasonReopenSummary } from '../domain/season-reopen'

export async function announceSeasonReopened(summary: SeasonReopenSummary): Promise<void> {
  console.info('season_reopened (reopening notices arrive with plan F)', summary)
}
