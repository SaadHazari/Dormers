'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    CalendarOff, Plus, Trash2, X, AlertTriangle,
    ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminButton } from '../_components/AdminButton'
import { addClosure, addClosures, removeClosure } from './actions'
import type { AdminTokens } from '@/ui-system/tokens/admin-theme'

interface Closure {
    id: string
    closure_date: string
    reason: string
    created_by: string | null
    created_at: string
}

interface Props {
    closures: Closure[]
    activeSubscriptionCount: number
}

export function HolidaysClient({ closures, activeSubscriptionCount }: Props) {
    const { t, isLight } = useAdminTheme()
    const router = useRouter()
    const [modalOpen, setModalOpen] = useState(false)
    const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming')

    const today = todayAE()
    const upcoming = closures.filter(c => c.closure_date >= today)
    const past = closures.filter(c => c.closure_date < today)
    const displayed = filter === 'upcoming' ? upcoming : filter === 'past' ? past : closures
    const closureSet = useMemo(() => new Set(closures.map(c => c.closure_date)), [closures])

    const isClosureToday = closureSet.has(today)

    return (
        <div>
            <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                    <h1 className={`text-xl font-black tracking-tight ${t.heading}`}>Holidays</h1>
                    <p className={`text-[13px] font-medium mt-0.5 ${t.muted}`}>
                        Manage company-wide closures — Eid, national holidays, or emergency shutdowns.
                        All deliveries pause automatically; every active plan extends by the closure days.
                    </p>
                </div>
            </div>

            {isClosureToday && (
                <div className={`mt-4 flex items-center gap-2.5 px-4 py-3 rounded-xl border ${t.dangerBg}`}>
                    <AlertTriangle size={16} strokeWidth={2.2} className={t.danger} />
                    <span className={`text-[13px] font-bold ${t.danger}`}>
                        Company is CLOSED today — no deliveries, no cooking, no drivers.
                    </span>
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                <KPI label="Upcoming closures" value={upcoming.length} t={t} />
                <KPI label="Past closures" value={past.length} t={t} />
                <KPI label="Total closure days" value={closures.length} t={t} />
                <KPI label="Active subscriptions" value={activeSubscriptionCount} t={t} />
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-6">
                <AdminButton
                    icon={<Plus size={14} strokeWidth={2.5} />}
                    onClick={() => setModalOpen(true)}
                >
                    Add Closure
                </AdminButton>

                <div className="flex-1" />

                <div className="flex gap-1.5">
                    {(['upcoming', 'past', 'all'] as const).map(f => (
                        <button
                            key={f}
                            type="button"
                            onClick={() => setFilter(f)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border whitespace-nowrap ${
                                filter === f ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                            }`}
                        >
                            {f === 'upcoming' ? `Upcoming (${upcoming.length})` : f === 'past' ? `Past (${past.length})` : `All (${closures.length})`}
                        </button>
                    ))}
                </div>
            </div>

            <div className={`mt-4 rounded-xl border overflow-hidden ${t.card}`}>
                <table className="w-full text-left">
                    <thead>
                        <tr className={t.tableHeader}>
                            <th className="px-4 py-3 text-[10px] font-black tracking-[0.12em] uppercase">Date</th>
                            <th className="px-4 py-3 text-[10px] font-black tracking-[0.12em] uppercase">Day</th>
                            <th className="px-4 py-3 text-[10px] font-black tracking-[0.12em] uppercase">Reason</th>
                            <th className="px-4 py-3 text-[10px] font-black tracking-[0.12em] uppercase hidden sm:table-cell">Added by</th>
                            <th className="px-4 py-3 text-[10px] font-black tracking-[0.12em] uppercase w-16" />
                        </tr>
                    </thead>
                    <tbody>
                        {displayed.length === 0 && (
                            <tr>
                                <td colSpan={5} className={`px-4 py-12 text-center text-sm font-semibold ${t.faint}`}>
                                    {filter === 'upcoming' ? 'No upcoming closures scheduled' : 'No closures found'}
                                </td>
                            </tr>
                        )}
                        {displayed.map(c => (
                            <ClosureRow key={c.id} closure={c} today={today} t={t} isLight={isLight} />
                        ))}
                    </tbody>
                </table>
            </div>

            {modalOpen && (
                <AddClosureModal
                    existingClosures={closureSet}
                    onClose={() => setModalOpen(false)}
                    onDone={() => { setModalOpen(false); router.refresh() }}
                    t={t}
                    isLight={isLight}
                />
            )}
        </div>
    )
}

// ── KPI ──────────────────────────────────────────────────────────────────

function KPI({ label, value, t }: { label: string; value: number; t: AdminTokens }) {
    return (
        <div className={`rounded-xl border px-4 py-3 ${t.card}`}>
            <div className={`text-[10px] font-bold tracking-[0.08em] uppercase ${t.muted}`}>{label}</div>
            <div className={`text-2xl font-black mt-0.5 tabular-nums ${t.heading}`}>{value}</div>
        </div>
    )
}

// ── Table row ────────────────────────────────────────────────────────────

function ClosureRow({ closure, today, t, isLight }: {
    closure: Closure; today: string; t: AdminTokens; isLight: boolean
}) {
    const [pending, startTransition] = useTransition()
    const router = useRouter()
    const isToday = closure.closure_date === today
    const isPast = closure.closure_date < today

    function handleDelete() {
        startTransition(async () => {
            await removeClosure(closure.id, closure.closure_date)
            router.refresh()
        })
    }

    const d = new Date(closure.closure_date + 'T00:00:00')
    const dayName = d.toLocaleDateString('en-AE', { weekday: 'short', timeZone: 'UTC' })
    const dateFormatted = d.toLocaleDateString('en-AE', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    })

    return (
        <tr className={`${t.tableRow} ${isToday ? (isLight ? 'bg-[#c0392b]/[0.04]' : 'bg-[#e0716e]/[0.04]') : ''}`}>
            <td className={`px-4 py-3 text-[13px] font-bold tabular-nums ${isPast ? t.faint : t.heading}`}>
                {dateFormatted}
                {isToday && (
                    <span className={`ml-2 text-[9px] font-black tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-full ${t.dangerBg} ${t.danger}`}>
                        Today
                    </span>
                )}
            </td>
            <td className={`px-4 py-3 text-[13px] font-semibold ${isPast ? t.faint : t.muted}`}>{dayName}</td>
            <td className={`px-4 py-3 text-[13px] font-semibold ${isPast ? t.faint : t.body}`}>{closure.reason}</td>
            <td className={`px-4 py-3 text-[11px] font-medium hidden sm:table-cell ${t.faint}`}>
                {closure.created_by?.split('@')[0] ?? '—'}
            </td>
            <td className="px-4 py-3">
                {!isPast && (
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={pending}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                            isLight
                                ? 'text-[#091825]/35 hover:text-[#c0392b] hover:bg-[#c0392b]/[0.08]'
                                : 'text-[#ede8da]/30 hover:text-[#e0716e] hover:bg-[#e0716e]/[0.10]'
                        } ${pending ? 'opacity-40' : 'cursor-pointer'}`}
                        aria-label="Remove closure"
                    >
                        <Trash2 size={14} strokeWidth={2} />
                    </button>
                )}
            </td>
        </tr>
    )
}

// ── Calendar picker modal ────────────────────────────────────────────────

function AddClosureModal({ existingClosures, onClose, onDone, t, isLight }: {
    existingClosures: Set<string>
    onClose: () => void
    onDone: () => void
    t: AdminTokens
    isLight: boolean
}) {
    const today = todayAE()
    const [viewYear, setViewYear] = useState(() => parseInt(today.slice(0, 4)))
    const [viewMonth, setViewMonth] = useState(() => parseInt(today.slice(5, 7)) - 1)
    const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
    const [rangeAnchor, setRangeAnchor] = useState<string | null>(null)
    const [reason, setReason] = useState('')
    const [error, setError] = useState('')
    const [pending, startTransition] = useTransition()

    function prevMonth() {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
        else setViewMonth(m => m - 1)
    }
    function nextMonth() {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
        else setViewMonth(m => m + 1)
    }

    function handleDayClick(iso: string) {
        setError('')
        if (rangeAnchor && iso !== rangeAnchor) {
            const start = rangeAnchor < iso ? rangeAnchor : iso
            const end = rangeAnchor < iso ? iso : rangeAnchor
            const next = new Set<string>()
            const cursor = new Date(start + 'T00:00:00')
            const endDate = new Date(end + 'T00:00:00')
            while (cursor <= endDate) {
                const d = isoOf(cursor)
                if (d >= today && !existingClosures.has(d)) next.add(d)
                cursor.setDate(cursor.getDate() + 1)
            }
            setSelectedDates(next)
            setRangeAnchor(null)
        } else if (selectedDates.has(iso)) {
            const next = new Set(selectedDates)
            next.delete(iso)
            setSelectedDates(next)
            setRangeAnchor(null)
        } else if (selectedDates.size === 0) {
            setSelectedDates(new Set([iso]))
            setRangeAnchor(iso)
        } else {
            setSelectedDates(new Set([iso]))
            setRangeAnchor(iso)
        }
    }

    const sortedDates = Array.from(selectedDates).sort()
    const count = sortedDates.length

    function handleSubmit() {
        if (count === 0 || !reason.trim()) { setError('Pick at least one date and add a reason.'); return }
        startTransition(async () => {
            let res: { ok: true } | { ok: true; count: number } | { error: string }
            if (count === 1) {
                res = await addClosure(sortedDates[0], reason.trim())
            } else {
                res = await addClosures(sortedDates, reason.trim())
            }
            if ('error' in res) { setError(res.error); return }
            onDone()
        })
    }

    const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })

    const calendarDays = useMemo(() => {
        const first = new Date(viewYear, viewMonth, 1)
        const startDow = (first.getDay() + 6) % 7 // 0=Mon
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

        const cells: Array<{ iso: string; day: number; isPast: boolean; isToday: boolean; isExisting: boolean } | null> = []
        for (let i = 0; i < startDow; i++) cells.push(null)
        for (let d = 1; d <= daysInMonth; d++) {
            const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            cells.push({
                iso,
                day: d,
                isPast: iso < today,
                isToday: iso === today,
                isExisting: existingClosures.has(iso),
            })
        }
        return cells
    }, [viewYear, viewMonth, today, existingClosures])

    const navBtnCls = `w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
        isLight ? 'hover:bg-[#091825]/[0.06]' : 'hover:bg-white/[0.06]'
    }`

    return (
        <AdminModal label="Add closure" maxW="max-w-[420px]" onBackdrop={onClose}>
            {/* Header */}
            <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${t.border}`}>
                <div>
                    <div className={`text-[15px] font-black ${t.heading}`}>Add Closure</div>
                    <div className={`text-[11px] font-medium mt-0.5 ${t.muted}`}>
                        Tap a date, or tap two dates to select a range.
                    </div>
                </div>
                <button type="button" onClick={onClose} className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${t.muted} cursor-pointer`}>
                    <X size={16} strokeWidth={2.2} />
                </button>
            </div>

            {/* Calendar */}
            <div className="px-5 py-4">
                {/* Month nav */}
                <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={prevMonth} className={navBtnCls} aria-label="Previous month">
                        <ChevronLeft size={16} strokeWidth={2.2} className={t.muted} />
                    </button>
                    <span className={`text-[13px] font-black tracking-tight ${t.heading}`}>{monthLabel}</span>
                    <button type="button" onClick={nextMonth} className={navBtnCls} aria-label="Next month">
                        <ChevronRight size={16} strokeWidth={2.2} className={t.muted} />
                    </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 mb-1">
                    {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
                        <div key={d} className={`text-center text-[9px] font-black tracking-[0.12em] uppercase py-1 ${t.faint}`}>
                            {d}
                        </div>
                    ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7">
                    {calendarDays.map((cell, i) => {
                        if (!cell) return <div key={`empty-${i}`} />

                        const isSelected = selectedDates.has(cell.iso)
                        const disabled = cell.isPast || cell.isExisting
                        const isAnchor = cell.iso === rangeAnchor

                        let cellCls: string
                        if (cell.isExisting) {
                            cellCls = isLight
                                ? 'bg-[#c0392b]/[0.10] text-[#c0392b]/60 cursor-not-allowed'
                                : 'bg-[#e0716e]/[0.10] text-[#e0716e]/60 cursor-not-allowed'
                        } else if (isSelected) {
                            cellCls = 'bg-[#f57f20] text-white font-black cursor-pointer'
                        } else if (cell.isPast) {
                            cellCls = `${isLight ? 'text-[#091825]/20' : 'text-[#ede8da]/15'} cursor-not-allowed`
                        } else if (cell.isToday) {
                            cellCls = `${t.heading} font-black cursor-pointer ${isLight ? 'hover:bg-[#091825]/[0.06]' : 'hover:bg-white/[0.06]'}`
                        } else {
                            cellCls = `${t.body} cursor-pointer ${isLight ? 'hover:bg-[#091825]/[0.06]' : 'hover:bg-white/[0.06]'}`
                        }

                        return (
                            <button
                                key={cell.iso}
                                type="button"
                                disabled={disabled}
                                onClick={() => handleDayClick(cell.iso)}
                                className={`relative w-full aspect-square flex items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums transition-colors ${cellCls}`}
                            >
                                {cell.day}
                                {cell.isToday && !isSelected && (
                                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#f57f20]" />
                                )}
                                {isAnchor && count <= 1 && (
                                    <span className="absolute inset-0 rounded-lg border-2 border-[#f57f20] pointer-events-none" />
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-[#f57f20]" />
                        <span className={`text-[10px] font-bold ${t.muted}`}>Selected</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className={`w-3 h-3 rounded ${isLight ? 'bg-[#c0392b]/20' : 'bg-[#e0716e]/20'}`} />
                        <span className={`text-[10px] font-bold ${t.muted}`}>Already closed</span>
                    </div>
                </div>

                {/* Selection summary */}
                {count > 0 && (
                    <div className={`mt-3 text-[12px] font-bold ${t.accent}`}>
                        {count === 1
                            ? formatDateLong(sortedDates[0])
                            : `${formatDateLong(sortedDates[0])} — ${formatDateLong(sortedDates[sortedDates.length - 1])} (${count} days)`
                        }
                    </div>
                )}

                {/* Reason input */}
                <div className="mt-4">
                    <label className="flex flex-col gap-1.5">
                        <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>Reason</span>
                        <input
                            type="text"
                            value={reason}
                            onChange={e => { setReason(e.target.value); setError('') }}
                            placeholder="e.g. Eid Al-Adha, National Day, Emergency"
                            className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${t.input} ${t.inputFocus}`}
                        />
                    </label>
                </div>

                {error && <p className={`mt-2 text-[12px] font-bold ${t.danger}`}>{error}</p>}
            </div>

            {/* Footer */}
            <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
                <AdminButton variant="ghost" type="button" onClick={onClose} disabled={pending}>Cancel</AdminButton>
                <AdminButton
                    onClick={handleSubmit}
                    loading={pending}
                    disabled={count === 0}
                    icon={<CalendarOff size={14} strokeWidth={2.2} />}
                >
                    {count === 0 ? 'Pick Dates' : count === 1 ? 'Close This Day' : `Close ${count} Days`}
                </AdminButton>
            </div>
        </AdminModal>
    )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function todayAE(): string {
    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
    return `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`
}

function isoOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateLong(iso: string): string {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
}
