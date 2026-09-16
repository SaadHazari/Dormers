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
  const plans = summary.readyHolds === 1 ? '1 kept plan is ready to restart' : `${summary.readyHolds} kept plans are ready to restart`
  const pauses = summary.readyCustomerPauses === 1 ? '1 customer-paused plan can resume' : `${summary.readyCustomerPauses} customer-paused plans can resume`
  return `Kitchen reopened. ${plans} and ${pauses}. Nothing restarts by itself. Press Tell customers we are open on the Season page: it tells people with credit, past customers, and everyone with kept meals. You get a reminder in two hours if it has not gone out.`
}

export async function announceSeasonReopened(summary: SeasonReopenSummary): Promise<void> {
  await notifyAdmin(reopenedOwnerMessage(summary), 'season_reopen')
}
