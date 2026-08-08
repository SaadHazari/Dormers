'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, AlertTriangle } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'

interface Notification {
    id: string
    customer_id: string
    customer_name: string | null
    kind: string
    scheduled_for: string | null
    sent_at: string | null
    wamid: string | null
    meta_status_code: number | null
    created_at: string
}

interface Props {
    notifications: Notification[]
    failedCount: number
}

type Filter = 'all' | 'sent' | 'pending' | 'failed'

export function CommsClient({ notifications, failedCount }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [filter, setFilter] = useState<Filter>('all')

    const now = Date.now()
    const filtered = notifications.filter(n => {
        if (filter === 'all') return true
        if (filter === 'sent') return !!n.sent_at
        if (filter === 'pending') return !n.sent_at && (!n.scheduled_for || new Date(n.scheduled_for).getTime() > now - 600_000)
        if (filter === 'failed') return !n.sent_at && n.scheduled_for && new Date(n.scheduled_for).getTime() < now - 600_000
        return true
    })

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Messages</h1>
            <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                WhatsApp notifications · {notifications.length} total
                {failedCount > 0 && <span className={t.danger}> · {failedCount} failed</span>}
            </p>

            {/* Filters */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto">
                {([
                    ['all', 'All', notifications.length],
                    ['sent', 'Sent', notifications.filter(n => !!n.sent_at).length],
                    ['pending', 'Pending', notifications.filter(n => !n.sent_at && (!n.scheduled_for || new Date(n.scheduled_for).getTime() > now - 600_000)).length],
                    ['failed', 'Failed', failedCount],
                ] as const).map(([key, label, count]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border whitespace-nowrap ${
                            filter === key ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                        }`}
                    >
                        {label} <span className={`tabular-nums ${key === 'failed' && count > 0 && filter !== key ? 'text-[#e0716e]' : ''}`}>{count}</span>
                    </button>
                ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className={t.tableHeader}>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Customer</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Kind</th>
                            <th className="text-center px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Status</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Scheduled</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Sent</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(n => {
                            const isFailed = !n.sent_at && n.scheduled_for && new Date(n.scheduled_for).getTime() < now - 600_000
                            return (
                                <tr
                                    key={n.id}
                                    className={`${t.tableRow} cursor-pointer transition-colors`}
                                    onClick={() => router.push(`/admin/customers/${n.customer_id}`)}
                                >
                                    <td className={`px-3 py-2.5 font-bold ${t.heading}`}>
                                        {n.customer_name || '(no name)'}
                                    </td>
                                    <td className={`px-3 py-2.5 ${t.body}`}>
                                        {n.kind.replace(/_/g, ' ')}
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        {n.sent_at ? (
                                            <AdminBadge variant="approved">
                                                <Check size={9} strokeWidth={3} /> Sent
                                            </AdminBadge>
                                        ) : isFailed ? (
                                            <AdminBadge variant="rejected">
                                                <AlertTriangle size={9} strokeWidth={2.5} /> Failed
                                            </AdminBadge>
                                        ) : (
                                            <AdminBadge variant="pending">
                                                <Clock size={9} strokeWidth={2.5} /> Pending
                                            </AdminBadge>
                                        )}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${t.faint}`}>
                                        {n.scheduled_for ? formatTime(n.scheduled_for) : '—'}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${n.sent_at ? t.success : t.faint}`}>
                                        {n.sent_at ? formatTime(n.sent_at) : '—'}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-2">
                {filtered.map(n => {
                    const isFailed = !n.sent_at && n.scheduled_for && new Date(n.scheduled_for).getTime() < now - 600_000
                    return (
                        <div
                            key={n.id}
                            className={`${t.card} rounded-xl p-3 cursor-pointer active:scale-[0.99] transition-all`}
                            onClick={() => router.push(`/admin/customers/${n.customer_id}`)}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className={`text-[13px] font-bold ${t.heading}`}>{n.customer_name || '(no name)'}</span>
                                {n.sent_at ? (
                                    <AdminBadge variant="approved">Sent</AdminBadge>
                                ) : isFailed ? (
                                    <AdminBadge variant="rejected">Failed</AdminBadge>
                                ) : (
                                    <AdminBadge variant="pending">Pending</AdminBadge>
                                )}
                            </div>
                            <div className={`text-[11px] ${t.faint}`}>
                                {n.kind.replace(/_/g, ' ')} · {formatTime(n.created_at)}
                            </div>
                        </div>
                    )
                })}
            </div>

            {filtered.length === 0 && (
                <div className={`text-center py-12 text-sm font-semibold ${t.faint}`}>No notifications match this filter</div>
            )}
        </div>
    )
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-AE', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Dubai',
    })
}
