'use client'

// One dorm's drop-off, as a full-screen sheet: count what you left, photograph
// it, submit. Same order as pickup so the rider learns the ritual once.
//
// Replaces the old getUserMedia live-camera modal with the native capture
// input the fallback path already used — the OS camera is more reliable in an
// installed PWA (no stream eviction on background, no track leaks) and takes
// better photos than a canvas frame grab.
//
// The sheet is OPAQUE. The old overlay was rgba black over the dorm grid,
// which read as a rendering glitch, not a screen.

import { useState } from 'react'
import { resizeToJpeg } from '@/shared/image-resize'
import { MAX_VERIFY_ATTEMPTS } from '@/contexts/ops/domain/dropoff-decision'
import type { DormMapping } from '@/shared/dorm-shapes'
import { dormShapeSvg } from '@/shared/dorm-shapes'
import { PileGuide } from './PhotoGuides'
import { OPS, PillButton, CountStepper, Banner, ShotCard, TickSplash } from './ui'
import type { DormDropoffStatus } from './RiderClient'

/** Mirrors DropoffOutcome in contexts/ops/domain/dropoff-decision.ts, plus the
 *  gates the route answers before it spends a photo upload or an AI call. */
type VerifyOutcome =
  | 'verified'
  | 'retake'
  | 'unclear_final'
  | 'mismatch_retake'
  | 'mismatch_final'
  | 'manual'
  | 'locked'
  | 'already_verified'
  | 'no_pickup'
  | 'write_failed'

interface VerifyResponse {
  outcome?: VerifyOutcome
  verified: boolean
  delivered?: boolean
  needsRetake?: boolean
  needsManualConfirm?: boolean
  escalated?: boolean
  attemptsLeft?: number
  attempt?: number
  expectedCount?: number
  riderCount?: number
  geminiCount?: number | null
  reason: string
}

// ─── Non-blocking geolocation (Pitfall 6 — trigger from user gesture) ───────
function captureGeo(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    const timer = setTimeout(() => resolve(null), 8000)
    navigator.geolocation.getCurrentPosition(
      pos => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }) },
      () => { clearTimeout(timer); resolve(null) },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  })
}

