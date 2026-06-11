'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
    AlertCircle, ArrowLeftRight, CheckCircle2, ChevronRight, Database,
    Eye, EyeOff, Flame, Plus, Trash2, UtensilsCrossed,
} from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { AdminBadge } from '../_components/AdminBadge'
import { deleteDish, seedMenuFromStatic, toggleDishActive } from './actions'
import { DishThumb } from './DishThumb'
import { SlotEditorModal, type SlotTarget } from './SlotEditorModal'
import { DishEditorModal } from './DishEditorModal'

type Row = Record<string, unknown>
type Result = { ok: boolean; message: string }

interface Props {
    dishes: Row[]
    weeks: Row[]
    slots: Row[]
    currentWeekKey: string
    todayDow: number
}

type Tab = 'rotation' | 'dishes'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function MenuCmsClient({ dishes, weeks, slots, currentWeekKey, todayDow }: Props) {
    const { t } = useAdminTheme()
    const [tab, setTab] = useState<Tab>('rotation')
    const [result, setResult] = useState<Result | null>(null)
    const [slotTarget, setSlotTarget] = useState<SlotTarget | null>(null)
    const dismissToast = useCallback(() => setResult(null), [])

    const isEmpty = dishes.length === 0

    const targetWeek = slotTarget ? weeks.find(w => w.id === slotTarget.weekId) : null
    const targetIsToday = Boolean(
        slotTarget && targetWeek &&
        (targetWeek.week_key as string) === currentWeekKey &&
        slotTarget.dayIdx === todayDow,
    )

    return (
        <div>
            {/* ── Page header ────────────────────────────────────────── */}
            <div className="flex items-end justify-between gap-x-6 gap-y-4 flex-wrap mb-6">
                <div>
                    <h1 className={`text-[20px] font-black tracking-tight ${t.heading}`}>Menu CMS</h1>
                    <p className={`text-[13px] font-medium mt-1 ${t.muted}`}>
                        {isEmpty
                            ? 'No dishes in the database yet.'
                            : tab === 'rotation'
                                ? 'Tap any slot to swap, move, or assign a dish.'
                                : 'Edit dish details, photos, and availability.'}
                    </p>
                </div>
                {!isEmpty && <SegmentedTabs tab={tab} onChange={setTab} />}
            </div>

            {isEmpty && <SeedAction onResult={setResult} />}

            {!isEmpty && tab === 'rotation' && (
                <RotationView
                    weeks={weeks}
                    slots={slots}
                    dishes={dishes}
                    currentWeekKey={currentWeekKey}
                    todayDow={todayDow}
                    onSlotClick={setSlotTarget}
                />
            )}

            {!isEmpty && tab === 'dishes' && (
                <DishList dishes={dishes} slots={slots} weeks={weeks} onResult={setResult} />
            )}

            {slotTarget && (
                <SlotEditorModal
                    target={slotTarget}
                    dishes={dishes}
                    weeks={weeks}
                    slots={slots}
                    isToday={targetIsToday}
                    onClose={() => setSlotTarget(null)}
                    onResult={setResult}
                />
            )}

            <Toast result={result} onDismiss={dismissToast} />
        </div>
    )
}

/* ── Segmented tab control ─────────────────────────────────────── */

function SegmentedTabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
    const { t, isLight } = useAdminTheme()
    const seg = (key: Tab, label: string) => {
        const active = tab === key
        return (
            <button
                type="button"
                onClick={() => onChange(key)}
                className={`px-4 py-2 rounded-full text-[12px] font-bold tracking-[0.04em] uppercase transition-colors duration-150 ${
                    active
                        ? 'bg-[#f57f20] text-white shadow-[0_2px_10px_rgba(245,127,32,0.35)]'
                        : `${t.muted} ${isLight ? 'hover:text-[#091825]' : 'hover:text-[#ede8da]'}`
                }`}
            >
                {label}
            </button>
        )
    }
    return (
        <div className={`inline-flex p-1 rounded-full ${t.card}`}>
            {seg('rotation', 'Rotation')}
            {seg('dishes', 'All Dishes')}
        </div>
    )
}

