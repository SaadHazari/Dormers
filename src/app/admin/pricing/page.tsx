import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { PricingClient } from './PricingClient'

export const metadata = { title: 'Pricing — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function PricingPage() {
    const sb = createAdminSupabaseClient()

    const { data } = await sb
        .from('plan_pricing')
        .select('*')
        .order('plan_id')
        .order('effective_from', { ascending: false })

    const rows = (data ?? []) as Array<{
        id: string
        plan_id: string
        preference: string
        week_type: string
        veg_day_count: number | null
        price_per_meal: number
        effective_from: string
        effective_to: string | null
        created_by: string | null
        created_at: string
    }>

    return <PricingClient rows={rows} />
}
