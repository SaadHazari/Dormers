import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getAllSubscriptions } from '@/utils/supabase/queries'
import { redirect } from 'next/navigation'
import ClientDashboard from './ClientDashboard'
import { Suspense } from 'react'

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

    const [customer, activeSubscription, allSubscriptions] = await Promise.all([
        getCustomer(user.id),
        getActiveSubscription(user.id),
        getAllSubscriptions(user.id),
    ])

    return (
        <Suspense fallback={<Spinner />}>
            <ClientDashboard
                customer={customer}
                activeSubscription={activeSubscription}
                allSubscriptions={allSubscriptions}
                userEmail={user.email}
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
