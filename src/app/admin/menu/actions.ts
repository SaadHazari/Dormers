'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { MENU_DATA } from '@/contexts/menu/domain/catalog-data'

type Result = { ok: boolean; message: string }

// Every surface that renders the CMS-backed catalog. The dashboard pages are
// force-dynamic (fresh on every load), but /dish/[id] is SSG'd and the
// marketing home is static — without these calls a dish rename would go live
// on the dashboard while the public dish page kept the stale name.
function revalidateMenuSurfaces() {
    revalidatePath('/admin/menu')
    revalidatePath('/dashboard/menu')
    revalidatePath('/dashboard')
    revalidatePath('/')
    revalidatePath('/dish/[id]', 'page')
    revalidatePath('/dashboard/menu/review/[week]', 'page')
    revalidatePath('/r/[cid]', 'page')
}

export async function seedMenuFromStatic(): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { count } = await sb.from('dishes').select('id', { count: 'exact', head: true })
    if ((count ?? 0) > 0) {
        return { ok: false, message: `Dishes table already has ${count} rows. Seed skipped to avoid duplicates.` }
    }

    // Insert the 4 menu weeks
    const weekRows = [
        { week_key: 'week1', label: 'Week 1', anchor_date: '2026-04-13' },
        { week_key: 'week2', label: 'Week 2', anchor_date: '2026-04-20' },
        { week_key: 'week3', label: 'Week 3', anchor_date: '2026-04-27' },
        { week_key: 'week4', label: 'Week 4', anchor_date: '2026-05-04' },
    ]
    const { data: weeks, error: weekErr } = await sb
        .from('menu_weeks')
        .upsert(weekRows, { onConflict: 'week_key' })
        .select('id, week_key')
    if (weekErr) return { ok: false, message: `Week insert failed: ${weekErr.message}` }

    const weekMap = new Map<string, string>()
    for (const w of weeks ?? []) weekMap.set(w.week_key as string, w.id as string)

    // Insert all 48 dishes
    const dishInserts = MENU_DATA.map(d => ({
        legacy_id: d.id,
        name: d.name,
        description: d.description,
        is_veg: d.isVeg,
        spice_level: d.spiceLevel,
        allergens: d.allergens,
        calories: d.nutrients.calories,
        protein: d.nutrients.protein,
        carbs: d.nutrients.carbs,
        fat: d.nutrients.fat,
        micro_nutrients: d.nutrients.microNutrients,
        image_path: typeof d.image === 'string' ? d.image : (d.image as { src: string }).src,
    }))

    const { data: dishes, error: dishErr } = await sb
        .from('dishes')
        .insert(dishInserts)
        .select('id, legacy_id')
    if (dishErr) return { ok: false, message: `Dish insert failed: ${dishErr.message}` }

    const dishMap = new Map<number, string>()
    for (const d of dishes ?? []) dishMap.set(d.legacy_id as number, d.id as string)

    // Insert week-meal slots
    const slotInserts = MENU_DATA.map(d => ({
        menu_week_id: weekMap.get(d.week)!,
        dish_id: dishMap.get(d.id)!,
        day_of_week: d.dayOfWeek,
        is_veg: d.isVeg,
        sort_order: 0,
    })).filter(s => s.menu_week_id && s.dish_id)

    const { error: slotErr } = await sb.from('week_meal_slots').insert(slotInserts)
    if (slotErr) return { ok: false, message: `Slot insert failed: ${slotErr.message}` }

    await logAdminAction(admin.email, 'seed_menu', 'menu', undefined, {
        dishes_count: dishInserts.length,
        weeks_count: weekRows.length,
        slots_count: slotInserts.length,
    })

    revalidatePath('/admin/menu')
    return { ok: true, message: `Seeded ${dishInserts.length} dishes, 4 weeks, ${slotInserts.length} slots from static data.` }
}

