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

// How far out a last delivery day may be scheduled. 370 days is "a bit over
// a year" — long enough for an owner planning the next academic year from
// this one, short enough that a fat-fingered year (2036 instead of 2026)
// bounces instead of silently freezing intake a decade from now.
const MAX_SCHEDULE_DAYS_AHEAD = 370

/** Today's date in Asia/Dubai (UTC+4 year-round, no DST). */
function todayAE(): string {
    return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** ISO date `days` after `iso`, parsed and returned in UTC. */
function addDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

/**
 * Set the season's last delivery day. From here the taper guards (checkout
 * route, free-checkout, gift claim) refuse any journey that would run past
 * the date, and `intake_scheduled_pause_tick` flips the pause on the day
 * after it, stamping paused_by='schedule'.
 *
 * This action and `clearScheduledIntakePause` are the only writers of
 * pause_scheduled_for besides that tick, which only ever clears it.
 */
export async function scheduleIntakePause(dateIso: string): Promise<{ ok: true } | { error: string }> {
    const user = await requireAdmin()

    const clean = (dateIso ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        return { error: 'Pick a last delivery day first.' }
    }
    // Round-trip the parse so calendar-impossible dates (2026-02-30, which
    // Date happily rolls forward to 2 March) are rejected rather than
    // silently corrected into a different day than the owner typed.
    const parsed = new Date(`${clean}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== clean) {
        return { error: 'That date does not exist. Check the day and month.' }
    }

    const today = todayAE()
    if (clean <= today) {
        return { error: 'The last delivery day has to be a future date.' }
    }
    if (clean > addDays(today, MAX_SCHEDULE_DAYS_AHEAD)) {
        return { error: 'Pick a last delivery day within the next year.' }
    }

    const sb = createAdminSupabaseClient()

    // A schedule is a promise about a future stop, so it means nothing while
    // intake is already stopped — and worse, the tick would clear it on the
    // day without ever flipping anything, so the owner would watch their
    // schedule quietly vanish. Refuse instead.
    const { data: current, error: readError } = await sb
        .from('intake_settings')
        .select('paused')
        .eq('id', SETTINGS_ID)
        .maybeSingle()

    if (readError) return { error: readError.message }
    if (current?.paused === true) {
        return { error: 'Intake is already paused. Clear the pause instead.' }
    }

    const { error } = await sb
        .from('intake_settings')
        .update({ pause_scheduled_for: clean, updated_at: new Date().toISOString() })
        .eq('id', SETTINGS_ID)

    if (error) return { error: error.message }

    await logAdminAction(user.email, 'intake_pause_scheduled', 'intake_settings', 'singleton', {
        pause_scheduled_for: clean,
    })

    revalidatePath('/admin/season')
    return { ok: true }
}

/**
 * Drop the scheduled last delivery day. The taper guards go quiet again and
 * the tick has nothing left to flip. Deliberately unconditional: clearing is
 * always safe, so it stays available even in states where scheduling is not.
 */
export async function clearScheduledIntakePause(): Promise<{ ok: true } | { error: string }> {
    const user = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { error } = await sb
        .from('intake_settings')
        .update({ pause_scheduled_for: null, updated_at: new Date().toISOString() })
        .eq('id', SETTINGS_ID)

    if (error) return { error: error.message }

    await logAdminAction(user.email, 'intake_pause_schedule_cleared', 'intake_settings', 'singleton', {})

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

    await logAdminAction(user.email, 'intake_reopen_target_set', 'intake_settings', 'singleton', {
        reopen_target: target,
    })

    revalidatePath('/admin/season')
    return { ok: true }
}
