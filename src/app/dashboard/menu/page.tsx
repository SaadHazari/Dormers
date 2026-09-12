import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getQueuedSubscription } from '@/infra/supabase/subscriptions-repo'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import MenuClient from './MenuClient'
import { getMenuDishes } from '@/infra/supabase/menu-catalog'
import MenuLoading from './loading'

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; state?: string; queued?: string; pref?: string; week?: string; loading?: string; error?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    // Dev-only state harness:
    //   ?state=nosub (default) | active | skipped | paused | planned-pause
    //          | plan-ends | scheduled | resumed
    //   &queued=1 (with plan-ends: days after end_date stay "Upcoming")
    //   &pref=veg|mix  &week=5  &loading=1  &error=1
    if (params.loading === '1') return <MenuLoading />
    if (params.error === '1') throw new Error('Preview: forced error boundary')
    const st = params.state ?? 'nosub'
    const d = (off: number) => new Date(Date.now() + 4 * 3600000 + off * 86400000).toISOString().slice(0, 10)
    const weekType = params.week === '5' ? '5DAYS' as const : '6DAYS' as const
    const isMix = params.pref === 'mix'
    const mealPref = params.pref === 'veg' ? 'Veg' : isMix ? 'Religious Preference' : 'Non Veg'
    const sub = st === 'nosub' ? null : {
      week_type: weekType,
      veg_days: isMix ? ['Monday', 'Wednesday'] : null,
      status: st === 'paused' ? 'Paused' : st === 'skipped' ? 'Skipped' : st === 'scheduled' ? 'Scheduled' : 'Active',
      resume_cutoff_date: st === 'resumed' ? d(0) : null,
      skipped_dates: st === 'skipped' ? [d(-1), d(0), d(2)] : [],
      planned_pause_start: st === 'planned-pause' ? d(2) : null,
      start_date: st === 'scheduled' ? d(5) : d(-10),
      end_date: st === 'plan-ends' ? d(2) : d(20),
    }
    return (
      <Suspense>
        <MenuClient
          customer={{ id: 'preview', cid: 'YUG6750', name: 'Saad Hazari', email: 'preview@dormers.ae', meal_preference_type: mealPref, dorm_name: 'YUGO', created_at: new Date().toISOString(), week_type: weekType }}
          activeSubscription={sub}
          userEmail="preview@dormers.ae"
          hasQueuedRenewal={params.queued === '1'}
        />
      </Suspense>
    )
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  // Need the active sub to read week_type + veg_days (religious-mix per-day
  // snapshot). Falls back to customer.week_type if no sub yet.
  // queuedSub tells the menu whether to dim out-of-plan future days as
  // "Plan ends" — when a queued renewal exists those same days are simply
  // covered by the next cycle, so we leave them as normal "Upcoming".
  // Note: weeklyReviewState + monthlyWindow are both fetched in the layout
  // (for the Now tray) and no longer needed here — LastWeekSection and
  // MonthlyWrapTrigger used to live on this page but moved into the tray.
  // See project_now_tray_architecture memory.
  const [customer, activeSubscription, queuedSub, menuDishes] = await Promise.all([
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getQueuedSubscription(user.id),
    getMenuDishes(),
  ])

  return (
    <Suspense>
      <MenuClient
        customer={customer}
        activeSubscription={activeSubscription}
        userEmail={user.email}
        hasQueuedRenewal={!!queuedSub}
        menuData={menuDishes}
      />
    </Suspense>
  )
}
