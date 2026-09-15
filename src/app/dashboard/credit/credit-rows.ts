/**
 * How one credit row reads in the wallet ledger. Pure, shared by the desktop
 * and mobile ledgers, so a pending skip credit (spec §7.2 "Approval") says when
 * it arrives in the same words on both.
 */

import { formatAed } from '@/contexts/season/domain/meal-value'
import { addDaysIso, formatShortDay } from '@/contexts/season/domain/season-dates'

export interface CreditRowFacts {
  amount_aed: number | string
  status: 'pending' | 'approved' | 'applied'
  created_at: string
  meal_date?: string | null
}

export function creditRowAmount(item: CreditRowFacts): string {
  const amount = formatAed(Math.round(Number(item.amount_aed) * 100))
  return item.status === 'applied' ? `${amount} used` : amount
}

/** season_skip_credit_tick releases pending credit at 00:40 the night after the meal. */
export function creditRowDateLine(item: CreditRowFacts, dateLabel: (iso: string) => string): string {
  if (item.status === 'pending' && item.meal_date) return `Arrives ${formatShortDay(addDaysIso(item.meal_date, 1))}`
  return dateLabel(item.created_at)
}
