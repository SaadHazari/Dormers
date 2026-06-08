'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'

type CreditStatus = 'pending' | 'approved' | 'applied' | 'rejected'

interface Props {
    credits: Array<Record<string, unknown>>
    comped: Array<Record<string, unknown>>
    summary: {
        totalApproved: number
        totalPending: number
        totalApplied: number
        totalComped: number
    }
}

type View = 'credits' | 'comped'
type StatusFilter = 'all' | CreditStatus

const STATUS_BADGE: Record<CreditStatus, 'pending' | 'approved' | 'active' | 'rejected'> = {
    pending: 'pending',
    approved: 'approved',
    applied: 'active',
    rejected: 'rejected',
}

export function CreditsClient({ credits, comped, summary }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [view, setView] = useState<View>('credits')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

    const filteredCredits = statusFilter === 'all'
        ? credits
        : credits.filter(c => c.status === statusFilter)

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Credits & Comps</h1>
            <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                Reward credits, manual credits, and comped meals
            </p>

            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <SummaryCard label="Approved" value={`AED ${Math.round(summary.totalApproved)}`} />
                <SummaryCard label="Pending" value={`AED ${Math.round(summary.totalPending)}`} alert={summary.totalPending > 0} />
                <SummaryCard label="Applied" value={`AED ${Math.round(summary.totalApplied)}`} />
                <SummaryCard label="Comped COGS" value={`AED ${Math.round(summary.totalComped)}`} />
            </div>

            {/* View toggle */}
            <div className="flex gap-2 mb-4">
                <TabBtn label="Credit Ledger" count={credits.length} active={view === 'credits'} onClick={() => setView('credits')} />
                <TabBtn label="Comped Meals" count={comped.length} active={view === 'comped'} onClick={() => setView('comped')} />
            </div>

            {view === 'credits' && (
                <>
                    {/* Status filter */}
                    <div className="flex gap-1.5 mb-3 overflow-x-auto">
                        {(['all', 'pending', 'approved', 'applied', 'rejected'] as StatusFilter[]).map(s => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setStatusFilter(s)}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border ${
                                    statusFilter === s ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    {/* Credits table */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className={t.tableHeader}>
                                    <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Customer</th>
                                    <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Source</th>
                                    <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Amount</th>
                                    <th className="text-center px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Status</th>
                                    <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCredits.map(c => (
                                    <tr
                                        key={c.id as string}
                                        className={`${t.tableRow} cursor-pointer transition-colors`}
                                        onClick={() => router.push(`/admin/customers/${c.customer_id}`)}
                                    >
                                        <td className={`px-3 py-2.5 font-bold ${t.heading}`}>
                                            {(c.customer_name as string) || '(no name)'}
                                        </td>
                                        <td className={`px-3 py-2.5 ${t.body}`}>
                                            {String(c.source).replace(/_/g, ' ')}
                                        </td>
                                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${t.heading}`}>
                                            AED {Number(c.amount_aed)}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <AdminBadge variant={STATUS_BADGE[c.status as CreditStatus] ?? 'neutral'}>
                                                {c.status as string}
                                            </AdminBadge>
                                        </td>
                                        <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${t.faint}`}>
                                            {formatDate(c.created_at as string)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile credits */}
                    <div className="md:hidden flex flex-col gap-2">
                        {filteredCredits.map(c => (
                            <div
                                key={c.id as string}
                                className={`${t.card} rounded-xl p-3 cursor-pointer active:scale-[0.99] transition-all`}
                                onClick={() => router.push(`/admin/customers/${c.customer_id}`)}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`text-[13px] font-bold ${t.heading}`}>{(c.customer_name as string) || '(no name)'}</span>
                                    <span className={`text-[14px] font-black tabular-nums ${t.heading}`}>AED {Number(c.amount_aed)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className={`text-[11px] ${t.faint}`}>{String(c.source).replace(/_/g, ' ')}</span>
                                    <AdminBadge variant={STATUS_BADGE[c.status as CreditStatus] ?? 'neutral'}>
                                        {c.status as string}
                                    </AdminBadge>
                                </div>
                            </div>
                        ))}
                    </div>

                    {filteredCredits.length === 0 && (
                        <div className={`text-center py-12 text-sm font-semibold ${t.faint}`}>No credits match this filter</div>
                    )}
                </>
            )}

            {view === 'comped' && (
                <>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className={t.tableHeader}>
                                    <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Customer</th>
                                    <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Plan</th>
                                    <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Category</th>
                                    <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">COGS</th>
                                    <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {comped.map(c => (
                                    <tr
                                        key={c.id as string}
                                        className={`${t.tableRow} cursor-pointer transition-colors`}
                                        onClick={() => router.push(`/admin/customers/${c.customer_id}`)}
                                    >
                                        <td className={`px-3 py-2.5 font-bold ${t.heading}`}>
                                            {(c.customer_name as string) || '(no name)'}
                                        </td>
                                        <td className={`px-3 py-2.5 ${t.body}`}>
                                            {String(c.plan_name ?? '—').replace(/-/g, ' ')}
                                        </td>
                                        <td className={`px-3 py-2.5 ${t.body}`}>
                                            {String(c.expense_category ?? '—').replace(/_/g, ' ')}
                                        </td>
                                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${t.heading}`}>
                                            AED {Number(c.cogs_aed ?? 0)}
                                        </td>
                                        <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${t.faint}`}>
                                            {formatDate(c.created_at as string)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile comped */}
                    <div className="md:hidden flex flex-col gap-2">
                        {comped.map(c => (
                            <div
                                key={c.id as string}
                                className={`${t.card} rounded-xl p-3 cursor-pointer active:scale-[0.99] transition-all`}
                                onClick={() => router.push(`/admin/customers/${c.customer_id}`)}
                            >
                                <div className="flex items-center justify-between">
                                    <span className={`text-[13px] font-bold ${t.heading}`}>{(c.customer_name as string) || '(no name)'}</span>
                                    <span className={`text-[12px] font-bold tabular-nums ${t.heading}`}>AED {Number(c.cogs_aed ?? 0)}</span>
                                </div>
                                <div className={`text-[11px] ${t.faint}`}>
                                    {String(c.plan_name ?? '').replace(/-/g, ' ')} · {String(c.expense_category ?? '—').replace(/_/g, ' ')}
                                </div>
                            </div>
                        ))}
                    </div>

                    {comped.length === 0 && (
                        <div className={`text-center py-12 text-sm font-semibold ${t.faint}`}>No comped meals</div>
                    )}
                </>
            )}
        </div>
    )
}

function SummaryCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
    const { t } = useAdminTheme()
    return (
        <div className={`${t.card} rounded-xl px-3 py-2.5 ${alert ? 'ring-1 ring-[#f57f20]/30' : ''}`}>
            <div className={`text-[9px] font-bold tracking-[0.12em] uppercase ${t.faint}`}>{label}</div>
            <div className={`text-[16px] font-black tabular-nums ${alert ? t.accent : t.heading}`}>{value}</div>
        </div>
    )
}

function TabBtn({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
    const { t } = useAdminTheme()
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-[0.04em] uppercase transition-colors border ${
                active ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
            }`}
        >
            {label} <span className="tabular-nums">{count}</span>
        </button>
    )
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', {
        day: 'numeric', month: 'short',
        timeZone: 'Asia/Dubai',
    })
}
