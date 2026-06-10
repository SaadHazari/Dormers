/**
 * Menu catalog loader — the DB half of "the menu CMS is the single source
 * of truth".
 *
 * Formerly menu-image-overrides.ts, which only overlaid photo URLs onto the
 * static MENU_DATA array — admin edits to names, descriptions, nutrition,
 * spice, allergens, and slot assignments wrote to the DB but never reached
 * customers. This module now builds the ENTIRE catalog from the CMS tables
 * (menu_weeks → week_meal_slots → dishes), so every field the admin edits
 * at /admin/menu is what customers, kitchen labels, and QR codes see.
 *
 * Static MENU_DATA remains as the fallback when the DB is unseeded or
 * unreachable (fail-open: a DB blip degrades to the shipped menu, never a
 * blank page) and as the per-field backstop for NULL columns.
 *
 * `dishes.is_active` is a catalog flag for the CMS assignment picker — a
 * slotted dish renders regardless, because hiding it would leave a hole in
 * the customer's week. Unslot it in the CMS to remove it from the menu.
 */

import { cache } from 'react'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { MENU_DATA, getMenuWeek, type Dish, type Week } from '@/contexts/menu/domain/catalog-data'

type DishRow = {
    id: string
    legacy_id: number | null
    name: string | null
    description: string | null
    spice_level: number | null
    allergens: string[] | null
    calories: string | null
    protein: string | null
    carbs: string | null
    fat: string | null
    micro_nutrients: unknown
    image_path: string | null
}

const WEEK_KEYS = new Set<string>(['week1', 'week2', 'week3', 'week4'])

const loadCatalog = cache(async (): Promise<Dish[]> => {
    try {
        const sb = createAdminSupabaseClient()
        // Three flat reads joined in JS — avoids PostgREST embed-name coupling
        // and keeps each query trivially cacheable.
        const [slotsRes, dishesRes, weeksRes] = await Promise.all([
            sb.from('week_meal_slots').select('menu_week_id, dish_id, day_of_week, is_veg'),
            sb.from('dishes').select('id, legacy_id, name, description, spice_level, allergens, calories, protein, carbs, fat, micro_nutrients, image_path'),
            sb.from('menu_weeks').select('id, week_key'),
        ])
        const firstError = slotsRes.error ?? dishesRes.error ?? weeksRes.error
        if (firstError) throw new Error(firstError.message)

        const slots = slotsRes.data ?? []
        const dishes = (dishesRes.data ?? []) as DishRow[]
        const weeks = weeksRes.data ?? []
        // Unseeded DB → ship the static menu (the CMS seed action fills these).
        if (slots.length === 0 || dishes.length === 0 || weeks.length === 0) return MENU_DATA

        const weekById = new Map(weeks.map(w => [w.id as string, w.week_key as string]))
        const dishById = new Map(dishes.map(d => [d.id, d]))
        const staticById = new Map(MENU_DATA.map(d => [d.id, d]))

        const catalog: Dish[] = []
        let syntheticId = 1000 // CMS-created dishes without a legacy_id still need a stable-ish route id
        for (const s of slots) {
            const weekKey = weekById.get(s.menu_week_id as string)
            const d = dishById.get(s.dish_id as string)
            if (!weekKey || !WEEK_KEYS.has(weekKey) || !d) continue
            const fallback = d.legacy_id != null ? staticById.get(d.legacy_id) : undefined

            const spiceRaw = d.spice_level ?? fallback?.spiceLevel ?? 1
            const spiceLevel = Math.min(3, Math.max(1, Math.round(spiceRaw))) as Dish['spiceLevel']

            catalog.push({
                id: d.legacy_id ?? syntheticId++,
                name: d.name ?? fallback?.name ?? 'Dish',
                week: weekKey as Week,
                description: d.description ?? fallback?.description ?? '',
                image: d.image_path ?? fallback?.image ?? '',
                // The SLOT decides which lane (veg/non-veg) this dish serves —
                // that's the customer-meaningful flag, mirroring MENU_DATA.
                isVeg: Boolean(s.is_veg),
                dayOfWeek: Number(s.day_of_week),
                spiceLevel,
                allergens: (d.allergens ?? fallback?.allergens ?? []) as Dish['allergens'],
                nutrients: {
                    calories: d.calories ?? fallback?.nutrients.calories ?? '',
                    protein: d.protein ?? fallback?.nutrients.protein ?? '',
                    carbs: d.carbs ?? fallback?.nutrients.carbs ?? '',
                    fat: d.fat ?? fallback?.nutrients.fat ?? '',
                    microNutrients: Array.isArray(d.micro_nutrients)
                        ? (d.micro_nutrients as Dish['nutrients']['microNutrients'])
                        : fallback?.nutrients.microNutrients ?? [],
                },
            })
        }
        if (catalog.length === 0) return MENU_DATA

        // Stable render order: week → day → non-veg-first (matches MENU_DATA).
        catalog.sort((a, b) =>
            a.week.localeCompare(b.week) || a.dayOfWeek - b.dayOfWeek || Number(a.isVeg) - Number(b.isVeg))
        return catalog
    } catch (err) {
        console.error('menu catalog DB load failed — falling back to static MENU_DATA:', err)
        return MENU_DATA
    }
})

/** Full catalog, CMS-edited fields included. Same shape as MENU_DATA. */
export async function getMenuDishes(): Promise<Dish[]> {
    return loadCatalog()
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
