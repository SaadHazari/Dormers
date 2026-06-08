'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, ArrowRight } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'

interface Referral {
    id: string
    inviter_name: string | null
    inviter_cid: string | null
    invitee_name: string | null
    invitee_email: string | null
    invitee_phone: string | null
    status: string
    created_at: string
    gift_claimed_at: string | null
    converted_at: string | null
}

interface Props {
    referrals: Referral[]
    pendingReviewCount: number
    funnel: { total: number; sent: number; claimed: number; converted: number; blocked: number }
}

type StatusFilter = 'all' | 'sent' | 'gift_claimed' | 'converted' | 'blocked'

const STATUS_VARIANT: Record<string, 'pending' | 'active' | 'approved' | 'rejected' | 'warning' | 'neutral'> = {
    sent: 'pending',
    gift_claimed: 'warning',
    converted: 'approved',
    ineligible_existing_customer: 'rejected',
    blocked: 'rejected',
}

export function ReferralsClient({ referrals, pendingReviewCount, funnel }: Props) {
    const { t } = useAdminTheme()
    const [filter, setFilter] = useState<StatusFilter>('all')

    const filtered = filter === 'all'
        ? referrals
        : filter === 'blocked'
            ? referrals.filter(r => ['ineligible_existing_customer', 'blocked'].includes(r.status))
            : referrals.filter(r => r.status === filter)

    return (
        <div>
            <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                    <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Referrals</h1>
                    <p className={`text-[13px] font-medium ${t.muted}`}>
                        {funnel.total} total · {funnel.converted} converted · {Math.round((funnel.converted / Math.max(funnel.total, 1)) * 100)}% rate
                    </p>
                </div>
                {pendingReviewCount > 0 && (
                    <Link
                        href="/admin/referral-review-queue"
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-[0.04em] ring-1 ring-[#f57f20]/30 ${t.card} ${t.accent} transition-all hover:ring-[#f57f20]/50`}
                    >
                        <ShieldCheck size={14} strokeWidth={2.2} />
                        {pendingReviewCount} pending review
                        <ArrowRight size={12} strokeWidth={2.5} />
                    </Link>
                )}
            </div>

            {/* Funnel strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <FunnelCard label="Sent" value={funnel.sent} />
                <FunnelCard label="Gift Claimed" value={funnel.claimed} />
                <FunnelCard label="Converted" value={funnel.converted} accent />
                <FunnelCard label="Blocked" value={funnel.blocked} />
            </div>

            {/* Status filter */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto">
                {([['all', 'All'], ['sent', 'Sent'], ['gift_claimed', 'Claimed'], ['converted', 'Converted'], ['blocked', 'Blocked']] as const).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border whitespace-nowrap ${
                            filter === key ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className={t.tableHeader}>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Inviter</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Invitee</th>
                            <th className="text-center px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Status</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Created</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Converted</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(r => (
                            <tr key={r.id} className={`${t.tableRow} transition-colors`}>
                                <td className={`px-3 py-2.5 font-bold ${t.heading}`}>
                                    {r.inviter_name || r.inviter_cid || '—'}
                                </td>
                                <td className="px-3 py-2.5">
                                    <div className={`font-bold ${t.body}`}>{r.invitee_name || '(no name)'}</div>
                                    <div className={`text-[11px] ${t.faint}`}>{r.invitee_email || r.invitee_phone}</div>
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                    <AdminBadge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>
                                        {r.status.replace(/_/g, ' ')}
                                    </AdminBadge>
                                </td>
                                <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${t.faint}`}>
                                    {formatDate(r.created_at)}
                                </td>
                                <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${r.converted_at ? t.success : t.faint}`}>
                                    {r.converted_at ? formatDate(r.converted_at) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-2">
                {filtered.map(r => (
                    <div key={r.id} className={`${t.card} rounded-xl p-3`}>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0">
                                <div className={`text-[13px] font-bold ${t.heading}`}>
                                    {r.inviter_name || r.inviter_cid || '—'}
                                    <span className={`${t.faint} font-medium`}> → </span>
                                    {r.invitee_name || '(no name)'}
                                </div>
                                <div className={`text-[11px] ${t.faint}`}>{r.invitee_email || r.invitee_phone}</div>
                            </div>
                            <AdminBadge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>
                                {r.status.replace(/_/g, ' ')}
                            </AdminBadge>
                        </div>
                        <div className={`text-[10px] tabular-nums ${t.faint}`}>
                            {formatDate(r.created_at)}
                            {r.converted_at && <span className={t.success}> · Converted {formatDate(r.converted_at)}</span>}
                        </div>
                    </div>
                ))}
            </div>

            {filtered.length === 0 && (
                <div className={`text-center py-12 text-sm font-semibold ${t.faint}`}>No referrals match this filter</div>
            )}
        </div>
    )
}

function FunnelCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
    const { t } = useAdminTheme()
    return (
        <div className={`${t.card} rounded-xl px-3 py-2.5`}>
            <div className={`text-[9px] font-bold tracking-[0.12em] uppercase ${t.faint}`}>{label}</div>
            <div className={`text-[18px] font-black tabular-nums ${accent ? t.accent : t.heading}`}>{value}</div>
        </div>
    )
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', {
        day: 'numeric', month: 'short', timeZone: 'Asia/Dubai',
    })
}
