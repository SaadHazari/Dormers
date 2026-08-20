'use client'

// Scenario picker + fixture props for the rider PWA preview.
// Pick a scenario with ?s=<name>: pickup | run | run-mid | done | done-flagged
// | sunday | empty. Defaults to pickup.

import { useEffect, useState } from 'react'
import { DORM_SHAPE_MAP } from '@/shared/dorm-shapes'
import { RiderClient, type DormDropoffStatus } from '../../ops/[token]/RiderClient'

const COUNTS: Record<string, number> = {
  'The Myriad': 3,
  'KSK Homes': 2,
  'Yugo': 4,
  // Above DROPOFF_STACK_THRESHOLD, so its sheet exercises stack mode.
  'DSOA Residence': 12,
  'Study World': 0,
}

interface Scenario {
  noDeliveryReason: string | null
  dormCounts: Record<string, number>
  initialPickedUp: boolean
  initialPickupFlagged: boolean
  initialDormStatuses: Record<string, DormDropoffStatus>
  initialDormAttempts: Record<string, number>
}

const SCENARIOS: Record<string, Scenario> = {
  pickup: {
    noDeliveryReason: null, dormCounts: COUNTS,
    initialPickedUp: false, initialPickupFlagged: false,
    initialDormStatuses: {}, initialDormAttempts: {},
  },
  run: {
    noDeliveryReason: null, dormCounts: COUNTS,
    initialPickedUp: true, initialPickupFlagged: false,
    initialDormStatuses: {}, initialDormAttempts: {},
  },
  'run-mid': {
    noDeliveryReason: null, dormCounts: COUNTS,
    initialPickedUp: true, initialPickupFlagged: true,
    initialDormStatuses: { 'The Myriad': 'verified', 'KSK Homes': 'mismatch' },
    initialDormAttempts: { 'The Myriad': 1, 'KSK Homes': 1 },
  },
  done: {
    noDeliveryReason: null, dormCounts: COUNTS,
    initialPickedUp: true, initialPickupFlagged: false,
    initialDormStatuses: {
      'The Myriad': 'verified', 'KSK Homes': 'verified', 'Yugo': 'verified', 'DSOA Residence': 'verified',
    },
    initialDormAttempts: { 'The Myriad': 1, 'KSK Homes': 1, 'Yugo': 1, 'DSOA Residence': 2 },
  },
  'done-flagged': {
    noDeliveryReason: null, dormCounts: COUNTS,
    initialPickedUp: true, initialPickupFlagged: true,
    initialDormStatuses: {
      'The Myriad': 'verified', 'KSK Homes': 'mismatch', 'Yugo': 'manual', 'DSOA Residence': 'escalated',
    },
    initialDormAttempts: { 'The Myriad': 1, 'KSK Homes': 1, 'Yugo': 2, 'DSOA Residence': 2 },
  },
  sunday: {
    noDeliveryReason: 'Sunday, no deliveries', dormCounts: {},
    initialPickedUp: false, initialPickupFlagged: false,
    initialDormStatuses: {}, initialDormAttempts: {},
  },
  empty: {
    noDeliveryReason: null, dormCounts: { 'The Myriad': 0 },
    initialPickedUp: false, initialPickupFlagged: false,
    initialDormStatuses: {}, initialDormAttempts: {},
  },
}

export function PreviewClient() {
  const [scenario, setScenario] = useState<string | null>(null)

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('s') ?? 'pickup'
    setScenario(SCENARIOS[s] ? s : 'pickup')
  }, [])

  if (!scenario) return null
  const s = SCENARIOS[scenario]

  return (
    <RiderClient
      key={scenario}
      dormCounts={s.dormCounts}
      dormShapeMap={DORM_SHAPE_MAP}
      opsTokenId="preview-token"
      deliveryDateIso="2026-08-20"
      lastUpdated="17:30"
      noDeliveryReason={s.noDeliveryReason}
      initialPickedUp={s.initialPickedUp}
      initialPickupFlagged={s.initialPickupFlagged}
      initialDormStatuses={s.initialDormStatuses}
      initialDormAttempts={s.initialDormAttempts}
      confirmDropoffAction={async () => ({ ok: true })}
    />
  )
}
