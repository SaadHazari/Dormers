'use client'

import { useRouter } from 'next/navigation'
import {
    Users, CalendarCheck, TrendingUp, AlertTriangle,
    Swords, UserPlus, LogOut, Bell,
} from 'lucide-react'
import { useAdminTheme } from './AdminThemeProvider'

interface KPIs {
    active_subs: number
    scheduled_subs: number
    todays_deliveries: number
    pending_referrals: number
    pending_layer4: number
    total_customers: number
    failed_notifications: number
    revenue_30d: number
    new_customers_7d: number
    ended_subs_7d: number
}

interface Props {
    kpis: KPIs
}

export function KPIGrid({ kpis }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()

    const cards: {
        label: string
        value: string | number
        icon: React.ReactNode
        href?: string
        alert?: boolean
    }[] = [
        {
            label: 'Active Subs',
            value: kpis.active_subs,
            icon: <CalendarCheck size={16} strokeWidth={2} />,
            href: '/admin/customers',
        },
        {
            label: "Today's Deliveries",
            value: kpis.todays_deliveries,
            icon: <Users size={16} strokeWidth={2} />,
        },
        {
            label: 'Revenue (30d)',
            value: `AED ${Math.round(kpis.revenue_30d).toLocaleString()}`,
            icon: <TrendingUp size={16} strokeWidth={2} />,
            href: '/admin/payments',
        },
        {
            label: 'Pending Referrals',
            value: kpis.pending_referrals,
            icon: <AlertTriangle size={16} strokeWidth={2} />,
            href: '/admin/referral-review-queue',
            alert: kpis.pending_referrals > 0,
        },
        {
            label: 'Pending Layer 4',
            value: kpis.pending_layer4,
            icon: <Swords size={16} strokeWidth={2} />,
            href: '/admin/layer4-queue',
            alert: kpis.pending_layer4 > 0,
        },
        {
            label: 'Failed Notifs',
            value: kpis.failed_notifications,
            icon: <Bell size={16} strokeWidth={2} />,
            href: '/admin/comms',
            alert: kpis.failed_notifications > 0,
        },
        {
            label: 'New Customers (7d)',
            value: kpis.new_customers_7d,
            icon: <UserPlus size={16} strokeWidth={2} />,
            href: '/admin/customers',
        },
        {
            label: 'Churned (7d)',
            value: kpis.ended_subs_7d,
            icon: <LogOut size={16} strokeWidth={2} />,
        },
    ]

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {cards.map(card => (
                <div
                    key={card.label}
                    className={`${t.card} rounded-xl p-3.5 transition-all duration-150 ${
                        card.href ? `cursor-pointer ${t.cardHover}` : ''
                    } ${card.alert ? `ring-1 ring-[#f57f20]/30` : ''}`}
                    onClick={card.href ? () => router.push(card.href!) : undefined}
                    role={card.href ? 'link' : undefined}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold tracking-[0.10em] uppercase ${t.muted}`}>
                            {card.label}
                        </span>
                        <span className={card.alert ? 'text-[#f57f20]' : t.faint}>
                            {card.icon}
                        </span>
                    </div>
                    <div className={`text-[22px] font-black tabular-nums tracking-tight ${t.heading}`}>
                        {card.value}
                    </div>
                </div>
            ))}
        </div>
    )
}
