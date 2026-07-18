'use client'

// Packing check — the kitchen's link in the chain of custody.
//
// The kitchen confirms 1) veg / non-veg totals with a photo of the packed
// boxes and 2) a per-dorm box count entered against the SHAPES printed on
// the labels. The per-dorm entry is deliberately blind (expected numbers are
// never shown here) so it stays an independent check; the server tallies and
// the result comes back green or red. A mismatch alerts the owner but never
// blocks the kitchen.

import { useRef, useState } from 'react'
import { dormShapeSvg, type DormShape } from '@/shared/dorm-shapes'
import { resizeToJpeg } from '@/shared/image-resize'

const BG_CARD = '#ffffff'
const NAVY    = '#091825'
const MUTED   = '#64748b'
const BORDER  = '#e5e2dc'
const EMERALD = '#10b981'
const ORANGE  = '#f57f20'
const RED     = '#ef4444'
const FONT    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

export interface PackingDorm {
  key: string
  displayName: string
  shape: DormShape
  number: number
}

export interface ExistingPacking {
  confirmedAtLabel: string
  matched: boolean | null
  mismatchDetails: string | null
}

interface PackingMismatch {
  label: string
  entered: number
  expected: number
}

interface PackingResponse {
  ok: boolean
  matched: boolean
  mismatches: PackingMismatch[]
  geminiCount: number | null
  countsUnavailable: boolean
}

interface PackingCheckProps {
  dorms: PackingDorm[]
  opsTokenId: string
  dateIso: string
  existing: ExistingPacking | null
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '48px',
  borderRadius: '10px',
  border: `1px solid ${BORDER}`,
  backgroundColor: BG_CARD,
  color: NAVY,
  fontSize: '20px',
  fontWeight: 700,
  textAlign: 'center',
  fontFamily: FONT,
}

