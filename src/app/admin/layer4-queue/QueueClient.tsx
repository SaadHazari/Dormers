'use client'

import { useState, useTransition } from 'react'
import { Check, X, ExternalLink, Image as ImageIcon, ShieldAlert } from 'lucide-react'
import { approveLayer4Row, rejectLayer4Row } from './actions'
import type { PendingRow } from './page'
import { useAdminTheme } from '../_components/AdminThemeProvider'

function useColors() {
    const { isLight } = useAdminTheme()
    return {
        BG_DEEP:    isLight ? '#f5f0e8' : '#091825',
        BG_MID:     isLight ? 'rgba(0,0,0,0.04)' : '#1e3a4f',
        GOLD:       '#f57f20',
        TEXT:       isLight ? '#091825' : '#ede8da',
        GREEN:      isLight ? '#1d8a30' : '#5fb479',
        RED:        isLight ? '#c0392b' : '#e0716e',
        MIST:       isLight ? 'rgba(9,24,37,0.55)' : 'rgba(237,232,218,0.55)',
        MIST_DIM:   isLight ? 'rgba(9,24,37,0.30)' : 'rgba(237,232,218,0.30)',
        MIST_FAINT: isLight ? 'rgba(9,24,37,0.08)' : 'rgba(237,232,218,0.12)',
        CODE_BG:    isLight ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.32)',
        IMG_BG:     isLight ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.45)',
        IMG_TAG_BG: isLight ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.7)',
    }
}

const BODY = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

type RowState =
  | { state: 'idle' }
  | { state: 'pending' }
  | { state: 'done'; outcome: 'approved' | 'rejected' }
  | { state: 'error'; message: string }

export default function QueueClient({ rows }: { rows: PendingRow[] }) {
  const c = useColors()
  return (
    <div style={{ fontFamily: BODY, color: c.TEXT }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: BODY, fontSize: 20, fontWeight: 900,
          letterSpacing: '-0.01em', margin: 0,
        }}>
          Layer 4 Queue
        </h1>
        <p style={{
          fontFamily: BODY, fontSize: 13, fontWeight: 500, color: c.MIST,
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
  )
}

function EmptyState() {
  const c = useColors()
  return (
    <div style={{
      padding: '40px 24px',
      borderRadius: 14,
      border: `1px dashed ${c.MIST_FAINT}`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
      <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 800, color: c.TEXT, marginBottom: 4 }}>
        Queue is clear
      </div>
      <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: c.MIST }}>
        No pending Layer 4 claims to review right now.
      </div>
    </div>
  )
}

function Row({ row }: { row: PendingRow }) {
  const c = useColors()
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
      backgroundColor: c.BG_MID,
      border: `1px solid ${acted ? (rowState.outcome === 'approved' ? `${c.GREEN}55` : `${c.RED}55`) : c.MIST_FAINT}`,
      opacity: acted ? 0.55 : 1,
      transition: 'opacity 220ms ease, border-color 220ms ease',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 16,
        flexWrap: 'wrap',
        marginBottom: 12,
      }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 900, color: c.TEXT, marginBottom: 2 }}>
            {row.customer_name ?? '(no name)'}
          </div>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: c.MIST }}>
            {row.customer_email ?? row.customer_id}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{
            padding: '3px 8px', borderRadius: 999,
            fontFamily: BODY, fontSize: 10, fontWeight: 900, color: c.GOLD,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            backgroundColor: `${c.GOLD}14`, border: `1px solid ${c.GOLD}55`,
          }}>
            {row.kind.replace(/_/g, ' ')} · AED {row.value_aed}
          </span>
          <span style={{ fontFamily: BODY, fontSize: 10, fontWeight: 600, color: c.MIST_DIM }}>
            {timeAgo(row.claimed_at)}
          </span>
        </div>
      </div>

      {row.duplicate_of && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8,
          backgroundColor: `${c.RED}18`, border: `1px solid ${c.RED}66`,
          marginBottom: 10,
        }}>
          <ShieldAlert size={14} strokeWidth={2.6} color={c.RED} />
          <span style={{
            fontFamily: BODY, fontSize: 11, fontWeight: 800, color: c.TEXT,
            letterSpacing: '0.06em',
          }}>
            Duplicate of{' '}
            <code style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 10, fontWeight: 700, color: c.GOLD,
              padding: '1px 5px', borderRadius: 4,
              backgroundColor: c.CODE_BG,
            }}>
              {row.duplicate_of.row_id.slice(0, 8)}
            </code>
            {' '}({row.duplicate_of.matched_on === 'text_hash' ? 'same review text' : 'same reviewer name'})
          </span>
        </div>
      )}

      {row.kind === 'google_review' && row.extracted_review_text && (
        <div style={{
          padding: '10px 12px',
          borderRadius: 8,
          backgroundColor: c.CODE_BG,
          border: `1px dashed ${c.MIST_FAINT}`,
          fontFamily: BODY, fontSize: 11, fontWeight: 500, color: c.MIST,
          fontStyle: 'italic',
          lineHeight: 1.55,
          marginBottom: 10,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 120, overflowY: 'auto',
        }}>
          &ldquo;{row.extracted_review_text}&rdquo;
        </div>
      )}

      {row.notes && (
        <div style={{
          padding: '10px 12px',
          borderRadius: 8,
          backgroundColor: c.CODE_BG,
          border: `1px solid ${c.MIST_FAINT}`,
          fontFamily: BODY, fontSize: 11, fontWeight: 500, color: c.MIST,
          lineHeight: 1.55,
          marginBottom: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {row.notes}
        </div>
      )}

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
                border: `1px solid ${c.MIST_FAINT}`,
                backgroundColor: c.IMG_BG,
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
                  backgroundColor: c.IMG_TAG_BG,
                  fontFamily: BODY, fontSize: 10, fontWeight: 700, color: '#f5f0e8',
                }}>
                  <ExternalLink size={10} strokeWidth={2.6} />
                  Open
                </span>
              </div>
            </a>
          ) : (
            <div style={{
              padding: '14px 16px', borderRadius: 8,
              backgroundColor: `${c.RED}14`,
              border: `1px solid ${c.RED}44`,
              fontFamily: BODY, fontSize: 11, fontWeight: 700, color: c.TEXT,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              <ImageIcon size={14} strokeWidth={2.6} color={c.RED} />
              Screenshot not found in storage — verify on Google directly.
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleApprove}
          disabled={pending || acted}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 999,
            backgroundColor: acted && rowState.outcome === 'approved' ? `${c.GREEN}44` : c.GREEN,
            color: c.BG_DEEP,
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
            color: acted && rowState.outcome === 'rejected' ? `${c.RED}aa` : c.TEXT,
            fontFamily: BODY, fontSize: 12, fontWeight: 900,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            border: `1px solid ${c.RED}66`,
            cursor: pending || acted ? 'default' : 'pointer',
            opacity: pending ? 0.7 : 1,
          }}
        >
          <X size={13} strokeWidth={3} />
          {acted && rowState.outcome === 'rejected' ? 'Rejected' : 'Reject & delete'}
        </button>

        {rowState.state === 'error' && (
          <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: c.RED }}>
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
