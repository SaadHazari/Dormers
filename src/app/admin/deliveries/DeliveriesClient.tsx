'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Truck, Pause, SkipForward, Leaf, Drumstick, Building2, UtensilsCrossed, Send, X, CheckCircle2 } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'
import { AdminButton } from '../_components/AdminButton'
import { AdminModal } from '../_components/AdminModal'
import { DayBadge } from '../_components/DayBadge'
import { sendDeliveryMessageFailsafe, type DeliveryFailsafeResult } from './actions'

interface Sub {
    id: string
    customer_id: string
    customer_name: string | null
    dorm_name: string | null
    meal_preference: string | null
    veg_today: boolean
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

function isReligiousMix(pref: string | null): boolean {
    return pref?.toLowerCase().includes('religious') ?? false
}

// Preference column (By Dorm view) keeps the raw preference visible —
// religious-mix customers still read "Religious Mix" there.
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
    const [showSendModal, setShowSendModal] = useState(false)

    const filtered = statusFilter === 'all' ? subscriptions : subscriptions.filter(s => s.status === statusFilter)

    const activeCt = subscriptions.filter(s => s.status === 'Active').length
    const pausedCt = subscriptions.filter(s => s.status === 'Paused').length
    const skippedCt = subscriptions.filter(s => s.status === 'Skipped').length
    const vegCt = subscriptions.filter(s => s.veg_today).length
    const nonvegCt = subscriptions.length - vegCt

    // Group based on the active view. Meal view places religious-mix
    // customers in Veg or Non-Veg by TODAY's chosen day — no separate group.
    const groups = groupBy === 'dorm'
        ? groupByKey(filtered, s => s.dorm_name || 'Unknown Dorm')
        : groupByKey(filtered, s => s.veg_today ? 'Veg' : 'Non-Veg')

    // Sort: largest group first
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length)

    return (
        <div>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                    <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Delivery Queue</h1>
                    <p className={`text-[13px] font-medium ${t.muted}`}>
                        {subscriptions.length} active subscriptions across {new Set(subscriptions.map(s => s.dorm_name).filter(Boolean)).size} dorms
                    </p>
                </div>
                <AdminButton
                    variant="ghost"
                    icon={<Send size={13} strokeWidth={2.2} />}
                    onClick={() => setShowSendModal(true)}
                >
                    Send Delivery Message
                </AdminButton>
            </div>

            {showSendModal && <SendDeliveryModal onClose={() => setShowSendModal(false)} />}

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

// Failsafe confirm + result dialog. The dedup lives server-side, so the
// button is safe to press even when some dorms already got their message —
// only customers who never received today's delivery WhatsApp are queued.
function SendDeliveryModal({ onClose }: { onClose: () => void }) {
    const { t } = useAdminTheme()
    const [pending, setPending] = useState(false)
    const [result, setResult] = useState<DeliveryFailsafeResult | null>(null)

    const close = () => { if (!pending) onClose() }

    const handleSend = async () => {
        setPending(true)
        try {
            setResult(await sendDeliveryMessageFailsafe())
        } catch {
            setResult({ ok: false, message: 'Something went wrong, nothing was sent. Try again in a minute.' })
        } finally {
            setPending(false)
        }
    }

    return (
        <AdminModal label="Send delivery message" maxW="max-w-[440px]" onBackdrop={close}>
            {/* Header */}
            <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${t.border}`}>
                <div>
                    <div className={`text-[15px] font-black ${t.heading}`}>Send Delivery Message</div>
                    <div className={`text-[11px] font-medium mt-0.5 ${t.muted}`}>
                        Manual backup for the delivery WhatsApp
                    </div>
                </div>
                <button type="button" onClick={close} className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${t.muted} cursor-pointer`}>
                    <X size={16} strokeWidth={2.2} />
                </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
                {result === null ? (
                    <>
                        <p className={`text-[13px] font-medium leading-relaxed ${t.body}`}>
                            Use this if the rider flow failed and customers were never told their food arrived.
                            It sends today&rsquo;s delivery message to every active customer.
                        </p>
                        <ul className={`mt-3 flex flex-col gap-1.5 text-[12px] font-medium ${t.muted}`}>
                            <li className="flex gap-2">
                                <span className="text-[#f57f20] shrink-0">•</span>
                                Anyone who already got today&rsquo;s message is left out, so nobody gets it twice.
                            </li>
                            <li className="flex gap-2">
                                <span className="text-[#f57f20] shrink-0">•</span>
                                Customers who are paused or have skipped today are left out.
                            </li>
                        </ul>
                    </>
                ) : result.ok ? (
                    <div>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 size={18} strokeWidth={2.2} className="text-emerald-500 shrink-0" />
                            <span className={`text-[14px] font-black ${t.heading}`}>
                                {result.queued === 0
                                    ? 'Nothing to send'
                                    : `Message queued for ${result.queued} customer${result.queued === 1 ? '' : 's'}`}
                            </span>
                        </div>
                        <div className={`mt-2 flex flex-col gap-1 text-[12px] font-medium ${t.muted}`}>
                            {result.queued === 0 && (
                                <span>Everyone eligible already got today&rsquo;s message.</span>
                            )}
                            {result.queued > 0 && (
                                <span>WhatsApp delivery starts within a few seconds.</span>
                            )}
                            {result.alreadyNotified > 0 && (
                                <span>{result.alreadyNotified} already got today&rsquo;s message.</span>
                            )}
                            {result.skipped > 0 && (
                                <span>{result.skipped} paused or skipped today.</span>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className={`text-[13px] font-bold ${t.danger}`}>{result.message}</p>
                )}
            </div>

            {/* Footer */}
            <div className={`flex justify-end gap-3 px-5 py-4 border-t ${t.border}`}>
                {result === null ? (
                    <>
                        <AdminButton variant="ghost" type="button" onClick={close} disabled={pending}>Cancel</AdminButton>
                        <AdminButton
                            onClick={handleSend}
                            loading={pending}
                            icon={<Send size={14} strokeWidth={2.2} />}
                        >
                            Send Now
                        </AdminButton>
                    </>
                ) : (
                    <AdminButton variant="ghost" type="button" onClick={onClose}>Done</AdminButton>
                )}
            </div>
        </AdminModal>
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
                                    {isMealView && isReligiousMix(s.meal_preference) && <MixPill />}
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
                                    <div className="inline-flex items-center gap-1.5">
                                        <DayBadge startDate={s.start_date} endDate={s.end_date} status={s.status} />
                                        <AdminBadge variant={STATUS_VARIANT[s.status] ?? 'neutral'}>
                                            {STATUS_ICON[s.status]} {s.status}
                                        </AdminBadge>
                                    </div>
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
                            <span className={`text-[13px] font-bold ${t.heading}`}>
                                {s.customer_name || '(no name)'}
                                {isMealView && isReligiousMix(s.meal_preference) && <MixPill />}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <DayBadge startDate={s.start_date} endDate={s.end_date} status={s.status} />
                                <AdminBadge variant={STATUS_VARIANT[s.status] ?? 'neutral'}>
                                    {s.status}
                                </AdminBadge>
                            </div>
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

// Marks religious-mix customers inside the Veg/Non-Veg groups (meal view) —
// they're placed by today's chosen day and flip groups on other days.
function MixPill() {
    const { t } = useAdminTheme()
    return (
        <span className={`ml-1.5 align-middle inline-block px-1.5 py-px rounded-full text-[8px] font-bold tracking-[0.08em] uppercase ${t.accentBg} ${t.accent}`}>
            Mix
        </span>
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
