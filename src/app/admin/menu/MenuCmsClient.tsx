'use client'

import { useMemo, useState, useTransition } from 'react'
import { Database, Eye, EyeOff, Flame, Plus, Trash2, Upload } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { AdminBadge } from '../_components/AdminBadge'
import { createDish, deleteDish, seedMenuFromStatic, toggleDishActive, updateDish, uploadDishImage } from './actions'
import { SlotEditorModal, type SlotTarget } from './SlotEditorModal'

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

    const isEmpty = dishes.length === 0

    const targetWeek = slotTarget ? weeks.find(w => w.id === slotTarget.weekId) : null
    const targetIsToday = Boolean(
        slotTarget && targetWeek &&
        (targetWeek.week_key as string) === currentWeekKey &&
        slotTarget.dayIdx === todayDow,
    )

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Menu CMS</h1>
            <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                {isEmpty
                    ? 'No dishes in database. Seed from static catalog to get started.'
                    : `${dishes.length} dishes · ${weeks.length} weeks · ${slots.length} slots — tap any slot to rearrange`}
            </p>

            {/* Seed button (only if empty) */}
            {isEmpty && <SeedAction onResult={setResult} />}

            {result && (
                <div className={`mb-4 px-3 py-2 rounded-lg text-[12px] font-bold border ${
                    result.ok ? t.successBg : t.dangerBg
                } ${result.ok ? t.success : t.danger}`}>
                    {result.message}
                </div>
            )}

            {!isEmpty && (
                <>
                    {/* Tabs */}
                    <div className={`flex gap-1 mb-4 border-b ${t.border}`}>
                        <TabBtn label="Weekly Rotation" active={tab === 'rotation'} onClick={() => setTab('rotation')} />
                        <TabBtn label="All Dishes" active={tab === 'dishes'} onClick={() => setTab('dishes')} />
                    </div>

                    {tab === 'rotation' && (
                        <RotationView
                            weeks={weeks}
                            slots={slots}
                            dishes={dishes}
                            currentWeekKey={currentWeekKey}
                            todayDow={todayDow}
                            onSlotClick={setSlotTarget}
                        />
                    )}

                    {tab === 'dishes' && (
                        <DishList dishes={dishes} slots={slots} weeks={weeks} onResult={setResult} />
                    )}
                </>
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
        </div>
    )
}

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
        <div className={`${t.card} rounded-xl p-6 text-center mb-4`}>
            <Database size={32} className={`mx-auto mb-3 ${t.faint}`} strokeWidth={1.5} />
            <div className={`text-[14px] font-bold mb-1 ${t.heading}`}>Seed from Static Data</div>
            <div className={`text-[12px] font-medium mb-4 ${t.muted}`}>
                Import all 48 dishes and 4-week rotation from catalog-data.ts into the database.
            </div>
            <AdminButton onClick={handleSeed} loading={isPending} icon={<Database size={13} />}>
                Seed Database
            </AdminButton>
        </div>
    )
}

