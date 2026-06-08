import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { OverviewClient } from './OverviewClient'

export default async function AdminOverviewPage() {
    const sb = createAdminSupabaseClient()

    const [kpiResult, cronResult, recentOrdersResult] = await Promise.all([
        sb.rpc('admin_kpi_snapshot'),
        sb.rpc('admin_cron_health'),
        sb
            .from('orders')
            .select('id, customer_id, plan, meals_count, price_per_meal, payment_date, created_at')
            .order('created_at', { ascending: false })
            .limit(10),
    ])

    const kpis = (kpiResult.data as Record<string, number>) ?? {
        active_subs: 0, scheduled_subs: 0, todays_deliveries: 0,
        pending_referrals: 0, pending_layer4: 0, total_customers: 0,
        failed_notifications: 0, revenue_30d: 0, new_customers_7d: 0,
        ended_subs_7d: 0,
    }

    const cronJobs = (cronResult.data as Array<Record<string, unknown>>) ?? []

    const recentOrders = (recentOrdersResult.data ?? []) as Array<{
        id: string
        customer_id: string
        plan: string
        meals_count: number
        price_per_meal: number
        payment_date: string | null
        created_at: string
    }>

    return (
        <OverviewClient
            kpis={kpis}
            cronJobs={cronJobs}
            recentOrders={recentOrders}
        />
    )
}
