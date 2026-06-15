'use client'

import { useState } from 'react'
import { DORM_SHAPE_MAP, dormShapeSvg } from '@/shared/dorm-shapes'
import type { DormCountsRecord } from '@/contexts/ops/usecases/get-dorm-counts'
import { confirmPickup } from './actions'

const BG      = '#faf8f4'
const BG_CARD = '#ffffff'
const NAVY    = '#091825'
const MUTED   = '#64748b'
const BORDER  = '#e5e2dc'
const ORANGE  = '#f57f20'
const EMERALD = '#10b981'
const FONT    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

// Exclude 'Other' — only named dorms get a delivery stop
const RIDER_DORMS = Object.entries(DORM_SHAPE_MAP).filter(
  ([key]) => key !== 'Other',
)

interface RiderClientProps {
  dormCounts: DormCountsRecord
  opsTokenId: string
  deliveryDateIso: string
  lastUpdated: string
  noDeliveryReason: string | null
}

export function RiderClient({
  dormCounts,
  opsTokenId,
  deliveryDateIso,
  lastUpdated,
  noDeliveryReason,
}: RiderClientProps) {
  const [pickedUp, setPickedUp] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // No deliveries today (Sunday or other guard)
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
    try {
      const dormsToConfirm = RIDER_DORMS.filter(
        ([dormKey]) => (dormCounts[dormKey] ?? 0) > 0,
      )
      await Promise.all(
        dormsToConfirm.map(([dormKey]) =>
          confirmPickup(
            dormKey,
            dormCounts[dormKey],
            opsTokenId,
            deliveryDateIso,
          ),
        ),
      )
      setPickedUp(true)
    } finally {
      setConfirming(false)
    }
  }

  const confirmDisabled = confirming || pickedUp || totalBoxes === 0

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
      {/* Header */}
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
          Pickup
        </div>
        <div style={{ fontSize: '13px', color: MUTED }}>
          Last updated {lastUpdated}
        </div>
      </div>

      {/* Total count banner */}
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

      {/* Dorm button grid — 2-column */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '16px',
          flex: 1,
        }}
      >
        {RIDER_DORMS.map(([dormKey, dormInfo]) => {
          const count = dormCounts[dormKey] ?? 0
          const svgString = dormShapeSvg(dormInfo.shape, dormInfo.number, 72, 'light')
          const isEmpty = count === 0

          return (
            <div
              key={dormKey}
              style={{
                minWidth: 80,
                minHeight: 80,
                backgroundColor: BG_CARD,
                borderRadius: '16px',
                border: `1px solid ${BORDER}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px 12px',
                gap: '8px',
                opacity: isEmpty ? 0.4 : 1,
                transition: 'opacity 0.15s',
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

              {/* Post-confirm label */}
              {pickedUp && (
                <div
                  style={{
                    fontSize: '11px',
                    color: MUTED,
                    textAlign: 'center',
                  }}
                >
                  Ready for drop-off
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Confirm Pickup button */}
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

      {/* Timestamp */}
      <div style={{ fontSize: '12px', color: MUTED, textAlign: 'center' }}>
        Last updated {lastUpdated}
      </div>
    </div>
  )
}
