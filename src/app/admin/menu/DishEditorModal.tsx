'use client'

import { useEffect, useState, useTransition } from 'react'
import { Flame, Upload, X } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { AdminModal } from '../_components/AdminModal'
import { createDish, updateDish, uploadDishImage } from './actions'
import { DishThumb } from './DishThumb'

type Row = Record<string, unknown>
type Result = { ok: boolean; message: string }

/**
 * Create + edit a dish in one calm modal — replaces the old inline forms
 * that pushed the list around. `dish === null` means "new dish".
 */
export function DishEditorModal({ dish, onClose, onResult, onCreated }: {
    dish: Row | null
    onClose: () => void
    onResult: (r: Result) => void
    onCreated?: (dishId: string) => void
}) {
    const { t } = useAdminTheme()
    const [isPending, startTransition] = useTransition()
    const [uploadPending, startUpload] = useTransition()
    const [spice, setSpice] = useState<number>(dish ? (dish.spice_level as number) : 2)
    const [isVeg, setIsVeg] = useState<boolean>(dish ? Boolean(dish.is_veg) : false)
    const isNew = dish === null

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const fields = {
            name: fd.get('name') as string,
            description: fd.get('description') as string,
            spice_level: spice,
            allergens: (fd.get('allergens') as string).split(',').map(s => s.trim()).filter(Boolean),
            calories: fd.get('calories') as string,
            protein: fd.get('protein') as string,
            carbs: fd.get('carbs') as string,
            fat: fd.get('fat') as string,
        }
        startTransition(async () => {
            if (isNew) {
                const res = await createDish({ ...fields, is_veg: isVeg })
                onResult(res)
                if (res.ok && res.dishId) onCreated?.(res.dishId)
            } else {
                const res = await updateDish(dish.id as string, fields)
                onResult(res)
                if (res.ok) onClose()
            }
        })
    }

    function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!dish) return
        const file = e.target.files?.[0]
        if (!file) return
        const fd = new FormData()
        fd.append('file', file)
        startUpload(async () => {
            const res = await uploadDishImage(dish.id as string, fd)
            onResult(res)
        })
    }

    const labelCls = `block text-[11px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`
    const fieldCls = `w-full px-3 py-2 rounded-lg border text-[13px] font-medium ${t.input} ${t.inputFocus}`

    return (
        <AdminModal label={isNew ? 'New dish' : `Edit ${dish.name as string}`} maxW="max-w-[560px]" onBackdrop={() => { if (!isPending && !uploadPending) onClose() }}>
            {/* Header */}
            <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${t.border}`}>
                <div className="min-w-0">
                    <h2 className={`text-[16px] font-black tracking-tight truncate ${t.heading}`}>
                        {isNew ? 'New dish' : (dish.name as string)}
                    </h2>
                    <p className={`text-[12px] font-medium mt-0.5 ${t.muted}`}>
                        {isNew ? 'Save it first, then add the photo.' : 'Changes apply everywhere — dashboard, marketing site, menu.'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-colors duration-150 ${t.muted} ${t.cardHover}`}
                    aria-label="Close"
                >
                    <X size={16} strokeWidth={2.2} />
                </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                    {/* Photo (existing dishes only — new ones need an id first) */}
                    {!isNew && (
                        <div className="flex items-center gap-4 mb-5">
                            <DishThumb
                                src={dish.image_path as string | null}
                                alt={dish.name as string}
                                className="w-24 h-24 rounded-xl shrink-0"
                            />
                            <div className="min-w-0">
                                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors duration-150 ${t.card} ${t.cardHover} ${uploadPending ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {uploadPending ? (
                                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Upload size={13} strokeWidth={2.2} />
                                    )}
                                    <span className={`text-[11px] font-bold tracking-[0.04em] uppercase ${t.body}`}>
                                        {uploadPending ? 'Uploading…' : dish.image_path ? 'Replace photo' : 'Upload photo'}
                                    </span>
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                        disabled={uploadPending}
                                    />
                                </label>
                                <div className={`text-[11px] font-medium mt-1.5 ${t.faint}`}>
                                    JPG, PNG, or WebP.
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4">
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Name</label>
                            <input name="name" required defaultValue={isNew ? '' : (dish.name as string)} placeholder="e.g. Chicken Karahi" className={fieldCls} />
                        </div>

                        <div className="sm:col-span-2">
                            <label className={labelCls}>Description</label>
                            <textarea name="description" rows={2} defaultValue={isNew ? '' : (dish.description as string)} className={fieldCls} />
                        </div>

                        {isNew && (
                            <div>
                                <label className={labelCls}>Lane</label>
                                <Segmented
                                    options={[{ v: false, label: 'Non-Veg' }, { v: true, label: 'Veg' }]}
                                    value={isVeg}
                                    onChange={setIsVeg}
                                />
                            </div>
                        )}

                        <div>
                            <label className={labelCls}>Spice</label>
                            <Segmented
                                options={[1, 2, 3].map(n => ({
                                    v: n,
                                    label: (
                                        <span className="inline-flex items-center gap-px">
                                            {Array.from({ length: n }).map((_, i) => (
                                                <Flame key={i} size={11} strokeWidth={2.5} />
                                            ))}
                                        </span>
                                    ),
                                }))}
                                value={spice}
                                onChange={setSpice}
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label className={labelCls}>Allergens <span className="normal-case tracking-normal font-semibold">(comma-separated)</span></label>
                            <input name="allergens" defaultValue={isNew ? '' : ((dish.allergens as string[]) ?? []).join(', ')} placeholder="gluten, dairy" className={fieldCls} />
                        </div>

                        <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <label className={labelCls}>Calories</label>
                                <input name="calories" defaultValue={isNew ? '' : (dish.calories as string)} placeholder="650 kcal" className={fieldCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Protein</label>
                                <input name="protein" defaultValue={isNew ? '' : (dish.protein as string)} placeholder="35g" className={fieldCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Carbs</label>
                                <input name="carbs" defaultValue={isNew ? '' : (dish.carbs as string)} placeholder="70g" className={fieldCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Fat</label>
                                <input name="fat" defaultValue={isNew ? '' : (dish.fat as string)} placeholder="20g" className={fieldCls} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className={`flex items-center justify-end gap-2 px-5 py-4 border-t ${t.border}`}>
                    <AdminButton type="button" variant="ghost" onClick={onClose}>
                        Cancel
                    </AdminButton>
                    <AdminButton type="submit" loading={isPending}>
                        {isNew ? 'Add Dish' : 'Save Changes'}
                    </AdminButton>
                </div>
            </form>
        </AdminModal>
    )
}

/** Tight segmented control for tiny enum fields (lane, spice). */
function Segmented<T extends number | boolean>({ options, value, onChange }: {
    options: { v: T; label: React.ReactNode }[]
    value: T
    onChange: (v: T) => void
}) {
    const { t, isLight } = useAdminTheme()
    return (
        <div className={`inline-flex w-full p-1 rounded-lg border ${t.input}`}>
            {options.map(o => {
                const active = o.v === value
                return (
                    <button
                        key={String(o.v)}
                        type="button"
                        onClick={() => onChange(o.v)}
                        className={`flex-1 flex items-center justify-center px-2 py-1.5 rounded-md text-[12px] font-bold transition-colors duration-150 ${
                            active
                                ? 'bg-[#f57f20] text-white'
                                : `${t.muted} ${isLight ? 'hover:text-[#091825]' : 'hover:text-[#ede8da]'}`
                        }`}
                    >
                        {o.label}
                    </button>
                )
            })}
        </div>
    )
}
