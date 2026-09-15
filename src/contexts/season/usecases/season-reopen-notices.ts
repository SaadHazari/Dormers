import 'server-only'

/**
 * The one place reopening is announced to the owner (spec §5 "offer the
 * reopening notice", §11.7 "Reopened"). Customers hear about it when the
 * owner launches the reopening notice from the Season page: credit holders
 * and past customers through the broadcast (N15, N16), held plans through
 * the season outbox (N17, season_queue_reopen_notices). If the notice has
 * not gone out two hours later, season_invariants_tick reminds the owner.
 */

import { notifyAdmin } from '@/infra/admin-alerts/notify'
import type { SeasonReopenSummary } from '../domain/season-reopen'

export function reopenedOwnerMessage(summary: SeasonReopenSummary): string {
  const plans = summary.readyHolds === 1 ? '1 held plan is ready' : `${summary.readyHolds} held plans are ready`
  const pauses = summary.readyCustomerPauses === 1 ? '1 customer pause can resume' : `${summary.readyCustomerPauses} customer pauses can resume`
  return `Reopened. ${plans} and ${pauses}. Nothing restarts on its own. Send the reopening notice from the Season page: it tells credit holders and past customers, and every held plan that its meals are ready. You get a reminder in two hours if it has not gone out.`
}

export async function announceSeasonReopened(summary: SeasonReopenSummary): Promise<void> {
  await notifyAdmin(reopenedOwnerMessage(summary), 'season_reopen')
}