function RotationView({ weeks, slots, dishes, currentWeekKey, todayDow, onSlotClick }: {
    weeks: Row[]
    slots: Row[]
    dishes: Row[]
    currentWeekKey: string
    todayDow: number
    onSlotClick: (target: SlotTarget) => void
}) {
    const { t } = useAdminTheme()

    const dishMap = new Map<string, Row>()
    for (const d of dishes) dishMap.set(d.id as string, d)

    return (
        <div className="flex flex-col gap-5">
            {weeks.map(week => {
                const weekSlots = slots.filter(s => s.menu_week_id === week.id)
                const weekLabel = (week.label as string) || (week.week_key as string)
                const isCurrentWeek = (week.week_key as string) === currentWeekKey

                const slotTarget = (dayIdx: number, isVeg: boolean): SlotTarget => ({
                    weekId: week.id as string,
                    weekLabel,
                    dayIdx,
                    isVeg,
                })

                return (
                    <div key={week.id as string} className={`${t.card} rounded-xl p-4 ${isCurrentWeek ? 'border-[#f57f20]/30' : ''}`}>
                        <div className="flex items-center gap-2 mb-3">
                            <h2 className={`text-[14px] font-black ${t.heading}`}>{weekLabel}</h2>
                            {isCurrentWeek && (
                                <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold tracking-[0.08em] uppercase ${t.accentBg} ${t.accent}`}>
                                    Live this week
                                </span>
                            )}
                        </div>

                        {/* Desktop grid */}
                        <div className="hidden sm:grid grid-cols-6 gap-2">
                            {DAYS.map((day, dayIdx) => {
                                const vegSlot = weekSlots.find(s => Number(s.day_of_week) === dayIdx && s.is_veg === true)
                                const nonvegSlot = weekSlots.find(s => Number(s.day_of_week) === dayIdx && s.is_veg === false)
                                const vegDish = vegSlot ? dishMap.get(vegSlot.dish_id as string) ?? null : null
                                const nonvegDish = nonvegSlot ? dishMap.get(nonvegSlot.dish_id as string) ?? null : null
                                const isToday = isCurrentWeek && dayIdx === todayDow

                                return (
                                    <div key={dayIdx}>
                                        <DayHeader day={day} isToday={isToday} />
                                        <SlotButton dish={nonvegDish} label="Non-Veg" isToday={isToday} onClick={() => onSlotClick(slotTarget(dayIdx, false))} />
                                        <SlotButton dish={vegDish} label="Veg" isToday={isToday} onClick={() => onSlotClick(slotTarget(dayIdx, true))} />
                                    </div>
                                )
                            })}
                        </div>

                        {/* Mobile list */}
                        <div className="sm:hidden flex flex-col gap-2.5">
                            {DAYS.map((day, dayIdx) => {
                                const vegSlot = weekSlots.find(s => Number(s.day_of_week) === dayIdx && s.is_veg === true)
                                const nonvegSlot = weekSlots.find(s => Number(s.day_of_week) === dayIdx && s.is_veg === false)
                                const vegDish = vegSlot ? dishMap.get(vegSlot.dish_id as string) ?? null : null
                                const nonvegDish = nonvegSlot ? dishMap.get(nonvegSlot.dish_id as string) ?? null : null
                                const isToday = isCurrentWeek && dayIdx === todayDow

                                return (
                                    <div key={dayIdx}>
                                        <DayHeader day={day} isToday={isToday} align="left" />
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <SlotButton dish={nonvegDish} label="Non-Veg" isToday={isToday} onClick={() => onSlotClick(slotTarget(dayIdx, false))} />
                                            <SlotButton dish={vegDish} label="Veg" isToday={isToday} onClick={() => onSlotClick(slotTarget(dayIdx, true))} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function DayHeader({ day, isToday, align = 'center' }: { day: string; isToday: boolean; align?: 'center' | 'left' }) {
    const { t } = useAdminTheme()
    return (
        <div className={`flex items-center gap-1 mb-1.5 ${align === 'center' ? 'justify-center' : ''}`}>
            <span className={`text-[10px] font-bold tracking-[0.10em] uppercase ${isToday ? t.accent : t.faint}`}>
                {day}
            </span>
            {isToday && (
                <span className="px-1 py-px rounded bg-[#f57f20] text-white text-[7.5px] font-black tracking-[0.08em] uppercase">
                    Today
                </span>
            )}
        </div>
    )
}

function SlotButton({ dish, label, isToday, onClick }: {
    dish: Row | null
    label: string
    isToday: boolean
    onClick: () => void
}) {
    const { t, isLight } = useAdminTheme()

    return (
        <button
            type="button"
            onClick={onClick}
            title="Tap to change this slot"
            className={`w-full rounded-lg p-2 mb-1.5 text-center border transition-colors cursor-pointer ${
                isLight ? 'bg-[#091825]/[0.03]' : 'bg-white/[0.03]'
            } ${isToday ? 'border-[#f57f20]/35' : 'border-transparent'} hover:border-[#f57f20]/50 ${
                isLight ? 'hover:bg-[#f57f20]/[0.05]' : 'hover:bg-[#f57f20]/[0.07]'
            }`}
        >
            <div className={`text-[9px] font-bold tracking-[0.10em] uppercase mb-0.5 ${
                label === 'Veg' ? t.success : t.accent
            }`}>
                {label}
            </div>
            {dish ? (
                <div className={`text-[11px] font-bold leading-tight ${t.body}`}>
                    {dish.name as string}
                </div>
            ) : (
                <div className={`text-[10px] font-medium italic ${t.faint}`}>Empty — tap to assign</div>
            )}
        </button>
    )
}

function DishList({ dishes, slots, weeks, onResult }: {
    dishes: Row[]
    slots: Row[]
    weeks: Row[]
    onResult: (r: Result) => void
}) {
    const { t } = useAdminTheme()
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

    return (
        <div>
            <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                {(['all', 'nonveg', 'veg'] as const).map(f => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase border transition-colors ${
                            filter === f ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                        }`}
                    >
                        {f === 'all' ? `All (${dishes.length})` : f === 'veg' ? `Veg (${dishes.filter(d => d.is_veg).length})` : `Non-Veg (${dishes.filter(d => !d.is_veg).length})`}
                    </button>
                ))}
                <div className="flex-1" />
                <AdminButton onClick={() => setShowNew(v => !v)} icon={<Plus size={13} />}>
                    New Dish
                </AdminButton>
            </div>

            {showNew && (
                <NewDishForm
                    onResult={onResult}
                    onCreated={dishId => {
                        setShowNew(false)
                        setEditId(dishId) // open the editor so a photo can be uploaded right away
                    }}
                />
            )}

            <div className="flex flex-col gap-2">
                {filtered.map(dish => (
                    <DishRow
                        key={dish.id as string}
                        dish={dish}
                        assignments={slotsByDish.get(dish.id as string) ?? []}
                        weekLabelById={weekLabelById}
                        isEditing={editId === dish.id}
                        onEdit={() => setEditId(editId === dish.id ? null : dish.id as string)}
                        onResult={onResult}
                    />
                ))}
            </div>
        </div>
    )
}

function DishRow({ dish, assignments, weekLabelById, isEditing, onEdit, onResult }: {
    dish: Row
    assignments: Row[]
    weekLabelById: Map<string, string>
    isEditing: boolean
    onEdit: () => void
    onResult: (r: Result) => void
}) {
    const { t } = useAdminTheme()
    const [isPending, startTransition] = useTransition()
    const isActive = dish.is_active as boolean
    const isSlotted = assignments.length > 0

    function handleToggle() {
        startTransition(async () => {
            const res = await toggleDishActive(dish.id as string, !isActive)
            onResult(res)
        })
    }

    function handleDelete() {
        if (!confirm(`Delete "${dish.name as string}" permanently? This cannot be undone.`)) return
        startTransition(async () => {
            const res = await deleteDish(dish.id as string)
            onResult(res)
        })
    }

    const assignmentText = isSlotted
        ? assignments
            .map(s => `${weekLabelById.get(s.menu_week_id as string) ?? '?'} · ${DAYS[Number(s.day_of_week)] ?? '?'}`)
            .join('  ·  ')
        : 'Not on the rotation'

    return (
        <div className={`${t.card} rounded-xl p-3 ${!isActive ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-bold ${t.heading}`}>{dish.name as string}</span>
                        <AdminBadge variant={dish.is_veg ? 'active' : 'neutral'}>
                            {dish.is_veg ? 'Veg' : 'Non-Veg'}
                        </AdminBadge>
                        <span className="inline-flex items-center gap-0.5">
                            {Array.from({ length: dish.spice_level as number }).map((_, i) => (
                                <Flame key={i} size={10} className="text-[#f57f20]" strokeWidth={2.5} />
                            ))}
                        </span>
                    </div>
                    <div className={`text-[11px] font-medium mt-0.5 truncate ${t.muted}`}>
                        {dish.description as string}
                    </div>
                    <div className={`text-[10px] font-semibold mt-0.5 ${t.faint}`}>
                        {dish.calories as string} · {dish.protein as string} protein · Allergens: {(dish.allergens as string[])?.join(', ') || 'none'}
                    </div>
                    <div className={`text-[10px] font-bold mt-0.5 ${isSlotted ? t.muted : t.warning}`}>
                        {assignmentText}
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {!isSlotted && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isPending}
                            className={`p-1.5 rounded-lg transition-colors ${t.danger} ${isPending ? 'opacity-50' : ''}`}
                            title="Delete dish"
                        >
                            <Trash2 size={14} strokeWidth={2} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleToggle}
                        disabled={isPending}
                        className={`p-1.5 rounded-lg transition-colors ${isActive ? t.success : t.danger} ${isPending ? 'opacity-50' : ''}`}
                        title={isActive ? 'Deactivate' : 'Activate'}
                    >
                        {isActive ? <Eye size={14} strokeWidth={2} /> : <EyeOff size={14} strokeWidth={2} />}
                    </button>
                    <button
                        type="button"
                        onClick={onEdit}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold tracking-[0.06em] uppercase border transition-colors ${
                            isEditing ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                        }`}
                    >
                        Edit
                    </button>
                </div>
            </div>

            {isEditing && <DishEditor dish={dish} onResult={onResult} />}
        </div>
    )
}

function NewDishForm({ onResult, onCreated }: {
    onResult: (r: Result) => void
    onCreated: (dishId: string) => void
}) {
    const { t } = useAdminTheme()
    const [isPending, startTransition] = useTransition()

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(async () => {
            const res = await createDish({
                name: fd.get('name') as string,
                description: fd.get('description') as string,
                is_veg: fd.get('is_veg') === 'veg',
                spice_level: parseInt(fd.get('spice_level') as string, 10),
                allergens: (fd.get('allergens') as string).split(',').map(s => s.trim()).filter(Boolean),
                calories: fd.get('calories') as string,
                protein: fd.get('protein') as string,
                carbs: fd.get('carbs') as string,
                fat: fd.get('fat') as string,
            })
            onResult(res)
            if (res.ok && res.dishId) onCreated(res.dishId)
        })
    }

    const fieldCls = `w-full px-2.5 py-1.5 rounded-lg border text-[12px] font-medium ${t.input} ${t.inputFocus}`

    return (
        <div className={`${t.card} rounded-xl p-4 mb-4`}>
            <div className={`text-[13px] font-black mb-3 ${t.heading}`}>New Dish</div>
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
                    <div>
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Name</label>
                        <input name="name" required placeholder="e.g. Chicken Karahi" className={fieldCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                        <div>
                            <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Lane</label>
                            <select name="is_veg" defaultValue="nonveg" className={fieldCls}>
                                <option value="nonveg">Non-Veg</option>
                                <option value="veg">Veg</option>
                            </select>
                        </div>
                        <div>
                            <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Spice (1-3)</label>
                            <input name="spice_level" type="number" min={1} max={3} defaultValue={2} required className={fieldCls} />
                        </div>
                    </div>
                    <div className="sm:col-span-2">
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Description</label>
                        <textarea name="description" rows={2} className={fieldCls} />
                    </div>
                    <div>
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Allergens (comma-separated)</label>
                        <input name="allergens" placeholder="gluten, dairy" className={fieldCls} />
                    </div>
                    <div>
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Calories</label>
                        <input name="calories" placeholder="650 kcal" className={fieldCls} />
                    </div>
                    <div>
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Protein</label>
                        <input name="protein" placeholder="35g" className={fieldCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                        <div>
                            <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Carbs</label>
                            <input name="carbs" placeholder="70g" className={fieldCls} />
                        </div>
                        <div>
                            <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Fat</label>
                            <input name="fat" placeholder="20g" className={fieldCls} />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <AdminButton type="submit" loading={isPending} icon={<Plus size={13} />}>
                        Add Dish
                    </AdminButton>
                    <span className={`text-[10px] font-medium ${t.faint}`}>
                        Photo upload opens right after — then assign it to a day from the rotation tab.
                    </span>
                </div>
            </form>
        </div>
    )
}

function DishEditor({ dish, onResult }: { dish: Row; onResult: (r: Result) => void }) {
    const { t } = useAdminTheme()
    const [isPending, startTransition] = useTransition()
    const [uploadPending, startUpload] = useTransition()

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(async () => {
            const res = await updateDish(dish.id as string, {
                name: fd.get('name') as string,
                description: fd.get('description') as string,
                spice_level: parseInt(fd.get('spice_level') as string, 10),
                allergens: (fd.get('allergens') as string).split(',').map(s => s.trim()).filter(Boolean),
                calories: fd.get('calories') as string,
                protein: fd.get('protein') as string,
                carbs: fd.get('carbs') as string,
                fat: fd.get('fat') as string,
            })
            onResult(res)
        })
    }

    function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const fd = new FormData()
        fd.append('file', file)
        startUpload(async () => {
            const res = await uploadDishImage(dish.id as string, fd)
            onResult(res)
        })
    }

    const fieldCls = `w-full px-2.5 py-1.5 rounded-lg border text-[12px] font-medium ${t.input} ${t.inputFocus}`
    const currentImage = dish.image_path as string | null

    return (
        <div className={`mt-3 pt-3 border-t ${t.border}`}>
            {/* Image upload section */}
            <div className="mb-4">
                <div className={`text-[9px] font-bold tracking-[0.08em] uppercase mb-1.5 ${t.faint}`}>Dish Image</div>
                <div className="flex items-start gap-3">
                    {currentImage && (
                        <div className={`w-20 h-20 rounded-lg overflow-hidden shrink-0 border ${t.border}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={currentImage}
                                alt={dish.name as string}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}
                    <div className="flex-1">
                        <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${t.card} ${t.cardHover} ${uploadPending ? 'opacity-50 pointer-events-none' : ''}`}>
                            {uploadPending ? (
                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Upload size={13} strokeWidth={2.2} />
                            )}
                            <span className={`text-[11px] font-bold tracking-[0.04em] uppercase ${t.body}`}>
                                {uploadPending ? 'Uploading...' : currentImage ? 'Replace Image' : 'Upload Image'}
                            </span>
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handleImageUpload}
                                disabled={uploadPending}
                            />
                        </label>
                        <div className={`text-[10px] mt-1 ${t.faint}`}>
                            JPG, PNG, or WebP. Updates everywhere — dashboard, marketing site, menu.
                        </div>
                    </div>
                </div>
            </div>

            {/* Fields form */}
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
                    <div>
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Name</label>
                        <input name="name" defaultValue={dish.name as string} required className={fieldCls} />
                    </div>
                    <div>
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Spice Level (1-3)</label>
                        <input name="spice_level" type="number" min={1} max={3} defaultValue={dish.spice_level as number} required className={fieldCls} />
                    </div>
                    <div className="sm:col-span-2">
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Description</label>
                        <textarea name="description" defaultValue={dish.description as string} rows={2} className={fieldCls} />
                    </div>
                    <div>
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Allergens (comma-separated)</label>
                        <input name="allergens" defaultValue={(dish.allergens as string[])?.join(', ')} className={fieldCls} />
                    </div>
                    <div>
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Calories</label>
                        <input name="calories" defaultValue={dish.calories as string} className={fieldCls} />
                    </div>
                    <div>
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Protein</label>
                        <input name="protein" defaultValue={dish.protein as string} className={fieldCls} />
                    </div>
                    <div>
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Carbs</label>
                        <input name="carbs" defaultValue={dish.carbs as string} className={fieldCls} />
                    </div>
                    <div>
                        <label className={`block text-[9px] font-bold tracking-[0.08em] uppercase mb-0.5 ${t.faint}`}>Fat</label>
                        <input name="fat" defaultValue={dish.fat as string} className={fieldCls} />
                    </div>
                </div>
                <AdminButton type="submit" loading={isPending}>Save Changes</AdminButton>
            </form>
        </div>
    )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    const { t } = useAdminTheme()
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-3 py-2 rounded-t-lg text-[11px] font-bold tracking-[0.04em] uppercase transition-colors ${
                active ? `${t.accent} border-b-2 border-[#f57f20]` : `${t.muted}`
            }`}
        >
            {label}
        </button>
    )
}