/* ── Toast — fixed to the viewport so feedback is never off-screen ─ */

function Toast({ result, onDismiss }: { result: Result | null; onDismiss: () => void }) {
    const { t } = useAdminTheme()
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!result) return
        timer.current = setTimeout(onDismiss, 4000)
        return () => { if (timer.current) clearTimeout(timer.current) }
    }, [result, onDismiss])

    if (!result) return null

    return (
        <div className="fixed bottom-6 inset-x-4 lg:left-[220px] lg:right-0 z-[200] flex justify-center pointer-events-none">
            <button
                type="button"
                onClick={onDismiss}
                className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 max-w-[440px] rounded-xl text-left shadow-xl ${t.overlay}`}
            >
                {result.ok
                    ? <CheckCircle2 size={16} className={`shrink-0 ${t.success}`} strokeWidth={2.2} />
                    : <AlertCircle size={16} className={`shrink-0 ${t.danger}`} strokeWidth={2.2} />}
                <span className={`text-[13px] font-semibold leading-snug ${t.heading}`}>{result.message}</span>
            </button>
        </div>
    )
}

/* ── Seed (empty DB only) ──────────────────────────────────────── */

function SeedAction({ onResult }: { onResult: (r: Result) => void }) {
    const { t } = useAdminTheme()
    const [isPending, startTransition] = useTransition()

    function handleSeed() {
        if (!confirm('Seed the database from the static catalog-data.ts? This inserts 48 dishes, 4 weeks, and 48 slot assignments.')) return
        startTransition(async () => {
            const res = await seedMenuFromStatic()
            onResult(res)
        })
    }

    return (
        <div className={`${t.card} rounded-2xl px-6 py-12 text-center`}>
            <Database size={32} className={`mx-auto mb-4 ${t.faint}`} strokeWidth={1.5} />
            <div className={`text-[14px] font-bold mb-1 ${t.heading}`}>Seed from static data</div>
            <div className={`text-[12px] font-medium mb-5 max-w-[360px] mx-auto ${t.muted}`}>
                Import all 48 dishes and the 4-week rotation from catalog-data.ts into the database.
            </div>
            <AdminButton onClick={handleSeed} loading={isPending} icon={<Database size={13} />}>
                Seed Database
            </AdminButton>
        </div>
    )
}

/* ── Rotation ──────────────────────────────────────────────────── */

function RotationView({ weeks, slots, dishes, currentWeekKey, todayDow, onSlotClick }: {
    weeks: Row[]
    slots: Row[]
    dishes: Row[]
    currentWeekKey: string
    todayDow: number
    onSlotClick: (target: SlotTarget) => void
}) {
    const dishMap = useMemo(() => {
        const m = new Map<string, Row>()
        for (const d of dishes) m.set(d.id as string, d)
        return m
    }, [dishes])

    // Live week leads; the rest follow in cyclic order (mirrors the actual
    // upcoming timeline, so "what's next" reads top to bottom).
    const ordered = useMemo(() => {
        const idx = weeks.findIndex(w => (w.week_key as string) === currentWeekKey)
        if (idx <= 0) return weeks
        return [...weeks.slice(idx), ...weeks.slice(0, idx)]
    }, [weeks, currentWeekKey])

    return (
        <div className="flex flex-col gap-6">
            {ordered.map((week, orderIdx) => (
                <WeekCard
                    key={week.id as string}
                    week={week}
                    slots={slots}
                    dishMap={dishMap}
                    isLive={(week.week_key as string) === currentWeekKey}
                    isNext={orderIdx === 1 && weeks.length > 1}
                    todayDow={todayDow}
                    onSlotClick={onSlotClick}
                />
            ))}
        </div>
    )
}

function WeekCard({ week, slots, dishMap, isLive, isNext, todayDow, onSlotClick }: {
    week: Row
    slots: Row[]
    dishMap: Map<string, Row>
    isLive: boolean
    isNext: boolean
    todayDow: number
    onSlotClick: (target: SlotTarget) => void
}) {
    const { t, isLight } = useAdminTheme()

    const weekSlots = slots.filter(s => s.menu_week_id === week.id)
    const weekLabel = (week.label as string) || (week.week_key as string)
    const emptyCount = DAYS.length * 2 - weekSlots.length

    const dishAt = (dayIdx: number, isVeg: boolean): Row | null => {
        const slot = weekSlots.find(s => Number(s.day_of_week) === dayIdx && Boolean(s.is_veg) === isVeg)
        return slot ? dishMap.get(slot.dish_id as string) ?? null : null
    }
    const target = (dayIdx: number, isVeg: boolean): SlotTarget => ({
        weekId: week.id as string,
        weekLabel,
        dayIdx,
        isVeg,
    })

    return (
        <section className={`rounded-2xl border ${isLive ? 'border-[#f57f20]/35' : t.border} ${isLight ? 'bg-white' : 'bg-[#0d2035]'}`}>
            {/* Week header */}
            <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 pb-1 flex-wrap">
                <h2 className={`text-[16px] font-black tracking-tight ${t.heading}`}>{weekLabel}</h2>
                {isLive && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black tracking-[0.10em] uppercase ${t.accentBg} ${t.accent}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-[#f57f20]" />
                        Serving this week
                    </span>
                )}
                {!isLive && isNext && (
                    <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black tracking-[0.10em] uppercase ${t.border} ${t.faint}`}>
                        Up next
                    </span>
                )}
                {emptyCount > 0 && (
                    <span className={`ml-auto text-[11px] font-bold ${t.warning}`}>
                        {emptyCount} empty {emptyCount === 1 ? 'slot' : 'slots'}
                    </span>
                )}
            </div>

            {/* Desktop: one grid — day headers + both lanes share columns */}
            <div className="hidden sm:grid gap-2 px-4 sm:px-5 pb-5 pt-3" style={{ gridTemplateColumns: '88px repeat(6, minmax(0, 1fr))' }}>
                <div />
                {DAYS.map((day, dayIdx) => (
                    <DayHeader key={day} day={day} isToday={isLive && dayIdx === todayDow} />
                ))}
                {([false, true] as const).map(laneVeg => (
                    <LaneCells
                        key={String(laneVeg)}
                        laneVeg={laneVeg}
                        dishAt={dishAt}
                        isLive={isLive}
                        todayDow={todayDow}
                        target={target}
                        onSlotClick={onSlotClick}
                    />
                ))}
            </div>

            {/* Mobile: stacked day sections */}
            <div className="sm:hidden flex flex-col gap-4 px-4 pb-4 pt-3">
                {DAYS.map((day, dayIdx) => {
                    const isToday = isLive && dayIdx === todayDow
                    return (
                        <div key={dayIdx}>
                            <DayHeader day={day} isToday={isToday} align="left" />
                            <div className="flex flex-col gap-2 mt-1.5">
                                {([false, true] as const).map(laneVeg => (
                                    <MobileSlotRow
                                        key={String(laneVeg)}
                                        dish={dishAt(dayIdx, laneVeg)}
                                        laneVeg={laneVeg}
                                        isToday={isToday}
                                        onClick={() => onSlotClick(target(dayIdx, laneVeg))}
                                    />
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

function LaneCells({ laneVeg, dishAt, isLive, todayDow, target, onSlotClick }: {
    laneVeg: boolean
    dishAt: (dayIdx: number, isVeg: boolean) => Row | null
    isLive: boolean
    todayDow: number
    target: (dayIdx: number, isVeg: boolean) => SlotTarget
    onSlotClick: (target: SlotTarget) => void
}) {
    return (
        <>
            <LaneLabel laneVeg={laneVeg} />
            {DAYS.map((_, dayIdx) => (
                <SlotTile
                    key={dayIdx}
                    dish={dishAt(dayIdx, laneVeg)}
                    isToday={isLive && dayIdx === todayDow}
                    onClick={() => onSlotClick(target(dayIdx, laneVeg))}
                />
            ))}
        </>
    )
}

function LaneLabel({ laneVeg }: { laneVeg: boolean }) {
    const { t } = useAdminTheme()
    return (
        <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${laneVeg ? 'bg-[#1d8a30]' : 'bg-[#f57f20]'}`} />
            <span className={`text-[11px] font-bold tracking-[0.06em] uppercase truncate ${t.muted}`}>
                {laneVeg ? 'Veg' : 'Non-Veg'}
            </span>
        </div>
    )
}

function DayHeader({ day, isToday, align = 'center' }: { day: string; isToday: boolean; align?: 'center' | 'left' }) {
    const { t } = useAdminTheme()
    return (
        <div className={`flex items-center gap-1.5 ${align === 'center' ? 'justify-center' : ''}`}>
            <span className={`text-[11px] font-bold tracking-[0.10em] uppercase ${isToday ? t.accent : t.faint}`}>
                {day}
            </span>
            {isToday && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#f57f20] text-white text-[10px] font-black tracking-[0.06em] uppercase leading-none">
                    Today
                </span>
            )}
        </div>
    )
}

/** Full-bleed photo tile — the photo IS the slot. */
function SlotTile({ dish, isToday, onClick }: {
    dish: Row | null
    isToday: boolean
    onClick: () => void
}) {
    const { t } = useAdminTheme()

    if (!dish) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={`group aspect-[4/3] rounded-xl border border-dashed ${t.borderStrong} flex flex-col items-center justify-center gap-1.5 transition-colors duration-150 cursor-pointer hover:border-[#f57f20]/60 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f57f20] ${
                    isToday ? 'bg-[#f57f20]/[0.04]' : ''
                }`}
            >
                <Plus size={16} className={`transition-colors ${t.faint} group-hover:text-[#f57f20]`} strokeWidth={2.2} />
                <span className={`text-[11px] font-bold tracking-[0.06em] uppercase transition-colors ${t.faint} group-hover:text-[#f57f20]`}>
                    Add dish
                </span>
            </button>
        )
    }

    return (
        <button
            type="button"
            onClick={onClick}
            className={`group relative aspect-[4/3] rounded-xl overflow-hidden text-left cursor-pointer active:scale-[0.98] transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f57f20] ${
                isToday ? 'ring-2 ring-[#f57f20]/70' : ''
            }`}
            title={dish.name as string}
        >
            <TilePhoto src={dish.image_path as string | null} alt={dish.name as string} />
            {/* scrim anchors the name to the plate */}
            <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <span className="absolute left-2.5 right-2.5 bottom-2 text-[12px] font-bold leading-[1.3] text-white line-clamp-2 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
                {dish.name as string}
            </span>
            <span className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/45 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <ArrowLeftRight size={12} strokeWidth={2.2} />
            </span>
        </button>
    )
}

/** Photo layer for tiles, with a quiet placeholder when missing/broken. */
function TilePhoto({ src, alt }: { src: string | null; alt: string }) {
    const { isLight } = useAdminTheme()
    const [broken, setBroken] = useState(false)

    if (!src || broken) {
        return (
            <span className={`absolute inset-0 flex items-center justify-center ${isLight ? 'bg-[#091825]/[0.06]' : 'bg-white/[0.06]'}`}>
                <UtensilsCrossed size={18} className={isLight ? 'text-[#091825]/25' : 'text-[#ede8da]/20'} strokeWidth={2} />
            </span>
        )
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setBroken(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.05]"
        />
    )
}

function MobileSlotRow({ dish, laneVeg, isToday, onClick }: {
    dish: Row | null
    laneVeg: boolean
    isToday: boolean
    onClick: () => void
}) {
    const { t, isLight } = useAdminTheme()

    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full flex items-center gap-3 rounded-xl border p-2 pr-3 text-left transition-colors duration-150 cursor-pointer active:scale-[0.98] ${
                isLight ? 'bg-white' : 'bg-white/[0.04]'
            } ${isToday ? 'border-[#f57f20]/40' : t.border} active:border-[#f57f20]/60`}
        >
            {dish ? (
                <DishThumb src={dish.image_path as string | null} alt={dish.name as string} className="w-14 h-14 rounded-lg shrink-0" />
            ) : (
                <span className={`w-14 h-14 rounded-lg shrink-0 border border-dashed ${t.borderStrong} flex items-center justify-center`}>
                    <Plus size={14} className={t.faint} strokeWidth={2.2} />
                </span>
            )}
            <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${laneVeg ? 'bg-[#1d8a30]' : 'bg-[#f57f20]'}`} />
                    <span className={`text-[11px] font-bold tracking-[0.08em] uppercase ${t.faint}`}>
                        {laneVeg ? 'Veg' : 'Non-Veg'}
                    </span>
                </span>
                <span className={`block mt-0.5 text-[13px] font-bold leading-[1.3] line-clamp-2 ${dish ? t.heading : t.faint}`}>
                    {dish ? (dish.name as string) : 'Empty — tap to assign'}
                </span>
            </span>
            <ChevronRight size={14} className={`shrink-0 ${t.faint}`} strokeWidth={2.2} />
        </button>
    )
}

/* ── All Dishes ────────────────────────────────────────────────── */

function DishList({ dishes, slots, weeks, onResult }: {
    dishes: Row[]
    slots: Row[]
    weeks: Row[]
    onResult: (r: Result) => void
}) {
    const { t, isLight } = useAdminTheme()
    const [editId, setEditId] = useState<string | null>(null)
    const [showNew, setShowNew] = useState(false)
    const [filter, setFilter] = useState<'all' | 'veg' | 'nonveg'>('all')

    const weekLabelById = useMemo(
        () => new Map(weeks.map(w => [w.id as string, (w.label as string) || (w.week_key as string)])),
        [weeks],
    )
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

    const filtered = filter === 'all' ? dishes : filter === 'veg'
        ? dishes.filter(d => d.is_veg === true)
        : dishes.filter(d => d.is_veg === false)

    const editingDish = editId ? dishes.find(d => d.id === editId) ?? null : null

    const pill = (key: typeof filter, label: string) => {
        const active = filter === key
        return (
            <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-2 sm:py-1.5 rounded-full text-[11px] font-bold tracking-[0.04em] uppercase border transition-colors duration-150 ${
                    active
                        ? `${t.accentBg} ${t.accent}`
                        : `${t.card} ${t.muted} ${isLight ? 'hover:text-[#091825]' : 'hover:text-[#ede8da]'}`
                }`}
            >
                {label}
            </button>
        )
    }

    return (
        <div>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
                {pill('all', `All · ${dishes.length}`)}
                {pill('nonveg', `Non-Veg · ${dishes.filter(d => !d.is_veg).length}`)}
                {pill('veg', `Veg · ${dishes.filter(d => d.is_veg).length}`)}
                <div className="flex-1" />
                <AdminButton onClick={() => setShowNew(true)} icon={<Plus size={13} />}>
                    New Dish
                </AdminButton>
            </div>

            <div className="flex flex-col gap-2">
                {filtered.map(dish => (
                    <DishRow
                        key={dish.id as string}
                        dish={dish}
                        assignments={slotsByDish.get(dish.id as string) ?? []}
                        weekLabelById={weekLabelById}
                        onEdit={() => setEditId(dish.id as string)}
                        onResult={onResult}
                    />
                ))}
            </div>

            {showNew && (
                <DishEditorModal
                    dish={null}
                    onClose={() => setShowNew(false)}
                    onResult={onResult}
                    onCreated={dishId => {
                        setShowNew(false)
                        setEditId(dishId) // reopen as editor so the photo can go up right away
                    }}
                />
            )}
            {editingDish && (
                <DishEditorModal
                    dish={editingDish}
                    onClose={() => setEditId(null)}
                    onResult={onResult}
                />
            )}
        </div>
    )
}

function DishRow({ dish, assignments, weekLabelById, onEdit, onResult }: {
    dish: Row
    assignments: Row[]
    weekLabelById: Map<string, string>
    onEdit: () => void
    onResult: (r: Result) => void
}) {
    const { t, isLight } = useAdminTheme()
    const [isPending, startTransition] = useTransition()
    const [armDelete, setArmDelete] = useState(false)
    const isActive = dish.is_active as boolean
    const isSlotted = assignments.length > 0

    useEffect(() => {
        if (!armDelete) return
        const id = setTimeout(() => setArmDelete(false), 3000)
        return () => clearTimeout(id)
    }, [armDelete])

    function handleToggle() {
        startTransition(async () => {
            const res = await toggleDishActive(dish.id as string, !isActive)
            onResult(res)
        })
    }

    function handleDelete() {
        if (!armDelete) { setArmDelete(true); return }
        setArmDelete(false)
        startTransition(async () => {
            const res = await deleteDish(dish.id as string)
            onResult(res)
        })
    }

    const chipLabel = (s: Row) =>
        `${(weekLabelById.get(s.menu_week_id as string) ?? '?').replace('Week ', 'W')} · ${DAYS[Number(s.day_of_week)] ?? '?'}`

    return (
        <div className={`${t.card} rounded-xl p-3 flex items-center gap-3 sm:gap-4`}>
            <DishThumb
                src={dish.image_path as string | null}
                alt={dish.name as string}
                className={`w-16 h-16 rounded-lg shrink-0 ${!isActive ? 'grayscale opacity-60' : ''}`}
            />

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[14px] font-bold ${isActive ? t.heading : t.muted}`}>{dish.name as string}</span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dish.is_veg ? 'bg-[#1d8a30]' : 'bg-[#f57f20]'}`} title={dish.is_veg ? 'Veg' : 'Non-Veg'} />
                    <span className="inline-flex items-center gap-0.5" title={`Spice ${dish.spice_level as number}/3`}>
                        {Array.from({ length: dish.spice_level as number }).map((_, i) => (
                            <Flame key={i} size={11} className="text-[#f57f20]" strokeWidth={2.5} />
                        ))}
                    </span>
                    {!isActive && <AdminBadge variant="warning">Hidden</AdminBadge>}
                </div>
                <div className={`hidden sm:block text-[12px] font-medium mt-1 truncate ${t.muted}`}>
                    {dish.description as string}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {isSlotted ? (
                        assignments.map(s => (
                            <span
                                key={s.id as string}
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${t.accentBg} ${t.accent}`}
                            >
                                {chipLabel(s)}
                            </span>
                        ))
                    ) : (
                        <span className={`text-[11px] font-bold ${t.warning}`}>Not on the rotation</span>
                    )}
                    <span className={`hidden sm:inline text-[11px] font-semibold ${t.faint}`}>
                        {dish.calories as string} · {dish.protein as string} protein
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
                {!isSlotted && (
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isPending}
                        className={`h-11 sm:h-9 rounded-lg flex items-center justify-center transition-all duration-150 ${
                            armDelete
                                ? `px-2.5 text-[11px] font-bold uppercase tracking-[0.04em] ${isLight ? 'bg-[#c0392b] text-white' : 'bg-[#e0716e] text-[#091825]'}`
                                : `w-11 sm:w-9 ${t.danger} ${isLight ? 'hover:bg-[#c0392b]/[0.08]' : 'hover:bg-[#e0716e]/[0.10]'}`
                        } ${isPending ? 'opacity-50' : ''}`}
                        title={armDelete ? 'Tap again to delete permanently' : 'Delete dish'}
                    >
                        {armDelete ? 'Sure?' : <Trash2 size={15} strokeWidth={2} />}
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleToggle}
                    disabled={isPending}
                    className={`w-11 h-11 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition-colors duration-150 ${
                        isActive ? t.success : t.faint
                    } ${isLight ? 'hover:bg-[#091825]/[0.05]' : 'hover:bg-white/[0.06]'} ${isPending ? 'opacity-50' : ''}`}
                    title={isActive ? 'Visible to customers — tap to hide' : 'Hidden from customers — tap to show'}
                >
                    {isActive ? <Eye size={15} strokeWidth={2} /> : <EyeOff size={15} strokeWidth={2} />}
                </button>
                <button
                    type="button"
                    onClick={onEdit}
                    className={`px-3 h-11 sm:h-9 rounded-lg text-[11px] font-bold tracking-[0.04em] uppercase border transition-colors duration-150 ${t.card} ${t.muted} ${t.cardHover}`}
                >
                    Edit
                </button>
            </div>
        </div>
    )
}