export function PackingCheck({ dorms, opsTokenId, dateIso, existing }: PackingCheckProps) {
  const [open, setOpen] = useState(false)
  const [veg, setVeg] = useState('')
  const [nonveg, setNonveg] = useState('')
  const [dormValues, setDormValues] = useState<Record<string, string>>({})
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PackingResponse | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const resized = await resizeToJpeg(file)
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setPhotoBlob(resized)
    setPhotoUrl(URL.createObjectURL(resized))
    e.target.value = ''
  }

  const allDormsFilled = dorms.every(d => (dormValues[d.key] ?? '') !== '')
  const submitDisabled =
    submitting || !photoBlob || veg === '' || nonveg === '' || !allDormsFilled

  async function handleSubmit() {
    if (submitDisabled || !photoBlob) return
    setSubmitting(true)
    setError(null)
    try {
      const dormCounts: Record<string, number> = {}
      for (const d of dorms) {
        dormCounts[d.key] = parseInt(dormValues[d.key] ?? '0', 10) || 0
      }
      const form = new FormData()
      form.append('photo', photoBlob, 'packing.jpg')
      form.append('opsToken', opsTokenId)
      form.append('dateIso', dateIso)
      form.append('vegCount', String(parseInt(veg, 10) || 0))
      form.append('nonvegCount', String(parseInt(nonveg, 10) || 0))
      form.append('dormCounts', JSON.stringify(dormCounts))

      const res = await fetch('/api/ops/confirm-packing', { method: 'POST', body: form })
      if (!res.ok) {
        setError(`Couldn’t save (${res.status}). Tap Save to retry.`)
        return
      }
      const data: PackingResponse = await res.json()
      setResult(data)
      setOpen(false)
    } catch {
      setError('Network error. Tap Save to retry.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Result / existing summary banner ──────────────────────────────────────
  const summary = result
    ? {
        matched: result.matched && !result.countsUnavailable,
        details: result.countsUnavailable
          ? 'Saved, but system counts were unavailable. Admin has been told.'
          : result.mismatches.map(m => `${m.label}: you ${m.entered}, system ${m.expected}`).join('\n'),
      }
    : existing
      ? {
          matched: existing.matched === true,
          details: existing.mismatchDetails
            ? existing.mismatchDetails.split(' | ').join('\n')
            : '',
        }
      : null

  return (
    <div
      style={{
        borderRadius: '16px',
        backgroundColor: BG_CARD,
        border: `1px solid ${BORDER}`,
        padding: '20px',
        marginTop: '24px',
        fontFamily: FONT,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: NAVY }}>Packing check</div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            style={{
              height: '40px',
              padding: '0 16px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: ORANGE,
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: FONT,
              cursor: 'pointer',
            }}
          >
            {summary ? 'Redo check' : 'Start check'}
          </button>
        )}
      </div>

      {/* ── Saved-state summary ─────────────────────────────────────────── */}
      {!open && summary && (
        <div
          style={{
            marginTop: '14px',
            borderRadius: '12px',
            padding: '14px 16px',
            backgroundColor: summary.matched ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${summary.matched ? EMERALD : RED}`,
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 700, color: summary.matched ? '#065f46' : '#991b1b' }}>
            {summary.matched ? 'All counts match. Boxes ready for pickup.' : 'Counts don’t match. Admin has been told.'}
          </div>
          {!summary.matched && summary.details && (
            <div style={{ fontSize: '13px', color: '#991b1b', marginTop: '6px', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
              {summary.details}
            </div>
          )}
          {!result && existing && (
            <div style={{ fontSize: '12px', color: MUTED, marginTop: '6px' }}>
              Checked at {existing.confirmedAtLabel}
            </div>
          )}
        </div>
      )}

      {!open && !summary && (
        <div style={{ fontSize: '14px', color: MUTED, marginTop: '10px', lineHeight: 1.5 }}>
          Once the boxes are packed and labelled, count them here and take one photo. Do this before the rider arrives.
        </div>
      )}

      {/* ── Open form ───────────────────────────────────────────────────── */}
      {open && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Veg / non-veg totals */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: NAVY, marginBottom: '8px' }}>
              1. Count the boxes you packed
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: EMERALD, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Veg</div>
                <input type="number" inputMode="numeric" min={0} value={veg} onChange={e => setVeg(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: ORANGE, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Non-veg</div>
                <input type="number" inputMode="numeric" min={0} value={nonveg} onChange={e => setNonveg(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Per-shape counts */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: NAVY, marginBottom: '4px' }}>
              2. Count boxes per label shape
            </div>
            <div style={{ fontSize: '13px', color: MUTED, marginBottom: '10px', lineHeight: 1.4 }}>
              Group the boxes by the shape printed on each label, then enter how many carry each shape. Enter 0 if none.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
              {dorms.map(d => (
                <div
                  key={d.key}
                  style={{
                    borderRadius: '12px',
                    border: `1px solid ${BORDER}`,
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div dangerouslySetInnerHTML={{ __html: dormShapeSvg(d.shape, d.number, 44, 'dark', { hideNumber: true }) }} />
                  <div style={{ fontSize: '12px', fontWeight: 600, color: MUTED, textAlign: 'center', lineHeight: 1.2 }}>
                    {d.displayName}
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={dormValues[d.key] ?? ''}
                    onChange={e => setDormValues(prev => ({ ...prev, [d.key]: e.target.value }))}
                    style={{ ...inputStyle, height: '44px', fontSize: '18px' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Photo */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: NAVY, marginBottom: '8px' }}>
              3. One photo of all the packed boxes
            </div>
            <div style={{ fontSize: '13px', color: MUTED, marginBottom: '10px', lineHeight: 1.4 }}>
              Spread them so every lid is visible.
            </div>
            {photoUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="Packed boxes" style={{ width: '100%', borderRadius: '12px', border: `1px solid ${BORDER}` }} />
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ height: '40px', borderRadius: '10px', border: `1px solid ${BORDER}`, backgroundColor: BG_CARD, color: NAVY, fontSize: '14px', fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}
                >
                  Retake photo
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                style={{ width: '100%', height: '52px', borderRadius: '10px', border: `2px dashed ${ORANGE}`, backgroundColor: '#fff7ef', color: ORANGE, fontSize: '15px', fontWeight: 700, fontFamily: FONT, cursor: 'pointer' }}
              >
                Take photo
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: 'none' }} />
          </div>

          {error && (
            <div style={{ fontSize: '13px', color: RED, textAlign: 'center' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setOpen(false)}
              disabled={submitting}
              style={{ flex: 1, height: '52px', borderRadius: '12px', border: `1px solid ${BORDER}`, backgroundColor: BG_CARD, color: NAVY, fontSize: '15px', fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitDisabled}
              style={{
                flex: 2,
                height: '52px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: submitDisabled ? BORDER : ORANGE,
                color: '#fff',
                fontSize: '16px',
                fontWeight: 700,
                fontFamily: FONT,
                cursor: submitDisabled ? 'default' : 'pointer',
              }}
            >
              {submitting ? 'Checking…' : 'Save packing check'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