export async function updateDish(
    dishId: string,
    updates: {
        name?: string
        description?: string
        is_veg?: boolean
        spice_level?: number
        allergens?: string[]
        calories?: string
        protein?: string
        carbs?: string
        fat?: string
        is_active?: boolean
    },
): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { error } = await sb
        .from('dishes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', dishId)

    if (error) return { ok: false, message: error.message }

    await logAdminAction(admin.email, 'update_dish', 'dish', dishId, updates)
    revalidateMenuSurfaces()
    return { ok: true, message: 'Dish updated' }
}

export async function toggleDishActive(dishId: string, isActive: boolean): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { error } = await sb
        .from('dishes')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', dishId)

    if (error) return { ok: false, message: error.message }

    await logAdminAction(admin.email, isActive ? 'activate_dish' : 'deactivate_dish', 'dish', dishId)
    revalidateMenuSurfaces()
    return { ok: true, message: isActive ? 'Dish activated' : 'Dish deactivated' }
}

export async function uploadDishImage(
    dishId: string,
    formData: FormData,
): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const file = formData.get('file') as File | null
    if (!file) return { ok: false, message: 'No file provided' }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const storagePath = `${dishId}.${ext}`

    const { error: uploadErr } = await sb.storage
        .from('dish-photos')
        .upload(storagePath, file, { upsert: true, contentType: file.type })

    if (uploadErr) {
        console.error('uploadDishImage: storage upload failed', uploadErr)
        return { ok: false, message: uploadErr.message }
    }

    const { data: urlData } = sb.storage
        .from('dish-photos')
        .getPublicUrl(storagePath)

    const publicUrl = urlData.publicUrl

    const { error: dbErr } = await sb
        .from('dishes')
        .update({ image_path: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', dishId)

    if (dbErr) {
        console.error('uploadDishImage: DB update failed', dbErr)
        return { ok: false, message: dbErr.message }
    }

    await logAdminAction(admin.email, 'upload_dish_image', 'dish', dishId, {
        storagePath, publicUrl,
    })

    revalidateMenuSurfaces()
    return { ok: true, message: `Image uploaded and saved for dish` }
}

export async function assignDishToSlot(
    menuWeekId: string,
    dishId: string,
    dayOfWeek: number,
    isVeg: boolean,
): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { error } = await sb
        .from('week_meal_slots')
        .upsert(
            { menu_week_id: menuWeekId, dish_id: dishId, day_of_week: dayOfWeek, is_veg: isVeg, sort_order: 0 },
            { onConflict: 'menu_week_id,day_of_week,is_veg' },
        )

    if (error) return { ok: false, message: error.message }

    await logAdminAction(admin.email, 'assign_dish_to_slot', 'week_meal_slot', menuWeekId, {
        dishId, dayOfWeek, isVeg,
    })
    revalidateMenuSurfaces()
    return { ok: true, message: 'Slot updated' }
}

/** Empty a rotation slot — that day/lane will render no dish until refilled. */
export async function clearSlot(
    menuWeekId: string,
    dayOfWeek: number,
    isVeg: boolean,
): Promise<Result> {
    const admin = await requireAdmin()
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 5) {
        return { ok: false, message: 'Invalid day' }
    }
    const sb = createAdminSupabaseClient()

    const { error } = await sb
        .from('week_meal_slots')
        .delete()
        .eq('menu_week_id', menuWeekId)
        .eq('day_of_week', dayOfWeek)
        .eq('is_veg', isVeg)

    if (error) return { ok: false, message: error.message }

    await logAdminAction(admin.email, 'clear_slot', 'week_meal_slot', menuWeekId, { dayOfWeek, isVeg })
    revalidateMenuSurfaces()
    return { ok: true, message: 'Slot cleared' }
}

