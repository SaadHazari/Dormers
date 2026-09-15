/**
 * The wallet credit an order really used, read from the credits table
 * (season spec §10.1, D7). The one reader for the Stripe webhook, free
 * checkout and scripts/backfill-order-money.ts, so all three count credit the
 * same way: rows redeemed in full count whole, the split row only by its used
 * part (creditUsedFils).
 *
 * Takes the Supabase client as an argument and imports nothing server-only,
 * so the tsx backfill script can import it too.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { creditUsedFils } from '@/contexts/payments/domain/order-money'

export interface CreditRowIds {
  /** Credit rows the order redeemed in full. */
  fullRowIds: readonly string[]
  /** Fils used from the one split boundary row, or null when nothing was split. */
  splitUseFils: number | null
}

/**
 * Fils of wallet credit the order consumed, or null when any full row cannot
 * be read (a read error, or fewer rows than ids). Null means the caller records
 * no money at all: a partial figure would under-credit every later season skip.
 */
export async function loadCreditUsedFils(sb: SupabaseClient, rows: CreditRowIds): Promise<number | null> {
  const ids = [...new Set(rows.fullRowIds)]
  let fullRowAmountsAed: Array<number | string> = []
  if (ids.length > 0) {
    const { data, error } = await sb.from('credits').select('id, amount_aed').in('id', ids)
    if (error || !data || data.length !== ids.length) return null
    fullRowAmountsAed = (data as Array<{ amount_aed: number | string }>).map((r) => r.amount_aed)
  }
  return creditUsedFils({ fullRowAmountsAed, splitUseFils: rows.splitUseFils })
}
