/**
 * Words for a skip that becomes wallet credit near the season end (spec §7.2, N6).
 * Pure so vitest can pin every sentence. A normal skip and a buffer grant keep
 * the existing make-up day copy: their make-up meal is really cooked.
 */

import { formatAed } from '@/contexts/season/domain/meal-value'
import { addDaysIso, formatShortDay } from '@/contexts/season/domain/season-dates'
import type { SeasonSkipNotice, SkipOutcome } from '@/contexts/season/domain/skip-outcome'

export interface CreditedSkipCopy {
  body: string
  cta: string
  tileLabel: string
  tileValue: string
  /** True when the skip cannot be confirmed (meal value unknown). */
  blocked: boolean
}

export function creditedSkipCopy(input: { wrapUpDay: string; creditFils: number | null; sameDay: boolean }): CreditedSkipCopy {
  const lead = `There's no delivery day left before ${formatShortDay(input.wrapUpDay)} to move this meal to.`
  const plainCta = input.sameDay ? 'Skip tonight' : 'Skip this day'
  if (input.creditFils == null) {
    return {
      body: `${lead} We can't work out this meal's value yet, so message us on WhatsApp before you skip it.`,
      cta: plainCta, tileLabel: 'Wallet', tileValue: 'Not known yet', blocked: true,
    }
  }
  if (input.creditFils <= 0) {
    return {
      body: `${lead} You can still skip it, but this meal is not moved to another day.`,
      cta: plainCta, tileLabel: 'End date', tileValue: 'No change', blocked: false,
    }
  }
  const amount = formatAed(input.creditFils)
  return {
    body: `${lead} Skip it and ${amount} goes to your wallet.`,
    cta: `Skip and add ${amount}`, tileLabel: 'Wallet', tileValue: `+${amount}`, blocked: false,
  }
}

export function seasonSkipSheet(outcome: SkipOutcome, wrapUpDay: string | null, sameDay: boolean): CreditedSkipCopy | null {
  if (outcome.kind !== 'credited' || !wrapUpDay) return null
  return creditedSkipCopy({ wrapUpDay, creditFils: outcome.creditFils, sameDay })
}

export function creditedSkipToast(notice: SeasonSkipNotice): string {
  if (notice.creditStatus === 'none' || notice.creditFils <= 0) return 'Skipped. This meal is not moved to another day.'
  const amount = formatAed(notice.creditFils)
  if (notice.creditStatus === 'approved') return `Skipped. ${amount} is in your wallet.`
  return `Skip scheduled. ${amount} arrives ${formatShortDay(addDaysIso(notice.mealDate, 1))}.`
}

/** The toast for a skip action's result, or undefined when it was an ordinary skip. */
export function seasonToastFor(result: unknown): string | undefined {
  const notice = (result as { seasonSkip?: SeasonSkipNotice } | null)?.seasonSkip
  return notice?.outcome === 'credited' ? creditedSkipToast(notice) : undefined
}

export function creditedUnskipBody(creditFils: number | null): string {
  return creditFils != null && creditFils > 0
    ? `Your meal for that day will be delivered, and the ${formatAed(creditFils)} waiting for it is cancelled.`
    : 'Your meal for that day will be delivered.'
}
