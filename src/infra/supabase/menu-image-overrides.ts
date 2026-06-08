import { cache } from 'react'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { MENU_DATA, getMenuWeek, type Dish, type Week } from '@/contexts/menu/domain/catalog-data'

type DishImageOverride = { legacy_id: number; image_path: string | null }

const fetchImageOverrides = cache(async (): Promise<Map<number, string>> => {
    const sb = createAdminSupabaseClient()
    const { data } = await sb
        .from('dishes')
        .select('legacy_id, image_path')
        .not('image_path', 'is', null)

    const map = new Map<number, string>()
    for (const row of (data ?? []) as DishImageOverride[]) {
        if (row.legacy_id != null && row.image_path) {
            map.set(row.legacy_id, row.image_path)
        }
    }
    return map
})

function applyOverrides(dishes: Dish[], overrides: Map<number, string>): Dish[] {
    if (overrides.size === 0) return dishes
    return dishes.map(d => {
        const override = overrides.get(d.id)
        if (!override) return d
        return { ...d, image: override }
    })
}

export async function getMenuDishes(): Promise<Dish[]> {
    const overrides = await fetchImageOverrides()
    return applyOverrides(MENU_DATA, overrides)
}

export async function getMenuDishesForWeek(week?: Week): Promise<Dish[]> {
    const all = await getMenuDishes()
    const w = week ?? getMenuWeek()
    return all.filter(d => d.week === w)
}

export async function findDishForDateWithOverrides(date: Date, isVeg: boolean): Promise<Dish | null> {
    const jsDow = date.getUTCDay()
    if (jsDow === 0) return null
    const dayOfWeek = jsDow - 1
    const week = getMenuWeek(date)
    const all = await getMenuDishes()
    return all.find(d => d.week === week && d.dayOfWeek === dayOfWeek && d.isVeg === isVeg) ?? null
}
