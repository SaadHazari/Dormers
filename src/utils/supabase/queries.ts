import { cache } from 'react'
import { createClient } from './server'

// React `cache()` deduplicates these calls inside a single render. When the
// layout and a page both ask for the same user's customer row, only one
// network round-trip happens — both callers receive the same Promise.

export const getCustomer = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  return data
})

export const getActiveSubscription = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('customer_id', userId)
    .in('status', ['Active', 'Paused', 'Scheduled'])
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
})

export const getAllSubscriptions = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
})

export const getReferralCount = cache(async (userId: string) => {
  const supabase = await createClient()
  try {
    const { count } = await supabase
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', userId)
    return count ?? 0
  } catch {
    return 0
  }
})
