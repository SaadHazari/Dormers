import { getDailyLabels } from './data'
import LabelsClient from './LabelsClient'

export const metadata = { title: 'Labels — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function LabelsPage() {
  const daily = await getDailyLabels()
  return (
    <LabelsClient
      dateIso={daily.dateIso}
      dayName={daily.dayName}
      labels={daily.labels}
      noDeliveryReason={daily.noDeliveryReason}
    />
  )
}
