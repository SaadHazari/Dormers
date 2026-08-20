'use client'

// The rider's day, as three stages instead of one screen wearing three hats:
//
//   PICKUP  — count first, then photo(s). PickupFlow owns it.
//   RUN     — a stop list with real progress. Tapping a stop opens its
//             full-screen DropoffSheet.
//   DONE    — RunComplete. The old app simply had no ending; the rider
//             finished his last dorm and the screen just sat there.
//
// This file is the orchestrator: it owns the day state (seeded by the RSC so
// a PWA reload rejoins the day in progress) and decides which stage shows.

import { useState } from 'react'
import { dormShapeSvg } from '@/shared/dorm-shapes'
import type { DormMapping } from '@/shared/dorm-shapes'
import type { DormCountsRecord } from '@/contexts/ops/usecases/get-dorm-counts'
import { MAX_VERIFY_ATTEMPTS } from '@/contexts/ops/domain/dropoff-decision'
import { PickupFlow } from './PickupFlow'
import { DropoffSheet } from './DropoffSheet'
import { RunComplete, type StopSummary } from './RunComplete'
import { OPS, Banner, Tick } from './ui'
import { confirmDropoff } from './actions'

export type DormDropoffStatus = 'ready' | 'verified' | 'mismatch' | 'escalated' | 'manual'

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
  /** Dev-preview hook: replaces the confirmDropoff server action. */
  confirmDropoffAction?: (
    dormName: string,
    riderCount: number,
    opsTokenId: string,
    deliveryDateIso: string,
  ) => Promise<{ ok: boolean; error?: string }>
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
  confirmDropoffAction,
}: RiderClientProps) {
  const [pickedUp, setPickedUp] = useState(initialPickedUp)
  const [pickupFlagged, setPickupFlagged] = useState(initialPickupFlagged)
  const [statuses, setStatuses] = useState<Record<string, DormDropoffStatus>>(initialDormStatuses)
  const [attempts, setAttempts] = useState<Record<string, number>>(initialDormAttempts)
  const [activeDorm, setActiveDorm] = useState<string | null>(null)

  const riderDorms = Object.entries(dormShapeMap).filter(([key]) => key !== 'Other')
  const totalBoxes = riderDorms.reduce((a, [key]) => a + (dormCounts[key] ?? 0), 0)

  function attemptsLeftFor(dormKey: string): number {
    return Math.max(0, MAX_VERIFY_ATTEMPTS - (attempts[dormKey] ?? 0))
  }

  function isTappable(dormKey: string): boolean {
    const count = dormCounts[dormKey] ?? 0
    if (count === 0) return false
    const status = statuses[dormKey]
    // Genuinely finished states are locked. A flagged count stays open while
    // the rider still has a photo: they can add evidence, never erase it.
    if (status === 'verified' || status === 'manual' || status === 'escalated') return false
    if (status === 'mismatch') return attemptsLeftFor(dormKey) > 0
    return true
  }

  const confirmManually = (dormName: string, riderCount: number) =>
    (confirmDropoffAction ?? confirmDropoff)(dormName, riderCount, opsTokenId, deliveryDateIso)

  // ── Idle days ─────────────────────────────────────────────────────────────
  if (noDeliveryReason) {
    return <IdleScreen title={noDeliveryReason} lastUpdated={lastUpdated} />
  }
  if (totalBoxes === 0) {
    return (
      <IdleScreen
        title="No boxes to deliver today"
        sub="Nothing is scheduled for delivery. Check back tomorrow."
        lastUpdated={lastUpdated}
      />
    )
  }

  // ── Stage: pickup ─────────────────────────────────────────────────────────
  if (!pickedUp) {
    return (
      <PickupFlow
        opsTokenId={opsTokenId}
        deliveryDateIso={deliveryDateIso}
        onAccepted={flagged => { setPickupFlagged(flagged); setPickedUp(true) }}
      />
    )
  }

  // ── Stage: run / done ─────────────────────────────────────────────────────
  const stops = riderDorms.filter(([key]) => (dormCounts[key] ?? 0) > 0)
  const emptyDorms = riderDorms.filter(([key]) => (dormCounts[key] ?? 0) === 0)
  const doneCount = stops.filter(([key]) => {
    const s = statuses[key]
    return s === 'verified' || s === 'manual' || s === 'mismatch' || s === 'escalated'
  }).length
  const allDone = stops.length > 0 && doneCount === stops.length

  const sheet = activeDorm && (
    <DropoffSheet
      dormName={activeDorm}
      dormInfo={dormShapeMap[activeDorm]}
      expectedCount={dormCounts[activeDorm] ?? 0}
      attemptsUsed={attempts[activeDorm] ?? 0}
      opsTokenId={opsTokenId}
      deliveryDateIso={deliveryDateIso}
      onStatus={s => setStatuses(prev => ({ ...prev, [activeDorm]: s }))}
      onAttempt={a => setAttempts(prev => ({ ...prev, [activeDorm]: a }))}
      onClose={() => setActiveDorm(null)}
      confirmManually={confirmManually}
    />
  )

  if (allDone) {
    const summary: StopSummary[] = stops.map(([key, info]) => ({
      dormName: key,
      dormInfo: info,
      count: dormCounts[key] ?? 0,
      status: statuses[key] ?? 'ready',
      canAddPhoto: statuses[key] === 'mismatch' && attemptsLeftFor(key) > 0,
    }))
    return (
      <>
        <RunComplete stops={summary} pickupFlagged={pickupFlagged} onAddPhoto={setActiveDorm} />
        {sheet}
      </>
    )
  }

  return (
    <div
      style={{
        minHeight: '100dvh', backgroundColor: OPS.bg, fontFamily: OPS.font,
        padding: '24px 16px 32px', display: 'flex', flexDirection: 'column', gap: '16px',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '26px', fontWeight: 800, color: OPS.navy, lineHeight: 1 }}>
          Drop-offs
        </div>
        <div style={{ fontSize: '12px', color: OPS.faint }}>Updated {lastUpdated}</div>
      </div>

      {/* ── Progress ───────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: OPS.card, border: `1px solid ${OPS.border}`,
          borderRadius: '20px', padding: '14px 18px',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: OPS.navy }}>
            {doneCount} of {stops.length} stops done
          </div>
          <div style={{ fontSize: '12px', color: OPS.muted }}>
            {totalBoxes} {totalBoxes === 1 ? 'box' : 'boxes'} on board
          </div>
        </div>
        <div style={{ height: '8px', borderRadius: '999px', backgroundColor: OPS.bg, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%', borderRadius: '999px',
              width: `${stops.length ? Math.round((doneCount / stops.length) * 100) : 0}%`,
              // Brand orange is the ceiling: fade lighter, never darker.
              backgroundImage: 'linear-gradient(90deg, #ffaa00, #f57f20)',
              transition: 'width 300ms ease',
            }}
          />
        </div>
      </div>

      {/* The day opened on the rider's word, not on the camera's. That is not
          a footnote — it is the one fact about this run the owner needs. */}
      {pickupFlagged && (
        <Banner
          tone="warn"
          title="You confirmed the pickup count by hand"
          body="The photo never matched, so the owner has been told. Carry on with deliveries."
        />
      )}

      {/* ── Stop list ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {stops.map(([key, info]) => (
          <StopRow
            key={key}
            dormInfo={info}
            count={dormCounts[key] ?? 0}
            status={statuses[key]}
            attemptsLeft={attemptsLeftFor(key)}
            tappable={isTappable(key)}
            onTap={() => setActiveDorm(key)}
          />
        ))}
        {emptyDorms.map(([key, info]) => (
          <StopRow key={key} dormInfo={info} count={0} status={undefined} attemptsLeft={0} tappable={false} onTap={() => {}} />
        ))}
      </div>

      {sheet}
    </div>
  )
}

// ─── One stop in the list ───────────────────────────────────────────────────

function StopRow({
  dormInfo,
  count,
  status,
  attemptsLeft,
  tappable,
  onTap,
}: {
  dormInfo: DormMapping
  count: number
  status: DormDropoffStatus | undefined
  attemptsLeft: number
  tappable: boolean
  onTap: () => void
}) {
  const empty = count === 0
  const svg = dormShapeSvg(dormInfo.shape, dormInfo.number, 44, 'dark', { hideNumber: true })

  let chip: React.ReactNode = null
  if (empty) {
    chip = <span style={{ fontSize: '12px', fontWeight: 600, color: OPS.faint }}>No boxes today</span>
  } else if (status === 'verified') {
    chip = (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: OPS.success }}>
        <Tick size={14} color={OPS.success} /> Delivered
      </span>
    )
  } else if (status === 'manual') {
    chip = <span style={{ fontSize: '12px', fontWeight: 700, color: OPS.orange }}>Recorded by hand</span>
  } else if (status === 'mismatch' && attemptsLeft > 0) {
    chip = <span style={{ fontSize: '12px', fontWeight: 700, color: OPS.danger }}>Flagged, tap to add a photo</span>
  } else if (status === 'mismatch' || status === 'escalated') {
    chip = <span style={{ fontSize: '12px', fontWeight: 700, color: OPS.danger }}>Owner notified</span>
  } else {
    chip = (
      <span
        style={{
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: '#ffffff', backgroundColor: OPS.orange, borderRadius: '999px', padding: '7px 14px',
        }}
      >
        Deliver
      </span>
    )
  }

  return (
    <div
      onClick={() => tappable && onTap()}
      role={tappable ? 'button' : undefined}
      style={{
        backgroundColor: OPS.card,
        border: tappable && status !== 'mismatch'
          ? `2px solid ${OPS.orangeLine}`
          : `1px solid ${status === 'mismatch' || status === 'escalated' ? OPS.dangerLine : OPS.border}`,
        borderRadius: '20px',
        padding: '14px 16px',
        minHeight: '76px',
        display: 'flex', alignItems: 'center', gap: '14px',
        opacity: empty ? 0.45 : 1,
        cursor: tappable ? 'pointer' : 'default',
      }}
    >
      <div style={{ flexShrink: 0, display: 'flex' }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: OPS.navy, lineHeight: 1.2 }}>
          {dormInfo.displayName}
        </div>
        <div style={{ fontSize: '13px', color: OPS.muted, marginTop: '2px' }}>
          {empty ? 'Skip this one' : `${count} ${count === 1 ? 'box' : 'boxes'}`}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{chip}</div>
    </div>
  )
}

// ─── Nothing-to-do screen (Sunday, empty day) ───────────────────────────────

function IdleScreen({ title, sub, lastUpdated }: { title: string; sub?: string; lastUpdated: string }) {
  return (
    <div
      style={{
        minHeight: '100dvh', backgroundColor: OPS.bg, color: OPS.navy,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', fontFamily: OPS.font, padding: '20px 24px', gap: '10px',
      }}
    >
      <div style={{ fontSize: '22px', fontWeight: 800, textAlign: 'center', lineHeight: 1.3 }}>{title}</div>
      {sub && <div style={{ fontSize: '14px', color: OPS.muted, textAlign: 'center', lineHeight: 1.5 }}>{sub}</div>}
      <div style={{ fontSize: '12px', color: OPS.faint, marginTop: '8px' }}>Last updated {lastUpdated}</div>
    </div>
  )
}
