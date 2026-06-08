'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Clock } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'

export interface Order {
    id: string
    customer_id: string
    customer_name: string | null
    customer_email: string | null
    plan: string | null
    meal_preference: string | null
    meals_count: number
    total_aed: number
    email_sent_at: string | null
    whatsapp_sent_at: string | null
    zoho_synced_at: string | null
    post_payment_errors: Record<string, unknown> | null
    created_at: string
}

interface Props {
    orders: Order[]
}

export function PaymentsClient({ orders }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [filter, setFilter] = useState<'all' | 'failed'>('all')

    const filtered = filter === 'failed'
        ? orders.filter(o => o.post_payment_errors && Object.keys(o.post_payment_errors).length > 0)
        : orders

    const failedCount = orders.filter(o => o.post_payment_errors && Object.keys(o.post_payment_errors).length > 0).length

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Payments</h1>
            <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                {orders.length} orders · AED {orders.reduce((s, o) => s + o.total_aed, 0).toLocaleString()} total
            </p>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-4">
                <FilterTab label="All" count={orders.length} active={filter === 'all'} onClick={() => setFilter('all')} />
                <FilterTab label="Failed Fanout" count={failedCount} active={filter === 'failed'} onClick={() => setFilter('failed')} alert={failedCount > 0} />
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className={t.tableHeader}>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Customer</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Plan</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Amount</th>
                            <th className="text-center px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Fanout</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(o => {
                            const hasErrors = o.post_payment_errors && Object.keys(o.post_payment_errors).length > 0
                            return (
                                <tr
                                    key={o.id as string}
                                    className={`${t.tableRow} cursor-pointer transition-colors`}
                                    onClick={() => router.push(`/admin/customers/${o.customer_id}`)}
                                >
                                    <td className="px-3 py-2.5">
                                        <div className={`font-bold ${t.heading}`}>{o.customer_name || '(no name)'}</div>
                                        <div className={`text-[11px] ${t.faint}`}>{o.customer_email}</div>
                                    </td>
                                    <td className={`px-3 py-2.5 ${t.body}`}>
                                        {o.plan?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '—'}
                                        <div className={`text-[11px] ${t.faint}`}>{o.meals_count} meals · {o.meal_preference}</div>
                                    </td>
                                    <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${t.heading}`}>
                                        AED {o.total_aed}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <FanoutDot label="Email" ok={!!o.email_sent_at} />
                                            <FanoutDot label="WA" ok={!!o.whatsapp_sent_at} />
                                            <FanoutDot label="Zoho" ok={!!o.zoho_synced_at} />
                                            {hasErrors && (
                                                <span className="text-[#e0716e]">
                                                    <AlertTriangle size={12} strokeWidth={2.5} />
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${t.faint}`}>
                                        {formatDate(o.created_at)}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-2.5">
                {filtered.map(o => {
                    const hasErrors = o.post_payment_errors && Object.keys(o.post_payment_errors).length > 0
                    return (
                        <div
                            key={o.id as string}
                            className={`${t.card} rounded-xl p-3.5 cursor-pointer active:scale-[0.99] transition-all`}
                            onClick={() => router.push(`/admin/customers/${o.customer_id}`)}
                        >
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="min-w-0">
                                    <div className={`text-[14px] font-bold truncate ${t.heading}`}>{o.customer_name || '(no name)'}</div>
                                    <div className={`text-[11px] ${t.faint}`}>
                                        {o.plan?.replace(/-/g, ' ')} · {o.meals_count} meals
                                    </div>
                                </div>
                                <div className={`text-[14px] font-black tabular-nums shrink-0 ${t.heading}`}>
                                    AED {o.total_aed}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <FanoutDot label="Email" ok={!!o.email_sent_at} />
                                <FanoutDot label="WA" ok={!!o.whatsapp_sent_at} />
                                <FanoutDot label="Zoho" ok={!!o.zoho_synced_at} />
                                {hasErrors && (
                                    <AdminBadge variant="rejected">Error</AdminBadge>
                                )}
                                <span className={`ml-auto text-[10px] tabular-nums ${t.faint}`}>{formatDate(o.created_at)}</span>
                            </div>
                        </div>
                    )
                })}
            </div>

            {filtered.length === 0 && (
                <div className={`text-center py-12 text-sm font-semibold ${t.faint}`}>No orders match this filter</div>
            )}
        </div>
    )
}

function FilterTab({ label, count, active, onClick, alert }: {
    label: string; count: number; active: boolean; onClick: () => void; alert?: boolean
}) {
    const { t } = useAdminTheme()
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-[0.04em] uppercase transition-colors border ${
                active ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
            }`}
        >
            {label}
            <span className={`tabular-nums ${alert && !active ? 'text-[#e0716e]' : ''}`}>{count}</span>
        </button>
    )
}

function FanoutDot({ label, ok }: { label: string; ok: boolean }) {
    const { t } = useAdminTheme()
    return (
        <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold tracking-[0.06em] uppercase ${ok ? t.success : t.faint}`}>
            {ok ? <Check size={9} strokeWidth={3} /> : <Clock size={9} strokeWidth={2.5} />}
            {label}
        </span>
    )
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Dubai',
    })
}
