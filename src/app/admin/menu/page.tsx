import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { MenuCmsClient } from './MenuCmsClient'

export const metadata = { title: 'Menu CMS — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function MenuCmsPage() {
    const sb = createAdminSupabaseClient()

    const [dishesRes, weeksRes, slotsRes] = await Promise.all([
        sb.from('dishes')
            .select('id, legacy_id, name, description, is_veg, spice_level, allergens, calories, protein, carbs, fat, micro_nutrients, image_path, is_active, created_at')
            .order('legacy_id', { ascending: true }),
        sb.from('menu_weeks')
            .select('id, week_key, label, anchor_date, is_active')
            .order('week_key'),
        sb.from('week_meal_slots')
            .select('id, menu_week_id, dish_id, day_of_week, is_veg, sort_order')
            .order('day_of_week'),
    ])

    return (
        <MenuCmsClient
            dishes={(dishesRes.data ?? []) as Array<Record<string, unknown>>}
            weeks={(weeksRes.data ?? []) as Array<Record<string, unknown>>}
            slots={(slotsRes.data ?? []) as Array<Record<string, unknown>>}
        />
    )
}
