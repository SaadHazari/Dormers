'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { captureError } from '@/infra/logging/capture-error'

type Result = { ok: boolean; message: string }

const VALID_PLANS = ['monthly-max', 'monthly-premium', 'weekly-flex', 'trial']
const VALID_PREFS = ['Veg', 'NonVeg', 'Religious']
const VALID_WEEKS = ['6DAYS', '5DAYS']

export async function createPricingRow(
    planId: string,
    preference: string,
    weekType: string,
    pricePerMeal: number,
    effectiveFrom: string,
    vegDayCount: number | null = null,
): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    if (!VALID_PLANS.includes(planId)) return { ok: false, message: 'Unknown plan' }
    if (!VALID_PREFS.includes(preference)) return { ok: false, message: 'Unknown preference' }
    if (!VALID_WEEKS.includes(weekType)) return { ok: false, message: 'Unknown week type' }
    if (pricePerMeal <= 0 || isNaN(pricePerMeal)) {
        return { ok: false, message: 'Price must be a positive number' }
    }
    // veg_day_count only means something for Religious rows (the per-meal
    // price slides with the count). 1..5 covers the 6DAYS week; 5DAYS
    // customers use 1..4 of the same table. NULL = flat for all counts.
    if (preference !== 'Religious' && vegDayCount != null) {
        return { ok: false, message: 'Veg-day count only applies to Religious pricing' }
    }
    if (vegDayCount != null && (!Number.isInteger(vegDayCount) || vegDayCount < 1 || vegDayCount > 5)) {
        return { ok: false, message: 'Veg-day count must be 1–5' }
    }

    const { error } = await sb.from('plan_pricing').insert({
        plan_id: planId,
        preference,
        week_type: weekType,
        veg_day_count: vegDayCount,
        price_per_meal: pricePerMeal,
        effective_from: effectiveFrom,
        created_by: admin.email,
    })

    if (error) {
        captureError(error, { area: 'admin', op: 'createPricingRow' })
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, 'create_pricing', 'plan_pricing', planId, {
        preference, weekType, vegDayCount, pricePerMeal, effectiveFrom,
    })

    revalidatePath('/admin/pricing')
    const countLabel = vegDayCount != null ? ` (${vegDayCount} veg days)` : ''
    return { ok: true, message: `Price set: ${planId} ${preference}${countLabel} ${weekType} → AED ${pricePerMeal}/meal from ${effectiveFrom}` }
}

/**
 * Retire an override immediately: sets effective_to to today (Asia/Dubai).
 * effective_to is EXCLUSIVE everywhere (loader, checkout band, admin view),
 * so the row stops applying the moment this commits and the price reverts
 * to the code default — or to an older still-active row if one exists.
 */
export async function endPricingRow(id: string): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const todayAE = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { data: row, error } = await sb
        .from('plan_pricing')
        .update({ effective_to: todayAE })
        .eq('id', id)
        .select('plan_id, preference, week_type, veg_day_count, price_per_meal')
        .maybeSingle()

    if (error) {
        captureError(error, { area: 'admin', op: 'endPricingRow' })
        return { ok: false, message: error.message }
    }
    if (!row) return { ok: false, message: 'Override not found' }

    await logAdminAction(admin.email, 'end_pricing', 'plan_pricing', id, {
        ...row, endedOn: todayAE,
    })

    revalidatePath('/admin/pricing')
    return { ok: true, message: `Override ended: ${row.plan_id} ${row.preference} reverts to its previous price.` }
}
