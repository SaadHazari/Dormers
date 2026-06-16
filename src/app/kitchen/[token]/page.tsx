import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { validateOpsToken } from '@/contexts/ops/usecases/validate-token'
import { findDishForDateWithOverrides } from '@/infra/supabase/menu-catalog'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { getKitchenCounts } from '@/contexts/ops/usecases/get-kitchen-counts'
import type { RecipeJson } from './KitchenClient'
import { KitchenClient } from './KitchenClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Kitchen — Dormers',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Dormers Kitchen',
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

export default async function KitchenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const opsToken = await validateOpsToken(token, 'kitchen')
  if (!opsToken) notFound()

  // All UAE time computation lives here in the RSC (KIT-05)
  const AE_OFFSET_MS = 4 * 60 * 60 * 1000
  const aeNow = new Date(Date.now() + AE_OFFSET_MS)
  const aeDow = aeNow.getUTCDay()
  const isSunday = aeDow === 0
  const isSaturday = aeDow === 6
  const aeHour = aeNow.getUTCHours()
  const isPast2pm = aeHour >= 14
  const todayIso = aeNow.toISOString().slice(0, 10)
  const dayName = DAYS_OF_WEEK[isSunday ? 1 : aeDow]
  const lastUpdated = `${String(aeNow.getUTCHours()).padStart(2, '0')}:${String(aeNow.getUTCMinutes()).padStart(2, '0')}`

  if (isSunday) {
    return (
      <KitchenClient
        dishes={[]}
        vegCount={0}
        nonVegCount={0}
        isPast2pm={false}
        lastUpdated={lastUpdated}
        noDeliveryReason="Sunday — no deliveries"
      />
    )
  }

  const [vegDish, nonVegDish, counts] = await Promise.all([
    findDishForDateWithOverrides(aeNow, true),
    findDishForDateWithOverrides(aeNow, false),
    getKitchenCounts(todayIso, dayName, isSaturday),
  ])

  // Fetch recipes separately — recipe column is not in menu-catalog's DishRow
  const sb = createAdminSupabaseClient()
  const dishNames = [vegDish?.name, nonVegDish?.name].filter(Boolean) as string[]
  const { data: recipeRows } = dishNames.length > 0
    ? await sb.from('dishes').select('name, recipe').in('name', dishNames)
    : { data: [] as Array<{ name: string; recipe: RecipeJson | null }> }
  const recipeMap = new Map(
    (recipeRows ?? []).map(r => [r.name, r.recipe as RecipeJson | null]),
  )

  const dishes = [
    vegDish
      ? {
          name: vegDish.name,
          image: typeof vegDish.image === 'string' ? vegDish.image : '',
          isVeg: true,
          recipe: recipeMap.get(vegDish.name) ?? null,
          mealCount: counts.vegCount,
        }
      : null,
    nonVegDish
      ? {
          name: nonVegDish.name,
          image: typeof nonVegDish.image === 'string' ? nonVegDish.image : '',
          isVeg: false,
          recipe: recipeMap.get(nonVegDish.name) ?? null,
          mealCount: counts.nonVegCount,
        }
      : null,
  ].filter((d): d is NonNullable<typeof d> => d !== null)

  return (
    <KitchenClient
      dishes={dishes}
      vegCount={counts.vegCount}
      nonVegCount={counts.nonVegCount}
      isPast2pm={isPast2pm}
      lastUpdated={lastUpdated}
      noDeliveryReason={null}
    />
  )
}
