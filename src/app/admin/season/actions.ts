'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { invalidateIntakeCache } from '@/infra/config/intake'
import {
    scheduleSeasonEnd,
    moveSeasonEnd,
    clearSeasonEnd,
    stopSeasonSales,
    resumeSeasonSales,
    endSeasonToday,
    type SeasonTransitionResult,
} from '@/contexts/season/usecases/season-transitions'

// intake_settings is a single-row table enforced by `id boolean primary key
// default true` plus `constraint intake_settings_singleton check (id)` — the
// row's id can only ever be the literal `true`. Every write below targets
// that one row by filtering on it.
const SETTINGS_ID = true

export async function scheduleSeasonEndAction(wrapUpDay: string, bufferDays: number): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await scheduleSeasonEnd(user.email, wrapUpDay, bufferDays)
    revalidatePath('/admin/season')
    return result
}

export async function moveSeasonEndAction(wrapUpDay: string, bufferDays: number): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await moveSeasonEnd(user.email, wrapUpDay, bufferDays)
    revalidatePath('/admin/season')
    return result
}

export async function clearSeasonEndAction(): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await clearSeasonEnd(user.email)
    revalidatePath('/admin/season')
    return result
}

export async function stopSeasonSalesAction(): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await stopSeasonSales(user.email)
    revalidatePath('/admin/season')
    return result
}

export async function resumeSeasonSalesAction(): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await resumeSeasonSales(user.email)
    revalidatePath('/admin/season')
    return result
}

export async function endSeasonTodayAction(): Promise<SeasonTransitionResult> {
    const user = await requireAdmin()
    const result = await endSeasonToday(user.email)
    revalidatePath('/admin/season')
    return result
}

export async function updateIntakeCopy(
    headline: string,
    body: string,
): Promise<{ ok: true } | { error: string }> {
    const user = await requireAdmin()

    const cleanHeadline = headline.trim()
    const cleanBody = body.trim()
    if (cleanHeadline.length < 1 || cleanHeadline.length > 120) {
        return { error: 'Headline must be between 1 and 120 characters.' }
    }
    if (cleanBody.length < 1 || cleanBody.length > 400) {
        return { error: 'Body must be between 1 and 400 characters.' }
    }

    const sb = createAdminSupabaseClient()
    const { error } = await sb
        .from('intake_settings')
        .update({ headline: cleanHeadline, body: cleanBody, updated_at: new Date().toISOString() })
        .eq('id', SETTINGS_ID)

    if (error) return { error: error.message }


    // The row changed — never answer the next question from the old copy.

    invalidateIntakeCache()

    await logAdminAction(user.email, 'intake_copy_updated', 'intake_settings', 'singleton', {
        headline: cleanHeadline,
        body: cleanBody,
    })

    revalidatePath('/admin/season')
    return { ok: true }
}

export async function updateIntakeCredits(
    nonveg: number,
    veg: number,
    religious: number,
): Promise<{ ok: true } | { error: string }> {
    const user = await requireAdmin()

    const checks: Array<[string, number]> = [
        ['Non-veg', nonveg],
        ['Veg', veg],
        ['Religious Preference', religious],
    ]
    for (const [label, value] of checks) {
        if (!Number.isFinite(value) || value < 0 || value > 200) {
            return { error: `${label} credit must be an amount between AED 0 and AED 200.` }
        }
    }

    const sb = createAdminSupabaseClient()
    const { error } = await sb
        .from('intake_settings')
        .update({
            credit_nonveg_aed: nonveg,
            credit_veg_aed: veg,
            credit_religious_aed: religious,
            updated_at: new Date().toISOString(),
        })
        .eq('id', SETTINGS_ID)

    if (error) return { error: error.message }


    // The row changed — never answer the next question from the old copy.

    invalidateIntakeCache()

    await logAdminAction(user.email, 'intake_credits_updated', 'intake_settings', 'singleton', {
        credit_nonveg_aed: nonveg,
        credit_veg_aed: veg,
        credit_religious_aed: religious,
    })

    revalidatePath('/admin/season')
    return { ok: true }
}

/**
 * Set (or clear) the saved-spot target the owner is waiting for before
 * restarting the kitchen.
 *
 * Informational only. Nothing in the product reads this to make a decision and
 * hitting the number does NOT reopen intake — reopening stays the deliberate
 * human action it has always been. The target exists so the Season page can
 * show progress toward a restart instead of a bare count.
 *
 * `null` clears it, which is a real state rather than a zero: the page falls
 * back to the plain count, and the owner is never measured against a number
 * they did not choose. The upper bound mirrors the DB check constraint so a
 * fat-fingered 1500 is refused with a sentence instead of a Postgres error.
 */
export async function setReopenTarget(target: number | null): Promise<{ ok: true } | { error: string }> {
    const user = await requireAdmin()

    if (target !== null) {
        if (!Number.isInteger(target) || target < 1 || target > 1000) {
            return { error: 'The target must be a whole number between 1 and 1000.' }
        }
    }

    const sb = createAdminSupabaseClient()
    const { error } = await sb
        .from('intake_settings')
        .update({ reopen_target: target, updated_at: new Date().toISOString() })
        .eq('id', SETTINGS_ID)

    if (error) return { error: error.message }


    // The row changed — never answer the next question from the old copy.

    invalidateIntakeCache()

    await logAdminAction(user.email, 'intake_reopen_target_set', 'intake_settings', 'singleton', {
        reopen_target: target,
    })

    revalidatePath('/admin/season')
    return { ok: true }
}
