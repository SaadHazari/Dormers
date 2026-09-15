/**
 * What a credited skip leaves behind for messaging (spec §7.2, N6).
 * Pure: shared by the customer skip actions and the admin transitions.
 */

export interface SeasonSkipReceipt {
  subscriptionId: string
  customerId: string
  mealDates: string[]
  /** Credit per skipped day in fils; 0 for plans not paid in cash. */
  creditFils: number
  source: 'customer_skip' | 'reconciled'
}

/** Receipts from a season_schedule_end / season_move_end result. */
export function receiptsFromTransition(state: unknown): SeasonSkipReceipt[] {
  const list = (state as { reconciled?: unknown } | null)?.reconciled
  if (!Array.isArray(list)) return []
  const out: SeasonSkipReceipt[] = []
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    const row = item as { subscription_id?: unknown; customer_id?: unknown; meal_dates?: unknown; credit_fils?: unknown }
    if (typeof row.subscription_id !== 'string' || typeof row.customer_id !== 'string') continue
    if (!Array.isArray(row.meal_dates) || row.meal_dates.length === 0 || typeof row.credit_fils !== 'number') continue
    out.push({
      subscriptionId: row.subscription_id,
      customerId: row.customer_id,
      mealDates: row.meal_dates.map(String),
      creditFils: row.credit_fils,
      source: 'reconciled',
    })
  }
  return out
}
