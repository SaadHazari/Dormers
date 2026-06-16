'use client'

import { useState, useTransition } from 'react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminTable, type Column } from '../_components/AdminTable'
import { rotateOpsToken } from './actions'
import type { OpsToken } from './page'

export function OpsTokensClient({ tokens }: { tokens: OpsToken[] }) {
  const { t } = useAdminTheme()
  const [isPending, startTransition] = useTransition()
  const [newUrlResult, setNewUrlResult] = useState<{ url: string; token: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function handleRotate(tok: OpsToken) {
    setError(null)
    startTransition(async () => {
      const result = await rotateOpsToken(tok.id, tok.role, tok.label)
      if (result.ok && result.newUrl) {
        setNewUrlResult({ url: result.newUrl, token: result.newToken! })
      } else {
        setError(result.message)
      }
    })
  }

  function handleCopy() {
    if (!newUrlResult) return
    navigator.clipboard.writeText(newUrlResult.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const columns: Column<OpsToken>[] = [
    { key: 'label', label: 'Label', render: (r) => <span className={`font-semibold ${t.heading}`}>{r.label}</span> },
    { key: 'role', label: 'Role', render: (r) => (
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.role === 'kitchen' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-[#f57f20]'}`}>
        {r.role}
      </span>
    )},
    { key: 'token', label: 'Token', render: (r) => <span className={`font-mono text-[12px] ${t.muted}`}>****{r.token.slice(-4)}</span> },
    { key: 'status', label: 'Status', render: (r) => r.is_active
      ? <span className="text-emerald-600 font-semibold text-[12px]">Active</span>
      : <span className={`font-semibold text-[12px] ${t.muted}`}>Revoked</span>
    },
    { key: 'created', label: 'Created', render: (r) => <span className={`text-[12px] ${t.muted}`}>{r.created_at.slice(0, 10)}</span> },
    { key: 'action', label: '', render: (r) => r.is_active ? (
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleRotate(r)}
        className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors duration-100 ${t.sidebarItem} disabled:opacity-50`}
      >
        {isPending ? 'Rotating...' : 'Rotate'}
      </button>
    ) : null },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`text-[20px] font-extrabold tracking-tight ${t.heading}`}>Ops Tokens</h1>
          <p className={`text-[13px] mt-1 ${t.muted}`}>Rotate a token to immediately revoke the old URL and generate a new one. No deploy required.</p>
        </div>
      </div>

      {error && <p className="text-red-500 text-[13px] mb-4 font-semibold">{error}</p>}

      <AdminTable
        columns={columns}
        data={tokens}
        rowKey={(r) => r.id}
        emptyMessage="No ops tokens found"
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
