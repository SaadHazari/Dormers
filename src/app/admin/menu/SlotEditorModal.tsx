'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Search, X } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { assignDishToSlot, clearSlot, moveSlotDish, swapSlotDishes } from './actions'

type Row = Record<string, unknown>
type Result = { ok: boolean; message: string }

export interface SlotTarget {
    weekId: string
    weekLabel: string
    dayIdx: number
    isVeg: boolean
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
    target: SlotTarget
    dishes: Row[]
    weeks: Row[]
    slots: Row[]
    isToday: boolean
    onClose: () => void
    onResult: (r: Result) => void
}

export function SlotEditorModal({ target, dishes, weeks, slots, isToday, onClose, onResult }: Props) {
    const { t, isLight } = useAdminTheme()
    const [search, setSearch] = useState('')
    const [showAllLanes, setShowAllLanes] = useState(false)
    const [pickedId, setPickedId] = useState<string | null>(null) // dish waiting on swap/move/keep choice
    const [isPending, startTransition] = useTransition()

    const lane = target.isVeg ? 'Veg' : 'Non-Veg'

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const dishById = useMemo(() => new Map(dishes.map(d => [d.id as string, d])), [dishes])
    const weekLabelById = useMemo(
        () => new Map(weeks.map(w => [w.id as string, (w.label as string) || (w.week_key as string)])),
        [weeks],
    )

    const currentSlot = useMemo(
        () =>
            slots.find(s =>
                s.menu_week_id === target.weekId &&
                Number(s.day_of_week) === target.dayIdx &&
                Boolean(s.is_veg) === target.isVeg,
            ) ?? null,
        [slots, target],
    )
    const currentDish = currentSlot ? dishById.get(currentSlot.dish_id as string) ?? null : null

    const slotsByDish = useMemo(() => {
        const m = new Map<string, Row[]>()
        for (const s of slots) {
            const k = s.dish_id as string
            const arr = m.get(k)
            if (arr) arr.push(s)
            else m.set(k, [s])
        }
        return m
    }, [slots])

    const q = search.trim().toLowerCase()
    const list = dishes.filter(d =>
        d.is_active !== false &&
        (showAllLanes || Boolean(d.is_veg) === target.isVeg) &&
        (!q || ((d.name as string) ?? '').toLowerCase().includes(q)),
    )

    function run(fn: () => Promise<Result>) {
        startTransition(async () => {
            const res = await fn()
            onResult(res)
            if (res.ok) onClose()
        })
    }

    function slotLabel(s: Row): string {
        const week = weekLabelById.get(s.menu_week_id as string) ?? '?'
        const day = DAYS[Number(s.day_of_week)] ?? '?'
        return `${week} · ${day}${s.is_veg ? ' · Veg' : ''}`
    }

    function handlePick(dish: Row) {
        const dishId = dish.id as string
        if (currentSlot && currentSlot.dish_id === dishId) return
        const elsewhere = (slotsByDish.get(dishId) ?? []).filter(s => s.id !== currentSlot?.id)
        if (elsewhere.length === 0) {
            run(() => assignDishToSlot(target.weekId, dishId, target.dayIdx, target.isVeg))
        } else {
            setPickedId(pickedId === dishId ? null : dishId)
        }
    }

    function handleClear() {
        if (!confirm(`Empty this slot? ${DAYS[target.dayIdx]} (${target.weekLabel}) will have no ${lane} dish until you assign one.`)) return
        run(() => clearSlot(target.weekId, target.dayIdx, target.isVeg))
    }

    const choiceBtn = `w-full text-left px-3 py-2 rounded-lg border text-[11px] font-bold transition-colors disabled:opacity-50 ${
        isLight
            ? 'border-[#091825]/[0.10] hover:border-[#f57f20]/50 hover:bg-[#f57f20]/[0.05]'
            : 'border-white/[0.10] hover:border-[#f57f20]/50 hover:bg-[#f57f20]/[0.07]'
    } ${t.body}`

    return (
        <div
            className={`fixed inset-0 z-[150] flex items-center justify-center p-4 ${t.backdrop}`}
            onClick={() => { if (!isPending) onClose() }}
        >
            <div
                className={`w-full max-w-[480px] max-h-[85vh] flex flex-col rounded-2xl overflow-hidden ${t.overlay}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`px-4 pt-4 pb-3 border-b ${t.border}`}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className={`text-[14px] font-black ${t.heading}`}>
                                {DAYS[target.dayIdx]} · {lane}
                            </div>
                            <div className={`text-[11px] font-semibold mt-0.5 ${t.muted}`}>
                                {target.weekLabel} · currently:{' '}
                                {currentDish ? (currentDish.name as string) : 'empty'}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className={`p-1.5 rounded-lg transition-colors ${t.muted} hover:${t.heading}`}
                            aria-label="Close"
                        >
                            <X size={16} strokeWidth={2.2} />
                        </button>
                    </div>

                    {isToday && (
                        <div className={`mt-2.5 px-2.5 py-1.5 rounded-lg border text-[10.5px] font-bold ${t.warningBg} ${t.warning}`}>
                            This is TODAY&apos;s slot — labels printed earlier today still carry the current dish.
                        </div>
                    )}

                    {/* Search + lane filter */}
                    <div className="flex items-center gap-2 mt-3">
                        <div className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${t.input}`}>
                            <Search size={13} className={t.faint} strokeWidth={2.2} />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search dishes..."
                                autoFocus
                                className="flex-1 bg-transparent text-[12px] font-medium outline-none"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowAllLanes(v => !v)}
                            className={`px-2.5 py-1.5 rounded-full text-[9px] font-bold tracking-[0.06em] uppercase border transition-colors ${
                                showAllLanes ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                            }`}
                            title={showAllLanes ? `Showing all dishes` : `Showing ${lane} dishes only`}
                        >
                            {showAllLanes ? 'All lanes' : `${lane} only`}
                        </button>
                    </div>
                </div>

                {/* Dish list */}
                <div className="flex-1 overflow-y-auto px-2 py-2">
                    {list.length === 0 && (
                        <div className={`text-center py-8 text-[12px] font-semibold ${t.muted}`}>
                            No dishes match — try &ldquo;All lanes&rdquo; or add a new dish first.
                        </div>
                    )}
                    {list.map(dish => {
                        const dishId = dish.id as string
                        const isCurrent = currentSlot?.dish_id === dishId
                        const elsewhere = (slotsByDish.get(dishId) ?? []).filter(s => s.id !== currentSlot?.id)
                        const expanded = pickedId === dishId && elsewhere.length > 0 && !isCurrent

                        return (
                            <div key={dishId}>
                                <button
                                    type="button"
                                    onClick={() => handlePick(dish)}
                                    disabled={isPending || isCurrent}
                                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                                        isCurrent
                                            ? `${t.tableRowSelected} cursor-default`
                                            : isLight
                                                ? 'hover:bg-[#091825]/[0.04]'
                                                : 'hover:bg-white/[0.04]'
                                    } ${isPending ? 'opacity-60' : ''}`}
                                >
                                    <span className="min-w-0">
                                        <span className={`block text-[12px] font-bold truncate ${t.heading}`}>
                                            {dish.name as string}
                                        </span>
                                        <span className={`block text-[10px] font-semibold ${dish.is_veg ? t.success : t.accent}`}>
                                            {dish.is_veg ? 'Veg' : 'Non-Veg'}
                                        </span>
                                    </span>
                                    <span className={`shrink-0 text-[9.5px] font-bold ${isCurrent ? t.accent : t.faint}`}>
                                        {isCurrent
                                            ? 'Current'
                                            : elsewhere.length === 1
                                                ? slotLabel(elsewhere[0])
                                                : elsewhere.length > 1
                                                    ? `On ${elsewhere.length} days`
                                                    : 'Unassigned'}
                                    </span>
                                </button>

                                {expanded && (
                                    <div className={`mx-2.5 mb-2 mt-0.5 flex flex-col gap-1.5 p-2 rounded-xl border ${t.border} ${
                                        isLight ? 'bg-[#091825]/[0.02]' : 'bg-white/[0.02]'
                                    }`}>
                                        {elsewhere.length === 1 ? (
                                            <>
                                                {currentSlot && currentDish && (
                                                    <button
                                                        type="button"
                                                        disabled={isPending}
                                                        className={choiceBtn}
                                                        onClick={() => run(() => swapSlotDishes(currentSlot.id as string, elsewhere[0].id as string))}
                                                    >
                                                        Swap — {currentDish.name as string} goes to {slotLabel(elsewhere[0])}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    disabled={isPending}
                                                    className={choiceBtn}
                                                    onClick={() => run(() => moveSlotDish(elsewhere[0].id as string, target.weekId, target.dayIdx, target.isVeg))}
                                                >
                                                    Move here — {slotLabel(elsewhere[0])} becomes empty
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isPending}
                                                    className={choiceBtn}
                                                    onClick={() => run(() => assignDishToSlot(target.weekId, dishId, target.dayIdx, target.isVeg))}
                                                >
                                                    Keep both — also stays on {slotLabel(elsewhere[0])}
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={isPending}
                                                className={choiceBtn}
                                                onClick={() => run(() => assignDishToSlot(target.weekId, dishId, target.dayIdx, target.isVeg))}
                                            >
                                                Add here too — stays on its other {elsewhere.length} days
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Footer */}
                {currentSlot && (
                    <div className={`px-4 py-3 border-t ${t.border} flex justify-end`}>
                        <AdminButton variant="danger" onClick={handleClear} loading={isPending}>
                            Clear slot
                        </AdminButton>
                    </div>
                )}
            </div>
        </div>
    )
}
