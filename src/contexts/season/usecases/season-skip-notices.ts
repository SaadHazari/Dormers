import 'server-only'

/**
 * The one place a credited skip is announced (spec §7.2 "Messages", N6).
 *
 * Plan E wires the WhatsApp template `season_skip_credited` (first_name,
 * wrap_up_day, credit_aed) here, behind its fail-closed env flag. Until that
 * template is approved at Meta, the customer hears about the credit in the app
 * only: the skip sheet before, the toast after, the wallet row. Never queue
 * meal_skipped_confirm / meal_skip_scheduled_confirm for these: both promise a
 * make-up meal that is not coming.
 */

import type { SeasonSkipReceipt } from '../domain/season-skip-receipt'

export async function announceSeasonSkipCredited(receipts: readonly SeasonSkipReceipt[]): Promise<void> {
  for (const receipt of receipts) {
    console.info('season_skip_credited (in-app only until the WhatsApp template ships)', {
      subscriptionId: receipt.subscriptionId,
      mealDates: receipt.mealDates,
      creditFils: receipt.creditFils,
      source: receipt.source,
    })
  }
}
