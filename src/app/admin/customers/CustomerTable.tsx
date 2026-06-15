'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User } from 'lucide-react'
import type { CustomerRow } from './page'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'
import { DayBadge } from '../_components/DayBadge'

interface Props {
    customers: CustomerRow[]
    initialQuery: string
}

const STATUS_VARIANT: Record<string, 'active' | 'pending' | 'ended' | 'warning' | 'neutral'> = {
    Active: 'active',
    Paused: 'warning',
    Skipped: 'warning',
    Scheduled: 'pending',
    Ended: 'ended',
}

export function CustomerTable({ customers, initialQuery }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [query, setQuery] = useState(initialQuery)
    const [isPending, startTransition] = useTransition()

    function handleSearch(e: React.FormEvent) {
        e.preventDefault()
        startTransition(() => {
            const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
            router.push(`/admin/customers${params}`)
        })
    }

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>
                Customers
            </h1>
            <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                {customers.length} customer{customers.length !== 1 ? 's' : ''}{initialQuery ? ` matching "${initialQuery}"` : ''}
            </p>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="mb-4">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${t.input} ${t.inputFocus} transition-colors`}>
                    <Search size={15} strokeWidth={2.2} className={t.faint} />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search by name, email, phone, CID, or dorm..."
                        className={`flex-1 bg-transparent text-[13px] font-medium outline-none ${t.heading}`}
                    />
                    {isPending && (
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" />
                    )}
                </div>
            </form>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className={t.tableHeader}>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Customer</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Dorm</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Plan</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Status</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Progress</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Joined</th>
                        </tr>
                    </thead>
                    <tbody>
                        {customers.map(c => (
                            <tr
                                key={c.id}
                                className={`${t.tableRow} cursor-pointer transition-colors duration-100`}
                                onClick={() => router.push(`/admin/customers/${c.id}`)}
                            >
                                <td className="px-3 py-2.5">
                                    <div className={`font-bold ${t.heading}`}>{c.name || '(no name)'}</div>
                                    <div className={`text-[11px] ${t.faint}`}>
                                        {c.email || c.whatsapp_number || c.cid}
                                    </div>
                                </td>
                                <td className={`px-3 py-2.5 ${t.body}`}>{c.dorm_name || '—'}</td>
                                <td className={`px-3 py-2.5 ${t.body}`}>
                                    {c.active_plan?.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) || '—'}
                                </td>
                                <td className="px-3 py-2.5">
                                    {c.sub_status ? (
                                        <div className="inline-flex items-center gap-1.5">
                                            <DayBadge startDate={c.sub_start_date} endDate={c.sub_end_date} status={c.sub_status} />
                                            <AdminBadge variant={STATUS_VARIANT[c.sub_status] ?? 'neutral'}>
                                                {c.sub_status}
                                            </AdminBadge>
                                        </div>
                                    ) : (
                                        <span className={t.faint}>—</span>
                                    )}
                                </td>
                                <td className={`px-3 py-2.5 text-right tabular-nums ${t.body}`}>
                                    {c.delivered_meals != null && c.total_meals != null
                                        ? `${c.delivered_meals}/${c.total_meals}`
                                        : '—'}
                                </td>
                                <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${t.faint}`}>
                                    {formatDate(c.created_at)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-2.5">
                {customers.map(c => (
                    <div
                        key={c.id}
                        className={`${t.card} rounded-xl p-3.5 cursor-pointer active:scale-[0.99] transition-all duration-100`}
                        onClick={() => router.push(`/admin/customers/${c.id}`)}
                        role="link"
                    >
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                                <div className={`text-[14px] font-bold truncate ${t.heading}`}>
                                    {c.name || '(no name)'}
                                </div>
                                <div className={`text-[11px] font-medium ${t.faint}`}>
                                    {c.dorm_name || 'No dorm'} · {c.email || c.whatsapp_number || c.cid}
                                </div>
                            </div>
                            {c.sub_status && (
                                <div className="flex items-center gap-1.5">
                                    <DayBadge startDate={c.sub_start_date} endDate={c.sub_end_date} status={c.sub_status} />
                                    <AdminBadge variant={STATUS_VARIANT[c.sub_status] ?? 'neutral'}>
                                        {c.sub_status}
                                    </AdminBadge>
                                </div>
                            )}
                        </div>
                        {c.active_plan && (
                            <div className="flex items-center justify-between">
                                <span className={`text-[11px] font-semibold ${t.muted}`}>
                                    {c.active_plan.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}
                                </span>
                                {c.delivered_meals != null && c.total_meals != null && (
                                    <span className={`text-[11px] font-bold tabular-nums ${t.body}`}>
                                        {c.delivered_meals}/{c.total_meals} meals
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {customers.length === 0 && (
                <div className={`flex flex-col items-center py-16 ${t.muted}`}>
                    <User size={32} strokeWidth={1.5} className="mb-3 opacity-40" />
                    <div className="text-sm font-bold">No customers found</div>
                    {initialQuery && (
                        <div className={`text-xs font-medium mt-1 ${t.faint}`}>
                            Try a different search term
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', {
        day: 'numeric', month: 'short', year: '2-digit',
        timeZone: 'Asia/Dubai',
    })
}
