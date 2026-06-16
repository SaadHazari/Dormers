import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { validateOpsToken } from '@/contexts/ops/usecases/validate-token'
import { getDormCounts } from '@/contexts/ops/usecases/get-dorm-counts'
import { RiderClient } from './RiderClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Rider — Dormers',
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
    apple: [{ url: '/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
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

  // Sunday guard — no deliveries
  if (isSunday) {
    return (
      <RiderClient
        dormCounts={{}}
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
      opsTokenId={opsToken.id}
      deliveryDateIso={todayIso}
      lastUpdated={lastUpdated}
      noDeliveryReason={null}
    />
  )
}
