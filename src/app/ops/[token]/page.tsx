import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { validateOpsToken } from '@/contexts/ops/usecases/validate-token'
import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { dormShapeMap } from '@/shared/dorm-registry'
import { RiderClient } from './RiderClient'

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
      // `icons` REPLACES the root's entirely, so without this Safari/no-JS would
      // fall back to a blank icon here. Mirrors src/app/layout.tsx; the live
      // navy↔cream swap on Chromium/Firefox still comes from the root <body> script.
      icon: [
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
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

  return (
    <RiderClient
      dormCounts={dormCounts}
      dormShapeMap={shapeMap}
      opsTokenId={opsToken.id}
      deliveryDateIso={todayIso}
      lastUpdated={lastUpdated}
      noDeliveryReason={null}
    />
  )
}
