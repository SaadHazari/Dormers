'use client'

import { useAdminTheme } from './_components/AdminThemeProvider'
import { KPIGrid } from './_components/KPIGrid'
import { PulseStrip, type CronJob } from './_components/PulseStrip'
import { QuickActions } from './_components/QuickActions'

interface RecentOrder {
    id: string
    customer_id: string
    plan: string
    meals_count: number
    price_per_meal: number
    payment_date: string | null
    created_at: string
}

interface Props {
    kpis: Record<string, number>
    cronJobs: Array<Record<string, unknown>>
    recentOrders: RecentOrder[]
}

export function OverviewClient({ kpis, cronJobs, recentOrders }: Props) {
    const { t } = useAdminTheme()

    const typedKpis = {
        active_subs:          kpis.active_subs ?? 0,
        scheduled_subs:       kpis.scheduled_subs ?? 0,
        todays_deliveries:    kpis.todays_deliveries ?? 0,
        pending_referrals:    kpis.pending_referrals ?? 0,
        pending_layer4:       kpis.pending_layer4 ?? 0,
        total_customers:      kpis.total_customers ?? 0,
        failed_notifications: kpis.failed_notifications ?? 0,
        revenue_30d:          kpis.revenue_30d ?? 0,
        new_customers_7d:     kpis.new_customers_7d ?? 0,
        ended_subs_7d:        kpis.ended_subs_7d ?? 0,
    }

    return (
        <div className="flex flex-col gap-5">
            {/* Header + quick actions */}
            <div>
                <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>
                    Overview
                </h1>
                <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                    {new Date().toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })}
                </p>
                <QuickActions
                    pendingReferrals={typedKpis.pending_referrals}
                    pendingLayer4={typedKpis.pending_layer4}
                />
            </div>

            {/* KPI cards */}
            <KPIGrid kpis={typedKpis} />

            {/* Pulse strip — cron health */}
            <PulseStrip jobs={cronJobs as unknown as CronJob[]} />

            {/* Recent orders */}
            <div className={`${t.card} rounded-xl p-4`}>
                <h2 className={`text-[11px] font-black tracking-[0.14em] uppercase mb-3 ${t.muted}`}>
                    Recent Orders
                </h2>
                {recentOrders.length === 0 ? (
                    <div className={`text-center py-6 text-sm font-semibold ${t.faint}`}>
                        No recent orders
                    </div>
                ) : (
                    <div className="flex flex-col gap-0">
                        {recentOrders.map(order => (
                            <div
                                key={order.id}
                                className={`flex items-center justify-between gap-3 py-2.5 border-b last:border-b-0 ${t.border}`}
                            >
                                <div className="min-w-0">
                                    <div className={`text-[13px] font-bold ${t.body}`}>
                                        {order.plan?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? 'Unknown'}
                                    </div>
                                    <div className={`text-[10px] font-semibold tabular-nums ${t.faint}`}>
                                        {order.meals_count} meals
                                        {order.payment_date && ` · ${formatDate(order.payment_date)}`}
                                    </div>
                                </div>
                                <div className={`text-[14px] font-black tabular-nums shrink-0 ${t.heading}`}>
                                    AED {Math.round(order.meals_count * order.price_per_meal)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('en-AE', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Dubai',
    })
}