/** Swap the dishes of two existing slots (e.g. Butter Chicken Mon ↔ Biryani Sat). */
export async function swapSlotDishes(slotIdA: string, slotIdB: string): Promise<Result> {
    const admin = await requireAdmin()
    if (slotIdA === slotIdB) return { ok: false, message: 'Pick two different slots to swap' }
    const sb = createAdminSupabaseClient()

    const { data: rows, error: readErr } = await sb
        .from('week_meal_slots')
        .select('id, dish_id')
        .in('id', [slotIdA, slotIdB])
    if (readErr) return { ok: false, message: readErr.message }

    const a = rows?.find(r => r.id === slotIdA)
    const b = rows?.find(r => r.id === slotIdB)
    if (!a || !b) return { ok: false, message: 'One of the slots no longer exists — refresh and try again' }

    const { error: errA } = await sb.from('week_meal_slots').update({ dish_id: b.dish_id }).eq('id', a.id)
    if (errA) return { ok: false, message: errA.message }

    const { error: errB } = await sb.from('week_meal_slots').update({ dish_id: a.dish_id }).eq('id', b.id)
    if (errB) {
        // Restore A so a half-swap never leaves the same dish on both days.
        await sb.from('week_meal_slots').update({ dish_id: a.dish_id }).eq('id', a.id)
        return { ok: false, message: errB.message }
    }

    await logAdminAction(admin.email, 'swap_slot_dishes', 'week_meal_slot', slotIdA, { with: slotIdB })
    revalidateMenuSurfaces()
    return { ok: true, message: 'Dishes swapped' }
}

/** Move a slot's dish to another day/lane, leaving the source slot empty. */
export async function moveSlotDish(
    fromSlotId: string,
    toWeekId: string,
    toDayOfWeek: number,
    toIsVeg: boolean,
): Promise<Result> {
    const admin = await requireAdmin()
    if (!Number.isInteger(toDayOfWeek) || toDayOfWeek < 0 || toDayOfWeek > 5) {
        return { ok: false, message: 'Invalid day' }
    }
    const sb = createAdminSupabaseClient()

    const { data: from, error: readErr } = await sb
        .from('week_meal_slots')
        .select('id, dish_id, menu_week_id, day_of_week, is_veg')
        .eq('id', fromSlotId)
        .maybeSingle()
    if (readErr) return { ok: false, message: readErr.message }
    if (!from) return { ok: false, message: 'Source slot no longer exists — refresh and try again' }
    if (
        from.menu_week_id === toWeekId &&
        Number(from.day_of_week) === toDayOfWeek &&
        Boolean(from.is_veg) === toIsVeg
    ) {
        return { ok: true, message: 'Dish is already in that slot' }
    }

    const { error: upErr } = await sb
        .from('week_meal_slots')
        .upsert(
            { menu_week_id: toWeekId, dish_id: from.dish_id, day_of_week: toDayOfWeek, is_veg: toIsVeg, sort_order: 0 },
            { onConflict: 'menu_week_id,day_of_week,is_veg' },
        )
    if (upErr) return { ok: false, message: upErr.message }

    const { error: delErr } = await sb.from('week_meal_slots').delete().eq('id', from.id)
    if (delErr) return { ok: false, message: `Dish placed, but the old slot was not cleared: ${delErr.message}` }

    await logAdminAction(admin.email, 'move_slot_dish', 'week_meal_slot', from.id, {
        dishId: from.dish_id, toWeekId, toDayOfWeek, toIsVeg,
    })
    revalidateMenuSurfaces()
    return { ok: true, message: 'Dish moved' }
}

