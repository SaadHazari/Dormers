'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Truck, Pause, SkipForward, Leaf, Drumstick } from 'lucide-react'
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
type MealFilter = 'all' | 'veg' | 'nonveg'

export function DeliveriesClient({ subscriptions }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [mealFilter, setMealFilter] = useState<MealFilter>('all')

    const afterStatus = statusFilter === 'all' ? subscriptions : subscriptions.filter(s => s.status === statusFilter)
    const filtered = mealFilter === 'all'
        ? afterStatus
        : mealFilter === 'veg'
            ? afterStatus.filter(s => isVeg(s.meal_preference))
            : afterStatus.filter(s => !isVeg(s.meal_preference))

    const activeCt = subscriptions.filter(s => s.status === 'Active').length
    const pausedCt = subscriptions.filter(s => s.status === 'Paused').length
    const skippedCt = subscriptions.filter(s => s.status === 'Skipped').length
    const vegCt = subscriptions.filter(s => isVeg(s.meal_preference)).length
    const nonvegCt = subscriptions.length - vegCt

    // Group: Dorm → Meal Type → Subs
    const byDorm = new Map<string, Sub[]>()
    for (const s of filtered) {
        const dorm = s.dorm_name || 'Unknown Dorm'
        const list = byDorm.get(dorm) ?? []
        list.push(s)
        byDorm.set(dorm, list)
    }
    const dorms = Array.from(byDorm.entries()).sort((a, b) => b[1].length - a[1].length)

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

            {/* Filters row */}
            <div className="flex flex-wrap gap-4 mb-4">
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

                {/* Meal type filter */}
                <div className="flex gap-1.5">
                    {([
                        ['all', 'All Meals', subscriptions.length],
                        ['nonveg', 'Non-Veg', nonvegCt],
                        ['veg', 'Veg', vegCt],
                    ] as const).map(([key, label, count]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setMealFilter(key)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border whitespace-nowrap ${
                                mealFilter === key
                                    ? key === 'veg' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600'
                                      : key === 'nonveg' ? `${t.accentBg} ${t.accent}`
                                      : `${t.accentBg} ${t.accent}`
                                    : `${t.card} ${t.muted}`
                            }`}
                        >
                            {key === 'veg' && <Leaf size={10} strokeWidth={2.5} />}
                            {key === 'nonveg' && <Drumstick size={10} strokeWidth={2.5} />}
                            {label} <span className="tabular-nums">{count}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Grouped by dorm, then by meal type within each dorm */}
            {dorms.map(([dorm, subs]) => {
                const dormNonVeg = subs.filter(s => !isVeg(s.meal_preference))
                const dormVeg = subs.filter(s => isVeg(s.meal_preference))

                return (
                    <div key={dorm} className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                            <h2 className={`text-[14px] font-black ${t.heading}`}>{dorm}</h2>
                            <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${t.accentBg} ${t.accent}`}>
                                {subs.length}
                            </span>
                        </div>

                        {/* Non-Veg section */}
                        {dormNonVeg.length > 0 && (
                            <MealTypeSection
                                label="Non-Veg"
                                icon={<Drumstick size={12} strokeWidth={2.2} />}
                                color="text-[#f57f20]"
                                bgColor="bg-[#f57f20]/[0.08]"
                                subs={dormNonVeg}
                                onRowClick={(s) => router.push(`/admin/customers/${s.customer_id}`)}
                            />
                        )}

                        {/* Veg section */}
                        {dormVeg.length > 0 && (
                            <MealTypeSection
                                label="Veg"
                                icon={<Leaf size={12} strokeWidth={2.2} />}
                                color="text-emerald-500"
                                bgColor="bg-emerald-500/[0.08]"
                                subs={dormVeg}
                                onRowClick={(s) => router.push(`/admin/customers/${s.customer_id}`)}
                            />
                        )}
                    </div>
                )
            })}

            {filtered.length === 0 && (
                <div className={`text-center py-12 text-sm font-semibold ${t.faint}`}>No subscriptions match these filters</div>
            )}
        </div>
    )
}

function MealTypeSection({ label, icon, color, bgColor, subs, onRowClick }: {
    label: string
    icon: React.ReactNode
    color: string
    bgColor: string
    subs: Sub[]
    onRowClick: (s: Sub) => void
}) {
    const { t } = useAdminTheme()

    return (
        <div className="mb-3">
            <div className={`flex items-center gap-1.5 mb-1.5 ${color}`}>
                {icon}
                <span className="text-[11px] font-black tracking-[0.10em] uppercase">
                    {label}
                </span>
                <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${bgColor} ${color}`}>
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
                            <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Preference</th>
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
                                <td className={`px-3 py-2 ${t.body}`}>{mealLabel(s.meal_preference)}</td>
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
                            {s.plan_name.replace(/-/g, ' ')} · {mealLabel(s.meal_preference)} · {s.delivered_meals}/{s.total_meals} meals
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
