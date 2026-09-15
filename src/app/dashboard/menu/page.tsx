import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getQueuedSubscription, getAllSubscriptions, getCompanyClosureDates } from '@/infra/supabase/subscriptions-repo'
import { getIntakeState } from '@/infra/config/intake'
import { missingProfileFields } from '@/contexts/subscriptions/domain/profile-completion'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import MenuClient from './MenuClient'
import { getMenuDishes } from '@/infra/supabase/menu-catalog'
import MenuLoading from './loading'

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; state?: string; queued?: string; pref?: string; week?: string; closure?: string; now?: string; gate?: string; loading?: string; error?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    // Dev-only state harness:
    //   ?state=nosub (default) | active | skipped | paused | planned-pause
    //          | plan-ends | last-day | scheduled | held | resumed | midweek | ended | credited | season-held | season-ready
    //   &queued=1 (with plan-ends: days after end_date stay "Upcoming")
    //   &pref=veg|mix  &week=5  &closure=today|1
    //   &gate=season|zone|profile — why renewing is closed right now
    //   &now=YYYY-MM-DD — pin the fixture's today; pair it with a client fake
    //                     clock so past days (paused, before the plan) show
    //   &loading=1  &error=1
    if (params.loading === '1') return <MenuLoading />
    if (params.error === '1') throw new Error('Preview: forced error boundary')
    const st = params.state ?? 'nosub'
    const nowMs = params.now && /^\d{4}-\d{2}-\d{2}$/.test(params.now) ? Date.parse(params.now + 'T08:00:00Z') : Date.now()
    const d = (off: number) => new Date(nowMs + 4 * 3600000 + off * 86400000).toISOString().slice(0, 10)
    const weekType = params.week === '5' ? '5DAYS' as const : '6DAYS' as const
    const isMix = params.pref === 'mix'
    const mealPref = params.pref === 'veg' ? 'Veg' : isMix ? 'Religious Preference' : 'Non Veg'
    const planRow = (over: Record<string, unknown> = {}) => ({
      plan_name: 'Monthly Premium',
      week_type: weekType,
      veg_days: isMix ? ['Monday', 'Wednesday'] : null,
      meal_preference_type: mealPref,
      status: 'Active',
      resume_cutoff_date: null,
      skipped_dates: [] as string[],
      paused_dates: [] as string[],
      planned_pause_start: null,
      start_date: d(-10),
      end_date: d(20),
      ...over,
    })
    const sub =
      st === 'nosub' || st === 'ended' ? null
      : st === 'skipped' ? planRow({ status: 'Skipped', skipped_dates: [d(-1), d(0), d(2)] })
      // Paused two days ago, end date close: past days read "Paused" and next
      // week stays "Paused" rather than "Renew to unlock".
      // Held for next semester: during the break (season-held) and after reopening (season-ready).
      : st === 'season-held' || st === 'season-ready' ? planRow({ status: 'Paused', paused_dates: [d(-2), d(-1)], season_hold_id: 'preview-hold' })
      // Season wind-down: yesterday's skip and one two days out became wallet credit.
      : st === 'credited' ? planRow({ skipped_dates: [d(-1), d(2)], credited_skip_dates: [d(-1), d(2)] })
      : st === 'paused' ? planRow({ status: 'Paused', paused_dates: [d(-2), d(-1)], end_date: d(6) })
      : st === 'planned-pause' ? planRow({ planned_pause_start: d(2) })
      : st === 'plan-ends' ? planRow({ end_date: d(2) })
      : st === 'last-day' ? planRow({ end_date: d(0) })
      : st === 'scheduled' ? planRow({ status: 'Scheduled', start_date: d(5), end_date: d(33) })
      // A staff renewal still waiting for approval after its start date.
      : st === 'held' ? planRow({ plan_name: 'Staff Monthly', status: 'Scheduled', start_date: d(-2), end_date: d(26) })
      : st === 'resumed' ? planRow({ resume_cutoff_date: d(0), paused_dates: [d(-2), d(-1), d(0)] })
      : st === 'midweek' ? planRow({ start_date: d(-1), end_date: d(27) })
      : planRow()
    const endedPlan = st === 'ended' ? planRow({ status: 'Ended', start_date: d(-30), end_date: d(-2), skipped_dates: [d(-8)] }) : null
    return (
      <Suspense>
        <MenuClient
          // veg_days lives on the customer too, so state=nosub&pref=mix is a
          // religious signup who hasn't bought a plan yet.
          customer={{ id: 'preview', cid: 'YUG6750', name: 'Saad Hazari', email: 'preview@dormers.ae', meal_preference_type: mealPref, veg_days: isMix ? ['Monday', 'Wednesday'] : null, dorm_name: 'YUGO', created_at: new Date().toISOString(), week_type: weekType }}
          activeSubscription={sub}
          endedPlan={endedPlan}
          userEmail="preview@dormers.ae"
          hasQueuedRenewal={params.queued === '1'}
          // ?closure=today — the kitchen is closed TODAY; ?closure=1 — closed
          // the next two days (mirrors the home page's knob).
          closureDates={params.closure === 'today' ? [d(0), d(1)] : params.closure === '1' ? [d(1), d(2)] : []}
          seasonPhase={st === 'season-held' ? 'break' : 'open'}
          renewGate={{ intakePaused: params.gate === 'season', outOfZone: params.gate === 'zone', profileIncomplete: params.gate === 'profile' }}
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
  const [customer, activeSubscription, queuedSub, allSubscriptions, menuDishes, closureDates, intake] = await Promise.all([
    getCustomer(user.id),
    getActiveSubscription(user.id),
    getQueuedSubscription(user.id),
    getAllSubscriptions(user.id),
    getMenuDishes(),
    getCompanyClosureDates(),
    getIntakeState(),
  ])

  // A returning customer's week is read against the plan that ended, so the
  // days after its last dinner stay locked instead of turning back into
  // full-colour dinners overnight (2026-09-14).
  const endedPlan = activeSubscription
    ? null
    : (allSubscriptions as Array<{ status: string | null; end_date: string }>)
        .filter(s => s.status === SUBSCRIPTION_STATUS.ENDED)
        .sort((a, b) => b.end_date.localeCompare(a.end_date))[0] ?? null

  return (
    <Suspense>
      <MenuClient
        customer={customer}
        activeSubscription={activeSubscription}
        endedPlan={endedPlan}
        userEmail={user.email}
        hasQueuedRenewal={!!queuedSub}
        menuData={menuDishes}
        closureDates={closureDates}
        // The dashboard plan card's renew gates: season pause, out-of-zone
        // dorm, unfinished profile.
        renewGate={{
          intakePaused: intake.paused,
          outOfZone: !!customer?.out_of_zone,
          profileIncomplete: missingProfileFields(customer).length > 0,
        }}
        seasonPhase={intake.phase}
      />
    </Suspense>
  )
}
