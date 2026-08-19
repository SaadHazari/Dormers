import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { validateOpsToken } from '@/contexts/ops/usecases/validate-token'
import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { dormShapeMap } from '@/shared/dorm-registry'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { RiderClient, type DormDropoffStatus } from './RiderClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  return {
    title: 'Rider — Dormers',
    // Per-token manifest so home-screen installs open THIS page, not '/'
    manifest: `/ops/${token}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'Dormers Rider',
    },
    other: {
      referrer: 'no-referrer',
      'apple-mobile-web-app-capable': 'yes', // belt-and-suspenders — iOS Safari still needs this
    },
    icons: {
      // Re-declare the tab favicon (not just the apple touch icon) — a page-level
      // `icons` REPLACES the root's entirely, so without this Safari would fall
      // back to a blank icon here. Must mirror src/app/layout.tsx exactly,
      // including the PNG-then-SVG order (see the comment there).
      icon: [
        { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
        { url: '/favicon-auto.svg', type: 'image/svg+xml' },
      ],
      apple: [{ url: '/icon-180.png', sizes: '180x180', type: 'image/png' }],
    },
  }
}

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export default async function OpsPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const opsToken = await validateOpsToken(token, 'rider')
  if (!opsToken) notFound()

  // All UAE time computation lives here in the RSC — never in client or action
  const AE_OFFSET_MS = 4 * 60 * 60 * 1000
  const aeNow = new Date(Date.now() + AE_OFFSET_MS)
  const aeDow = aeNow.getUTCDay()
  const isSunday = aeDow === 0
  const isSaturday = aeDow === 6
  const todayIso = aeNow.toISOString().slice(0, 10)
  const dayName = DAYS_OF_WEEK[isSunday ? 1 : aeDow]
  const lastUpdated = `${String(aeNow.getUTCHours()).padStart(2, '0')}:${String(aeNow.getUTCMinutes()).padStart(2, '0')}`

  const locs = await getDormLocations()
  const shapeMap = dormShapeMap(locs)

  // Sunday guard — no deliveries
  if (isSunday) {
    return (
      <RiderClient
        dormCounts={{}}
        dormShapeMap={shapeMap}
        opsTokenId={opsToken.id}
        deliveryDateIso={todayIso}
        lastUpdated={lastUpdated}
        noDeliveryReason="Sunday — no deliveries"
      />
    )
  }

  const dormCounts = await getDormCounts(todayIso, dayName, isSaturday)

  // ── Rehydrate the day in progress ─────────────────────────────────────────
  // The rider PWA reloads mid-run all the time (iOS evicts background pages).
  // Without this, a reload re-locks the day behind a pickup photo the rider
  // can no longer take and wipes the delivered-dorm checklist. The server
  // already holds both facts — pass them down as initial state.
  const sbAdmin = createAdminSupabaseClient()
  const [{ data: pickupRow }, { data: eventRows }] = await Promise.all([
    sbAdmin
      .from('ops_day_events')
      .select('matched')
      .eq('event_date', todayIso)
      .eq('event_type', 'rider_pickup')
      .maybeSingle(),
    sbAdmin
      .from('delivery_events')
      .select('dorm_name, verified, rider_count, gemini_count, delivered_at, escalated_at, verify_attempts')
      .eq('delivery_date', todayIso)
      .eq('trip_number', 1),
  ])

  const initialDormStatuses: Record<string, DormDropoffStatus> = {}
  const initialDormAttempts: Record<string, number> = {}
  for (const row of eventRows ?? []) {
    initialDormAttempts[row.dorm_name] = row.verify_attempts ?? 0

    // Only a genuinely finished drop-off comes back locked. A dorm that took
    // one unreadable photo and never came back must stay open — rehydrating
    // it as done was the reload half of the old lockout.
    if (row.verified) {
      initialDormStatuses[row.dorm_name] = 'verified'
    } else if (row.escalated_at) {
      // A count the AI actually produced is a mismatch (the rider may still
      // have a photo left); no count at all is an unreadable-photo escalation.
      initialDormStatuses[row.dorm_name] =
        row.gemini_count !== null ? 'mismatch' : 'escalated'
    } else if (row.delivered_at) {
      initialDormStatuses[row.dorm_name] = 'manual'
    }
  }

  return (
    <RiderClient
      dormCounts={dormCounts}
      dormShapeMap={shapeMap}
      opsTokenId={opsToken.id}
      deliveryDateIso={todayIso}
      lastUpdated={lastUpdated}
      noDeliveryReason={null}
      initialPickedUp={!!pickupRow}
      initialPickupFlagged={pickupRow?.matched === false}
      initialDormStatuses={initialDormStatuses}
      initialDormAttempts={initialDormAttempts}
    />
  )
}
