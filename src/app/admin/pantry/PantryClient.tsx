'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminTable, type Column } from '../_components/AdminTable'
import {
  addPantryIngredient,
  updatePantryIngredient,
  togglePantryActive,
  deletePantryIngredient,
  type PantryInput,
} from './actions'
import type { PantryRow } from './page'

const UNIT_OPTIONS = ['g', 'ml', 'pcs'] as const

type FormData = {
  name: string
  category: string
  brand: string
  supplier: string
  pack_qty_text: string
  pack_unit: string
  pack_cost_text: string
  pack_label: string
}

const EMPTY_FORM: FormData = {
  name: '',
  category: '',
  brand: '',
  supplier: '',
  pack_qty_text: '',
  pack_unit: 'g',
  pack_cost_text: '',
  pack_label: '',
}

/** Number field → number | null (blank stays null so the DB column keeps NULL). */
function parseNum(text: string): number | null {
  const s = text.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** "AED 2/kg" · "AED 6.2/L" · "AED 0.32/pc" — mirrors infra/supabase/pantry.ts. */
function costHint(row: PantryRow): string | null {
  if (!row.pack_cost || !row.pack_qty || row.pack_qty <= 0) return null
  const per = row.pack_cost / row.pack_qty
  if (row.pack_unit === 'g') return `AED ${(per * 1000).toFixed(per * 1000 < 1 ? 2 : 1)}/kg`
  if (row.pack_unit === 'ml') return `AED ${(per * 1000).toFixed(per * 1000 < 1 ? 2 : 1)}/L`
  if (row.pack_unit === 'pcs') return `AED ${per.toFixed(2)}/pc`
  return null
}

export function PantryClient({ items }: { items: PantryRow[] }) {
  const { isLight, t } = useAdminTheme()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [confirmDelete, setConfirmDelete] = useState<PantryRow | null>(null)

  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Existing categories power both the filter row and the form's datalist, so
  // the admin reuses "Spice", "Dry Shelf", etc. rather than coining variants.
  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(),
    [items],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (categoryFilter !== 'all' && i.category !== categoryFilter) return false
      if (!q) return true
      return (
        i.name.toLowerCase().includes(q) ||
        i.brand.toLowerCase().includes(q) ||
        i.supplier.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
      )
    })
  }, [items, query, categoryFilter])

  const activeCount = items.filter((i) => i.is_active).length

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
    setError(null)
  }

  function openEdit(row: PantryRow) {
    setForm({
      name: row.name,
      category: row.category,
      brand: row.brand,
      supplier: row.supplier,
      pack_qty_text: row.pack_qty === null ? '' : String(row.pack_qty),
      pack_unit: row.pack_unit || 'g',
      pack_cost_text: row.pack_cost === null ? '' : String(row.pack_cost),
      pack_label: row.pack_label,
    })
    setEditingId(row.id)
    setShowForm(true)
    setError(null)
  }

  function handleSave() {
    setError(null)
    const payload: PantryInput = {
      name: form.name,
      category: form.category,
      brand: form.brand,
      supplier: form.supplier,
      pack_qty: parseNum(form.pack_qty_text),
      pack_unit: form.pack_unit,
      pack_cost: parseNum(form.pack_cost_text),
      pack_label: form.pack_label,
    }
    startTransition(async () => {
      const result = editingId
        ? await updatePantryIngredient(editingId, payload)
        : await addPantryIngredient(payload)
      if (result.ok) {
        setShowForm(false)
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  function handleToggle(row: PantryRow) {
    setError(null)
    setPendingId(row.id)
    startTransition(async () => {
      try {
        const result = await togglePantryActive(row.id, !row.is_active)
        if (result.ok) router.refresh()
        else setError(result.message)
      } finally {
        setPendingId(null)
      }
    })
  }

  function handleDelete() {
    if (!confirmDelete) return
    setError(null)
    const id = confirmDelete.id
    setPendingId(id)
    startTransition(async () => {
      try {
        const result = await deletePantryIngredient(id)
        if (result.ok) {
          setConfirmDelete(null)
          router.refresh()
        } else {
          setError(result.message)
        }
      } finally {
        setPendingId(null)
      }
    })
  }

  const set = <K extends keyof FormData>(key: K, val: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const columns: Column<PantryRow>[] = [
    {
      key: 'name',
      label: 'Ingredient',
      render: (r) => (
        <div className="flex flex-col">
          <span className={`font-semibold ${t.heading}`}>{r.name}</span>
          {r.brand && <span className={`text-[11px] ${t.faint}`}>{r.brand}</span>}
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (r) => <span className={`text-[12px] ${t.muted}`}>{r.category || '—'}</span>,
    },
    {
      key: 'pack',
      label: 'Pack',
      render: (r) => (
        <span className={`text-[12px] font-mono ${t.muted}`}>
          {r.pack_qty !== null ? `${r.pack_qty}${r.pack_unit}` : '—'}
          {r.pack_label ? ` · ${r.pack_label}` : ''}
        </span>
      ),
    },
    {
      key: 'cost',
      label: 'Cost',
      render: (r) => {
        const hint = costHint(r)
        return (
          <div className="flex flex-col">
            <span className={`text-[12px] font-mono ${t.muted}`}>
              {r.pack_cost !== null ? `AED ${r.pack_cost}` : '—'}
            </span>
            {hint && <span className={`text-[11px] ${t.faint}`}>{hint}</span>}
          </div>
        )
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) =>
        r.is_active ? (
          <span className="text-emerald-600 font-semibold text-[12px]">In stock</span>
        ) : (
          <span className={`font-semibold text-[12px] ${t.muted}`}>Out of stock</span>
        ),
    },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            disabled={pendingId === r.id}
            onClick={() => openEdit(r)}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors duration-100 ${t.sidebarItem} disabled:opacity-50`}
          >
            Edit
          </button>
          <button
            type="button"
            disabled={pendingId === r.id}
            onClick={() => handleToggle(r)}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors duration-100 ${t.sidebarItem} disabled:opacity-50`}
          >
            {pendingId === r.id ? '…' : r.is_active ? 'Out of stock' : 'In stock'}
          </button>
          <button
            type="button"
            disabled={pendingId === r.id}
            onClick={() => {
              setError(null)
              setConfirmDelete(r)
            }}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors duration-100 ${t.danger} ${isLight ? 'hover:bg-[#c0392b]/[0.08]' : 'hover:bg-[#e0716e]/[0.10]'} disabled:opacity-50`}
          >
            Remove
          </button>
        </div>
      ),
    },
  ]

  const filterChip = (label: string, value: string) => {
    const selected = categoryFilter === value
    return (
      <button
        key={value}
        type="button"
        onClick={() => setCategoryFilter(value)}
        className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors duration-100 ${
          selected
            ? 'border-[#f57f20] bg-[#f57f20]/[0.08] text-[#f57f20]'
            : `${t.border} ${t.muted} ${isLight ? 'hover:bg-[#091825]/[0.04]' : 'hover:bg-white/[0.04]'}`
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className={`text-[20px] font-extrabold tracking-tight ${t.heading}`}>Pantry</h1>
          <p className={`text-[13px] mt-1 ${t.muted}`}>
            The kitchen&apos;s master stock list. The AI recipe generator can only cook
            from ingredients marked in stock — mark items out of stock to keep them out
            of new recipes without losing their cost data.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="shrink-0 text-[13px] font-bold px-4 py-2 rounded-lg bg-[#f57f20] text-white hover:bg-[#e06d15] transition-colors duration-100"
        >
          Add Ingredient
        </button>
      </div>

      {error && !showForm && !confirmDelete && (
        <p className="text-red-500 text-[13px] mb-4 font-semibold">{error}</p>
      )}

      {/* ── Search + category filter ──────────────────────────────── */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search ingredient, brand, supplier…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`w-full max-w-sm text-sm px-3 py-2 rounded-lg border transition-colors ${t.input} ${t.inputFocus}`}
          />
          <span className={`text-[12px] ${t.faint} whitespace-nowrap`}>
            {filtered.length} of {items.length} · {activeCount} in stock
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterChip('All', 'all')}
          {categories.map((c) => filterChip(c, c))}
        </div>
      </div>

      <AdminTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        emptyMessage="No ingredients match"
      />

      {/* ── Add / Edit modal ──────────────────────────────────────── */}
      {showForm && (
        <AdminModal
          label={editingId ? 'Edit Ingredient' : 'Add Ingredient'}
          maxW="max-w-[540px]"
          onBackdrop={() => setShowForm(false)}
        >
          <div className="overflow-y-auto p-6 space-y-6">
            <div>
              <h2 className={`text-lg font-extrabold tracking-tight ${t.heading}`}>
                {editingId ? 'Edit Ingredient' : 'New Ingredient'}
              </h2>
              <p className={`text-sm mt-1 ${t.muted}`}>
                The recipe generator reads name, category, and the pack cost to
                estimate per-serving cost.
              </p>
            </div>

            {error && (
              <div className={`text-sm font-medium px-3 py-2 rounded-lg border ${t.dangerBg} ${t.danger}`}>
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label className={`text-sm font-medium ${t.body}`}>Name</label>
              <input
                type="text"
                placeholder="Basmati rice"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
              />
              <p className={`text-xs mt-1 ${t.faint}`}>Must be unique across the pantry.</p>
            </div>

            {/* Category + label */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-sm font-medium ${t.body}`}>Category</label>
                <input
                  type="text"
                  list="pantry-categories"
                  placeholder="Spice"
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                  className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
                />
                <datalist id="pantry-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <p className={`text-xs mt-1 ${t.faint}`}>
                  &ldquo;Equipment&rdquo; is excluded from the generator.
                </p>
              </div>
              <div>
                <label className={`text-sm font-medium ${t.body}`}>Pack label</label>
                <input
                  type="text"
                  placeholder="Bag"
                  value={form.pack_label}
                  onChange={(e) => set('pack_label', e.target.value)}
                  className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
                />
                <p className={`text-xs mt-1 ${t.faint}`}>e.g. Bag, Packet, Can.</p>
              </div>
            </div>

            {/* Brand + supplier */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-sm font-medium ${t.body}`}>Brand</label>
                <input
                  type="text"
                  placeholder="Lulu"
                  value={form.brand}
                  onChange={(e) => set('brand', e.target.value)}
                  className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
                />
              </div>
              <div>
                <label className={`text-sm font-medium ${t.body}`}>Supplier</label>
                <input
                  type="text"
                  placeholder="Lulu"
                  value={form.supplier}
                  onChange={(e) => set('supplier', e.target.value)}
                  className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
                />
              </div>
            </div>

            {/* Pack qty + unit + cost */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={`text-sm font-medium ${t.body}`}>Pack qty</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="5000"
                  value={form.pack_qty_text}
                  onChange={(e) => set('pack_qty_text', e.target.value)}
                  className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
                />
              </div>
              <div>
                <label className={`text-sm font-medium ${t.body}`}>Unit</label>
                <select
                  value={form.pack_unit}
                  onChange={(e) => set('pack_unit', e.target.value)}
                  className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`text-sm font-medium ${t.body}`}>Pack cost</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="10"
                  value={form.pack_cost_text}
                  onChange={(e) => set('pack_cost_text', e.target.value)}
                  className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
                />
              </div>
            </div>
            <p className={`text-xs -mt-3 ${t.faint}`}>
              Pack qty and cost together give the generator a per-kg / per-L / per-piece
              price. Leave blank if unknown.
            </p>

            {/* Actions */}
            <div className={`flex gap-3 pt-2 border-t ${t.border}`}>
              <button
                type="button"
                disabled={isPending}
                onClick={handleSave}
                className="flex-1 text-sm font-bold py-2.5 rounded-xl bg-[#f57f20] text-white hover:bg-[#e06d15] disabled:opacity-50 transition-colors duration-100 shadow-sm"
              >
                {isPending ? 'Saving…' : editingId ? 'Save Changes' : 'Add Ingredient'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className={`px-5 text-sm font-medium rounded-xl transition-colors duration-100 ${t.sidebarItem}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* ── Delete confirmation ───────────────────────────────────── */}
      {confirmDelete && (
        <AdminModal
          label="Remove Ingredient"
          maxW="max-w-[420px]"
          onBackdrop={() => setConfirmDelete(null)}
        >
          <div className="p-6 space-y-5">
            <div>
              <h2 className={`text-lg font-extrabold tracking-tight ${t.heading}`}>
                Remove &ldquo;{confirmDelete.name}&rdquo;?
              </h2>
              <p className={`text-sm mt-1.5 ${t.muted}`}>
                This permanently deletes the ingredient from the pantry. To keep it
                for later but hide it from the recipe generator, mark it out of stock
                instead.
              </p>
            </div>

            {error && (
              <div className={`text-sm font-medium px-3 py-2 rounded-lg border ${t.dangerBg} ${t.danger}`}>
                {error}
              </div>
            )}

            <div className={`flex gap-3 pt-1`}>
              <button
                type="button"
                disabled={isPending}
                onClick={handleDelete}
                className="flex-1 text-sm font-bold py-2.5 rounded-xl bg-[#c0392b] text-white hover:bg-[#a93226] disabled:opacity-50 transition-colors duration-100 shadow-sm"
              >
                {isPending ? 'Removing…' : 'Remove'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className={`px-5 text-sm font-medium rounded-xl transition-colors duration-100 ${t.sidebarItem}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
