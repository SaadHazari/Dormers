'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { ArrowLeftRight, ChevronLeft, ChevronRight, Copy, MoveRight, Search, Trash2, X } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { DishThumb } from './DishThumb'
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
    const [picked, setPicked] = useState<Row | null>(null) // dish in the confirm step
    const [isPending, startTransition] = useTransition()

    const lane = target.isVeg ? 'Veg' : 'Non-Veg'
    const otherLane = target.isVeg ? 'non-veg' : 'veg'

    // Esc steps back out of the confirm view first, then closes.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key !== 'Escape') return
            if (picked) setPicked(null)
            else onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [picked, onClose])

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

    const elsewhereOf = (dishId: string) =>
        (slotsByDish.get(dishId) ?? []).filter(s => s.id !== currentSlot?.id)

    const q = search.trim().toLowerCase()
    const visible = dishes.filter(d =>
        d.is_active !== false &&
        d.id !== currentDish?.id &&
        (showAllLanes || Boolean(d.is_veg) === target.isVeg) &&
        (!q || ((d.name as string) ?? '').toLowerCase().includes(q)),
    )
    const byName = (a: Row, b: Row) => ((a.name as string) ?? '').localeCompare((b.name as string) ?? '')
    const unassigned = visible.filter(d => elsewhereOf(d.id as string).length === 0).sort(byName)
    const scheduled = visible.filter(d => elsewhereOf(d.id as string).length > 0).sort(byName)

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
        return `${week} · ${day}`
    }
    const chipLabel = (s: Row) => slotLabel(s).replace('Week ', 'W')

    function handleClear() {
        if (!confirm(`Empty this slot? ${DAYS[target.dayIdx]} (${target.weekLabel}) will have no ${lane} dish until you assign one.`)) return
        run(() => clearSlot(target.weekId, target.dayIdx, target.isVeg))
    }

    const pickedElsewhere = picked ? elsewhereOf(picked.id as string) : []

    return (
        <div
            className={`fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 ${t.backdrop}`}
            onClick={() => { if (!isPending) onClose() }}
        >
            <div
                className={`w-full max-w-[480px] max-h-[88vh] flex flex-col rounded-2xl overflow-hidden ${t.overlay}`}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ─────────────────────────────────────────────── */}
                <div className={`px-4 pt-4 pb-3.5 border-b ${t.border}`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-baseline gap-2 min-w-0">
                            <span className={`text-[15px] font-black tracking-tight ${t.heading}`}>
                                {DAYS[target.dayIdx]}
                            </span>
                            <span className={`text-[11px] font-bold ${target.isVeg ? t.success : t.accent}`}>
                                {lane}
                            </span>
                            <span className={`text-[11px] font-semibold ${t.faint}`}>
                                {target.weekLabel}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className={`p-1.5 -mr-1 rounded-lg transition-colors ${t.muted}`}
                            aria-label="Close"
                        >
                            <X size={16} strokeWidth={2.2} />
                        </button>
                    </div>

                    {isToday && (
                        <div className={`mt-2.5 px-2.5 py-1.5 rounded-lg border text-[10.5px] font-bold ${t.warningBg} ${t.warning}`}>
                            TODAY&apos;s slot — labels printed earlier still carry the current dish.
                        </div>
                    )}

                    {/* Current dish hero */}
                    <div className={`mt-3 flex items-center gap-3 p-2.5 rounded-xl border ${t.border} ${
                        isLight ? 'bg-[#091825]/[0.025]' : 'bg-white/[0.03]'
                    }`}>
                        {currentDish ? (
                            <DishThumb
                                src={currentDish.image_path as string | null}
                                alt={currentDish.name as string}
                                className="w-12 h-12 rounded-lg shrink-0"
                            />
                        ) : (
                            <div className={`w-12 h-12 rounded-lg shrink-0 border border-dashed ${t.borderStrong}`} />
                        )}
                        <div className="flex-1 min-w-0">
                            <div className={`text-[8.5px] font-bold tracking-[0.14em] uppercase ${t.faint}`}>
                                Currently serving
                            </div>
                            <div className={`text-[13px] font-bold truncate ${currentDish ? t.heading : t.faint}`}>
                                {currentDish ? (currentDish.name as string) : 'Nothing — pick a dish below'}
                            </div>
                        </div>
                        {currentSlot && !picked && (
                            <button
                                type="button"
                                onClick={handleClear}
                                disabled={isPending}
                                className={`shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[9.5px] font-bold tracking-[0.04em] uppercase transition-colors ${t.dangerBg} ${t.danger} ${isPending ? 'opacity-50' : ''}`}
                                title="Remove the dish from this day"
                            >
                                <Trash2 size={11} strokeWidth={2.2} />
                                Clear day
                            </button>
                        )}
                    </div>
                </div>

                {picked ? (
                    /* ── Confirm step ───────────────────────────────────── */
                    <div className="flex-1 overflow-y-auto px-4 py-3">
                        <button
                            type="button"
                            onClick={() => setPicked(null)}
                            className={`inline-flex items-center gap-0.5 mb-3 text-[10px] font-bold tracking-[0.06em] uppercase transition-colors ${t.muted}`}
                        >
                            <ChevronLeft size={12} strokeWidth={2.5} />
                            All dishes
                        </button>

                        <div className="flex items-center gap-2.5 mb-4">
                            <DishThumb
                                src={picked.image_path as string | null}
                                alt={picked.name as string}
                                className="w-11 h-11 rounded-lg shrink-0"
                            />
                            <div className="min-w-0">
                                <div className={`text-[13px] font-bold truncate ${t.heading}`}>{picked.name as string}</div>
                                <div className={`text-[10px] font-semibold ${t.muted}`}>
                                    Now on {pickedElsewhere.map(slotLabel).join(', ')}
                                </div>
                            </div>
                        </div>

                        <div className={`text-[9px] font-bold tracking-[0.10em] uppercase mb-1.5 ${t.faint}`}>
                            Place on {DAYS[target.dayIdx]} · {target.weekLabel} by…
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {pickedElsewhere.length === 1 ? (
                                <>
                                    {currentSlot && currentDish && (
                                        <OptionCard
                                            accent
                                            icon={<ArrowLeftRight size={15} strokeWidth={2.2} />}
                                            title="Swap the two days"
                                            consequence={`${currentDish.name as string} moves to ${slotLabel(pickedElsewhere[0])}`}
                                            disabled={isPending}
                                            onClick={() => run(() => swapSlotDishes(currentSlot.id as string, pickedElsewhere[0].id as string))}
                                        />
                                    )}
                                    <OptionCard
                                        icon={<MoveRight size={15} strokeWidth={2.2} />}
                                        title="Move it here"
                                        consequence={`${slotLabel(pickedElsewhere[0])} becomes empty`}
                                        disabled={isPending}
                                        onClick={() => run(() => moveSlotDish(pickedElsewhere[0].id as string, target.weekId, target.dayIdx, target.isVeg))}
                                    />
                                    <OptionCard
                                        icon={<Copy size={15} strokeWidth={2.2} />}
                                        title="Serve both days"
                                        consequence={`Stays on ${slotLabel(pickedElsewhere[0])} as well`}
                                        disabled={isPending}
                                        onClick={() => run(() => assignDishToSlot(target.weekId, picked.id as string, target.dayIdx, target.isVeg))}
                                    />
                                </>
                            ) : (
                                <OptionCard
                                    icon={<Copy size={15} strokeWidth={2.2} />}
                                    title="Add it here too"
                                    consequence={`Keeps its other ${pickedElsewhere.length} days`}
                                    disabled={isPending}
                                    onClick={() => run(() => assignDishToSlot(target.weekId, picked.id as string, target.dayIdx, target.isVeg))}
                                />
                            )}
                        </div>
                    </div>
                ) : (
                    /* ── Pick step ──────────────────────────────────────── */
                    <>
                        <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${t.border}`}>
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
                                className={`shrink-0 px-2.5 py-1.5 rounded-full text-[9px] font-bold tracking-[0.06em] uppercase border transition-colors ${
                                    showAllLanes ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                                }`}
                            >
                                {showAllLanes ? '✓ All dishes' : `Show ${otherLane} too`}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-2 py-1.5">
                            {unassigned.length === 0 && scheduled.length === 0 && (
                                <div className={`text-center py-10 text-[12px] font-semibold ${t.muted}`}>
                                    No dishes match — try the {otherLane} lane or add a new dish first.
                                </div>
                            )}

                            {unassigned.length > 0 && (
                                <>
                                    <GroupLabel>Ready to assign — one tap</GroupLabel>
                                    {unassigned.map(dish => (
                                        <DishOptionRow
                                            key={dish.id as string}
                                            dish={dish}
                                            disabled={isPending}
                                            meta={<span className={`text-[10px] font-semibold ${t.success}`}>Not scheduled yet</span>}
                                            onClick={() => run(() => assignDishToSlot(target.weekId, dish.id as string, target.dayIdx, target.isVeg))}
                                        />
                                    ))}
                                </>
                            )}

                            {scheduled.length > 0 && (
                                <>
                                    <GroupLabel>On the rotation — swap, move, or copy</GroupLabel>
                                    {scheduled.map(dish => (
                                        <DishOptionRow
                                            key={dish.id as string}
                                            dish={dish}
                                            disabled={isPending}
                                            meta={
                                                <span className="flex items-center gap-1 flex-wrap">
                                                    {elsewhereOf(dish.id as string).map(s => (
                                                        <span
                                                            key={s.id as string}
                                                            className={`px-1.5 py-px rounded border text-[8.5px] font-bold ${t.accentBg} ${t.accent}`}
                                                        >
                                                            {chipLabel(s)}
                                                        </span>
                                                    ))}
                                                </span>
                                            }
                                            onClick={() => setPicked(dish)}
                                        />
                                    ))}
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
    const { t } = useAdminTheme()
    return (
        <div className={`px-2.5 pt-2.5 pb-1 text-[9px] font-bold tracking-[0.10em] uppercase ${t.faint}`}>
            {children}
        </div>
    )
}

function DishOptionRow({ dish, meta, disabled, onClick }: {
    dish: Row
    meta: React.ReactNode
    disabled: boolean
    onClick: () => void
}) {
    const { t, isLight } = useAdminTheme()
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                isLight ? 'hover:bg-[#091825]/[0.04]' : 'hover:bg-white/[0.04]'
            } ${disabled ? 'opacity-60' : ''}`}
        >
            <DishThumb
                src={dish.image_path as string | null}
                alt={dish.name as string}
                className="w-10 h-10 rounded-md shrink-0"
            />
            <span className="flex-1 min-w-0">
                <span className={`block text-[12px] font-bold truncate ${t.heading}`}>{dish.name as string}</span>
                <span className="block mt-0.5">{meta}</span>
            </span>
            <ChevronRight size={13} className={`shrink-0 ${t.faint}`} strokeWidth={2.2} />
        </button>
    )
}

function OptionCard({ icon, title, consequence, onClick, disabled, accent = false }: {
    icon: React.ReactNode
    title: string
    consequence: string
    onClick: () => void
    disabled: boolean
    accent?: boolean
}) {
    const { t, isLight } = useAdminTheme()
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                accent
                    ? 'border-[#f57f20]/45 bg-[#f57f20]/[0.05] hover:bg-[#f57f20]/[0.09]'
                    : `${t.border} ${isLight ? 'hover:bg-[#091825]/[0.03]' : 'hover:bg-white/[0.04]'}`
            } ${disabled ? 'opacity-60' : ''}`}
        >
            <span className={`mt-0.5 shrink-0 ${accent ? t.accent : t.muted}`}>{icon}</span>
            <span className="min-w-0">
                <span className={`block text-[12.5px] font-bold ${t.heading}`}>{title}</span>
                <span className={`block text-[11px] font-medium mt-0.5 ${t.muted}`}>{consequence}</span>
            </span>
        </button>
    )
}
