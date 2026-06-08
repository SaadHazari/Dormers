'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'

type Result = { ok: boolean; message: string }

export async function createPricingRow(
    planId: string,
    preference: string,
    weekType: string,
    pricePerMeal: number,
    effectiveFrom: string,
): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    if (pricePerMeal <= 0 || isNaN(pricePerMeal)) {
        return { ok: false, message: 'Price must be a positive number' }
    }

    const { error } = await sb.from('plan_pricing').insert({
        plan_id: planId,
        preference,
        week_type: weekType,
        price_per_meal: pricePerMeal,
        effective_from: effectiveFrom,
        created_by: admin.email,
    })

    if (error) {
        console.error('createPricingRow failed:', error)
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, 'create_pricing', 'plan_pricing', planId, {
        preference, weekType, pricePerMeal, effectiveFrom,
    })

    revalidatePath('/admin/pricing')
    return { ok: true, message: `Price set: ${planId} ${preference} ${weekType} → AED ${pricePerMeal}/meal from ${effectiveFrom}` }
}
