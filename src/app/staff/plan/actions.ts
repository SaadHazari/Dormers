'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { provisionStaffFreePlan } from '@/contexts/staff/usecases/provision-plan'
import { getStaffPlanState, provisionStaffFreeRenewal, nextWorkingDayAfter } from '@/contexts/staff/usecases/renewal'
import { staffIntakeGate } from '@/contexts/staff/domain/staff-intake-gate'
import { staffSeasonRefusal } from '@/contexts/staff/domain/staff-season-copy'
import { getIntakeState } from '@/infra/config/intake'
import { computeEndDate, isoDate } from '@/contexts/subscriptions/domain/end-date'

export type StaffPlanResult = { ok: true } | { error: string }
export type StaffSixDayResult = { ok: true; startDate: string | null } | { error: string }

/** Free 5-day plan — first cycle provisions immediately; a renewal queues
 *  as Scheduled behind the admin's approval gate. */
export async function chooseStaffFiveDay(): Promise<StaffPlanResult> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Please log in again.' }

    const state = await getStaffPlanState(user.id)
    const res = state.kind === 'renewal-open'
        ? await provisionStaffFreeRenewal(user.id)
        : await provisionStaffFreePlan(user.id)
    if ('error' in res) return res

    revalidatePath('/dashboard', 'layout')
    return { ok: true }
}

/**
 * Pins the week type to 6DAYS ahead of the prepaid Saturday checkout — the
 * staff gate in /api/checkout validates against the (pending-aware) profile
 * week type, so this must commit first.
 *
 * First plan → canonical week_type changes now (no cycle running yet).
 * Renewal   → pending_week_type only; the running cycle keeps its menus,
 *             and the value drains when the admin approves.
 *
 * Returns the start_date the client must POST for a renewal (day after the
 * current cycle ends), or null for a first plan (checkout's ASAP default).
 */
export async function chooseStaffSixDay(): Promise<StaffSixDayResult> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Please log in again.' }

    const state = await getStaffPlanState(user.id)
    if (state.kind === 'not-staff') return { error: 'No active staff record for this account.' }
    if (state.kind === 'awaiting-approval' || state.kind === 'queued') {
        return { error: 'Your next cycle is already queued.' }
    }
    if (state.kind === 'covered') return { error: 'Renewal isn\'t open yet.' }

    const isRenewal = state.kind === 'renewal-open'
    const today = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const sixDayStart = isRenewal
        ? (state.renewStartDate <= today ? nextWorkingDayAfter(today, '6DAYS') : state.renewStartDate)
        : nextWorkingDayAfter(today, '6DAYS')

    // The same season rule the 5-day path applies. Without this the two
    // options on one screen disagreed: the free plan was created while the
    // paid one bounced off /api/checkout with customer sign-up copy —
    // "Save your spot and we will message you the day we reopen" — aimed at
    // an employee whose meals are pay.
    const intake = await getIntakeState()
    const gate = staffIntakeGate({
        paused: intake.paused,
        pauseScheduledFor: intake.pauseScheduledFor,
        cycleEndIso: isoDate(computeEndDate({
            startDate: new Date(sixDayStart + 'T00:00:00Z'),
            planKind: 'monthly', weekType: '6DAYS', skipCount: 0, pauseDays: 0,
        })),
    })
    if (!gate.ok) return { error: staffSeasonRefusal(gate, 'intern') }

    const sb = createAdminSupabaseClient()
    const { error } = await sb
        .from('customers')
        .update(isRenewal ? { pending_week_type: '6DAYS' } : { week_type: '6DAYS', pending_week_type: null })
        .eq('id', user.id)
    if (error) {
        console.error('chooseStaffSixDay week_type update failed:', error)
        return { error: 'Could not set your delivery week. Try again.' }
    }

    if (!isRenewal) return { ok: true, startDate: null }
    return { ok: true, startDate: sixDayStart }
}
