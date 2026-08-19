'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { dormShapeSvg } from '@/shared/dorm-shapes'
import type { DormMapping } from '@/shared/dorm-shapes'
import type { DormCountsRecord } from '@/contexts/ops/usecases/get-dorm-counts'
import { resizeToJpeg } from '@/shared/image-resize'
import { MAX_VERIFY_ATTEMPTS } from '@/contexts/ops/domain/dropoff-decision'
import { confirmDropoff } from './actions'

const BG      = '#faf8f4'
const BG_CARD = '#ffffff'
const NAVY    = '#091825'
const MUTED   = '#64748b'
const BORDER  = '#e5e2dc'
const ORANGE  = '#f57f20'
const EMERALD = '#10b981'
const FONT    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'


export type DormDropoffStatus = 'ready' | 'verified' | 'mismatch' | 'escalated' | 'manual'

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
  /** Photos left for this dorm. 0 means the owner owns it from here. */
  attemptsLeft?: number
  attempt?: number
  expectedCount?: number
  riderCount?: number
  geminiCount?: number | null
  reason: string
}

interface PickupResponse {
  ok: boolean
  /** false = the count did not agree, the day stays shut. */
  accepted?: boolean
  outcome?: 'accepted' | 'rider_disagrees' | 'retake' | 'needs_assertion' | 'uncountable'
  allowAssert?: boolean
  riderCount?: number
  attempt?: number
  attemptsLeft?: number
  maxAttempts?: number
  expectedTotal?: number
  geminiCount?: number | null
  flagged?: boolean
}

interface RiderClientProps {
  dormCounts: DormCountsRecord
  dormShapeMap: Record<string, DormMapping>
  opsTokenId: string
  deliveryDateIso: string
  lastUpdated: string
  noDeliveryReason: string | null
  // Server-rehydrated day state — a PWA reload mid-run must NOT re-lock the
  // day behind a pickup photo the rider can no longer take (boxes are already
  // in the van) or wipe the delivered-dorm checklist. The RSC reads
  // ops_day_events + delivery_events and passes what already happened.
  initialPickedUp?: boolean
  initialPickupFlagged?: boolean
  initialDormStatuses?: Record<string, DormDropoffStatus>
  /** Photos already spent per dorm. Server-authoritative — a reload must not
   *  hand the rider a fresh budget, and must not steal the one they have. */
  initialDormAttempts?: Record<string, number>
}

// ─── Utility: non-blocking geolocation (Pitfall 6 — trigger from user gesture) ─
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

