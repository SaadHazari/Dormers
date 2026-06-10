import { getMenuDishes } from '@/infra/supabase/menu-catalog'
import QrCodesClient from './QrCodesClient'

export const metadata = { title: 'QR Codes — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function QrCodesPage() {
  // CMS-backed catalog — QR sheets print the admin-edited dish names, not
  // the names frozen in catalog-data.ts.
  const allDishes = await getMenuDishes()
  const dishes = allDishes.map(d => ({
    id: d.id,
    name: d.name,
    week: d.week,
    isVeg: d.isVeg,
    dayOfWeek: d.dayOfWeek,
  }))
  return <QrCodesClient dishes={dishes} />
}
