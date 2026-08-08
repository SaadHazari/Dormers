'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminTable, type Column } from '../_components/AdminTable'
import { rotateOpsToken, addAllowlistEntry, toggleAllowlistEntry } from './actions'
import type { OpsToken, AllowlistEntry } from './page'

export function OpsTokensClient({ tokens, allowlist }: { tokens: OpsToken[]; allowlist: AllowlistEntry[] }) {
  const { t } = useAdminTheme()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Which row's action is in flight — so we disable/label only that button, not
  // every row's button at once.
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [newUrlResult, setNewUrlResult] = useState<{ url: string; token: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newLabel, setNewLabel] = useState('')

  function handleRotate(tok: OpsToken) {
    setError(null)
    setPendingId(tok.id)
    startTransition(async () => {
      try {
        const result = await rotateOpsToken(tok.id, tok.role, tok.label)
        if (result.ok && result.newUrl) {
          setNewUrlResult({ url: result.newUrl, token: result.newToken! })
          router.refresh()
        } else {
          setError(result.message)
        }
      } finally {
        setPendingId(null)
      }
    })
  }

  function handleCopy() {
    if (!newUrlResult) return
    navigator.clipboard.writeText(newUrlResult.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleAddPhone() {
    if (!newPhone.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await addAllowlistEntry(newPhone.trim(), newLabel.trim())
      if (result.ok) {
        setNewPhone('')
        setNewLabel('')
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  function handleToggle(entry: AllowlistEntry) {
    setError(null)
    setPendingId(entry.id)
    startTransition(async () => {
      try {
        const result = await toggleAllowlistEntry(entry.id, !entry.is_active)
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

  const tokenColumns: Column<OpsToken>[] = [
    { key: 'label', label: 'Label', render: (r) => <span className={`font-semibold ${t.heading}`}>{r.label}</span> },
    { key: 'role', label: 'Role', render: (r) => (
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.role === 'kitchen' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-[#f57f20]'}`}>
        {r.role}
      </span>
    )},
    { key: 'token', label: 'Token', render: (r) => <span className={`font-mono text-[12px] ${t.muted}`}>****{r.token.slice(-4)}</span> },
    { key: 'created', label: 'Created', render: (r) => <span className={`text-[12px] ${t.muted}`}>{r.created_at.slice(0, 10)}</span> },
    { key: 'action', label: '', render: (r) => (
      <button
        type="button"
        disabled={pendingId === r.id}
        onClick={() => handleRotate(r)}
        className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors duration-100 ${t.sidebarItem} disabled:opacity-50`}
      >
        {pendingId === r.id ? 'Rotating...' : 'Rotate'}
      </button>
    )},
  ]

  const allowlistColumns: Column<AllowlistEntry>[] = [
    { key: 'phone', label: 'Phone', render: (r) => <span className={`font-mono text-[13px] ${t.heading}`}>+{r.phone_digits}</span> },
    { key: 'label', label: 'Label', render: (r) => <span className={`text-[13px] ${t.muted}`}>{r.label ?? '—'}</span> },
    { key: 'status', label: 'Status', render: (r) => r.is_active
      ? <span className="text-emerald-600 font-semibold text-[12px]">Active</span>
      : <span className={`font-semibold text-[12px] ${t.muted}`}>Disabled</span>
    },
    { key: 'action', label: '', render: (r) => (
      <button
        type="button"
        disabled={pendingId === r.id}
        onClick={() => handleToggle(r)}
        className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors duration-100 ${t.sidebarItem} disabled:opacity-50`}
      >
        {pendingId === r.id ? '…' : r.is_active ? 'Disable' : 'Enable'}
      </button>
    )},
  ]

  return (
    <div>
      {/* ── Access Links ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`text-[20px] font-extrabold tracking-tight ${t.heading}`}>Access Links</h1>
          <p className={`text-[13px] mt-1 ${t.muted}`}>Rotate a token to revoke the old URL and generate a new one. No deploy required.</p>
        </div>
      </div>

      {error && <p className="text-red-500 text-[13px] mb-4 font-semibold">{error}</p>}

      <AdminTable
        columns={tokenColumns}
        data={tokens}
        rowKey={(r) => r.id}
        emptyMessage="No active ops tokens"
      />

      {/* ── Rider Allowlist ────────────────────────────────── */}
      <div className="mt-10 mb-6">
        <h2 className={`text-[18px] font-extrabold tracking-tight ${t.heading}`}>WhatsApp Rider Allowlist</h2>
        <p className={`text-[13px] mt-1 ${t.muted}`}>Phone numbers that can text a dorm name to confirm delivery via WhatsApp.</p>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Phone (e.g. 971504619384)"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          className={`flex-1 text-[13px] px-3 py-2 rounded-lg border ${t.tableHeader} ${t.heading}`}
        />
        <input
          type="text"
          placeholder="Label (e.g. Ali)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className={`w-[140px] text-[13px] px-3 py-2 rounded-lg border ${t.tableHeader} ${t.heading}`}
        />
        <button
          type="button"
          disabled={isPending || !newPhone.trim()}
          onClick={handleAddPhone}
          className="text-[13px] font-bold px-4 py-2 rounded-lg bg-[#f57f20] text-white hover:bg-[#e06d15] disabled:opacity-50 transition-colors duration-100"
        >
          Add
        </button>
      </div>

      <AdminTable
        columns={allowlistColumns}
        data={allowlist}
        rowKey={(r) => r.id}
        emptyMessage="No rider numbers allowlisted"
      />

      {newUrlResult && (
        <AdminModal label="New Token URL" onBackdrop={() => setNewUrlResult(null)}>
          <div className="p-6">
            <h2 className={`text-[16px] font-extrabold mb-2 ${t.heading}`}>Token rotated</h2>
            <p className={`text-[13px] mb-4 ${t.muted}`}>Copy this URL now — the token will not be shown again.</p>
            <div className={`rounded-xl p-3 font-mono text-[12px] break-all mb-4 ${t.tableHeader}`}>
              {newUrlResult.url}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCopy}
                className={`flex-1 text-[13px] font-bold py-2 rounded-xl transition-colors duration-100 ${copied ? 'bg-emerald-500 text-white' : 'bg-[#f57f20] text-white hover:bg-[#e06d15]'}`}
              >
                {copied ? 'Copied!' : 'Copy URL'}
              </button>
              <button
                type="button"
                onClick={() => setNewUrlResult(null)}
                className={`px-4 text-[13px] font-semibold rounded-xl ${t.sidebarItem}`}
              >
                Done
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
