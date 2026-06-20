'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { dormShapeSvg } from '@/shared/dorm-shapes'
import type { DormMapping } from '@/shared/dorm-shapes'
import type { DormCountsRecord } from '@/contexts/ops/usecases/get-dorm-counts'
import { confirmPickup, confirmDropoff } from './actions'

const BG      = '#faf8f4'
const BG_CARD = '#ffffff'
const NAVY    = '#091825'
const MUTED   = '#64748b'
const BORDER  = '#e5e2dc'
const ORANGE  = '#f57f20'
const EMERALD = '#10b981'
const FONT    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'


type DormDropoffStatus = 'ready' | 'verified' | 'mismatch' | 'escalated' | 'manual'

interface VerifyResponse {
  verified: boolean
  needsRetake?: boolean
  needsManualConfirm?: boolean
  escalated?: boolean
  geminiCount?: number
  reason: string
}

interface RiderClientProps {
  dormCounts: DormCountsRecord
  dormShapeMap: Record<string, DormMapping>
  opsTokenId: string
  deliveryDateIso: string
  lastUpdated: string
  noDeliveryReason: string | null
}

// ─── Utility: resize blob to max 1600px JPEG 85 (VER-03) ───────────────────
async function resizeToJpeg(file: Blob, maxPx = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality })
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
}: RiderClientProps) {
  const RIDER_DORMS = Object.entries(dormShapeMap).filter(
    ([key]) => key !== 'Other',
  )
  // ── Existing pickup state ────────────────────────────────────────────────
  const [pickedUp, setPickedUp] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pickupError, setPickupError] = useState<string | null>(null)

  // ── Per-dorm drop-off status ─────────────────────────────────────────────
  const [dormStatuses, setDormStatuses] = useState<Record<string, DormDropoffStatus>>({})

  // ── Active modal state ───────────────────────────────────────────────────
  const [activeDorm, setActiveDorm] = useState<string | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [boxCount, setBoxCount] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [retakeCount, setRetakeCount] = useState(0)
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
    setRetakeCount(0)
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
    setRetakeCount(0)
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
      form.append('retakeCount', String(retakeCount))
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

      if (data.verified) {
        setDormStatuses(prev => ({ ...prev, [activeDorm]: 'verified' }))
        // Auto-close after green tick animation (2s)
        setTimeout(() => closeModal(), 2000)
      } else if (data.needsRetake) {
        // Clear photo, keep modal open for retake
        setCapturedPhoto(null)
        setPhotoPreviewUrl(null)
        setRetakeCount(prev => prev + 1)
      } else if (data.needsManualConfirm) {
        // VER-11: Show manual confirm button — never auto-complete
      } else if (data.escalated) {
        const status = data.reason?.toLowerCase().includes('mismatch') ? 'mismatch' : 'escalated'
        setDormStatuses(prev => ({ ...prev, [activeDorm]: status }))
        setTimeout(() => closeModal(), 2000)
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
      await confirmDropoff(activeDorm, count, opsTokenId, deliveryDateIso)
      setDormStatuses(prev => ({ ...prev, [activeDorm]: 'manual' }))
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

  async function handleConfirmPickup() {
    setConfirming(true)
    setPickupError(null)
    try {
      const dormsToConfirm = RIDER_DORMS.filter(
        ([dormKey]) => (dormCounts[dormKey] ?? 0) > 0,
      )
      // confirmPickup returns { ok: false } on failure instead of throwing, so
      // inspect every result — without this a revoked token or DB error would
      // resolve "successfully" and the UI would flip to drop-off against dorms
      // whose pickup was never recorded.
      const results = await Promise.all(
        dormsToConfirm.map(([dormKey]) =>
          confirmPickup(
            dormKey,
            dormCounts[dormKey],
            opsTokenId,
            deliveryDateIso,
          ),
        ),
      )
      const failed = results.filter(r => !r.ok).length
      if (failed > 0) {
        setPickupError(`Couldn't confirm ${failed} dorm${failed > 1 ? 's' : ''}. Tap to retry.`)
        return
      }
      setPickedUp(true)
    } catch {
      setPickupError('Network error — tap to retry.')
    } finally {
      setConfirming(false)
    }
  }

  const confirmDisabled = confirming || pickedUp || totalBoxes === 0

  // ── Dorm button status helpers ────────────────────────────────────────────
  function statusColor(status: DormDropoffStatus | undefined): string {
    if (status === 'verified') return EMERALD
    if (status === 'mismatch' || status === 'escalated') return '#ef4444'
    if (status === 'manual') return ORANGE
    return MUTED
  }

  function statusLabel(status: DormDropoffStatus | undefined, isEmpty: boolean): string {
    if (status === 'verified') return '✓ Delivered'
    if (status === 'mismatch') return '⚠ Mismatch'
    if (status === 'escalated') return '⚠ Escalated'
    if (status === 'manual') return '◑ Manual'
    if (isEmpty) return ''
    return 'Tap to deliver'
  }

  function isDormTappable(dormKey: string): boolean {
    if (!pickedUp) return false
    const count = dormCounts[dormKey] ?? 0
    if (count === 0) return false
    const status = dormStatuses[dormKey]
    return status !== 'verified' && status !== 'mismatch' && status !== 'escalated' && status !== 'manual'
  }

  const submitDisabled =
    !capturedPhoto || !boxCount || parseInt(boxCount, 10) <= 0 || submitting

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
                  {statusLabel(status, isEmpty)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Confirm Pickup button ────────────────────────────────────────── */}
      <button
        onClick={handleConfirmPickup}
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
        {pickedUp
          ? '✓ Pickup Confirmed'
          : confirming
          ? 'Confirming…'
          : 'Confirm Pickup'}
      </button>

      {pickupError && (
        <div style={{ fontSize: '13px', color: '#ef4444', textAlign: 'center', fontFamily: FONT }}>
          {pickupError}
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
            <div style={{ fontSize: '18px', fontWeight: 700, color: NAVY }}>
              {dormShapeMap[activeDorm]?.displayName ?? activeDorm}
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

            {/* ── Retake prompt banner ──────────────────────────────── */}
            {verifyResult?.needsRetake && (
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

            {/* ── Escalated banner ──────────────────────────────────── */}
            {verifyResult?.escalated && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #ef4444',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  color: '#991b1b',
                  fontSize: '14px',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                  Owner has been notified
                </div>
                {verifyResult.reason && (
                  <div style={{ fontSize: '13px' }}>{verifyResult.reason}</div>
                )}
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
            {!verifyResult?.needsManualConfirm && (
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
