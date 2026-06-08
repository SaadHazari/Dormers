'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Truck, Pause, SkipForward, Leaf, Drumstick, Building2, UtensilsCrossed } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'

interface Sub {
    id: string
    customer_id: string
    customer_name: string | null
    dorm_name: string | null
    meal_preference: string | null
    whatsapp_number: string | null
    plan_name: string
    status: string
    meals_per_day: number
    total_meals: number
    delivered_meals: number
    week_type: string
    start_date: string
    end_date: string
}

interface Props {
    subscriptions: Sub[]
}

const STATUS_ICON: Record<string, React.ReactNode> = {
    Active:  <Truck size={13} strokeWidth={2} />,
    Paused:  <Pause size={13} strokeWidth={2} />,
    Skipped: <SkipForward size={13} strokeWidth={2} />,
}

const STATUS_VARIANT: Record<string, 'active' | 'warning' | 'neutral'> = {
    Active: 'active',
    Paused: 'warning',
    Skipped: 'warning',
}

function isVeg(pref: string | null): boolean {
    return pref?.toLowerCase() === 'veg'
}

function mealLabel(pref: string | null): string {
    if (!pref) return 'Unknown'
    const p = pref.toLowerCase()
    if (p === 'veg') return 'Veg'
    if (p.includes('religious')) return 'Religious Mix'
    return 'Non-Veg'
}

type StatusFilter = 'all' | 'Active' | 'Paused' | 'Skipped'
type GroupBy = 'dorm' | 'meal'

