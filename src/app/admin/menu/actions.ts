'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { MENU_DATA } from '@/contexts/menu/domain/catalog-data'

type Result = { ok: boolean; message: string }

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
    revalidatePath('/admin/menu')
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
    revalidatePath('/admin/menu')
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

    revalidatePath('/admin/menu')
    revalidatePath('/dashboard/menu')
    revalidatePath('/')
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
    revalidatePath('/admin/menu')
    return { ok: true, message: 'Slot updated' }
}
