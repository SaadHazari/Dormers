'use client'

import { useState, useTransition } from 'react'
import { Check, X, ExternalLink, Image as ImageIcon } from 'lucide-react'
import { approveLayer4Row, rejectLayer4Row } from './actions'
import type { PendingRow } from './page'

// Minimal admin queue. Internal-only — styling matches Dormers brand
// (#091825 navy, #f57f20 orange, cream text) but kept scan-dense rather
// than designed for delight. Each row exposes the AI verdict, the
// screenshot, and two buttons.

const BG_DEEP = '#091825'
const BG_MID  = '#1e3a4f'
const GOLD    = '#f57f20'
const CREAM   = '#ede8da'
const GREEN   = '#5fb479'
const RED     = '#e0716e'
const MIST    = 'rgba(237,232,218,0.55)'
const MIST_DIM = 'rgba(237,232,218,0.30)'
const MIST_FAINT = 'rgba(237,232,218,0.12)'
const BODY = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

type RowState =
  | { state: 'idle' }
  | { state: 'pending' }
  | { state: 'done'; outcome: 'approved' | 'rejected' }
  | { state: 'error'; message: string }

export default function QueueClient({ rows }: { rows: PendingRow[] }) {
  return (
    <main style={{
      backgroundColor: BG_DEEP,
      minHeight: '100vh',
      padding: '32px 24px',
      fontFamily: BODY,
      color: CREAM,
    }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <header style={{ marginBottom: 28 }}>
          <h1 style={{
            fontFamily: BODY, fontSize: 24, fontWeight: 900,
            letterSpacing: '-0.01em', margin: 0,
          }}>
            Layer 4 Queue
          </h1>
          <p style={{
            fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
            margin: '6px 0 0', lineHeight: 1.5,
          }}>
            Pending Layer 4 claims awaiting manual verification. {rows.length} row{rows.length === 1 ? '' : 's'}.
          </p>
        </header>

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rows.map(row => <Row key={row.id} row={row} />)}
          </div>
        )}
      </div>
    </main>
  )
}

function EmptyState() {
  return (
    <div style={{
      padding: '40px 24px',
      borderRadius: 14,
      border: `1px dashed ${MIST_FAINT}`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
      <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 800, color: CREAM, marginBottom: 4 }}>
        Queue is clear
      </div>
      <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: MIST }}>
        No pending Layer 4 claims to review right now.
      </div>
    </div>
  )
}

function Row({ row }: { row: PendingRow }) {
  const [rowState, setRowState] = useState<RowState>({ state: 'idle' })
  const [pending, startTransition] = useTransition()

  function handleApprove() {
    setRowState({ state: 'pending' })
    startTransition(async () => {
      const res = await approveLayer4Row(row.id)
      if ('ok' in res) {
        setRowState({ state: 'done', outcome: 'approved' })
      } else {
        setRowState({ state: 'error', message: res.error })
      }
    })
  }
  function handleReject() {
    if (!confirm(`Reject this ${row.kind} claim from ${row.customer_name ?? 'customer'}? The row will be deleted.`)) return
    setRowState({ state: 'pending' })
    startTransition(async () => {
      const res = await rejectLayer4Row(row.id)
      if ('ok' in res) {
        setRowState({ state: 'done', outcome: 'rejected' })
      } else {
        setRowState({ state: 'error', message: res.error })
      }
    })
  }

  const acted = rowState.state === 'done'

  return (
    <div style={{
      padding: '18px 18px 16px',
      borderRadius: 14,
      backgroundColor: BG_MID,
      border: `1px solid ${acted ? (rowState.outcome === 'approved' ? `${GREEN}55` : `${RED}55`) : MIST_FAINT}`,
      opacity: acted ? 0.55 : 1,
      transition: 'opacity 220ms ease, border-color 220ms ease',
    }}>
      {/* Top row — customer + meta */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 16,
        flexWrap: 'wrap',
        marginBottom: 12,
      }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 900, color: CREAM, marginBottom: 2 }}>
            {row.customer_name ?? '(no name)'}
          </div>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST }}>
            {row.customer_email ?? row.customer_id}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{
            padding: '3px 8px', borderRadius: 999,
            fontFamily: BODY, fontSize: 10, fontWeight: 900, color: GOLD,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            backgroundColor: `${GOLD}14`, border: `1px solid ${GOLD}55`,
          }}>
            {row.kind.replace(/_/g, ' ')} · AED {row.value_aed}
          </span>
          <span style={{ fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM }}>
            {timeAgo(row.claimed_at)}
          </span>
        </div>
      </div>

      {/* AI verdict notes */}
      {row.notes && (
        <div style={{
          padding: '10px 12px',
          borderRadius: 8,
          backgroundColor: 'rgba(0,0,0,0.32)',
          border: `1px solid ${MIST_FAINT}`,
          fontFamily: BODY, fontSize: 11, fontWeight: 500, color: MIST,
          lineHeight: 1.55,
          marginBottom: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {row.notes}
        </div>
      )}

      {/* Screenshot (google_review only) */}
      {row.kind === 'google_review' && (
        <div style={{ marginBottom: 14 }}>
          {row.screenshot_url ? (
            <a
              href={row.screenshot_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', textDecoration: 'none' }}
            >
              <div style={{
                position: 'relative',
                borderRadius: 10,
                overflow: 'hidden',
                border: `1px solid ${MIST_FAINT}`,
                backgroundColor: 'rgba(0,0,0,0.45)',
                maxHeight: 320,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                { /* eslint-disable-next-line @next/next/no-img-element */ }
                <img
                  src={row.screenshot_url}
                  alt={`Screenshot from ${row.customer_name ?? 'customer'}`}
                  style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }}
                />
                <span style={{
                  position: 'absolute', top: 8, right: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px', borderRadius: 6,
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  fontFamily: BODY, fontSize: 10, fontWeight: 700, color: CREAM,
                }}>
                  <ExternalLink size={10} strokeWidth={2.6} />
                  Open
                </span>
              </div>
            </a>
          ) : (
            <div style={{
              padding: '14px 16px', borderRadius: 8,
              backgroundColor: `${RED}14`,
              border: `1px solid ${RED}44`,
              fontFamily: BODY, fontSize: 11, fontWeight: 700, color: CREAM,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              <ImageIcon size={14} strokeWidth={2.6} color={RED} />
              Screenshot not found in storage — verify on Google directly.
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleApprove}
          disabled={pending || acted}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 999,
            backgroundColor: acted && rowState.outcome === 'approved' ? `${GREEN}44` : GREEN,
            color: BG_DEEP,
            fontFamily: BODY, fontSize: 12, fontWeight: 900,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            border: 'none',
            cursor: pending || acted ? 'default' : 'pointer',
            opacity: pending ? 0.7 : 1,
          }}
        >
          <Check size={13} strokeWidth={3} />
          {acted && rowState.outcome === 'approved' ? 'Approved' : 'Approve & credit'}
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={pending || acted}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 999,
            backgroundColor: 'transparent',
            color: acted && rowState.outcome === 'rejected' ? `${RED}aa` : CREAM,
            fontFamily: BODY, fontSize: 12, fontWeight: 900,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            border: `1px solid ${RED}66`,
            cursor: pending || acted ? 'default' : 'pointer',
            opacity: pending ? 0.7 : 1,
          }}
        >
          <X size={13} strokeWidth={3} />
          {acted && rowState.outcome === 'rejected' ? 'Rejected' : 'Reject & delete'}
        </button>

        {rowState.state === 'error' && (
          <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: RED }}>
            Error: {rowState.message}
          </span>
        )}
      </div>
    </div>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
