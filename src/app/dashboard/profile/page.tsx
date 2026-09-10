import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getAllSubscriptions } from '@/infra/supabase/subscriptions-repo'
import { endedPlansFrom } from '../_shared/past-plans'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { dormNames } from '@/shared/dorm-registry'
import ProfileClient from './ProfileClient'
import ProfileLoading from './loading'

const PREVIEW_ENDED = [
  { id: 'prev-old-1', plan_name: 'Monthly Premium', start_date: '2026-02-01', end_date: '2026-03-01', total_meals: 24, delivered_meals: 22 },
  { id: 'prev-old-2', plan_name: 'Weekly Flex', start_date: '2026-01-15', end_date: '2026-01-22', total_meals: 6, delivered_meals: 5 },
  { id: 'prev-old-3', plan_name: 'Trial', start_date: '2026-01-10', end_date: '2026-01-10', total_meals: 1, delivered_meals: 1 },
]

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; state?: string; loading?: string; error?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    // Dev-only state harness:
    //   ?state=verified (default) | unverified | nowhatsapp | nosub | pending
    //          | promoted | mix | noplans   &loading=1  &error=1
    if (params.loading === '1') return <ProfileLoading />
    if (params.error === '1') throw new Error('Preview: forced error boundary')
    const st = params.state ?? 'verified'
    const isMix = st === 'mix'
    const customer = {
      id: 'preview', cid: 'YUG6750', name: 'Saad Hazari', email: 'preview@dormers.ae',
      whatsapp_number: st === 'nowhatsapp' ? null : '+971 50 000 0000',
      whatsapp_verified: st !== 'unverified' && st !== 'nowhatsapp',
      dorm_name: 'YUGO',
      meal_preference_type: isMix ? 'Religious Preference' : 'Non Veg',
      allergens: 'None', spice_level_preference: 'Medium', created_at: '2026-02-01T00:00:00Z',
      week_type: '6DAYS' as const,
      veg_days: isMix ? ['Monday', 'Wednesday'] : null,
      ...(st === 'pending' ? { pending_meal_preference_type: 'Veg', pending_week_type: '5DAYS' as const, pending_allergens: 'Dairy, Nuts', pending_spice_level_preference: 'Mild' } : {}),
      ...(st === 'promoted' ? { preferences_promoted_at: new Date().toISOString() } : {}),
    }
    const hasSub = st !== 'nosub' && st !== 'promoted'
    return (
      <ProfileClient
        customer={customer}
        userEmail="preview@dormers.ae"
        emailConfirmed={st !== 'unverified'}
        activeSubscription={hasSub ? { week_type: '6DAYS', veg_days: isMix ? ['Monday', 'Wednesday'] : null } : null}
        endedPlans={st === 'noplans' ? [] : PREVIEW_ENDED}
        dorms={['YUGO', 'Study World', 'Uninest']}
      />
    )
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [{ data: authData }, customer, activeSubscription, allSubscriptions, locs] = await Promise.all([
    supabase.auth.getUser(),
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getAllSubscriptions(user.id),
    getDormLocations(),
  ])
  const emailConfirmed = !!authData?.user?.email_confirmed_at

  // Past plans live on this page (the account-records surface); the full
  // record is one link away at /dashboard/history. getAllSubscriptions is
  // React-cached and already selects every column, so this costs no extra
  // round-trip.
  const endedPlans = endedPlansFrom(allSubscriptions)

  return (
    <ProfileClient
      customer={customer}
      userEmail={user.email}
      emailConfirmed={emailConfirmed}
      activeSubscription={activeSubscription}
      endedPlans={endedPlans}
      dorms={dormNames(locs)}
    />
  )
}
