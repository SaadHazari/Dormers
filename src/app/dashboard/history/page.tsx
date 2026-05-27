import { createClient } from '@/utils/supabase/server'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { redirect } from 'next/navigation'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import HistoryClient, { type EndedPlan } from './HistoryClient'

const PREVIEW_PLANS: EndedPlan[] = [
  {
    id: 'preview-old-1',
    plan_name: 'Monthly Premium',
    status: 'Ended',
    start_date: '2026-02-01T00:00:00Z',
    end_date:   '2026-03-01T00:00:00Z',
    total_meals: 24,
    delivered_meals: 22,
    skipped_meals_count: 2,
  },
  {
    id: 'preview-old-2',
    plan_name: 'Weekly Flex',
    status: 'Ended',
    start_date: '2026-01-15T00:00:00Z',
    end_date:   '2026-01-22T00:00:00Z',
    total_meals: 6,
    delivered_meals: 5,
    skipped_meals_count: 1,
  },
]

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    return <HistoryClient plans={PREVIEW_PLANS} />
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: ended } = await supabase
    .from('subscriptions')
    .select('id, plan_name, status, start_date, end_date, total_meals, delivered_meals, skipped_meals_count')
    .eq('customer_id', user.id)
    .eq('status', SUBSCRIPTION_STATUS.ENDED)
    .order('end_date', { ascending: false })

  return <HistoryClient plans={(ended ?? []) as EndedPlan[]} />
}