export function RiderClient({
  dormCounts,
  dormShapeMap,
  opsTokenId,
  deliveryDateIso,
  lastUpdated,
  noDeliveryReason,
  initialPickedUp = false,
  initialPickupFlagged = false,
  initialDormStatuses = {},
  initialDormAttempts = {},
}: RiderClientProps) {
  const RIDER_DORMS = Object.entries(dormShapeMap).filter(
    ([key]) => key !== 'Other',
  )
  // ── Pickup state — the photo is the gate that unlocks the dorm list.
  //    Seeded from the server so a reload rejoins the day in progress. ─────
  const [pickedUp, setPickedUp] = useState(initialPickedUp)
  const [confirming, setConfirming] = useState(false)
  const [pickupError, setPickupError] = useState<string | null>(null)
  const [pickupPhoto, setPickupPhoto] = useState<Blob | null>(null)
  const [pickupPreviewUrl, setPickupPreviewUrl] = useState<string | null>(null)
  const [pickupFlagged, setPickupFlagged] = useState(initialPickupFlagged)
  // Set when a pickup photo is REJECTED — the box count did not agree, so the
  // day stays shut and the rider is asked to shoot it again.
  const [pickupResult, setPickupResult] = useState<PickupResponse | null>(null)
  // The rider's own count. The only number in the pickup check produced by
  // someone standing next to the boxes, and the one that catches a short van.
  const [pickupCount, setPickupCount] = useState('')
  const pickupInputRef = useRef<HTMLInputElement>(null)

  // ── Per-dorm drop-off status — seeded from delivery_events on load ───────
  const [dormStatuses, setDormStatuses] = useState<Record<string, DormDropoffStatus>>(initialDormStatuses)
  const [dormAttempts, setDormAttempts] = useState<Record<string, number>>(initialDormAttempts)

  // ── Active modal state ───────────────────────────────────────────────────
  const [activeDorm, setActiveDorm] = useState<string | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [boxCount, setBoxCount] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null)

  // ── Refs ─────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Stop camera tracks (Pitfall 4 — prevents memory leak) ───────────────
  const stopCamera = useCallback(() => {
    cameraStream?.getTracks().forEach(t => t.stop())
    setCameraStream(null)
  }, [cameraStream])

  // ── Wire stream to video element ─────────────────────────────────────────
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream
    }
  }, [cameraStream])

  // ── iOS stream recovery on visibility change (Pitfall 2) ─────────────────
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible' && activeDorm && !capturedPhoto) {
        navigator.mediaDevices
          .getUserMedia({ video: { facingMode: 'environment' } })
          .then(setCameraStream)
          .catch(() => {}) // silent — fallback file input still available
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [activeDorm, capturedPhoto])

  // ── Revoke object URL on change (memory cleanup) ──────────────────────────
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    }
  }, [photoPreviewUrl])

  // ── Open camera for a dorm (VER-01, VER-02) ──────────────────────────────
  async function openCamera(dormKey: string) {
    setActiveDorm(dormKey)
    setCapturedPhoto(null)
    setPhotoPreviewUrl(null)
    setBoxCount('')
    setVerifyResult(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      setCameraStream(stream)
    } catch {
      // getUserMedia failed (permission denied, API unavailable) → file input fallback (VER-02)
      setCameraStream(null)
      fileInputRef.current?.click()
    }
  }

  // ── Capture frame from video element ─────────────────────────────────────
  async function captureFrame() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const blob = await new Promise<Blob>(resolve =>
      canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.9),
    )
    const resized = await resizeToJpeg(blob)
    setCapturedPhoto(resized)
    setPhotoPreviewUrl(URL.createObjectURL(resized))
    stopCamera()
  }

  // ── File input handler — fallback path (VER-02) ──────────────────────────
  async function handleFileCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const resized = await resizeToJpeg(file)
    setCapturedPhoto(resized)
    setPhotoPreviewUrl(URL.createObjectURL(resized))
    // Reset input so the same file can be re-selected on retake
    e.target.value = ''
  }

  // ── Close modal and reset all modal state ─────────────────────────────────
  function closeModal() {
    stopCamera()
    setActiveDorm(null)
    setCapturedPhoto(null)
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    setPhotoPreviewUrl(null)
    setBoxCount('')
    setVerifyResult(null)
  }

  // ── Submit verification to API (VER-12) ───────────────────────────────────
  async function handleSubmitVerification() {
    if (!activeDorm || !capturedPhoto || !boxCount) return
    const count = parseInt(boxCount, 10)
    if (isNaN(count) || count <= 0) return

    setSubmitting(true)
    try {
      // Capture geo from user gesture context (Pitfall 6)
      const geo = await captureGeo()

      const form = new FormData()
      form.append('photo', capturedPhoto, 'dropoff.jpg')
      form.append('dormName', activeDorm)
      form.append('riderCount', String(count))
      form.append('opsToken', opsTokenId)
      form.append('deliveryDateIso', deliveryDateIso)
      if (geo) {
        form.append('geoLat', String(geo.lat))
        form.append('geoLng', String(geo.lng))
      }

      const res = await fetch('/api/ops/verify-box-count', { method: 'POST', body: form })
      if (!res.ok) {
        setVerifyResult({
          verified: false,
          needsManualConfirm: true,
          reason: `Server error (${res.status}) — please confirm manually`,
        })
        return
      }
      const data: VerifyResponse = await res.json()
      setVerifyResult(data)

      // The server owns the photo budget; mirror it so the dorm tile knows
      // whether tapping it again will get the rider anywhere.
      if (typeof data.attempt === 'number') {
        setDormAttempts(prev => ({ ...prev, [activeDorm]: data.attempt as number }))
      }

      switch (data.outcome ?? (data.verified ? 'verified' : 'manual')) {
        case 'verified':
        case 'already_verified':
          setDormStatuses(prev => ({ ...prev, [activeDorm]: 'verified' }))
          setTimeout(() => closeModal(), 2000)  // green tick animation
          break

        case 'retake':
          // Unreadable photo, budget left. Clear the shot, keep the modal up.
          setCapturedPhoto(null)
          setPhotoPreviewUrl(null)
          break

        case 'mismatch_retake':
          // Owner already alerted and customers already told. The rider now
          // gets to ADD evidence — a second angle on the stack — which is the
          // honest way to settle a miscount. It cannot un-send the alert.
          setDormStatuses(prev => ({ ...prev, [activeDorm]: 'mismatch' }))
          setCapturedPhoto(null)
          setPhotoPreviewUrl(null)
          break

        case 'mismatch_final':
          setDormStatuses(prev => ({ ...prev, [activeDorm]: 'mismatch' }))
          setTimeout(() => closeModal(), 3000)
          break

        case 'unclear_final':
          setDormStatuses(prev => ({ ...prev, [activeDorm]: 'escalated' }))
          setTimeout(() => closeModal(), 3000)
          break

        case 'manual':
          // VER-11: show the manual confirm button, never auto-complete.
          break

        case 'locked':
          // Budget spent. If the drop-off was never recorded the response
          // carries needsManualConfirm, so the rider still has a way out.
          if (!data.needsManualConfirm) {
            setDormStatuses(prev => ({
              ...prev,
              [activeDorm]: data.escalated ? 'mismatch' : 'manual',
            }))
            setTimeout(() => closeModal(), 3000)
          }
          break

        case 'no_pickup':
        case 'write_failed':
          // Nothing was recorded. Leave the dorm open so it can be retried.
          setCapturedPhoto(null)
          setPhotoPreviewUrl(null)
          break
      }
    } catch {
      // fetch itself rejected (rider offline — common in a delivery PWA). Show a
      // manual-confirm fallback so the rider isn't left with a silent dead end.
      setVerifyResult({
        verified: false,
        needsManualConfirm: true,
        reason: 'Network error — please confirm manually',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Manual confirm — VER-11 fallback when Gemini returns null ─────────────
  async function handleManualConfirm() {
    if (!activeDorm) return
    setSubmitting(true)
    try {
      const count = parseInt(boxCount, 10) || 0
      const res = await confirmDropoff(activeDorm, count, opsTokenId, deliveryDateIso)
      if (!res.ok) {
        setVerifyResult({
          verified: false,
          outcome: 'manual',
          needsManualConfirm: true,
          reason: res.error ?? 'Could not save. Try again.',
        })
        return
      }
      // A flagged dorm stays flagged: recording the drop-off by hand never
      // clears an escalation, it only tells the customers their food arrived.
      setDormStatuses(prev => ({
        ...prev,
        [activeDorm]: prev[activeDorm] === 'mismatch' || prev[activeDorm] === 'escalated'
          ? prev[activeDorm]
          : 'manual',
      }))
      setTimeout(() => closeModal(), 1500)
    } finally {
      setSubmitting(false)
    }
  }

  // ── No deliveries today ───────────────────────────────────────────────────
  if (noDeliveryReason) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          backgroundColor: BG,
          color: NAVY,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT,
          padding: '20px 16px',
          gap: '12px',
        }}
      >
        <p style={{ fontSize: '24px', textAlign: 'center', color: MUTED, margin: 0 }}>
          {noDeliveryReason}
        </p>
        <p style={{ fontSize: '13px', color: MUTED, margin: 0 }}>
          Last updated {lastUpdated}
        </p>
      </div>
    )
  }

  const totalBoxes = Object.values(dormCounts).reduce((a, b) => a + b, 0)

  // ── Pickup photo capture — file input opens the camera directly ─────────
  async function handlePickupPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const resized = await resizeToJpeg(file)
    if (pickupPreviewUrl) URL.revokeObjectURL(pickupPreviewUrl)
    setPickupPhoto(resized)
    setPickupPreviewUrl(URL.createObjectURL(resized))
    setPickupError(null)
    setPickupResult(null)
    e.target.value = ''
  }

  // ── Submit pickup — the AI box count is now a GATE (owner call 2026-08-19).
  //    A photo that does not show the expected number of boxes sends the rider
  //    back to shoot it again instead of opening the day. The budget is bounded
  //    so a camera that cannot count a stack can never cancel the run: on the
  //    last attempt he passes by vouching for the count himself. ─────────────
  async function handleConfirmPickup(asserted = false) {
    if (!pickupPhoto) return
    const typed = parseInt(pickupCount, 10)
    if (isNaN(typed) || typed < 0) return
    setConfirming(true)
    setPickupError(null)
    try {
      const form = new FormData()
      form.append('photo', pickupPhoto, 'pickup.jpg')
      form.append('opsToken', opsTokenId)
      form.append('dateIso', deliveryDateIso)
      form.append('riderCount', String(parseInt(pickupCount, 10)))
      if (asserted) form.append('riderAsserted', 'true')

      const res = await fetch('/api/ops/confirm-pickup', { method: 'POST', body: form })
      if (!res.ok) {
        setPickupError(`Couldn't confirm pickup (${res.status}). Tap Confirm to retry.`)
        return
      }
      const data: PickupResponse = await res.json()
      if (!data.ok) {
        setPickupError('Couldn’t confirm pickup. Tap Confirm to retry.')
        return
      }

      setPickupResult(data)

      // Rejected: keep the overlay up with the photo still on screen so the
      // numbers and the picture sit side by side, and let him shoot again.
      if (data.accepted === false) return

      setPickupFlagged(data.flagged === true)
      setPickedUp(true)
      setPickupCount('')
      setPickupPhoto(null)
      if (pickupPreviewUrl) URL.revokeObjectURL(pickupPreviewUrl)
      setPickupPreviewUrl(null)
    } catch {
      setPickupError('Network error — tap Confirm to retry.')
    } finally {
      setConfirming(false)
    }
  }

  const confirmDisabled = confirming || pickedUp || totalBoxes === 0
  const pickupCountInvalid =
    pickupCount.trim() === '' || isNaN(parseInt(pickupCount, 10)) || parseInt(pickupCount, 10) < 0

  // ── Dorm button status helpers ────────────────────────────────────────────
  function statusColor(status: DormDropoffStatus | undefined): string {
    if (status === 'verified') return EMERALD
    if (status === 'mismatch' || status === 'escalated') return '#ef4444'
    if (status === 'manual') return ORANGE
    return MUTED
  }

  /** Photos left for this dorm, from the server-seeded count. */
  function attemptsLeftFor(dormKey: string): number {
    return Math.max(0, MAX_VERIFY_ATTEMPTS - (dormAttempts[dormKey] ?? 0))
  }

  function statusLabel(
    status: DormDropoffStatus | undefined,
    isEmpty: boolean,
    dormKey: string,
  ): string {
    if (status === 'verified') return '✓ Delivered'
    // A flagged count with a photo left is not a dead end — say so, because
    // "Mismatch" on a dead tile is what made this feel like a punishment.
    if (status === 'mismatch') {
      return attemptsLeftFor(dormKey) > 0 ? '⚠ Tap to retake' : '⚠ Owner notified'
    }
    if (status === 'escalated') return '⚠ Owner notified'
    if (status === 'manual') return '◑ Recorded by hand'
    if (isEmpty) return ''
    return 'Tap to deliver'
  }

  function isDormTappable(dormKey: string): boolean {
    if (!pickedUp) return false
    const count = dormCounts[dormKey] ?? 0
    if (count === 0) return false
    const status = dormStatuses[dormKey]
    // Genuinely finished states are locked. A flagged count stays open while
    // the rider still has a photo: they can add evidence, never erase it.
    if (status === 'verified' || status === 'manual' || status === 'escalated') return false
    if (status === 'mismatch') return attemptsLeftFor(dormKey) > 0
    return true
  }

  // The drop-off has reached a state only the owner can move. Stop offering
  // a Submit that the server would just refuse.
  const modalLocked =
    verifyResult?.outcome === 'mismatch_final' ||
    verifyResult?.outcome === 'unclear_final' ||
    verifyResult?.outcome === 'already_verified' ||
    (verifyResult?.outcome === 'locked' && !verifyResult?.needsManualConfirm)

  const submitDisabled =
    !capturedPhoto || !boxCount || parseInt(boxCount, 10) <= 0 || submitting || modalLocked

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: BG,
        color: NAVY,
        fontFamily: FONT,
        padding: '20px 16px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontSize: '28px',
            fontWeight: 800,
            color: NAVY,
            lineHeight: 1,
          }}
        >
          {pickedUp ? 'Drop-off' : 'Pickup'}
        </div>
        <div style={{ fontSize: '13px', color: MUTED }}>
          Last updated {lastUpdated}
        </div>
      </div>

      {/* ── Total count banner ───────────────────────────────────────────── */}
      <div
        style={{
          textAlign: 'center',
          fontSize: '18px',
          fontWeight: 700,
          color: ORANGE,
        }}
      >
        Total: {totalBoxes} {totalBoxes === 1 ? 'box' : 'boxes'}
      </div>

      {/* ── Dorm button grid — 2-column ──────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '16px',
          flex: 1,
        }}
      >
        {RIDER_DORMS.map(([dormKey, dormInfo]) => {
          const count = dormCounts[dormKey] ?? 0
          const svgString = dormShapeSvg(dormInfo.shape, dormInfo.number, 72, 'dark', { hideNumber: true })
          const isEmpty = count === 0
          const status = dormStatuses[dormKey] as DormDropoffStatus | undefined
          const tappable = isDormTappable(dormKey)

          return (
            <div
              key={dormKey}
              onClick={() => tappable && openCamera(dormKey)}
              style={{
                minWidth: 80,
                minHeight: 80,
                backgroundColor: BG_CARD,
                borderRadius: '16px',
                border: tappable
                  ? `2px solid ${ORANGE}`
                  : `1px solid ${BORDER}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px 12px',
                gap: '8px',
                opacity: isEmpty ? 0.4 : 1,
                transition: 'opacity 0.15s, border-color 0.2s',
                cursor: tappable ? 'pointer' : 'default',
              }}
            >
              {/* SVG shape */}
              <div dangerouslySetInnerHTML={{ __html: svgString }} />

              {/* Dorm display name */}
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: NAVY,
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {dormInfo.displayName}
              </div>

              {/* Box count */}
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  color: NAVY,
                  lineHeight: 1,
                }}
              >
                {count}
              </div>

              {/* Status label (replaces "Ready for drop-off") */}
              {pickedUp && (
                <div
                  style={{
                    fontSize: '11px',
                    textAlign: 'center',
                    color: statusColor(status),
                    fontWeight: 600,
                  }}
                >
                  {statusLabel(status, isEmpty, dormKey)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Pickup button — photo-gated: taking the photo unlocks the day ── */}
      <button
        onClick={() => {
          if (confirmDisabled) return
          pickupInputRef.current?.click()
        }}
        disabled={confirmDisabled}
        style={{
          width: '100%',
          height: '56px',
          borderRadius: '12px',
          border: 'none',
          backgroundColor: pickedUp ? EMERALD : confirmDisabled ? BORDER : ORANGE,
          color: '#ffffff',
          fontSize: '18px',
          fontWeight: 700,
          fontFamily: FONT,
          cursor: confirmDisabled ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'background-color 0.2s',
        }}
      >
        {pickedUp ? '✓ Pickup Confirmed' : 'Photo of all boxes to start'}
      </button>

      {/* The day opened on the rider's word, not on the camera's. That is not
          a footnote — it is the one fact about this run the owner needs. */}
      {pickedUp && pickupFlagged && (
        <div
          style={{
            backgroundColor: '#fff7ed',
            border: `1px solid ${ORANGE}`,
            borderRadius: '12px',
            padding: '12px 16px',
            fontFamily: FONT,
            color: NAVY,
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>
            You confirmed the count by hand
          </div>
          <div style={{ fontSize: '13px', color: MUTED }}>
            The photo never matched. The owner has been told. Carry on with deliveries.
          </div>
        </div>
      )}

      {pickupError && (
        <div style={{ fontSize: '13px', color: '#ef4444', textAlign: 'center', fontFamily: FONT }}>
          {pickupError}
        </div>
      )}

      {/* ── Hidden pickup camera input ───────────────────────────────────── */}
      <input
        ref={pickupInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePickupPhoto}
        style={{ display: 'none' }}
      />

      {/* ── Pickup photo review overlay ──────────────────────────────────── */}
      {pickupPreviewUrl && !pickedUp && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            backgroundColor: '#000000ee',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            overflowY: 'auto',
            padding: '20px 16px',
            gap: '16px',
            fontFamily: FONT,
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', textAlign: 'center' }}>
            All {totalBoxes} {totalBoxes === 1 ? 'box' : 'boxes'} in the shot?
          </div>

          {/* ── Rejected on the PHOTO's count ─────────────────────────── */}
          {pickupResult?.accepted === false && pickupResult.outcome !== 'rider_disagrees' && (
            <div
              style={{
                backgroundColor: '#7f1d1d',
                border: '1px solid #ef4444',
                borderRadius: '12px',
                padding: '14px 16px',
                color: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: 800 }}>
                {pickupResult.geminiCount == null
                  ? 'The boxes could not be counted in that photo'
                  : `That looks like ${pickupResult.geminiCount} ${pickupResult.geminiCount === 1 ? 'box' : 'boxes'}, not ${pickupResult.expectedTotal}`}
              </div>
              <div style={{ fontSize: '14px', color: '#fecaca' }}>
                {pickupResult.outcome === 'retake'
                  ? `Lay the boxes out so every one is visible, then shoot it again. ${pickupResult.attemptsLeft} ${pickupResult.attemptsLeft === 1 ? 'try' : 'tries'} left.`
                  : `Still no match after ${pickupResult.attempt} tries. Count the van. If all ${pickupResult.expectedTotal} really are there, say so below and the owner will be told.`}
              </div>
            </div>
          )}
          {/* ── The rider's count disagrees with the list ─────────────── */}
          {pickupResult?.outcome === 'rider_disagrees' && (
            <div
              style={{
                backgroundColor: '#7f1d1d',
                border: '1px solid #ef4444',
                borderRadius: '12px',
                padding: '14px 16px',
                color: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: 800 }}>
                The list says {pickupResult.expectedTotal}, you counted {pickupResult.riderCount}
              </div>
              <div style={{ fontSize: '14px', color: '#fecaca' }}>
                Recount the van. If you mistyped, fix the number. If the kitchen
                really only gave you {pickupResult.riderCount}, say so below and
                the owner will be told straight away.
              </div>
            </div>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pickupPreviewUrl}
            alt="Pickup"
            style={{ width: '100%', maxHeight: '40vh', objectFit: 'contain', borderRadius: '12px' }}
          />

          {/* ── Rider's own count ────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <label style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff' }}>
              How many are you taking?
            </label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              value={pickupCount}
              onChange={e => setPickupCount(e.target.value)}
              style={{
                width: '96px',
                height: '56px',
                fontSize: '26px',
                fontWeight: 800,
                color: NAVY,
                textAlign: 'center',
                border: '2px solid #ffffff',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                fontFamily: FONT,
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                if (confirming) return
                pickupInputRef.current?.click()
              }}
              disabled={confirming}
              style={{
                flex: 1,
                height: '56px',
                borderRadius: '12px',
                border: '1px solid #ffffff55',
                backgroundColor: 'transparent',
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: 600,
                fontFamily: FONT,
                cursor: 'pointer',
              }}
            >
              {pickupResult?.accepted === false ? 'Take another' : 'Retake'}
            </button>
            {/* Budget spent: the only way past a disagreeing photo is the
                rider putting his own name to the count. Recorded and sent
                to the owner, never a silent pass. */}
            {pickupResult?.outcome === 'retake' ? null
              : pickupResult?.allowAssert ? (
              <button
                onClick={() => handleConfirmPickup(true)}
                disabled={confirming || pickupCountInvalid}
                style={{
                  flex: 2,
                  height: '56px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: confirming || pickupCountInvalid ? BORDER : ORANGE,
                  color: '#ffffff',
                  fontSize: '15px',
                  fontWeight: 700,
                  fontFamily: FONT,
                  cursor: confirming || pickupCountInvalid ? 'default' : 'pointer',
                }}
              >
                {confirming
                  ? 'Confirming…'
                  : pickupResult.outcome === 'rider_disagrees'
                    ? `The kitchen only gave me ${pickupCount}`
                    : `All ${pickupCount} are in the van`}
              </button>
            ) : (
              <button
                onClick={() => handleConfirmPickup(false)}
                disabled={confirming || pickupCountInvalid}
                style={{
                  flex: 2,
                  height: '56px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: confirming || pickupCountInvalid ? BORDER : EMERALD,
                  color: '#ffffff',
                  fontSize: '16px',
                  fontWeight: 700,
                  fontFamily: FONT,
                  cursor: confirming || pickupCountInvalid ? 'default' : 'pointer',
                }}
              >
                {confirming ? 'Checking…' : 'Confirm pickup'}
              </button>
            )}
          </div>
          {pickupError && (
            <div style={{ fontSize: '13px', color: '#fca5a5', textAlign: 'center' }}>
              {pickupError}
            </div>
          )}
        </div>
      )}

      {/* ── Timestamp ───────────────────────────────────────────────────── */}
      <div style={{ fontSize: '12px', color: MUTED, textAlign: 'center' }}>
        Last updated {lastUpdated}
      </div>

      {/* ── Hidden file input — camera fallback (VER-02) ────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileCapture}
        style={{ display: 'none' }}
      />

      {/* ── Drop-off modal ───────────────────────────────────────────────── */}
      {activeDorm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            backgroundColor: '#000000ee',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: FONT,
          }}
        >
          {/* Keyframe animation for green tick */}
          <style jsx>{`
            @keyframes tickPop {
              0%   { transform: scale(0); opacity: 0; }
              60%  { transform: scale(1.1); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
            .tick-anim {
              animation: tickPop 0.3s ease-out forwards;
            }
          `}</style>

          {/* ── Modal header ──────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: `1px solid ${BORDER}`,
              backgroundColor: BG,
            }}
          >
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: NAVY }}>
                {dormShapeMap[activeDorm]?.displayName ?? activeDorm}
              </div>
              {/* Say the budget out loud once one photo is already spent, so a
                  second attempt never feels like a trap. */}
              {(dormAttempts[activeDorm] ?? 0) > 0 && (
                <div style={{ fontSize: '13px', color: MUTED, marginTop: '2px' }}>
                  {attemptsLeftFor(activeDorm) > 0
                    ? `Photo ${(dormAttempts[activeDorm] ?? 0) + 1} of ${MAX_VERIFY_ATTEMPTS}`
                    : 'Both photos used'}
                </div>
              )}
            </div>
            <button
              onClick={closeModal}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: BORDER,
                color: NAVY,
                fontSize: '18px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT,
              }}
            >
              ×
            </button>
          </div>

          {/* ── Modal body ────────────────────────────────────────────── */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              backgroundColor: BG,
            }}
          >
            {/* ── Verified overlay ──────────────────────────────────── */}
            {verifyResult?.verified && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 60,
                  backgroundColor: EMERALD,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  className="tick-anim"
                  style={{
                    fontSize: '80px',
                    color: '#ffffff',
                    lineHeight: 1,
                  }}
                >
                  ✓
                </div>
              </div>
            )}

            {/* ── Camera view ───────────────────────────────────────── */}
            {cameraStream && !capturedPhoto && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    maxHeight: '50vh',
                    objectFit: 'cover',
                    borderRadius: '12px',
                    backgroundColor: '#000',
                  }}
                />
                {/* Shutter button */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={captureFrame}
                    style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '50%',
                      border: `4px solid ${NAVY}`,
                      backgroundColor: '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        backgroundColor: NAVY,
                      }}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* ── Photo preview ─────────────────────────────────────── */}
            {capturedPhoto && photoPreviewUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <img
                  src={photoPreviewUrl}
                  alt="Drop-off photo preview"
                  style={{
                    width: '100%',
                    maxHeight: '50vh',
                    objectFit: 'contain',
                    borderRadius: '12px',
                  }}
                />
                <button
                  onClick={() => {
                    setCapturedPhoto(null)
                    setPhotoPreviewUrl(null)
                    // Re-open camera for retake
                    navigator.mediaDevices
                      .getUserMedia({ video: { facingMode: 'environment' } })
                      .then(setCameraStream)
                      .catch(() => fileInputRef.current?.click())
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: ORANGE,
                    fontSize: '15px',
                    fontWeight: 600,
                    fontFamily: FONT,
                    cursor: 'pointer',
                    textAlign: 'center',
                    padding: '4px',
                  }}
                >
                  Retake
                </button>
              </div>
            )}

            {/* ── No stream and no photo: fallback prompt ───────────── */}
            {!cameraStream && !capturedPhoto && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    height: '56px',
                    paddingLeft: '32px',
                    paddingRight: '32px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: NAVY,
                    color: '#ffffff',
                    fontSize: '16px',
                    fontWeight: 700,
                    fontFamily: FONT,
                    cursor: 'pointer',
                  }}
                >
                  Take Photo
                </button>
              </div>
            )}

            {/* ── Count flagged, one photo left ─────────────────────── */}
            {verifyResult?.outcome === 'mismatch_retake' && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #ef4444',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  color: '#991b1b',
                  fontSize: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ fontWeight: 700 }}>Counts do not match</div>
                <div style={{ fontSize: '13px' }}>{verifyResult.reason}</div>
                <div style={{ fontSize: '13px', color: NAVY }}>
                  The owner has been told and the customers know their food arrived.
                  You have 1 more photo to settle the count.
                </div>
              </div>
            )}

            {/* ── Retake prompt banner ──────────────────────────────── */}
            {verifyResult?.outcome === 'retake' && verifyResult?.needsRetake && (
              <div
                style={{
                  backgroundColor: '#fff7ed',
                  border: `1px solid ${ORANGE}`,
                  borderRadius: '12px',
                  padding: '12px 16px',
                  color: NAVY,
                  fontSize: '14px',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                  Photo unclear — please retake
                </div>
                {verifyResult.reason && (
                  <div style={{ color: MUTED }}>{verifyResult.reason}</div>
                )}
              </div>
            )}

            {/* ── Manual confirm banner (VER-11) ─────────────────────── */}
            {verifyResult?.needsManualConfirm && (
              <div
                style={{
                  backgroundColor: '#fff7ed',
                  border: `1px solid ${ORANGE}`,
                  borderRadius: '12px',
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  color: NAVY,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '14px' }}>
                  Could not verify automatically
                </div>
                <div style={{ fontSize: '13px', color: MUTED }}>
                  {verifyResult.reason}
                </div>
                <button
                  onClick={handleManualConfirm}
                  disabled={submitting}
                  style={{
                    height: '48px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: submitting ? BORDER : ORANGE,
                    color: '#ffffff',
                    fontSize: '15px',
                    fontWeight: 700,
                    fontFamily: FONT,
                    cursor: submitting ? 'default' : 'pointer',
                  }}
                >
                  {submitting ? 'Confirming…' : 'Confirm Delivery'}
                </button>
              </div>
            )}

            {/* ── Final state: the owner owns this drop-off now ─────── */}
            {(verifyResult?.outcome === 'mismatch_final' ||
              verifyResult?.outcome === 'unclear_final' ||
              (verifyResult?.outcome === 'locked' && !verifyResult?.needsManualConfirm)) && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #ef4444',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  color: '#991b1b',
                  fontSize: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ fontWeight: 700 }}>Owner has been notified</div>
                {verifyResult.reason && (
                  <div style={{ fontSize: '13px' }}>{verifyResult.reason}</div>
                )}
                <div style={{ fontSize: '13px', color: NAVY }}>
                  Nothing left to do here. Carry on to the next dorm.
                </div>
              </div>
            )}

            {/* ── Nothing was recorded — this one IS worth retrying ─── */}
            {(verifyResult?.outcome === 'no_pickup' ||
              verifyResult?.outcome === 'write_failed') && (
              <div
                style={{
                  backgroundColor: '#fff7ed',
                  border: `1px solid ${ORANGE}`,
                  borderRadius: '12px',
                  padding: '12px 16px',
                  color: NAVY,
                  fontSize: '14px',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>Not saved</div>
                <div style={{ fontSize: '13px', color: MUTED }}>{verifyResult.reason}</div>
              </div>
            )}

            {/* ── Box count input (VER-05, VER-12) ─────────────────── */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <label
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: NAVY,
                }}
              >
                How many boxes?
              </label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                value={boxCount}
                onChange={e => setBoxCount(e.target.value)}
                style={{
                  width: '120px',
                  height: '60px',
                  fontSize: '28px',
                  fontWeight: 800,
                  color: NAVY,
                  textAlign: 'center',
                  border: `2px solid ${NAVY}`,
                  borderRadius: '12px',
                  backgroundColor: BG_CARD,
                  fontFamily: FONT,
                  outline: 'none',
                }}
              />
            </div>

            {/* ── Submit button (VER-12) ────────────────────────────── */}
            {!verifyResult?.needsManualConfirm && !modalLocked && (
              <button
                onClick={handleSubmitVerification}
                disabled={submitDisabled}
                style={{
                  width: '100%',
                  height: '56px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: submitDisabled ? BORDER : ORANGE,
                  color: '#ffffff',
                  fontSize: '18px',
                  fontWeight: 700,
                  fontFamily: FONT,
                  cursor: submitDisabled ? 'default' : 'pointer',
                  transition: 'background-color 0.2s',
                }}
              >
                {submitting ? 'Verifying…' : 'Submit'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
