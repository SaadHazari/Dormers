import { MENU_DATA } from '@/contexts/menu/domain/catalog-data'
import QrCodesClient from './QrCodesClient'

export const metadata = { title: 'QR Codes — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default function QrCodesPage() {
  const dishes = MENU_DATA.map(d => ({
    id: d.id,
    name: d.name,
    week: d.week,
    isVeg: d.isVeg,
    dayOfWeek: d.dayOfWeek,
  }))
  return <QrCodesClient dishes={dishes} />
}