/** Add a brand-new dish to the catalog (unslotted until assigned). */
export async function createDish(input: {
    name: string
    description: string
    is_veg: boolean
    spice_level: number
    allergens: string[]
    calories: string
    protein: string
    carbs: string
    fat: string
}): Promise<Result & { dishId?: string }> {
    const admin = await requireAdmin()

    const name = input.name?.trim()
    if (!name) return { ok: false, message: 'Dish name is required' }
    const spice = Math.round(input.spice_level)
    if (!Number.isFinite(spice) || spice < 1 || spice > 3) {
        return { ok: false, message: 'Spice level must be between 1 and 3' }
    }

    const sb = createAdminSupabaseClient()

    // Every dish gets a real legacy_id: the catalog assigns NULL-legacy_id rows
    // synthetic ids by read order, which would shuffle /dish/{id} URLs (and any
    // printed QR codes) between loads. max+1 keeps the public id permanent.
    const { data: maxRow, error: maxErr } = await sb
        .from('dishes')
        .select('legacy_id')
        .not('legacy_id', 'is', null)
        .order('legacy_id', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (maxErr) return { ok: false, message: maxErr.message }
    const legacyId = ((maxRow?.legacy_id as number | null) ?? 0) + 1

    const { data: created, error } = await sb
        .from('dishes')
        .insert({
            legacy_id: legacyId,
            name,
            description: input.description?.trim() ?? '',
            is_veg: input.is_veg,
            spice_level: spice,
            allergens: input.allergens.map(a => a.trim()).filter(Boolean),
            calories: input.calories?.trim() ?? '',
            protein: input.protein?.trim() ?? '',
            carbs: input.carbs?.trim() ?? '',
            fat: input.fat?.trim() ?? '',
            micro_nutrients: [],
            is_active: true,
        })
        .select('id')
        .single()
    if (error) return { ok: false, message: error.message }

    await logAdminAction(admin.email, 'create_dish', 'dish', created.id as string, { legacyId, name })
    revalidateMenuSurfaces()
    return { ok: true, message: `"${name}" added — now upload a photo and assign it to a day`, dishId: created.id as string }
}

/**
 * Promote an AI recipe draft to the live recipe the kitchen reads.
 * The draft was produced by /api/admin/recipes/generate and reviewed in the
 * dish editor — this is the only path that writes dishes.recipe from a draft.
 */
export async function approveRecipeDraft(dishId: string): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { data: dish, error: readErr } = await sb
        .from('dishes')
        .select('id, name, recipe_draft')
        .eq('id', dishId)
        .maybeSingle()
    if (readErr) return { ok: false, message: readErr.message }
    if (!dish?.recipe_draft) return { ok: false, message: 'No draft to approve — generate one first.' }

    const { error } = await sb
        .from('dishes')
        .update({ recipe: dish.recipe_draft, recipe_draft: null, updated_at: new Date().toISOString() })
        .eq('id', dishId)
    if (error) return { ok: false, message: error.message }

    await logAdminAction(admin.email, 'approve_recipe_draft', 'dish', dishId, { dishName: dish.name })
    revalidateMenuSurfaces()
    return { ok: true, message: 'Recipe approved — the kitchen sees it from today.' }
}

/** Throw away an AI recipe draft. The live recipe is untouched. */
export async function discardRecipeDraft(dishId: string): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { error } = await sb
        .from('dishes')
        .update({ recipe_draft: null, updated_at: new Date().toISOString() })
        .eq('id', dishId)
    if (error) return { ok: false, message: error.message }

    await logAdminAction(admin.email, 'discard_recipe_draft', 'dish', dishId)
    revalidateMenuSurfaces()
    return { ok: true, message: 'Draft discarded' }
}

/** Toggle the proprietary lock — locked recipes cannot be AI-regenerated. */
export async function setRecipeLocked(dishId: string, locked: boolean): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { error } = await sb
        .from('dishes')
        .update({ recipe_locked: locked, updated_at: new Date().toISOString() })
        .eq('id', dishId)
    if (error) return { ok: false, message: error.message }

    await logAdminAction(admin.email, locked ? 'lock_recipe' : 'unlock_recipe', 'dish', dishId)
    revalidateMenuSurfaces()
    return { ok: true, message: locked ? 'Recipe locked as proprietary' : 'Recipe unlocked' }
}

/** Permanently delete a dish. Blocked by FK while it's still slotted anywhere. */
export async function deleteDish(dishId: string): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { error } = await sb.from('dishes').delete().eq('id', dishId)
    if (error) {
        if (error.code === '23503') {
            return { ok: false, message: 'This dish is still on the rotation — clear its slots first, then delete.' }
        }
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, 'delete_dish', 'dish', dishId)
    revalidateMenuSurfaces()
    return { ok: true, message: 'Dish deleted' }
}
