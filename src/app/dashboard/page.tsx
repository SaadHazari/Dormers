import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getAllSubscriptions, getQueuedSubscription, getMostRecentOrder } from '@/utils/supabase/queries'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import ClientDashboard from './ClientDashboard'
import { Suspense } from 'react'
import { computeTrialDeliveryDate, trialDeliveryLabel, type WeekType } from '@/contexts/referrals/domain/trial-delivery'
import { getMonthlyReviewWindow } from '@/utils/supabase/monthly-review-queries'

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
    const [customer, activeSubscription, allSubscriptions, queuedSubscription, monthlyWindow, mostRecentOrder] = await Promise.all([
        getCustomer(user.id),
        getActiveSubscription(user.id),
        getAllSubscriptions(user.id),
        getQueuedSubscription(user.id),
        getMonthlyReviewWindow(user.id),
        getMostRecentOrder(user.id),
    ])

    // ── Trial gift in flight? ──────────────────────────────────────────────
    // When a customer claims their free meal via /r/[cid] but hasn't yet
    // bought a paid plan, they have a `referrals` row with status='gift_claimed'
    // pointing at their auth user id but no `subscriptions` row. Surface this
    // as a "trial meal arriving" banner above the no-plan view so the user
    // can see their delivery is on the way — same intent as the active-plan
    // dashboard's HeroToday tile.
    let trialGift: { deliveryLabel: string; deliveryIso: string } | null = null
    if (!activeSubscription && customer) {
        const admin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        const { data: pendingGift } = await admin
            .from('referrals')
            .select('id, gift_claimed_at')
            .eq('invitee_user_id', user.id)
            .eq('status', 'gift_claimed')
            .gte('gift_claimed_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString())
            .order('gift_claimed_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (pendingGift) {
            const weekType = ((customer.week_type as WeekType | undefined) ?? '6DAYS')
            const deliveryDate = computeTrialDeliveryDate(new Date(pendingGift.gift_claimed_at), weekType)
            trialGift = {
                deliveryLabel: trialDeliveryLabel(deliveryDate, new Date(pendingGift.gift_claimed_at)),
                deliveryIso:   deliveryDate.toISOString(),
            }
        }
    }

    return (
        <Suspense fallback={<Spinner />}>
            <ClientDashboard
                customer={customer}
                activeSubscription={activeSubscription}
                allSubscriptions={allSubscriptions}
                queuedSubscription={queuedSubscription}
                userEmail={user.email}
                trialGift={trialGift}
                monthlyWindow={monthlyWindow}
                mostRecentOrder={mostRecentOrder}
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
