'use client'

import { useState, useTransition } from 'react'
import { Database, Eye, EyeOff, Flame } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { AdminBadge } from '../_components/AdminBadge'
import { Upload } from 'lucide-react'
import { seedMenuFromStatic, toggleDishActive, updateDish, uploadDishImage } from './actions'

type Row = Record<string, unknown>

interface Props {
    dishes: Row[]
    weeks: Row[]
    slots: Row[]
}

type Tab = 'rotation' | 'dishes'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function MenuCmsClient({ dishes, weeks, slots }: Props) {
    const { t } = useAdminTheme()
    const [tab, setTab] = useState<Tab>('rotation')
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

    const isEmpty = dishes.length === 0

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Menu CMS</h1>
            <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                {isEmpty
                    ? 'No dishes in database. Seed from static catalog to get started.'
                    : `${dishes.length} dishes · ${weeks.length} weeks · ${slots.length} slots`}
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
                        <RotationView weeks={weeks} slots={slots} dishes={dishes} />
                    )}

                    {tab === 'dishes' && (
                        <DishList dishes={dishes} onResult={setResult} />
                    )}
                </>
            )}
        </div>
    )
}

function SeedAction({ onResult }: { onResult: (r: { ok: boolean; message: string }) => void }) {
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

function RotationView({ weeks, slots, dishes }: { weeks: Row[]; slots: Row[]; dishes: Row[] }) {
    const { t } = useAdminTheme()

    const dishMap = new Map<string, Row>()
    for (const d of dishes) dishMap.set(d.id as string, d)

    return (
        <div className="flex flex-col gap-5">
            {weeks.map(week => {
                const weekSlots = slots.filter(s => s.menu_week_id === week.id)
                return (
                    <div key={week.id as string} className={`${t.card} rounded-xl p-4`}>
                        <h2 className={`text-[14px] font-black mb-3 ${t.heading}`}>
                            {week.label as string || week.week_key as string}
                        </h2>

                        {/* Desktop grid */}
                        <div className="hidden sm:grid grid-cols-6 gap-2">
                            {DAYS.map((day, dayIdx) => {
                                const vegSlot = weekSlots.find(s => Number(s.day_of_week) === dayIdx && s.is_veg === true)
                                const nonvegSlot = weekSlots.find(s => Number(s.day_of_week) === dayIdx && s.is_veg === false)
                                const vegDish = vegSlot ? dishMap.get(vegSlot.dish_id as string) ?? null : null
                                const nonvegDish = nonvegSlot ? dishMap.get(nonvegSlot.dish_id as string) ?? null : null

                                return (
                                    <div key={dayIdx}>
                                        <div className={`text-[10px] font-bold tracking-[0.10em] uppercase mb-1.5 text-center ${t.faint}`}>
                                            {day}
                                        </div>
                                        <DishSlotCard dish={nonvegDish} label="Non-Veg" />
                                        <DishSlotCard dish={vegDish} label="Veg" />
                                    </div>
                                )
                            })}
                        </div>

                        {/* Mobile list */}
                        <div className="sm:hidden flex flex-col gap-2">
                            {DAYS.map((day, dayIdx) => {
                                const vegSlot = weekSlots.find(s => Number(s.day_of_week) === dayIdx && s.is_veg === true)
                                const nonvegSlot = weekSlots.find(s => Number(s.day_of_week) === dayIdx && s.is_veg === false)
                                const vegDish = vegSlot ? dishMap.get(vegSlot.dish_id as string) ?? null : null
                                const nonvegDish = nonvegSlot ? dishMap.get(nonvegSlot.dish_id as string) ?? null : null

                                return (
                                    <div key={dayIdx} className={`py-2 border-b last:border-b-0 ${t.border}`}>
                                        <div className={`text-[10px] font-bold tracking-[0.10em] uppercase mb-1 ${t.faint}`}>{day}</div>
                                        <div className={`text-[12px] font-bold ${t.body}`}>
                                            {nonvegDish ? nonvegDish.name as string : '(empty)'}
                                        </div>
                                        <div className={`text-[12px] font-medium ${t.muted}`}>
                                            {vegDish ? vegDish.name as string : '(empty)'}
                                            <span className={`text-[9px] font-bold uppercase tracking-wider ml-1 ${t.success}`}>veg</span>
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

function DishSlotCard({ dish, label }: { dish: Row | null; label: string }) {
    const { t, isLight } = useAdminTheme()

    return (
        <div className={`rounded-lg p-2 mb-1.5 text-center ${
            isLight ? 'bg-[#091825]/[0.03]' : 'bg-white/[0.03]'
        }`}>
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
                <div className={`text-[10px] font-medium italic ${t.faint}`}>Empty</div>
            )}
        </div>
    )
}

function DishList({ dishes, onResult }: { dishes: Row[]; onResult: (r: { ok: boolean; message: string }) => void }) {
    const { t } = useAdminTheme()
    const [editId, setEditId] = useState<string | null>(null)
    const [filter, setFilter] = useState<'all' | 'veg' | 'nonveg'>('all')

    const filtered = filter === 'all' ? dishes : filter === 'veg'
        ? dishes.filter(d => d.is_veg === true)
        : dishes.filter(d => d.is_veg === false)

    return (
        <div>
            <div className="flex gap-1.5 mb-4">
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
            </div>

            <div className="flex flex-col gap-2">
                {filtered.map(dish => (
                    <DishRow
                        key={dish.id as string}
                        dish={dish}
                        isEditing={editId === dish.id}
                        onEdit={() => setEditId(editId === dish.id ? null : dish.id as string)}
                        onResult={onResult}
                    />
                ))}
            </div>
        </div>
    )
}

function DishRow({ dish, isEditing, onEdit, onResult }: {
    dish: Row
    isEditing: boolean
    onEdit: () => void
    onResult: (r: { ok: boolean; message: string }) => void
}) {
    const { t } = useAdminTheme()
    const [isPending, startTransition] = useTransition()
    const isActive = dish.is_active as boolean

    function handleToggle() {
        startTransition(async () => {
            const res = await toggleDishActive(dish.id as string, !isActive)
            onResult(res)
        })
    }

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
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
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

function DishEditor({ dish, onResult }: { dish: Row; onResult: (r: { ok: boolean; message: string }) => void }) {
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
