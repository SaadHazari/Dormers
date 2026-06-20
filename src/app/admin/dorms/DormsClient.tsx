'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminTable, type Column } from '../_components/AdminTable'
import { addDormLocation, updateDormLocation, toggleDormActive } from './actions'
import type { DormRow } from './page'
import { AVAILABLE_SHAPES, SHAPE_PATHS, type DormShape } from '@/shared/dorm-shapes'

const SHAPE_LABELS: Record<DormShape, string> = {
  circle: 'Circle',
  square: 'Square',
  triangle: 'Triangle',
  diamond: 'Diamond',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  octagon: 'Octagon',
  star: 'Star',
  shield: 'Shield',
  plus: 'Plus',
  oval: 'Oval',
  arrow: 'Arrow',
}

// Shape geometry is imported from shared/dorm-shapes (SHAPE_PATHS) — the same
// source the label PDF renderer uses — so the admin preview can't drift from
// the printed labels.

type FormData = {
  canonical_name: string
  display_name: string
  cid_code: string
  shape: string
  sort_order: number
  aliases_text: string
  is_delivery_target: boolean
}

const EMPTY_FORM: FormData = {
  canonical_name: '',
  display_name: '',
  cid_code: '',
  shape: 'circle',
  sort_order: 1,
  aliases_text: '',
  is_delivery_target: false,
}

function ShapeIcon({ shape, size = 20, fill }: { shape: DormShape; size?: number; fill: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: `<g fill="${fill}">${SHAPE_PATHS[shape]}</g>` }}
    />
  )
}