export function DropoffSheet({
  dormName,
  dormInfo,
  expectedCount,
  attemptsUsed,
  opsTokenId,
  deliveryDateIso,
  onStatus,
  onAttempt,
  onClose,
  confirmManually,
}: {
  dormName: string
  dormInfo: DormMapping
  expectedCount: number
  /** Photos already spent, server-seeded — a reload must not refill the budget. */
  attemptsUsed: number
  opsTokenId: string
  deliveryDateIso: string
  onStatus: (status: DormDropoffStatus) => void
  onAttempt: (attempt: number) => void
  onClose: () => void
  /** Injected so the dev preview can stub the server action. */
  confirmManually: (dormName: string, riderCount: number) => Promise<{ ok: boolean; error?: string }>
}) {
  const [count, setCount] = useState('')
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<VerifyResponse | null>(null)
  const [done, setDone] = useState(false)

  const n = parseInt(count, 10)
  const countValid = !isNaN(n) && n > 0

  // The drop-off has reached a state only the owner can move. Stop offering
  // a Submit that the server would just refuse.
  const locked =
    result?.outcome === 'mismatch_final' ||
    result?.outcome === 'unclear_final' ||
    result?.outcome === 'already_verified' ||
    (result?.outcome === 'locked' && !result?.needsManualConfirm)

  async function onFile(f: File | undefined) {
    if (!f) return
    const blob = await resizeToJpeg(f)
    if (shot) URL.revokeObjectURL(shot.url)
    setShot({ blob, url: URL.createObjectURL(blob) })
  }

  async function submit() {
    if (!shot || !countValid || busy || locked) return
    setBusy(true)
    try {
      const geo = await captureGeo()

      const form = new FormData()
      form.append('photo', shot.blob, 'dropoff.jpg')
      form.append('dormName', dormName)
      form.append('riderCount', String(n))
      form.append('opsToken', opsTokenId)
      form.append('deliveryDateIso', deliveryDateIso)
      if (geo) {
        form.append('geoLat', String(geo.lat))
        form.append('geoLng', String(geo.lng))
      }

      const res = await fetch('/api/ops/verify-box-count', { method: 'POST', body: form })
      if (!res.ok) {
        setResult({
          verified: false,
          needsManualConfirm: true,
          reason: `Server error (${res.status}). You can record the delivery by hand below.`,
        })
        return
      }
      const data: VerifyResponse = await res.json()
      setResult(data)

      if (typeof data.attempt === 'number') onAttempt(data.attempt)

      switch (data.outcome ?? (data.verified ? 'verified' : 'manual')) {
        case 'verified':
        case 'already_verified':
          onStatus('verified')
          setDone(true)
          setTimeout(onClose, 1600)
          break
        case 'retake':
          setShot(null)
          break
        case 'mismatch_retake':
          // Owner already alerted and customers already told. The rider now
          // gets to ADD evidence — a second angle on the stack — which is the
          // honest way to settle a miscount. It cannot un-send the alert.
          onStatus('mismatch')
          setShot(null)
          break
        case 'mismatch_final':
          onStatus('mismatch')
          setTimeout(onClose, 3000)
          break
        case 'unclear_final':
          onStatus('escalated')
          setTimeout(onClose, 3000)
          break
        case 'manual':
          // VER-11: show the manual confirm button, never auto-complete.
          break
        case 'locked':
          if (!data.needsManualConfirm) {
            onStatus(data.escalated ? 'mismatch' : 'manual')
            setTimeout(onClose, 3000)
          }
          break
        case 'no_pickup':
        case 'write_failed':
          // Nothing was recorded. Leave the dorm open so it can be retried.
          setShot(null)
          break
      }
    } catch {
      // Rider offline — common in a delivery PWA. Offer the manual path so
      // there is never a silent dead end.
      setResult({
        verified: false,
        needsManualConfirm: true,
        reason: 'No connection. You can record the delivery by hand below.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function manualConfirm() {
    if (busy) return
    setBusy(true)
    try {
      const res = await confirmManually(dormName, isNaN(n) ? 0 : n)
      if (!res.ok) {
        setResult({
          verified: false,
          outcome: 'manual',
          needsManualConfirm: true,
          reason: res.error ?? 'Could not save. Try again.',
        })
        return
      }
      // A flagged dorm stays flagged: recording the drop-off by hand never
      // clears an escalation, it only tells the customers their food arrived.
      onStatus('manual')
      setDone(true)
      setTimeout(onClose, 1400)
    } finally {
      setBusy(false)
    }
  }

  const svg = dormShapeSvg(dormInfo.shape, dormInfo.number, 40, 'dark', { hideNumber: true })

  if (done) {
    return (
      <TickSplash
        title={`${dormInfo.displayName} delivered`}
        sub={result?.verified ? 'Counts agree. On to the next one.' : 'Recorded. On to the next one.'}
      />
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        backgroundColor: OPS.bg,
        display: 'flex', flexDirection: 'column',
        fontFamily: OPS.font,
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '16px', borderBottom: `1px solid ${OPS.border}`,
          backgroundColor: OPS.card,
        }}
      >
        <div style={{ flexShrink: 0, display: 'flex' }} dangerouslySetInnerHTML={{ __html: svg }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: OPS.navy, lineHeight: 1.2 }}>
            {dormInfo.displayName}
          </div>
          <div style={{ fontSize: '13px', color: OPS.muted, marginTop: '2px' }}>
            {expectedCount} {expectedCount === 1 ? 'box' : 'boxes'} for this dorm
            {/* Say the budget out loud once one photo is already spent, so a
                second attempt never feels like a trap. */}
            {attemptsUsed > 0 && (
              attemptsUsed >= MAX_VERIFY_ATTEMPTS
                ? '. Both photos used'
                : `. Photo ${attemptsUsed + 1} of ${MAX_VERIFY_ATTEMPTS}`
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            width: '44px', height: '44px', borderRadius: '50%', border: 'none',
            backgroundColor: OPS.bg, color: OPS.navy, fontSize: '20px',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontFamily: OPS.font, flexShrink: 0,
          }}
        >
          &times;
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1, overflowY: 'auto', padding: '20px 16px 28px',
          display: 'flex', flexDirection: 'column', gap: '18px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: OPS.navy, textAlign: 'center' }}>
            How many boxes did you leave here?
          </div>
          <CountStepper value={count} onChange={setCount} disabled={busy || locked} />
        </div>

        <ShotCard
          hero
          label={shot ? 'Your drop-off photo' : 'Photo of the boxes'}
          hint={shot ? 'Happy with it? Submit below.' : 'Shoot the stack where you left it, every lid edge visible.'}
          guide={<PileGuide />}
          shot={shot}
          disabled={busy || locked}
          onFile={onFile}
        />

        {result?.outcome === 'mismatch_retake' && (
          <Banner
            tone="danger"
            title="Counts do not match"
            body={`${result.reason} The owner has been told and the customers know their food arrived. You have one more photo to settle the count: shoot the same stack from another angle.`}
          />
        )}

        {result?.outcome === 'retake' && !shot && (
          <Banner
            tone="warn"
            title="Photo unclear, please retake"
            body={result.reason || 'Get closer and make sure every box shows.'}
          />
        )}

        {result?.needsManualConfirm && (
          <Banner
            tone="warn"
            title="Could not check the photo"
            body={result.reason}
          >
            <PillButton variant="navy" small disabled={busy || !countValid} onClick={manualConfirm} style={{ marginTop: '6px' }}>
              {busy ? 'Saving' : `Record ${countValid ? n : 'the'} ${n === 1 ? 'box' : 'boxes'} by hand`}
            </PillButton>
          </Banner>
        )}

        {locked && result?.outcome !== 'already_verified' && (
          <Banner
            tone="danger"
            title="Owner has been notified"
            body={`${result?.reason ? result.reason + ' ' : ''}Nothing left to do here. Carry on to the next dorm.`}
          />
        )}

        {(result?.outcome === 'no_pickup' || result?.outcome === 'write_failed') && (
          <Banner tone="warn" title="Not saved" body={result.reason} />
        )}

        <div style={{ marginTop: 'auto' }}>
          {!result?.needsManualConfirm && !locked && (
            <PillButton onClick={submit} disabled={!shot || !countValid || busy}>
              {busy ? 'Checking the photo' : 'Submit drop-off'}
            </PillButton>
          )}
        </div>
      </div>
    </div>
  )
}