export function DeliveriesClient({ subscriptions }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [groupBy, setGroupBy] = useState<GroupBy>('dorm')

    const filtered = statusFilter === 'all' ? subscriptions : subscriptions.filter(s => s.status === statusFilter)

    const activeCt = subscriptions.filter(s => s.status === 'Active').length
    const pausedCt = subscriptions.filter(s => s.status === 'Paused').length
    const skippedCt = subscriptions.filter(s => s.status === 'Skipped').length
    const vegCt = subscriptions.filter(s => isVeg(s.meal_preference)).length
    const nonvegCt = subscriptions.length - vegCt

    // Group based on the active view
    const groups = groupBy === 'dorm'
        ? groupByKey(filtered, s => s.dorm_name || 'Unknown Dorm')
        : groupByKey(filtered, s => mealLabel(s.meal_preference))

    // Sort: largest group first
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length)

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Delivery Queue</h1>
            <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                {subscriptions.length} active subscriptions across {new Set(subscriptions.map(s => s.dorm_name).filter(Boolean)).size} dorms
            </p>

            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                <SummaryCard label="Delivering" value={activeCt} accent />
                <SummaryCard label="Paused" value={pausedCt} />
                <SummaryCard label="Skipped" value={skippedCt} />
                <SummaryCard label="Non-Veg" value={nonvegCt} icon={<Drumstick size={13} className="text-[#f57f20]" />} />
                <SummaryCard label="Veg" value={vegCt} icon={<Leaf size={13} className="text-emerald-500" />} />
            </div>

            {/* Controls row: view switcher + status filter */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
                {/* View switcher (Notion-style) */}
                <div className={`inline-flex rounded-lg border ${t.border} overflow-hidden`}>
                    <ViewTab
                        active={groupBy === 'dorm'}
                        onClick={() => setGroupBy('dorm')}
                        icon={<Building2 size={12} strokeWidth={2.2} />}
                        label="By Dorm"
                    />
                    <ViewTab
                        active={groupBy === 'meal'}
                        onClick={() => setGroupBy('meal')}
                        icon={<UtensilsCrossed size={12} strokeWidth={2.2} />}
                        label="By Meal Type"
                    />
                </div>

                {/* Status filter */}
                <div className="flex gap-1.5 overflow-x-auto">
                    {([['all', 'All', subscriptions.length], ['Active', 'Active', activeCt], ['Paused', 'Paused', pausedCt], ['Skipped', 'Skipped', skippedCt]] as const).map(([key, label, count]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setStatusFilter(key)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border whitespace-nowrap ${
                                statusFilter === key ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                            }`}
                        >
                            {label} <span className="tabular-nums">{count}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Grouped sections */}
            {sortedGroups.map(([groupName, subs]) => (
                <GroupSection
                    key={groupName}
                    name={groupName}
                    subs={subs}
                    groupBy={groupBy}
                    onRowClick={(s) => router.push(`/admin/customers/${s.customer_id}`)}
                />
            ))}

            {filtered.length === 0 && (
                <div className={`text-center py-12 text-sm font-semibold ${t.faint}`}>No subscriptions match this filter</div>
            )}
        </div>
    )
}

function ViewTab({ active, onClick, icon, label }: {
    active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
    const { t } = useAdminTheme()
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-[0.04em] uppercase transition-colors ${
                active ? `${t.accentBg} ${t.accent}` : `${t.muted} hover:${t.body}`
            }`}
        >
            {icon} {label}
        </button>
    )
}

function GroupSection({ name, subs, groupBy, onRowClick }: {
    name: string; subs: Sub[]; groupBy: GroupBy; onRowClick: (s: Sub) => void
}) {
    const { t } = useAdminTheme()

    const isVegGroup = name === 'Veg'
    const isMealView = groupBy === 'meal'
    const iconColor = isMealView
        ? isVegGroup ? 'text-emerald-500' : 'text-[#f57f20]'
        : t.heading
    const icon = isMealView
        ? isVegGroup ? <Leaf size={14} strokeWidth={2.2} /> : <Drumstick size={14} strokeWidth={2.2} />
        : <Building2 size={14} strokeWidth={2.2} />
    const badgeBg = isMealView
        ? isVegGroup ? 'bg-emerald-500/[0.08] text-emerald-500' : 'bg-[#f57f20]/[0.08] text-[#f57f20]'
        : `${t.accentBg} ${t.accent}`

    // Secondary grouping label in each row depends on the view
    const secondaryLabel = isMealView ? 'Dorm' : 'Preference'
    const secondaryValue = (s: Sub) => isMealView ? (s.dorm_name || '—') : mealLabel(s.meal_preference)

    return (
        <div className="mb-6">
            <div className={`flex items-center gap-2 mb-2 ${iconColor}`}>
                {icon}
                <h2 className="text-[14px] font-black">{name}</h2>
                <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${badgeBg}`}>
                    {subs.length}
                </span>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className={t.tableHeader}>
                            <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Customer</th>
                            <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Plan</th>
                            <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">{secondaryLabel}</th>
                            <th className="text-center px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Status</th>
                            <th className="text-right px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Progress</th>
                            <th className="text-right px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">End Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {subs.map(s => (
                            <tr
                                key={s.id}
                                className={`${t.tableRow} cursor-pointer transition-colors`}
                                onClick={() => onRowClick(s)}
                            >
                                <td className={`px-3 py-2 font-bold ${t.heading}`}>
                                    {s.customer_name || '(no name)'}
                                    {s.whatsapp_number && (
                                        <div className={`text-[10px] font-medium ${t.faint}`}>{s.whatsapp_number}</div>
                                    )}
                                </td>
                                <td className={`px-3 py-2 ${t.body}`}>
                                    {s.plan_name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                    <div className={`text-[10px] ${t.faint}`}>{s.week_type} · {s.meals_per_day}/day</div>
                                </td>
                                <td className={`px-3 py-2 ${t.body}`}>{secondaryValue(s)}</td>
                                <td className="px-3 py-2 text-center">
                                    <AdminBadge variant={STATUS_VARIANT[s.status] ?? 'neutral'}>
                                        {STATUS_ICON[s.status]} {s.status}
                                    </AdminBadge>
                                </td>
                                <td className={`px-3 py-2 text-right font-bold tabular-nums ${t.heading}`}>
                                    {s.delivered_meals}/{s.total_meals}
                                </td>
                                <td className={`px-3 py-2 text-right tabular-nums text-[11px] ${t.faint}`}>
                                    {s.end_date}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-2">
                {subs.map(s => (
                    <div
                        key={s.id}
                        className={`${t.card} rounded-xl p-3 cursor-pointer active:scale-[0.99] transition-all`}
                        onClick={() => onRowClick(s)}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <span className={`text-[13px] font-bold ${t.heading}`}>{s.customer_name || '(no name)'}</span>
                            <AdminBadge variant={STATUS_VARIANT[s.status] ?? 'neutral'}>
                                {s.status}
                            </AdminBadge>
                        </div>
                        <div className={`text-[11px] ${t.muted}`}>
                            {s.plan_name.replace(/-/g, ' ')} · {secondaryValue(s)} · {s.delivered_meals}/{s.total_meals} meals
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function SummaryCard({ label, value, accent, icon }: { label: string; value: number; accent?: boolean; icon?: React.ReactNode }) {
    const { t } = useAdminTheme()
    return (
        <div className={`${t.card} rounded-xl px-3 py-2.5`}>
            <div className={`flex items-center gap-1 text-[9px] font-bold tracking-[0.12em] uppercase ${t.faint}`}>
                {icon}
                {label}
            </div>
            <div className={`text-[18px] font-black tabular-nums ${accent ? t.accent : t.heading}`}>{value}</div>
        </div>
    )
}

function groupByKey(subs: Sub[], keyFn: (s: Sub) => string): Map<string, Sub[]> {
    const map = new Map<string, Sub[]>()
    for (const s of subs) {
        const key = keyFn(s)
        const list = map.get(key) ?? []
        list.push(s)
        map.set(key, list)
    }
    return map
}
