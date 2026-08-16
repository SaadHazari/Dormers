import { getUserFromHeaders } from '@/utils/supabase/auth'
import { createClient } from '@/utils/supabase/server'
import { getCustomer, getActiveSubscription, getAllSubscriptions, getQueuedSubscription, getMostRecentOrder, getWaitlistStatus } from '@/infra/supabase/subscriptions-repo'
import { redirect } from 'next/navigation'
import ClientDashboard from './ClientDashboard'
import { Suspense } from 'react'
import type { Viewport } from 'next'
import { getMonthlyReviewWindow } from '@/utils/supabase/monthly-review-queries'
import { getMenuDishes } from '@/infra/supabase/menu-catalog'
import { getIntakeState, creditAedFor } from '@/infra/config/intake'
import type { IntakeGateState } from './_shared/types'

// Tint the browser chrome / top status-bar orange to match the canopy. NOTE: on iOS
// this single value also tints the bottom chrome, and the top+bottom safe-areas are
// both painted by the <html> background-color (one value, no per-edge control —
// proven exhaustively). So both ends are orange by design; the page leans INTO the
// orange bottom strip (treating orange as a base the content sits on) rather than
// fighting it. See the home canopy notes in dashboard/layout.tsx.
export const viewport: Viewport = { themeColor: '#f57f20' }

const PREVIEW_CUSTOMER = {
    id: 'preview',
    cid: 'YUG6750',
    name: 'Saad Hazari',
    email: 'preview@dormers.ae',
    whatsapp_number: '+971 50 000 0000',
    dorm_name: 'YUGO',
    meal_preference_type: 'Non Veg',
    allergens: 'None',
    spice_level_preference: 'Medium',
    created_at: '2026-02-01T00:00:00Z',
}

const PREVIEW_SUBSCRIPTION = {
    id: 'preview-sub',
    plan_name: 'Monthly Premium',
    status: 'Active',
    start_date: '2026-04-01T00:00:00Z',
    end_date: '2026-05-01T00:00:00Z',
    total_meals: 24,
    delivered_meals: 6,
    skipped_meals_count: 1,
    has_paused_before: false,
    pause_date: null,
    last_skipped_date: null,
    paused_days: 0,
    created_at: '2026-04-01T00:00:00Z',
}

export default async function DashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ preview?: string }>
}) {
    const params = await searchParams
    const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

    if (isPreview) {
        return (
            <Suspense fallback={<Spinner />}>
                <ClientDashboard
                    customer={PREVIEW_CUSTOMER}
                    activeSubscription={PREVIEW_SUBSCRIPTION}
                    allSubscriptions={[PREVIEW_SUBSCRIPTION]}
                    userEmail={PREVIEW_CUSTOMER.email}
                />
            </Suspense>
        )
    }

    const user = await getUserFromHeaders()
    if (!user) redirect('/login')

    // Note: weeklyReviewState lives in the layout (for the Now tray) and isn't
    // needed here — the dashboard hero/grid don't surface weekly inline anymore.
    // monthlyWindow IS needed here for the post-cron strip + empty banner — the
    // React cache() wrapper makes the second call free since the layout fetched
    // it first. See project_now_tray_architecture memory.
    const supabase = await createClient()
    // Resolved first (cached 30s, so this is not a new round trip) so its
    // cycleStartedAt can scope the waitlist-join lookup below to the CURRENT
    // pause — see getWaitlistStatus.
    const intakeState = await getIntakeState()
    const [customer, activeSubscription, allSubscriptions, queuedSubscription, monthlyWindow, mostRecentOrder, menuDishes, waitlistStatus] = await Promise.all([
        getCustomer(user.id),
        getActiveSubscription(user.id),
        getAllSubscriptions(user.id),
        getQueuedSubscription(user.id),
        getMonthlyReviewWindow(user.id),
        getMostRecentOrder(user.id),
        getMenuDishes(),
        getWaitlistStatus(supabase, user.id, intakeState.cycleStartedAt),
    ])

    // Phase 7: the trial-gift banner shim is gone. Referee welcome meals are
    // now real subscriptions (planKind='gift'), so they surface through
    // getActiveSubscription naturally and render via ActiveDashboard — same
    // path as paid plans.

    // Same shape PlanClient/IntakePausedGate already consume — creditAed is
    // the prospective amount for this customer's meal preference (matches
    // what joinIntakeWaitlist will actually mint), not the ledger balance;
    // alreadyJoined comes from the shared getWaitlistStatus helper so this
    // fact can't drift from the Now-tray's.
    const intakePause: IntakeGateState = {
        paused: intakeState.paused,
        headline: intakeState.headline,
        body: intakeState.body,
        creditAed: creditAedFor(intakeState, customer?.meal_preference_type),
        alreadyJoined: waitlistStatus.joined,
        waitlistCreditAed: waitlistStatus.unspentCreditAed,
        cycleStartedAt: intakeState.cycleStartedAt,
        cycleEndedAt: intakeState.cycleEndedAt,
    }

    return (
        <Suspense fallback={<Spinner />}>
            <ClientDashboard
                customer={customer}
                activeSubscription={activeSubscription}
                allSubscriptions={allSubscriptions}
                queuedSubscription={queuedSubscription}
                userEmail={user.email}
                monthlyWindow={monthlyWindow}
                mostRecentOrder={mostRecentOrder}
                menuData={menuDishes}
                intakePause={intakePause}
            />
        </Suspense>
    )
}

function Spinner() {
    return (
        <div style={{ minHeight: '100vh', background: '#091825', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(245,127,32,0.3)', borderTopColor: '#f57f20', animation: 'spin 1s linear infinite' }} />
        </div>
    )
}
