import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { fetchActivePriceOverrides } from '@/infra/supabase/pricing-repo'
import { pricePerMeal, PLAN_ID_BY_KEBAB } from '@/contexts/subscriptions/domain/pricing'
import { PricingClient, type EffectiveRow, type ReligiousPlanRow, type PricingRow } from './PricingClient'

export const metadata = { title: 'Pricing — Dormers Admin' }
export const dynamic = 'force-dynamic'

// Display order — most expensive commitment first, mirroring the old table.
const PLAN_ORDER = ['monthly-max', 'monthly-premium', 'weekly-flex', 'trial'] as const

export default async function PricingPage() {
    const sb = createAdminSupabaseClient()

    const [{ data }, overrides] = await Promise.all([
        sb.from('plan_pricing')
            .select('*')
            .order('plan_id')
            .order('effective_from', { ascending: false }),
        fetchActivePriceOverrides(),
    ])

    const rows = (data ?? []) as PricingRow[]

    // Effective Veg/NonVeg table — derived from the SAME engine customers
    // are priced by (code defaults + active plan_pricing rows). Nothing here
    // is hand-copied, so this table can never drift from production again.
    const effective: EffectiveRow[] = PLAN_ORDER.flatMap(kebab => {
        const display = PLAN_ID_BY_KEBAB[kebab]
        return (['Veg', 'NonVeg'] as const).map(pref => ({
            plan: kebab,
            pref,
            codeDefault: pricePerMeal(display, pref, 3, '6DAYS'),
            effective: pricePerMeal(display, pref, 3, '6DAYS', overrides),
        }))
    })

    // Religious mix — per-meal price slides with the veg-day count (1..5 on
    // the 6DAYS week; 5DAYS customers use counts 1..4 of the same table).
    // Trial Religious is a flat price, shown as a single cell.
    const religious: ReligiousPlanRow[] = PLAN_ORDER.map(kebab => {
        const display = PLAN_ID_BY_KEBAB[kebab]
        const counts = kebab === 'trial' ? [3] : [1, 2, 3, 4, 5]
        return {
            plan: kebab,
            flat: kebab === 'trial',
            cells: counts.map(count => ({
                count,
                codeDefault: pricePerMeal(display, 'Religious', count, '6DAYS'),
                effective: pricePerMeal(display, 'Religious', count, '6DAYS', overrides),
            })),
        }
    })

    return <PricingClient rows={rows} effective={effective} religious={religious} />
}
