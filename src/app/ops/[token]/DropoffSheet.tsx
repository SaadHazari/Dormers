'use client'

// One dorm's drop-off, as a full-screen sheet: count what you left, photograph
// it, submit. Same order as pickup so the rider learns the ritual once.
//
// Two capture modes, decided by the dorm's expected count:
//
//   SINGLE (<= DROPOFF_STACK_THRESHOLD boxes) — one photo. Up to two doorstep
//   stacks of five side by side is what one frame can be trusted to show.
//
//   STACKS (above the threshold) — the pickup pile trick at the door: one
//   close photo per stack of at most five, plus a wide shot that counts
//   STACKS only, all submitted together as ONE attempt of the same
//   two-attempt budget. The far photo is never asked to count boxes, so
//   standing back for it cannot corrupt the count; the server does the sum
//   and feeds it into the exact same triple check.
//
// Uses the native capture input, not getUserMedia — the OS camera is more
// reliable in an installed PWA (no stream eviction, no track leaks) and takes
// better photos than a canvas frame grab. The sheet is OPAQUE; the old
// translucent overlay read as a rendering glitch.

import { useState } from 'react'
import { resizeToJpeg } from '@/shared/image-resize'
import {
  MAX_VERIFY_ATTEMPTS,
  DROPOFF_STACK_THRESHOLD,
  MAX_BOXES_PER_DROPOFF_STACK,
} from '@/contexts/ops/domain/dropoff-decision'
import type { DormMapping } from '@/shared/dorm-shapes'
import { dormShapeSvg } from '@/shared/dorm-shapes'
import { PileGuide, WideShotGuide } from './PhotoGuides'
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
  /** Stack mode only: what the reconcile saw, for flagging the exact card. */
  batch?: {
    outcome: string
    unreadableStacks: number[]
    overviewStackCount: number | null
    stacksPhotographed: number
  }
}

