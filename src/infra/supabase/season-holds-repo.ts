import type { SupabaseClient } from '@supabase/supabase-js'
import { customerHoldFrom, type CustomerHold } from '@/contexts/season/domain/customer-hold'

/**
 * The customer's own hold (spec §6.3). season_holds and credits are readable
 * by the customer through RLS, so the dashboard's user client reads them. A
 * read error shows no card rather than a wrong one.
 */

export type HoldsClient = Pick<SupabaseClient, 'from'>

export async function getCustomerHold(
  sb: HoldsClient,
  sub: { id: string; plan_name: string; status: string | null; season_hold_id?: string | null } | null,
): Promise<CustomerHold | null> {
  if (!sub?.season_hold_id) return null
  const holdRes = await sb
    .from('season_holds')
    .select('id, reason, state, held_meals, waitlist_credit_id')
    .eq('id', sub.season_hold_id)
    .maybeSingle()
  if (holdRes.error || !holdRes.data) return null
  const hold = holdRes.data as Record<string, unknown>

  let creditAmountAed: number | null = null
  if (typeof hold.waitlist_credit_id === 'string') {
    const creditRes = await sb.from('credits').select('amount_aed').eq('id', hold.waitlist_credit_id).maybeSingle()
    if (!creditRes.error && creditRes.data) creditAmountAed = Number((creditRes.data as { amount_aed: number | string }).amount_aed)
  }
  return customerHoldFrom({ hold, sub, creditAmountAed })
}
