'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Star, ArrowRight, Flame, Trophy, Zap } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'

type Row = Record<string, unknown> & { customer_name: string | null }

interface Props {
    streaks: Row[]
    cycleRewards: Row[]
    lifetimeRewards: Row[]
    layer4Rewards: Row[]
    pendingLayer4Count: number
}

type Tab = 'streaks' | 'cycle' | 'lifetime' | 'layer4'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'streaks',  label: 'Streaks',       icon: <Flame size={13} /> },
    { key: 'cycle',    label: 'Cycle Rewards',  icon: <Trophy size={13} /> },
    { key: 'lifetime', label: 'Lifetime Tiers', icon: <Star size={13} /> },
    { key: 'layer4',   label: 'Layer 4',        icon: <Zap size={13} /> },
]

const LAYER4_STATUS: Record<string, 'pending' | 'approved' | 'active' | 'rejected'> = {
    pending: 'pending',
    approved: 'approved',
    auto_approved: 'active',
    rejected: 'rejected',
}

export function DormWarsClient({ streaks, cycleRewards, lifetimeRewards, layer4Rewards, pendingLayer4Count }: Props) {
    const { t } = useAdminTheme()
    const [tab, setTab] = useState<Tab>('streaks')

    return (
        <div>
            <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                    <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Dorm Wars</h1>
                    <p className={`text-[13px] font-medium ${t.muted}`}>
                        Streaks, rewards, and gamification admin
                    </p>
                </div>
                {pendingLayer4Count > 0 && (
                    <Link
                        href="/admin/layer4-queue"
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-[0.04em] ring-1 ring-[#f57f20]/30 ${t.card} ${t.accent} transition-all hover:ring-[#f57f20]/50`}
                    >
                        <Star size={14} strokeWidth={2.2} />
                        {pendingLayer4Count} pending review
                        <ArrowRight size={12} strokeWidth={2.5} />
                    </Link>
                )}
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <SummaryCard label="Active Streaks" value={String(streaks.filter(s => Number(s.count) > 0).length)} />
                <SummaryCard label="Top Streak" value={streaks.length > 0 ? String(streaks[0].count) : '0'} />
                <SummaryCard label="Cycle Rewards" value={String(cycleRewards.length)} />
                <SummaryCard label="Lifetime Tiers" value={String(lifetimeRewards.length)} />
            </div>

            {/* Tabs */}
            <div className={`flex gap-1 overflow-x-auto pb-1 mb-4 border-b ${t.border}`}>
                {TABS.map(({ key, label, icon }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[11px] font-bold tracking-[0.04em] uppercase whitespace-nowrap transition-colors ${
                            tab === key ? `${t.accent} border-b-2 border-[#f57f20]` : `${t.muted} hover:${t.body}`
                        }`}
                    >
                        {icon} {label}
                    </button>
                ))}
            </div>

            {tab === 'streaks' && <StreaksView rows={streaks} />}
            {tab === 'cycle' && <CycleView rows={cycleRewards} />}
            {tab === 'lifetime' && <LifetimeView rows={lifetimeRewards} />}
            {tab === 'layer4' && <Layer4View rows={layer4Rewards} />}
        </div>
    )
}

function StreaksView({ rows }: { rows: Row[] }) {
    const { t } = useAdminTheme()
    if (rows.length === 0) return <Empty />
    return (
        <div className="hidden-table-wrapper">
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className={t.tableHeader}>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Customer</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Streak</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Last Visit</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Last Chest</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((s, i) => (
                            <tr key={s.customer_id as string} className={`${t.tableRow}`}>
                                <td className={`px-3 py-2.5 font-bold ${t.heading}`}>
                                    <span className={`inline-block w-5 text-[10px] font-bold tabular-nums ${t.faint}`}>{i + 1}</span>
                                    {s.customer_name || '(no name)'}
                                </td>
                                <td className={`px-3 py-2.5 text-right font-black tabular-nums text-[16px] ${t.accent}`}>
                                    {String(s.count)}
                                </td>
                                <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${t.faint}`}>
                                    {s.last_visit_date_utc ? String(s.last_visit_date_utc) : '—'}
                                </td>
                                <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${t.faint}`}>
                                    {s.last_chest_day != null ? `Day ${s.last_chest_day}` : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <MobileList rows={rows} render={(s, i) => (
                <>
                    <div className="flex items-center justify-between">
                        <span className={`text-[13px] font-bold ${t.heading}`}>
                            <span className={`text-[10px] tabular-nums ${t.faint} mr-1`}>{i + 1}.</span>
                            {s.customer_name || '(no name)'}
                        </span>
                        <span className={`text-[16px] font-black tabular-nums ${t.accent}`}>{String(s.count)}</span>
                    </div>
                    <div className={`text-[10px] ${t.faint}`}>
                        Last visit: {s.last_visit_date_utc ? String(s.last_visit_date_utc) : '—'}
                    </div>
                </>
            )} />
        </div>
    )
}

function CycleView({ rows }: { rows: Row[] }) {
    const { t } = useAdminTheme()
    if (rows.length === 0) return <Empty />
    return (
        <div>
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className={t.tableHeader}>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Customer</th>
                            <th className="text-center px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Milestone</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Kind</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Value</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Awarded</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.id as string} className={t.tableRow}>
                                <td className={`px-3 py-2.5 font-bold ${t.heading}`}>{r.customer_name || '(no name)'}</td>
                                <td className={`px-3 py-2.5 text-center font-black tabular-nums ${t.accent}`}>{String(r.milestone)}</td>
                                <td className={`px-3 py-2.5 ${t.body}`}>{String(r.kind).replace(/_/g, ' ')}</td>
                                <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${t.heading}`}>AED {String(r.value_aed)}</td>
                                <td className={`px-3 py-2.5 text-right text-[11px] tabular-nums ${t.faint}`}>{formatDate(r.awarded_at as string)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <MobileList rows={rows} render={r => (
                <>
                    <div className="flex items-center justify-between">
                        <span className={`text-[13px] font-bold ${t.heading}`}>{r.customer_name || '(no name)'}</span>
                        <span className={`text-[13px] font-black tabular-nums ${t.heading}`}>AED {String(r.value_aed)}</span>
                    </div>
                    <div className={`text-[11px] ${t.faint}`}>
                        Milestone {String(r.milestone)} · {String(r.kind).replace(/_/g, ' ')} · {formatDate(r.awarded_at as string)}
                    </div>
                </>
            )} />
        </div>
    )
}

function LifetimeView({ rows }: { rows: Row[] }) {
    const { t } = useAdminTheme()
    if (rows.length === 0) return <Empty />
    return (
        <div className="flex flex-col gap-2">
            {rows.map(r => (
                <div key={r.id as string} className={`${t.card} rounded-xl p-3 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[13px] font-bold ${t.heading}`}>{r.customer_name || '(no name)'}</div>
                        <div className={`text-[11px] ${t.faint}`}>
                            Tier {String(r.tier)} · {String(r.perk).replace(/_/g, ' ')}
                        </div>
                    </div>
                    <AdminBadge variant="approved">Tier {String(r.tier)}</AdminBadge>
                </div>
            ))}
        </div>
    )
}

function Layer4View({ rows }: { rows: Row[] }) {
    const { t } = useAdminTheme()
    if (rows.length === 0) return <Empty />
    return (
        <div>
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className={t.tableHeader}>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Customer</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Kind</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Value</th>
                            <th className="text-center px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Status</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Claimed</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.id as string} className={t.tableRow}>
                                <td className={`px-3 py-2.5 font-bold ${t.heading}`}>{r.customer_name || '(no name)'}</td>
                                <td className={`px-3 py-2.5 ${t.body}`}>{String(r.kind).replace(/_/g, ' ')}</td>
                                <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${t.heading}`}>AED {String(r.value_aed)}</td>
                                <td className="px-3 py-2.5 text-center">
                                    <AdminBadge variant={LAYER4_STATUS[r.status as string] ?? 'neutral'}>
                                        {String(r.status).replace(/_/g, ' ')}
                                    </AdminBadge>
                                </td>
                                <td className={`px-3 py-2.5 text-right text-[11px] tabular-nums ${t.faint}`}>
                                    {r.claimed_at ? formatDate(r.claimed_at as string) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <MobileList rows={rows} render={r => (
                <>
                    <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-[13px] font-bold ${t.heading}`}>{r.customer_name || '(no name)'}</span>
                        <AdminBadge variant={LAYER4_STATUS[r.status as string] ?? 'neutral'}>
                            {String(r.status).replace(/_/g, ' ')}
                        </AdminBadge>
                    </div>
                    <div className={`text-[11px] ${t.faint}`}>
                        {String(r.kind).replace(/_/g, ' ')} · AED {String(r.value_aed)}
                    </div>
                </>
            )} />
        </div>
    )
}

function MobileList({ rows, render }: { rows: Row[]; render: (row: Row, index: number) => React.ReactNode }) {
    const { t } = useAdminTheme()
    return (
        <div className="md:hidden flex flex-col gap-2">
            {rows.map((r, i) => (
                <div key={(r.id as string) ?? (r.customer_id as string)} className={`${t.card} rounded-xl p-3`}>
                    {render(r, i)}
                </div>
            ))}
        </div>
    )
}

function Empty() {
    const { t } = useAdminTheme()
    return <div className={`text-center py-12 text-sm font-semibold ${t.faint}`}>No data</div>
}

function SummaryCard({ label, value }: { label: string; value: string }) {
    const { t } = useAdminTheme()
    return (
        <div className={`${t.card} rounded-xl px-3 py-2.5`}>
            <div className={`text-[9px] font-bold tracking-[0.12em] uppercase ${t.faint}`}>{label}</div>
            <div className={`text-[18px] font-black tabular-nums ${t.heading}`}>{value}</div>
        </div>
    )
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', {
        day: 'numeric', month: 'short', timeZone: 'Asia/Dubai',
    })
}
