import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { validateOpsToken } from '@/contexts/ops/usecases/validate-token'
import { findDishForDateWithOverrides } from '@/infra/supabase/menu-catalog'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { getKitchenCounts } from '@/contexts/ops/usecases/get-kitchen-counts'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { dormShapeMap } from '@/shared/dorm-registry'
import { captureError } from '@/infra/logging/capture-error'
import type { PackingProps } from './KitchenClient'
import type { RecipeJson } from './KitchenClient'
import { KitchenClient } from './KitchenClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  return {
    title: 'Kitchen — Dormers',
    // Per-token manifest so home-screen installs open THIS page, not '/'
    manifest: `/kitchen/${token}/manifest.webmanifest`,
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
        countsUnavailable={false}
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

  // Packing-check context: dorm shapes for the blind per-shape count entry,
  // plus today's saved check (if any) so the state survives a reload.
  // Best-effort — a failure here degrades to "no packing card", never a crash.
  let packing: PackingProps | null = null
  try {
    const locs = await getDormLocations()
    const shapeMap = dormShapeMap(locs)
    const sbPacking = createAdminSupabaseClient()
    const { data: packingRow } = await sbPacking
      .from('ops_day_events')
      .select('matched, mismatch_details, confirmed_at')
      .eq('event_date', todayIso)
      .eq('event_type', 'kitchen_packing')
      .maybeSingle()

    let confirmedAtLabel = ''
    if (packingRow?.confirmed_at) {
      const ae = new Date(new Date(packingRow.confirmed_at).getTime() + AE_OFFSET_MS)
      confirmedAtLabel = `${String(ae.getUTCHours()).padStart(2, '0')}:${String(ae.getUTCMinutes()).padStart(2, '0')}`
    }

    packing = {
      dorms: Object.entries(shapeMap)
        .filter(([key]) => key !== 'Other')
        .map(([key, info]) => ({
          key,
          displayName: info.displayName,
          shape: info.shape,
          number: info.number,
        })),
      opsTokenId: opsToken.id,
      dateIso: todayIso,
      existing: packingRow
        ? {
            confirmedAtLabel,
            matched: packingRow.matched as boolean | null,
            mismatchDetails: packingRow.mismatch_details as string | null,
          }
        : null,
    }
  } catch (err) {
    captureError(err, { area: 'kitchen', op: 'loadPackingContext', todayIso })
  }

  // Fetch recipes separately — recipe column is not in menu-catalog's DishRow.
  // Best-effort (Release It! L5): a DB blip here must degrade to "dish cards
  // without tap-for-recipe", never throw the whole kitchen screen into the
  // error boundary. The dish + count data above has already loaded.
  const sb = createAdminSupabaseClient()
  const dishNames = [vegDish?.name, nonVegDish?.name].filter(
    Boolean,
  ) as string[]
  let recipeRows: Array<{ name: string; recipe: RecipeJson | null }> = []
  if (dishNames.length > 0) {
    try {
      const { data, error } = await sb
        .from('dishes')
        .select('name, recipe')
        .in('name', dishNames)
      if (error) throw error
      recipeRows = (data ?? []) as Array<{
        name: string
        recipe: RecipeJson | null
      }>
    } catch (err) {
      captureError(err, {
        area: 'kitchen',
        op: 'fetchRecipes',
        dishNames: dishNames.join(','),
      })
    }
  }
  const recipeMap = new Map(
    recipeRows.map((r) => [r.name, r.recipe as RecipeJson | null]),
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
      countsUnavailable={counts.unavailable}
      isPast2pm={isPast2pm}
      lastUpdated={lastUpdated}
      noDeliveryReason={null}
      packing={packing}
    />
  )
}
