'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'

// intake_settings is a single-row table enforced by `id boolean primary key
// default true` plus `constraint intake_settings_singleton check (id)` — the
// row's id can only ever be the literal `true`. Every write below targets
// that one row by filtering on it.
const SETTINGS_ID = true

export async function setIntakePaused(paused: boolean): Promise<{ ok: true } | { error: string }> {
    const user = await requireAdmin()
    const sb = createAdminSupabaseClient()

    // Stamp who paused it and when on the way in; clear paused_at on the way
    // out. paused_by is intentionally left alone when reopening — it stays
    // as a record of who paused it last, useful context on the next pause.
    //
    // cycle_started_at / cycle_ended_at are a SEPARATE pair of timestamps,
    // stamped alongside paused_at/paused_by but never cleared. They exist
    // so the customer-facing takeovers can key their once-only dismissal
    // flag to a specific pause CYCLE rather than firing once ever — see
    // IntakePauseTakeover / ClientDashboard.tsx. If these cleared like
    // paused_at does, a second pause months later would reuse the same
    // (null) epoch and the "your plan is safe" reassurance would never
    // show again, defeating the point of that copy.
    const now = new Date().toISOString()
    const patch: {
        paused: boolean
        paused_at: string | null
        paused_by?: string
        cycle_started_at?: string
        cycle_ended_at?: string
    } = paused
        ? { paused: true, paused_at: now, paused_by: user.email, cycle_started_at: now }
        : { paused: false, paused_at: null, cycle_ended_at: now }

    const { error } = await sb
        .from('intake_settings')
        .update(patch)
        .eq('id', SETTINGS_ID)

    if (error) return { error: error.message }

    await logAdminAction(
        user.email,
        paused ? 'intake_paused' : 'intake_reopened',
        'intake_settings',
        'singleton',
        { paused },
    )

    revalidatePath('/admin/season')
    return { ok: true }
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

    await logAdminAction(user.email, 'intake_credits_updated', 'intake_settings', 'singleton', {
        credit_nonveg_aed: nonveg,
        credit_veg_aed: veg,
        credit_religious_aed: religious,
    })

    revalidatePath('/admin/season')
    return { ok: true }
}
