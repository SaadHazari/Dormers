'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { ArrowLeftRight, ChevronLeft, ChevronRight, Copy, MoveRight, Plus, Search, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
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
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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
    const [armClear, setArmClear] = useState(false)
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

    // Disarm the two-tap clear after a beat.
    useEffect(() => {
        if (!armClear) return
        const id = setTimeout(() => setArmClear(false), 3000)
        return () => clearTimeout(id)
    }, [armClear])

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
        if (!armClear) { setArmClear(true); return }
        setArmClear(false)
        run(() => clearSlot(target.weekId, target.dayIdx, target.isVeg))
    }

    const pickedElsewhere = picked ? elsewhereOf(picked.id as string) : []

    return (
        <AdminModal
            label={`Edit ${DAYS_FULL[target.dayIdx]} ${lane} slot`}
            onBackdrop={() => { if (!isPending) onClose() }}
        >
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className={`px-5 pt-4 pb-4 border-b ${t.border}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className={`text-[10px] font-black tracking-[0.14em] uppercase ${t.faint}`}>
                            {target.weekLabel} rotation
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-[16px] font-black tracking-tight ${t.heading}`}>
                                {DAYS_FULL[target.dayIdx]}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${target.isVeg ? 'bg-[#1d8a30]' : 'bg-[#f57f20]'}`} />
                                <span className={`text-[11px] font-bold tracking-[0.06em] uppercase ${t.muted}`}>{lane}</span>
                            </span>
                            {isToday && (
                                <span className="px-1.5 py-0.5 rounded-full bg-[#f57f20] text-white text-[10px] font-black tracking-[0.06em] uppercase leading-none">
                                    Today
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`w-9 h-9 -mr-1.5 -mt-1 shrink-0 rounded-lg flex items-center justify-center transition-colors duration-150 ${t.muted} ${
                            isLight ? 'hover:bg-[#091825]/[0.05]' : 'hover:bg-white/[0.06]'
                        }`}
                        aria-label="Close"
                    >
                        <X size={16} strokeWidth={2.2} />
                    </button>
                </div>

                {/* Current dish — the photo carries it */}
                <div className="relative h-20 rounded-xl overflow-hidden mt-3">
                    {currentDish ? (
                        <>
                            <BannerPhoto src={currentDish.image_path as string | null} alt={currentDish.name as string} />
                            <span className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/10" />
                            <span className="absolute inset-0 px-4 flex flex-col justify-center">
                                <span className="text-[10px] font-black tracking-[0.14em] uppercase text-white/70">
                                    Currently serving
                                </span>
                                <span className="text-[14px] font-black text-white truncate mt-0.5 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] pr-20">
                                    {currentDish.name as string}
                                </span>
                            </span>
                            {!picked && (
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    disabled={isPending}
                                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.04em] uppercase transition-colors duration-150 ${
                                        armClear
                                            ? 'bg-[#c0392b] text-white'
                                            : 'bg-black/45 text-white/90 hover:bg-black/60'
                                    } ${isPending ? 'opacity-50' : ''}`}
                                    title="Remove the dish from this day"
                                >
                                    <Trash2 size={11} strokeWidth={2.2} />
                                    {armClear ? 'Sure?' : 'Clear'}
                                </button>
                            )}
                        </>
                    ) : (
                        <span className={`absolute inset-0 rounded-xl border border-dashed ${t.borderStrong} flex items-center justify-center gap-2`}>
                            <UtensilsCrossed size={14} className={t.faint} strokeWidth={2} />
                            <span className={`text-[12px] font-semibold ${t.muted}`}>
                                Nothing scheduled — pick a dish below
                            </span>
                        </span>
                    )}
                </div>

                {isToday && (
                    <div className={`mt-2 px-3 py-2 rounded-lg border text-[12px] font-semibold ${t.warningBg} ${t.warning}`}>
                        Today&apos;s slot — labels printed earlier keep the old dish.
                    </div>
                )}
            </div>

            {picked ? (
                /* ── Confirm step ───────────────────────────────────── */
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
                    <button
                        type="button"
                        onClick={() => setPicked(null)}
                        className={`inline-flex items-center gap-1 mb-3 px-2 py-1.5 -ml-2 rounded-lg text-[11px] font-bold tracking-[0.06em] uppercase transition-colors duration-150 ${t.muted} ${
                            isLight ? 'hover:bg-[#091825]/[0.05]' : 'hover:bg-white/[0.05]'
                        }`}
                    >
                        <ChevronLeft size={13} strokeWidth={2.5} />
                        All dishes
                    </button>

                    <div className={`flex items-center gap-3 p-3 rounded-xl border ${t.border} ${
                        isLight ? 'bg-[#091825]/[0.02]' : 'bg-white/[0.03]'
                    } mb-4`}>
                        <DishThumb
                            src={picked.image_path as string | null}
                            alt={picked.name as string}
                            className="w-14 h-14 rounded-lg shrink-0"
                        />
                        <div className="min-w-0">
                            <div className={`text-[14px] font-black truncate ${t.heading}`}>{picked.name as string}</div>
                            <div className={`text-[11px] font-semibold mt-0.5 ${t.muted}`}>
                                Currently on {pickedElsewhere.map(slotLabel).join(', ')}
                            </div>
                        </div>
                    </div>

                    <div className={`text-[10px] font-black tracking-[0.12em] uppercase mb-2 ${t.faint}`}>
                        Place on {DAYS[target.dayIdx]} · {target.weekLabel} by…
                    </div>
                    <div className="flex flex-col gap-2">
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
                                    consequence={`Also stays on ${slotLabel(pickedElsewhere[0])}`}
                                    disabled={isPending}
                                    onClick={() => run(() => assignDishToSlot(target.weekId, picked.id as string, target.dayIdx, target.isVeg))}
                                />
                            </>
                        ) : (
                            <OptionCard
                                accent
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
                    <div className={`flex items-center gap-2 px-4 py-3 border-b ${t.border}`}>
                        <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border ${t.input}`}>
                            <Search size={14} className={t.faint} strokeWidth={2.2} />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search dishes…"
                                autoFocus
                                className="flex-1 min-w-0 bg-transparent text-[13px] font-medium outline-none"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowAllLanes(v => !v)}
                            className={`shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-bold tracking-[0.04em] uppercase border transition-colors duration-150 ${
                                showAllLanes ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted} ${t.cardHover}`
                            }`}
                        >
                            {!showAllLanes && <Plus size={11} strokeWidth={2.5} />}
                            {showAllLanes ? 'All lanes' : `${otherLane}`}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                        {unassigned.length === 0 && scheduled.length === 0 && (
                            <div className="text-center py-12 px-6">
                                <Search size={20} className={`mx-auto mb-3 ${t.faint}`} strokeWidth={2} />
                                <div className={`text-[13px] font-semibold ${t.muted}`}>
                                    No {showAllLanes ? '' : `${lane.toLowerCase()} `}dishes match
                                    {q ? ` “${search.trim()}”` : ''}.
                                </div>
                                {!showAllLanes && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllLanes(true)}
                                        className={`mt-2 text-[12px] font-bold ${t.accent}`}
                                    >
                                        Search {otherLane} dishes too
                                    </button>
                                )}
                            </div>
                        )}

                        {unassigned.length > 0 && (
                            <>
                                <GroupLabel>Not scheduled — tap to assign</GroupLabel>
                                {unassigned.map(dish => (
                                    <DishOptionRow
                                        key={dish.id as string}
                                        dish={dish}
                                        disabled={isPending}
                                        meta={<span className={`text-[11px] font-semibold ${t.success}`}>Available</span>}
                                        onClick={() => run(() => assignDishToSlot(target.weekId, dish.id as string, target.dayIdx, target.isVeg))}
                                    />
                                ))}
                            </>
                        )}

                        {scheduled.length > 0 && (
                            <>
                                <GroupLabel divider={unassigned.length > 0}>On the rotation — tap for options</GroupLabel>
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
                                                        className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${t.accentBg} ${t.accent}`}
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
        </AdminModal>
    )
}

/** Banner photo with quiet fallback (mirrors DishThumb, but fills a parent). */
function BannerPhoto({ src, alt }: { src: string | null; alt: string }) {
    const { isLight } = useAdminTheme()
    const [broken, setBroken] = useState(false)
    if (!src || broken) {
        return <span className={`absolute inset-0 ${isLight ? 'bg-[#091825]/[0.06]' : 'bg-white/[0.06]'}`} />
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt={alt}
            onError={() => setBroken(true)}
            className="absolute inset-0 w-full h-full object-cover"
        />
    )
}

function GroupLabel({ children, divider = false }: { children: React.ReactNode; divider?: boolean }) {
    const { t } = useAdminTheme()
    return (
        <div className={`px-3 pt-3 pb-1.5 text-[10px] font-black tracking-[0.12em] uppercase ${t.faint} ${divider ? `mt-2 border-t ${t.border}` : ''}`}>
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
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors duration-150 ${
                isLight ? 'hover:bg-[#091825]/[0.04]' : 'hover:bg-white/[0.04]'
            } ${disabled ? 'opacity-60' : ''}`}
        >
            <DishThumb
                src={dish.image_path as string | null}
                alt={dish.name as string}
                className="w-12 h-12 rounded-lg shrink-0"
            />
            <span className="flex-1 min-w-0">
                <span className={`block text-[13px] font-bold truncate ${t.heading}`}>{dish.name as string}</span>
                <span className="block mt-0.5">{meta}</span>
            </span>
            <ChevronRight size={14} className={`shrink-0 ${t.faint}`} strokeWidth={2.2} />
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
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors duration-150 active:scale-[0.99] ${
                accent
                    ? 'border-[#f57f20]/45 bg-[#f57f20]/[0.06] hover:bg-[#f57f20]/[0.10]'
                    : `${t.border} ${isLight ? 'hover:bg-[#091825]/[0.03]' : 'hover:bg-white/[0.04]'}`
            } ${disabled ? 'opacity-60' : ''}`}
        >
            <span className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${
                accent
                    ? `bg-[#f57f20]/[0.12] ${t.accent}`
                    : `${isLight ? 'bg-[#091825]/[0.04]' : 'bg-white/[0.05]'} ${t.muted}`
            }`}>
                {icon}
            </span>
            <span className="min-w-0">
                <span className={`block text-[13px] font-bold ${t.heading}`}>{title}</span>
                <span className={`block text-[12px] font-medium mt-0.5 ${t.muted}`}>{consequence}</span>
            </span>
        </button>
    )
}
