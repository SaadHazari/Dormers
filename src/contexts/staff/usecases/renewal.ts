import 'server-only'

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { STAFF_PLAN_NAME, RENEWAL_WINDOW_DAYS } from '../domain/staff-plan'

type StaffSubRow = {
    id: string
    status: string
    start_date: string
    end_date: string
    week_type: string
    staff_approval: string | null
}

export type StaffPlanState =
    | { kind: 'not-staff' }
    | { kind: 'first-plan' }                                  // no staff sub yet → first chooser
    | { kind: 'awaiting-approval'; startDate: string }        // renewal queued, admin hasn't approved
    | { kind: 'queued' }                                      // approved renewal already queued
    | { kind: 'renewal-open'; renewStartDate: string }        // current cycle ending → chooser in renew mode
    | { kind: 'covered' }                                     // mid-cycle, nothing to choose

function aeTodayIso(): string {
    return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Next working day (week-type aware) strictly after `afterIso`. */
export function nextWorkingDayAfter(afterIso: string, weekType: '5DAYS' | '6DAYS'): string {
    const d = new Date(afterIso + 'T00:00:00Z')
    for (let i = 0; i < 7; i++) {
        d.setUTCDate(d.getUTCDate() + 1)
        const isoDow = ((d.getUTCDay() + 6) % 7) + 1
        if (weekType === '5DAYS' ? isoDow <= 5 : isoDow <= 6) break
    }
    return d.toISOString().slice(0, 10)
}

/**
 * Where this intern stands in the plan lifecycle — drives what /staff/plan
 * renders. The renewal window opens RENEWAL_WINDOW_DAYS before cycle end
 * and stays open after a lapse (an intern who let the plan expire can
 * still renew; the admin gate catches anything fishy).
 */
export async function getStaffPlanState(userId: string): Promise<StaffPlanState> {
    const sb = createAdminSupabaseClient()

    const { data: staff } = await sb
        .from('staff_members')
        .select('id')
        .eq('customer_id', userId)
        .eq('status', 'active')
        .maybeSingle()
    if (!staff) return { kind: 'not-staff' }

    const { data: subsRaw } = await sb
        .from('subscriptions')
        .select('id, status, start_date, end_date, week_type, staff_approval')
        .eq('customer_id', userId)
        .eq('plan_name', STAFF_PLAN_NAME)
        .order('start_date', { ascending: false })
    const subs = (subsRaw ?? []) as StaffSubRow[]
    if (subs.length === 0) return { kind: 'first-plan' }

    const queued = subs.find(s => s.status === SUBSCRIPTION_STATUS.SCHEDULED)
    if (queued) {
        return queued.staff_approval === 'pending'
            ? { kind: 'awaiting-approval', startDate: queued.start_date }
            : { kind: 'queued' }
    }

    const live = subs.find(s => ['Active', 'Paused', 'Skipped'].includes(s.status))
    const today = aeTodayIso()
    if (live) {
        const daysToEnd = Math.ceil(
            (new Date(live.end_date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000,
        )
        if (daysToEnd <= RENEWAL_WINDOW_DAYS) {
            return { kind: 'renewal-open', renewStartDate: nextWorkingDayAfter(live.end_date, '5DAYS') }
        }
        return { kind: 'covered' }
    }

    // All staff subs ended — lapsed intern renewing late; starts at the
    // earliest serviceable day (computed at provisioning time).
    return { kind: 'renewal-open', renewStartDate: today }
}

export type RenewalResult = { ok: true } | { error: string }

/**
 * Free 5-day RENEWAL — inserts the next cycle as Scheduled. The DB trigger
 * stamps staff_approval='pending' (a prior staff sub exists), and the
 * status tick holds it at the gate until the admin approves from
 * /admin/staff. Mirrors provisionStaffFreePlan but starts after the
 * current cycle instead of ASAP.
 */
export async function provisionStaffFreeRenewal(userId: string): Promise<RenewalResult> {
    const sb = createAdminSupabaseClient()

    const state = await getStaffPlanState(userId)
    if (state.kind !== 'renewal-open') {
        return { error: state.kind === 'awaiting-approval' || state.kind === 'queued'
            ? 'Your next cycle is already queued.'
            : 'Renewal isn\'t open yet.' }
    }

    const { data: customer } = await sb
        .from('customers')
        .select('meal_preference_type, veg_days')
        .eq('id', userId)
        .maybeSingle()

    // Queue the week-type switch for the NEXT cycle — the current cycle's
    // menus/labels keep reading the canonical value. Drained on approval.
    await sb.from('customers').update({ pending_week_type: '5DAYS' }).eq('id', userId)

    const today = aeTodayIso()
    // Lapsed renewals start at the next 5DAYS working day from today;
    // in-window renewals start the day after the current cycle ends.
    const startDate = state.renewStartDate <= today
        ? nextWorkingDayAfter(today, '5DAYS')
        : state.renewStartDate
    const isReligious = /religious/i.test(customer?.meal_preference_type ?? '')

    const { data: created, error } = await sb.from('subscriptions').insert({
        customer_id: userId,
        plan_name: STAFF_PLAN_NAME,
        status: SUBSCRIPTION_STATUS.SCHEDULED,
        start_date: startDate,
        end_date: startDate, // recomputed by the BEFORE INSERT trigger
        week_type: '5DAYS',
        meals_per_day: 1,
        total_meals: 20,
        delivered_meals: 0,
        paused_days: 0,
        has_paused_before: false,
        skipped_meals_count: 0,
        veg_days: isReligious && (customer?.veg_days?.length ?? 0) > 0 ? customer?.veg_days : null,
    }).select('id, created_at').single()

    if (error || !created) {
        console.error('provisionStaffFreeRenewal insert failed:', error)
        return { error: 'Could not queue your renewal. Try again or message us on WhatsApp.' }
    }

    // Race guard — getStaffPlanState only reports 'queued' once a Scheduled row
    // exists, so two concurrent renewals can both pass the check above and
    // double-queue the next cycle. Keep exactly one queued staff sub via a
    // deterministic tiebreaker and roll back only our own row.
    const { data: rivals } = await sb
        .from('subscriptions')
        .select('id, created_at')
        .eq('customer_id', userId)
        .eq('plan_name', STAFF_PLAN_NAME)
        .eq('status', SUBSCRIPTION_STATUS.SCHEDULED)
        .neq('id', created.id)

    const weLose = (rivals ?? []).some(
        (r) =>
            (r.created_at as string) < (created.created_at as string) ||
            (r.created_at === created.created_at && (r.id as string) < (created.id as string)),
    )
    if (weLose) {
        await sb.from('subscriptions').delete().eq('id', created.id)
        return { error: 'Your next cycle is already queued.' }
    }

    return { ok: true }
}
