import 'server-only'

/**
 * The one place a credited skip is announced (spec §7.2 "Messages", N6).
 *
 * The WhatsApp template `season_skip_credited` (first_name, wrap_up_day,
 * credit_aed) is queued only behind WHATSAPP_SEASON_TEMPLATES_ENABLED, which
 * fails closed until the template is approved at Meta and its tpl_ secret
 * exists. Until then the customer hears about the credit in the app only:
 * the skip sheet before, the toast after, the wallet row. Never queue
 * meal_skipped_confirm / meal_skip_scheduled_confirm for these: both promise
 * a make-up meal that is not coming.
 */

import { queueCustomerNotification } from '@/contexts/notifications/usecases/queue'
import { getIntakeState } from '@/infra/config/intake'
import { aedText } from '../domain/season-messages'
import type { SeasonSkipReceipt } from '../domain/season-skip-receipt'

export function seasonWhatsAppEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WHATSAPP_SEASON_TEMPLATES_ENABLED === 'true'
}

export async function announceSeasonSkipCredited(receipts: readonly SeasonSkipReceipt[]): Promise<void> {
  if (receipts.length === 0) return
  const enabled = seasonWhatsAppEnabled()
  const intake = enabled ? await getIntakeState({ fresh: true }) : null
  for (const receipt of receipts) {
    if (enabled && intake?.wrapUpDay && receipt.creditFils > 0) {
      await queueCustomerNotification(receipt.customerId, 'season_skip_credited', new Date(), {
        wrap_up_day: intake.wrapUpDay,
        credit_aed: aedText((receipt.creditFils * Math.max(1, receipt.mealDates.length)) / 100),
      })
      continue
    }
    console.info('season_skip_credited (in-app only until the WhatsApp template ships)', {
      subscriptionId: receipt.subscriptionId,
      mealDates: receipt.mealDates,
      creditFils: receipt.creditFils,
      source: receipt.source,
    })
  }
}
