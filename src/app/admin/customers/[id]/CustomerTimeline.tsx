'use client'

import { useMemo } from 'react'
import {
    CreditCard, Bell, Share2, UtensilsCrossed, Coins, Star,
} from 'lucide-react'
import { useAdminTheme } from '../../_components/AdminThemeProvider'

interface Props {
    subscriptions: Array<Record<string, unknown>>
    orders: Array<Record<string, unknown>>
    credits: Array<Record<string, unknown>>
    notifications: Array<Record<string, unknown>>
    referralsAsInviter: Array<Record<string, unknown>>
    referralsAsInvitee: Array<Record<string, unknown>>
}

interface TimelineEvent {
    id: string
    type: 'subscription' | 'order' | 'credit' | 'notification' | 'referral'
    title: string
    detail: string
    timestamp: string
    icon: React.ReactNode
    color: string
}

export function CustomerTimeline({
    subscriptions, orders, credits, notifications,
    referralsAsInviter, referralsAsInvitee,
}: Props) {
    const { t, isLight } = useAdminTheme()

    const events = useMemo(() => {
        const all: TimelineEvent[] = []
        const accentColor = '#f57f20'
        const greenColor = isLight ? '#1d8a30' : '#5fb479'
        const blueColor = isLight ? '#2563eb' : '#60a5fa'
        const purpleColor = isLight ? '#7c3aed' : '#a78bfa'

        for (const sub of subscriptions) {
            all.push({
                id: `sub-${sub.id}`,
                type: 'subscription',
                title: `${(sub.plan_name as string)?.replace(/-/g, ' ')} — ${sub.status}`,
                detail: `${sub.delivered_meals}/${sub.total_meals} meals · ${sub.start_date} → ${sub.end_date}`,
                timestamp: sub.created_at as string,
                icon: <UtensilsCrossed size={12} strokeWidth={2.2} />,
                color: accentColor,
            })
        }

        for (const order of orders) {
            all.push({
                id: `order-${order.id}`,
                type: 'order',
                title: `Payment — ${(order.plan as string)?.replace(/-/g, ' ')}`,
                detail: `${order.meals_count} meals · AED ${Math.round((order.meals_count as number) * Number(order.price_per_meal))}`,
                timestamp: order.created_at as string,
                icon: <CreditCard size={12} strokeWidth={2.2} />,
                color: greenColor,
            })
        }

        for (const credit of credits) {
            all.push({
                id: `credit-${credit.id}`,
                type: 'credit',
                title: `Credit — ${(credit.source as string)?.replace(/_/g, ' ')} (${credit.status})`,
                detail: `AED ${Number(credit.amount_aed)}`,
                timestamp: credit.created_at as string,
                icon: <Coins size={12} strokeWidth={2.2} />,
                color: accentColor,
            })
        }

        for (const notif of notifications.slice(0, 30)) {
            all.push({
                id: `notif-${notif.id}`,
                type: 'notification',
                title: `${(notif.kind as string)?.replace(/_/g, ' ')}`,
                detail: notif.sent_at ? 'Delivered' : 'Pending',
                timestamp: notif.created_at as string,
                icon: <Bell size={12} strokeWidth={2.2} />,
                color: blueColor,
            })
        }

        for (const ref of referralsAsInviter) {
            all.push({
                id: `ref-inviter-${ref.id}`,
                type: 'referral',
                title: `Referred ${ref.invitee_first_name || ref.invitee_email || 'someone'}`,
                detail: `Status: ${ref.status}`,
                timestamp: ref.created_at as string,
                icon: <Share2 size={12} strokeWidth={2.2} />,
                color: purpleColor,
            })
        }

        for (const ref of referralsAsInvitee) {
            all.push({
                id: `ref-invitee-${ref.id}`,
                type: 'referral',
                title: `Was referred (invitee)`,
                detail: `Status: ${ref.status}`,
                timestamp: ref.created_at as string,
                icon: <Star size={12} strokeWidth={2.2} />,
                color: purpleColor,
            })
        }

        all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        return all
    }, [subscriptions, orders, credits, notifications, referralsAsInviter, referralsAsInvitee, isLight])

    if (events.length === 0) {
        return <div className={`text-sm font-semibold py-8 text-center ${t.faint}`}>No activity yet</div>
    }

    return (
        <div className="relative pl-6">
            {/* Vertical line */}
            <div className={`absolute left-[9px] top-2 bottom-2 w-px ${isLight ? 'bg-[#091825]/[0.08]' : 'bg-white/[0.06]'}`} />

            <div className="flex flex-col gap-0">
                {events.map(event => (
                    <div key={event.id} className="relative flex gap-3 py-2.5">
                        {/* Dot */}
                        <div
                            className="absolute -left-6 top-3.5 w-[18px] h-[18px] rounded-full flex items-center justify-center"
                            style={{ backgroundColor: `${event.color}18`, color: event.color }}
                        >
                            {event.icon}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                            <div className={`text-[13px] font-bold ${t.body}`}>
                                {event.title}
                            </div>
                            <div className={`text-[11px] font-medium ${t.faint}`}>
                                {event.detail}
                            </div>
                        </div>

                        {/* Timestamp */}
                        <div className={`text-[10px] font-semibold tabular-nums shrink-0 pt-0.5 ${t.faint}`}>
                            {formatTimestamp(event.timestamp)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function formatTimestamp(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
        return d.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })
    }
    if (diffDays < 7) {
        return `${diffDays}d ago`
    }
    return d.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' })
}