interface Shot { blob: Blob; url: string }

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
  const stackMode = expectedCount > DROPOFF_STACK_THRESHOLD

  const [count, setCount] = useState('')
  const [shot, setShot] = useState<Shot | null>(null)
  // Stack mode: one slot per doorstep stack, plus the wide shot.
  const [stacks, setStacks] = useState<(Shot | null)[]>(() =>
    stackMode
      ? Array.from(
          { length: Math.max(2, Math.ceil(expectedCount / MAX_BOXES_PER_DROPOFF_STACK)) },
          () => null,
        )
      : [],
  )
  const [wide, setWide] = useState<Shot | null>(null)
  const [badStacks, setBadStacks] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<VerifyResponse | null>(null)
  const [done, setDone] = useState(false)

  const n = parseInt(count, 10)
  const countValid = !isNaN(n) && n > 0

  const photosReady = stackMode
    ? stacks.length >= 1 && stacks.every(s => s !== null) && wide !== null
    : shot !== null

  // The drop-off has reached a state only the owner can move. Stop offering
  // a Submit that the server would just refuse.
  const locked =
    result?.outcome === 'mismatch_final' ||
    result?.outcome === 'unclear_final' ||
    result?.outcome === 'already_verified' ||
    (result?.outcome === 'locked' && !result?.needsManualConfirm)

  async function toShot(f: File): Promise<Shot> {
    const blob = await resizeToJpeg(f)
    return { blob, url: URL.createObjectURL(blob) }
  }

  async function onSingleFile(f: File | undefined) {
    if (!f) return
    const s = await toShot(f)
    if (shot) URL.revokeObjectURL(shot.url)
    setShot(s)
  }

  async function onStackFile(i: number, f: File | undefined) {
    if (!f) return
    const s = await toShot(f)
    setStacks(prev => {
      const next = [...prev]
      if (next[i]) URL.revokeObjectURL(next[i]!.url)
      next[i] = s
      return next
    })
    setBadStacks(prev => prev.filter(b => b !== i + 1))
  }

  async function onWideFile(f: File | undefined) {
    if (!f) return
    const s = await toShot(f)
    if (wide) URL.revokeObjectURL(wide.url)
    setWide(s)
  }

  function removeStack(i: number) {
    setStacks(prev => {
      if (prev[i]) URL.revokeObjectURL(prev[i]!.url)
      return prev.filter((_, j) => j !== i)
    })
    setBadStacks([])
  }

  async function submit() {
    if (!photosReady || !countValid || busy || locked) return
    setBusy(true)
    try {
      const geo = await captureGeo()

      const form = new FormData()
      form.append('dormName', dormName)
      form.append('riderCount', String(n))
      form.append('opsToken', opsTokenId)
      form.append('deliveryDateIso', deliveryDateIso)
      if (geo) {
        form.append('geoLat', String(geo.lat))
        form.append('geoLng', String(geo.lng))
      }
      if (stackMode) {
        stacks.forEach((s, i) => form.append('piles', s!.blob, `stack-${i + 1}.jpg`))
        form.append('overview', wide!.blob, 'wide.jpg')
      } else {
        form.append('photo', shot!.blob, 'dropoff.jpg')
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
          if (stackMode) {
            // Structural problem in the stack set. Keep every photo; flag the
            // exact cards to reshoot, and grow the list if one was missed.
            const bad = data.batch?.unreadableStacks ?? []
            setBadStacks(bad)
            const seen = data.batch?.overviewStackCount
            if (data.batch?.outcome === 'stack_missing' && seen && seen > stacks.length) {
              setStacks(prev => [
                ...prev,
                ...Array.from({ length: seen - prev.length }, () => null),
              ])
            }
          } else {
            setShot(null)
          }
          break
        case 'mismatch_retake':
          // Owner already alerted and customers already told. The rider now
          // gets to ADD evidence — a second angle on the stack — which is the
          // honest way to settle a miscount. It cannot un-send the alert.
          onStatus('mismatch')
          if (!stackMode) setShot(null)
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
          if (!stackMode) setShot(null)
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

  const disabled = busy || locked

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
            {/* Say the budget out loud once one try is already spent, so a
                second attempt never feels like a trap. */}
            {attemptsUsed > 0 && (
              attemptsUsed >= MAX_VERIFY_ATTEMPTS
                ? '. Both tries used'
                : `. Try ${attemptsUsed + 1} of ${MAX_VERIFY_ATTEMPTS}`
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
          <CountStepper value={count} onChange={setCount} disabled={disabled} />
        </div>

        {result?.outcome === 'retake' && (
          <Banner
            tone="warn"
            title={stackMode ? 'One of the shots needs fixing' : 'Photo unclear, please retake'}
            body={result.reason || 'Get closer and make sure every box shows.'}
          />
        )}

        {/* ── Capture: single photo ─────────────────────────────────── */}
        {!stackMode && (
          <ShotCard
            hero
            label={shot ? 'Your drop-off photo' : 'Photo of the boxes'}
            hint={shot
              ? 'Happy with it? Submit below.'
              : `Stack them at most ${MAX_BOXES_PER_DROPOFF_STACK} high, side by side, every lid edge visible.`}
            guide={<PileGuide />}
            shot={shot}
            disabled={disabled}
            onFile={onSingleFile}
          />
        )}

        {/* ── Capture: stacks + wide shot ───────────────────────────── */}
        {stackMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: OPS.muted, lineHeight: 1.5, textAlign: 'center' }}>
              Too many boxes for one photo. Build stacks of {MAX_BOXES_PER_DROPOFF_STACK} or
              fewer, shoot each stack up close, then one wide shot of them all.
            </div>
            {stacks.map((s, i) => (
              <ShotCard
                key={i}
                label={`Stack ${i + 1}`}
                hint={`Up to ${MAX_BOXES_PER_DROPOFF_STACK} boxes, every lid edge showing. Get close.`}
                shot={s}
                flagged={badStacks.includes(i + 1)}
                flaggedHint={`Could not be counted. Restack it, ${MAX_BOXES_PER_DROPOFF_STACK} high at most, and shoot it again.`}
                guide={<PileGuide />}
                onRemove={stacks.length > 1 ? () => removeStack(i) : undefined}
                onFile={f => onStackFile(i, f)}
                disabled={disabled}
              />
            ))}
            <button
              onClick={() => !disabled && setStacks(prev => [...prev, null])}
              disabled={disabled}
              style={{
                height: '48px', borderRadius: '999px', border: `1.5px dashed ${OPS.orangeLine}`,
                backgroundColor: 'transparent', color: OPS.orange, fontSize: '13px',
                fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                fontFamily: OPS.font, cursor: disabled ? 'default' : 'pointer',
              }}
            >
              Add another stack
            </button>
            <ShotCard
              label="Wide shot of every stack"
              hint="Step back so all the stacks are in one frame, with clear gaps. This one counts the stacks, not the boxes."
              shot={wide}
              guide={<WideShotGuide />}
              onFile={onWideFile}
              disabled={disabled}
            />
          </div>
        )}

        {result?.outcome === 'mismatch_retake' && (
          <Banner
            tone="danger"
            title="Counts do not match"
            body={`${result.reason} The customers already know their food arrived.`}
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
            <PillButton onClick={submit} disabled={!photosReady || !countValid || busy}>
              {busy
                ? 'Checking the photos'
                : stackMode && !photosReady
                  ? wide ? 'Photograph every stack first' : 'Take the wide shot to finish'
                  : 'Submit drop-off'}
            </PillButton>
          )}
        </div>
      </div>
    </div>
  )
}
