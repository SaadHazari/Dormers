import 'server-only'

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { STAFF_PLAN_NAME } from '../domain/staff-plan'
import { earliestStartIso } from '../domain/staff-plan'
import { staffIntakeGate } from '../domain/staff-intake-gate'
import { staffSeasonRefusal } from '../domain/staff-season-copy'
import { getIntakeState } from '@/infra/config/intake'
import { computeEndDate, isoDate } from '@/contexts/subscriptions/domain/end-date'

export type ProvisionResult = { ok: true } | { error: string }

/** Earliest start in Asia/Dubai: today if a working day and before the
 *  14:00 kitchen cutoff, else the next working day for the week type.
 *  Mirrors the checkout date rules — staff plans skip the date picker
 *  (their pay starts as soon as the kitchen can serve them). */

/**
 * Provisions the FREE 5-day Staff Monthly plan — the intern's pay. Modeled
 * on claimGift's Welcome Meal provisioning: a direct subscription insert,
 * no orders row (this is remuneration, not revenue — the expense side is
 * written per delivered meal by the delivery tick under
 * staff_comped_meals), no Stripe, no Zoho.
 *
 * The paid 6-day flavor never comes here — it flows through /api/checkout's
 * staff gate so the webhook writes the order + Zoho invoice + confirms.
 */
export async function provisionStaffFreePlan(userId: string): Promise<ProvisionResult> {
    const sb = createAdminSupabaseClient()

    // Active staff only — the registry is the authorization.
    const { data: staff } = await sb
        .from('staff_members')
        .select('id')
        .eq('customer_id', userId)
        .eq('status', 'active')
        .maybeSingle()
    if (!staff) return { error: 'No active staff record for this account.' }

    // One live plan per customer — same invariant checkout enforces.
    const { data: liveSub } = await sb
        .from('subscriptions')
        .select('id')
        .eq('customer_id', userId)
        .in('status', ['Active', 'Paused', 'Skipped', 'Scheduled'])
        .limit(1)
        .maybeSingle()
    if (liveSub) return { error: 'You already have a plan — message us if something looks wrong.' }

    const { data: customer } = await sb
        .from('customers')
        .select('meal_preference_type, veg_days')
        .eq('id', userId)
        .maybeSingle()

    const startDate = earliestStartIso('5DAYS')

    // Same season rule as everyone: no new cycle while sign-ups are paused,
    // none that outlives the last delivery day. Checked before the profile
    // write below so a refused plan leaves nothing changed behind it.
    const intake = await getIntakeState()
    const gate = staffIntakeGate({
        paused: intake.paused,
        pauseScheduledFor: intake.pauseScheduledFor,
        cycleEndIso: isoDate(computeEndDate({
            startDate: new Date(startDate + 'T00:00:00Z'),
            planKind: 'monthly', weekType: '5DAYS', skipCount: 0, pauseDays: 0,
        })),
    })
    if (!gate.ok) return { error: staffSeasonRefusal(gate, 'intern') }

    // The free flavor IS the 5-day week — pin the profile to it so menus,
    // labels, and the delivery tick all agree on Mon–Fri.
    const { error: weekErr } = await sb
        .from('customers')
        .update({ week_type: '5DAYS', pending_week_type: null })
        .eq('id', userId)
    if (weekErr) {
        console.error('provisionStaffFreePlan week_type update failed:', weekErr)
        return { error: 'Could not set up your delivery week. Try again.' }
    }

    const todayAE = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const isReligious = /religious/i.test(customer?.meal_preference_type ?? '')

    // end_date is computed by the BEFORE INSERT trigger from the canonical
    // formula (plan kind 'monthly' × 5DAYS) — the placeholder below is
    // overwritten before the row lands.
    const { data: created, error: subErr } = await sb.from('subscriptions').insert({
        customer_id: userId,
        plan_name: STAFF_PLAN_NAME,
        status: startDate > todayAE ? SUBSCRIPTION_STATUS.SCHEDULED : SUBSCRIPTION_STATUS.ACTIVE,
        start_date: startDate,
        end_date: startDate,
        week_type: '5DAYS',
        meals_per_day: 1,
        total_meals: 20,
        delivered_meals: 0,
        paused_days: 0,
        has_paused_before: false,
        skipped_meals_count: 0,
        veg_days: isReligious && (customer?.veg_days?.length ?? 0) > 0 ? customer?.veg_days : null,
    }).select('id, created_at').single()

    if (subErr || !created) {
        console.error('provisionStaffFreePlan subscription insert failed:', subErr)
        return { error: 'Could not create your plan. Try again or message us on WhatsApp.' }
    }

    // Race guard — the live-sub check above and this insert are not atomic and
    // there's no DB unique constraint on active-sub-per-customer. If a
    // concurrent provision created another live sub, keep exactly one via a
    // deterministic tiebreaker (earliest created_at, then smallest id) and roll
    // back ONLY our own row — never another request's sub.
    const { data: rivals } = await sb
        .from('subscriptions')
        .select('id, created_at')
        .eq('customer_id', userId)
        .in('status', ['Active', 'Paused', 'Skipped', 'Scheduled'])
        .neq('id', created.id)

    const weLose = (rivals ?? []).some(
        (r) =>
            (r.created_at as string) < (created.created_at as string) ||
            (r.created_at === created.created_at && (r.id as string) < (created.id as string)),
    )
    if (weLose) {
        await sb.from('subscriptions').delete().eq('id', created.id)
        return { error: 'You already have a plan — message us if something looks wrong.' }
    }

    return { ok: true }
}