export function DormsClient({ dorms }: { dorms: DormRow[] }) {
  const { isLight, t } = useAdminTheme()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Which row's toggle is in flight — disable/label only that row, not all rows.
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)

  const shapeFill = isLight ? '#091825' : '#ede8da'
  const shapeFillMuted = isLight ? 'rgba(9,24,37,0.35)' : 'rgba(237,232,218,0.35)'

  function openAdd() {
    const maxOrder = Math.max(0, ...dorms.map((d) => d.sort_order))
    setForm({ ...EMPTY_FORM, sort_order: maxOrder + 1 })
    setEditingId(null)
    setShowAdd(true)
    setError(null)
  }

  function openEdit(d: DormRow) {
    setForm({
      canonical_name: d.canonical_name,
      display_name: d.display_name,
      cid_code: d.cid_code,
      shape: d.shape,
      sort_order: d.sort_order,
      aliases_text: d.aliases.join(', '),
      is_delivery_target: d.is_delivery_target,
    })
    setEditingId(d.id)
    setShowAdd(true)
    setError(null)
  }

  function handleSave() {
    setError(null)
    const payload = {
      canonical_name: form.canonical_name,
      display_name: form.display_name,
      cid_code: form.cid_code,
      shape: form.shape,
      sort_order: form.sort_order,
      aliases: form.aliases_text
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      is_delivery_target: form.is_delivery_target,
    }
    startTransition(async () => {
      const result = editingId
        ? await updateDormLocation(editingId, payload)
        : await addDormLocation(payload)
      if (result.ok) {
        setShowAdd(false)
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  function handleToggle(d: DormRow) {
    setError(null)
    setPendingId(d.id)
    startTransition(async () => {
      try {
        const result = await toggleDormActive(d.id, !d.is_active)
        if (result.ok) {
          router.refresh()
        } else {
          setError(result.message)
        }
      } finally {
        setPendingId(null)
      }
    })
  }

  const columns: Column<DormRow>[] = [
    {
      key: 'order',
      label: '#',
      render: (r) => (
        <span className={`text-[12px] font-mono ${t.muted}`}>{r.sort_order}</span>
      ),
    },
    {
      key: 'name',
      label: 'Name',
      render: (r) => (
        <div className="flex items-center gap-2">
          <ShapeIcon shape={r.shape as DormShape} size={18} fill={shapeFill} />
          <span className={`font-semibold ${t.heading}`}>{r.canonical_name}</span>
        </div>
      ),
    },
    {
      key: 'display',
      label: 'Display',
      render: (r) => (
        <span className={`text-[12px] font-mono ${t.muted}`}>{r.display_name}</span>
      ),
    },
    {
      key: 'shape',
      label: 'Shape',
      render: (r) => (
        <span className={`text-[12px] ${t.muted}`}>
          {SHAPE_LABELS[r.shape as DormShape] ?? r.shape}
        </span>
      ),
    },
    {
      key: 'cid',
      label: 'CID',
      render: (r) => (
        <span className={`text-[12px] font-mono ${t.muted}`}>{r.cid_code}</span>
      ),
    },
    {
      key: 'delivery',
      label: 'Delivery',
      render: (r) =>
        r.is_delivery_target ? (
          <span className="text-emerald-600 font-semibold text-[12px]">Yes</span>
        ) : (
          <span className={`font-semibold text-[12px] ${t.muted}`}>No</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) =>
        r.is_active ? (
          <span className="text-emerald-600 font-semibold text-[12px]">Active</span>
        ) : (
          <span className={`font-semibold text-[12px] ${t.muted}`}>Disabled</span>
        ),
    },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <div className="flex gap-2">
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
            {pendingId === r.id ? '…' : r.is_active ? 'Disable' : 'Enable'}
          </button>
        </div>
      ),
    },
  ]

  const set = <K extends keyof FormData>(key: K, val: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`text-[20px] font-extrabold tracking-tight ${t.heading}`}>
            Dorm Locations
          </h1>
          <p className={`text-[13px] mt-1 ${t.muted}`}>
            Manage delivery dorms across the entire platform — onboarding, rider
            ops, labels, chatbot, and WhatsApp fuzzy match all read from here.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="text-[13px] font-bold px-4 py-2 rounded-lg bg-[#f57f20] text-white hover:bg-[#e06d15] transition-colors duration-100"
        >
          Add Dorm
        </button>
      </div>

      {error && (
        <p className="text-red-500 text-[13px] mb-4 font-semibold">{error}</p>
      )}

      <AdminTable
        columns={columns}
        data={dorms}
        rowKey={(r) => r.id}
        emptyMessage="No dorm locations"
      />

      {showAdd && (
        <AdminModal
          label={editingId ? 'Edit Dorm' : 'Add Dorm'}
          maxW="max-w-[540px]"
          onBackdrop={() => setShowAdd(false)}
        >
          <div className="overflow-y-auto p-6 space-y-6">
            {/* ── Header ──────────────────────────────────────────── */}
            <div>
              <h2 className={`text-lg font-extrabold tracking-tight ${t.heading}`}>
                {editingId ? 'Edit Dorm Location' : 'New Dorm Location'}
              </h2>
              <p className={`text-sm mt-1 ${t.muted}`}>
                {editingId
                  ? 'Changes propagate to all surfaces immediately.'
                  : 'This dorm will appear in onboarding, rider ops, labels, and chatbot.'}
              </p>
            </div>

            {error && (
              <div className={`text-sm font-medium px-3 py-2 rounded-lg border ${t.dangerBg} ${t.danger}`}>
                {error}
              </div>
            )}

            {/* ── Names ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-sm font-medium ${t.body}`}>
                  Canonical name
                </label>
                <input
                  type="text"
                  placeholder="The Myriad"
                  value={form.canonical_name}
                  onChange={(e) => set('canonical_name', e.target.value)}
                  className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
                />
                <p className={`text-xs mt-1 ${t.faint}`}>Used in database records</p>
              </div>
              <div>
                <label className={`text-sm font-medium ${t.body}`}>
                  Display name
                </label>
                <input
                  type="text"
                  placeholder="MYRIAD"
                  value={form.display_name}
                  onChange={(e) => set('display_name', e.target.value)}
                  className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
                />
                <p className={`text-xs mt-1 ${t.faint}`}>Shown on labels and rider UI</p>
              </div>
            </div>

            {/* ── CID + Sort Order ────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-sm font-medium ${t.body}`}>
                  CID code
                </label>
                <input
                  type="text"
                  placeholder="MYR"
                  maxLength={3}
                  value={form.cid_code}
                  onChange={(e) => set('cid_code', e.target.value.toUpperCase())}
                  className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 font-mono uppercase tracking-wider transition-colors ${t.input} ${t.inputFocus}`}
                />
                <p className={`text-xs mt-1 ${t.faint}`}>3-letter code for customer IDs</p>
              </div>
              <div>
                <label className={`text-sm font-medium ${t.body}`}>
                  Sort order
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.sort_order}
                  onChange={(e) => set('sort_order', parseInt(e.target.value, 10) || 1)}
                  className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
                />
                <p className={`text-xs mt-1 ${t.faint}`}>Display position in lists</p>
              </div>
            </div>

            {/* ── Shape Picker ─────────────────────────────────────── */}
            <div>
              <label className={`text-sm font-medium ${t.body}`}>
                Label shape
              </label>
              <div className="grid grid-cols-6 gap-2 mt-2">
                {AVAILABLE_SHAPES.map((s) => {
                  const selected = form.shape === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set('shape', s)}
                      className={`
                        flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border-2 transition-all duration-100
                        ${selected
                          ? 'border-[#f57f20] bg-[#f57f20]/[0.06] shadow-sm'
                          : `${isLight ? 'border-[#091825]/[0.06] hover:border-[#091825]/[0.15]' : 'border-white/[0.06] hover:border-white/[0.12]'} hover:shadow-sm`
                        }
                      `}
                    >
                      <ShapeIcon
                        shape={s}
                        size={28}
                        fill={selected ? '#f57f20' : shapeFillMuted}
                      />
                      <span className={`text-[10px] font-medium leading-none ${selected ? 'text-[#f57f20]' : t.muted}`}>
                        {SHAPE_LABELS[s]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Aliases ─────────────────────────────────────────── */}
            <div>
              <label className={`text-sm font-medium ${t.body}`}>
                Aliases
              </label>
              <input
                type="text"
                placeholder="myriad, the myriad"
                value={form.aliases_text}
                onChange={(e) => set('aliases_text', e.target.value)}
                className={`w-full text-sm px-3 py-2 rounded-lg border mt-1.5 transition-colors ${t.input} ${t.inputFocus}`}
              />
              <p className={`text-xs mt-1 ${t.faint}`}>
                Comma-separated. Used for WhatsApp fuzzy matching.
              </p>
            </div>

            {/* ── Delivery Target Toggle ──────────────────────────── */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  checked={form.is_delivery_target}
                  onChange={(e) => set('is_delivery_target', e.target.checked)}
                  className="sr-only peer"
                />
                <div className={`
                  w-9 h-5 rounded-full transition-colors duration-150
                  ${form.is_delivery_target ? 'bg-[#f57f20]' : isLight ? 'bg-[#091825]/20' : 'bg-white/20'}
                `} />
                <div className={`
                  absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-150
                  ${form.is_delivery_target ? 'translate-x-4' : 'translate-x-0'}
                `} />
              </div>
              <div>
                <span className={`text-sm font-medium ${t.heading}`}>
                  Delivery target
                </span>
                <p className={`text-xs ${t.faint}`}>
                  Receives meal deliveries from riders
                </p>
              </div>
            </label>

            {/* ── Actions ─────────────────────────────────────────── */}
            <div className={`flex gap-3 pt-2 border-t ${t.border}`}>
              <button
                type="button"
                disabled={isPending}
                onClick={handleSave}
                className="flex-1 text-sm font-bold py-2.5 rounded-xl bg-[#f57f20] text-white hover:bg-[#e06d15] disabled:opacity-50 transition-colors duration-100 shadow-sm"
              >
                {isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Add Dorm'}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
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
