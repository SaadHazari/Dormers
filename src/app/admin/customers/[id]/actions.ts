'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { eventBus } from '@/shared/events/event-bus'
// Side-effect import — registers the notifications subscriber so the
// notification-due/-cancel emits below actually queue WhatsApp messages.
// Mirrors subscription-mutations.ts.
import '@/contexts/notifications/usecases/subscribers'

type Result = { ok: boolean; message: string }

// Mirrors the vault secret `cogs_aed_per_meal` default used by the delivery
// cron's ledger writer (see 20260531_comped_meal_ledger.sql). The ledger is
// an expense trail — a comp recorded at AED 0 would understate quarterly
// P&L, so we snapshot the standing default instead.
const DEFAULT_COGS_AED = 12.0

export async function adminCompMeal(
    customerId: string,
    subscriptionId: string | undefined,
    reason: string,
): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    // comped_meal_ledger.subscription_id is NOT NULL — every comp must hang
    // off a subscription so the quarterly rollups can attribute it.
    if (!subscriptionId) {
        return { ok: false, message: 'Comped meals must be tied to a subscription — this customer has no active plan.' }
    }

    const { data: sub } = await sb
        .from('subscriptions')
        .select('id, plan_name')
        .eq('id', subscriptionId)
        .maybeSingle()
    if (!sub) return { ok: false, message: 'Subscription not found' }

    // Columns match the LIVE schema: plan_name + expense_category are
    // NOT NULL; the date lives in delivered_at (there is no meal_date or
    // reason column — the reason goes to the admin audit log below).
    const { error } = await sb.from('comped_meal_ledger').insert({
        customer_id: customerId,
        subscription_id: subscriptionId,
        plan_name: sub.plan_name ?? 'Unknown',
        cogs_aed: DEFAULT_COGS_AED,
        expense_category: 'customer_service_comp',
        delivered_at: new Date().toISOString(),
    })

    if (error) {
        console.error('adminCompMeal failed:', error)
        // Unique (subscription_id, day, category) — a same-day double comp is
        // blocked by design, not a bug.
        if (error.code === '23505') {
            return { ok: false, message: 'A comp for this subscription is already recorded today.' }
        }
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, 'comp_meal', 'customer', customerId, {
        reason, subscriptionId, cogs_aed: DEFAULT_COGS_AED, expense_category: 'customer_service_comp',
    })
    revalidatePath(`/admin/customers/${customerId}`)
    return { ok: true, message: `Comped meal recorded (AED ${DEFAULT_COGS_AED} COGS) — reason: ${reason}` }
}

/**
 * Gift extra meals onto a live plan — goodwill for a damaged delivery, a
 * too-salty dish, etc. Unlike Comp Meal (a pure accounting record), this
 * CHANGES what the customer receives and sees:
 *
 *   • total_meals += N      → dashboard "delivered / total" includes the gift
 *   • bonus_meals += N      → the end_date trigger appends N working days to
 *                             the cycle (same mechanism as skips), so the
 *                             kitchen actually delivers N extra meals
 *   • comped_meal_ledger    → one expense row (customer_goodwill) so the
 *                             quarterly books stay clean
 *
 * The ledger insert doubles as the idempotency guard: its unique index on
 * (subscription, day, category) turns a double-click into a friendly error
 * instead of a double grant.
 */
export async function adminGiftMeals(
    subscriptionId: string,
    count: number,
    reason: string,
): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    if (!Number.isInteger(count) || count < 1 || count > 5) {
        return { ok: false, message: 'Gift 1–5 meals at a time.' }
    }

    const { data: sub } = await sb
        .from('subscriptions')
        .select('id, customer_id, status, plan_name, total_meals, bonus_meals')
        .eq('id', subscriptionId)
        .maybeSingle()
    if (!sub) return { ok: false, message: 'Subscription not found' }
    if (sub.status !== 'Active' && sub.status !== 'Paused') {
        return { ok: false, message: `Can only gift meals on a live plan — status is ${sub.status}` }
    }

    // Books first — also the double-click guard (unique per sub/day/category).
    const { data: ledgerRow, error: ledgerError } = await sb
        .from('comped_meal_ledger')
        .insert({
            customer_id: sub.customer_id,
            subscription_id: subscriptionId,
            plan_name: sub.plan_name ?? 'Unknown',
            // One row per grant with the summed cost — the unique index
            // doesn't allow row-per-meal on the same day.
            cogs_aed: DEFAULT_COGS_AED * count,
            expense_category: 'customer_goodwill',
            delivered_at: new Date().toISOString(),
        })
        .select('id')
        .single()

    if (ledgerError) {
        if (ledgerError.code === '23505') {
            return { ok: false, message: 'Meals were already gifted to this plan today.' }
        }
        console.error('adminGiftMeals ledger insert failed:', ledgerError)
        return { ok: false, message: ledgerError.message }
    }

    // The plan change. The BEFORE UPDATE trigger watches bonus_meals and
    // recomputes end_date from the canonical formula — never set end_date
    // by hand here, it would be overwritten on the next skip/pause anyway.
    // The returning row carries the trigger's freshly computed end_date,
    // which the WhatsApp confirm below quotes to the customer.
    const { data: updated, error: subError } = await sb
        .from('subscriptions')
        .update({
            bonus_meals: (sub.bonus_meals as number ?? 0) + count,
            total_meals: (sub.total_meals as number ?? 0) + count,
        })
        .eq('id', subscriptionId)
        .select('end_date')
        .single()

    if (subError || !updated) {
        // Roll back the expense row — the grant never happened.
        await sb.from('comped_meal_ledger').delete().eq('id', ledgerRow.id)
        console.error('adminGiftMeals subscription update failed:', subError)
        return { ok: false, message: subError?.message ?? 'Subscription update failed' }
    }

    // WhatsApp confirm — template resolves from vault secret
    // 'tpl_meals_gifted_confirm'. If the Meta template isn't registered yet
    // the dispatcher holds the row and sends once the secret lands.
    // meals_gifted is pre-pluralized here because templates can't do plurals.
    await eventBus.emit('subscription.notification-due', {
        customerId: sub.customer_id as string,
        kind: 'meals_gifted_confirm',
        scheduledFor: new Date(),
        payload: {
            meals_gifted: `${count} extra meal${count === 1 ? '' : 's'}`,
            end_date: updated.end_date as string,
        },
    })

    await logAdminAction(admin.email, 'gift_meals', 'subscription', subscriptionId, {
        customer_id: sub.customer_id, count, reason, cogs_aed: DEFAULT_COGS_AED * count,
    })
    revalidatePath(`/admin/customers/${sub.customer_id}`)
    revalidatePath('/admin/customers')
    return { ok: true, message: `${count} meal${count === 1 ? '' : 's'} gifted — plan extended by ${count} delivery day${count === 1 ? '' : 's'} (${reason})` }
}

export async function adminAdjustSkips(
    subscriptionId: string,
    newBonusSkips: number,
): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { data: sub } = await sb
        .from('subscriptions')
        .select('id, customer_id, bonus_skips')
        .eq('id', subscriptionId)
        .maybeSingle()

    if (!sub) return { ok: false, message: 'Subscription not found' }

    // Sanity bounds — bonus skips sit on top of the plan's base allowance
    // (max 3). A fat-fingered 20 or 1e6 from the prompt() input would
    // silently hand out a cycle of free skips; 10 covers any genuine
    // goodwill case with room to spare.
    if (!Number.isInteger(newBonusSkips) || newBonusSkips < 0 || newBonusSkips > 10) {
        return { ok: false, message: 'Bonus skips must be a whole number between 0 and 10.' }
    }

    const oldValue = sub.bonus_skips as number
    const { error } = await sb
        .from('subscriptions')
        .update({ bonus_skips: newBonusSkips })
        .eq('id', subscriptionId)

    if (error) {
        console.error('adminAdjustSkips failed:', error)
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, 'adjust_skips', 'subscription', subscriptionId, {
        old: oldValue, new: newBonusSkips,
    })
    revalidatePath(`/admin/customers/${sub.customer_id}`)
    return { ok: true, message: `Bonus skips updated: ${oldValue} → ${newBonusSkips}` }
}

export async function adminIssueCredit(
    customerId: string,
    amountAed: number,
    reason: string,
): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { error } = await sb.from('credits').insert({
        customer_id: customerId,
        amount_aed: amountAed,
        source: `admin_manual_${reason.replace(/\s+/g, '_').toLowerCase()}`,
        status: 'approved',
    })

    if (error) {
        console.error('adminIssueCredit failed:', error)
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, 'issue_credit', 'customer', customerId, {
        amount_aed: amountAed, reason,
    })
    revalidatePath(`/admin/customers/${customerId}`)
    return { ok: true, message: `AED ${amountAed} credit issued (${reason})` }
}

// Admin pause/resume mirror the customer-facing usecases in
// subscription-mutations.ts. Those run through withOwnedSubscription (the
// customer's own session), so the admin can't call them directly — instead
// the state-machine-critical pieces are replicated here 1:1:
//   • CAS-guarded status flips (no double-pause / stale-resume races)
//   • pause bookkeeping (has_paused_before, planned_pause_start cleared)
//   • notification events (customer still gets the WhatsApp confirms)
//   • post-2PM resume cutoff so delivery_tick doesn't count a meal that
//     was never prepped
// If you change the rules in subscription-mutations.ts, change them here.

export async function adminPauseSub(subscriptionId: string): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { data: sub } = await sb
        .from('subscriptions')
        .select('id, customer_id, status')
        .eq('id', subscriptionId)
        .maybeSingle()

    if (!sub) return { ok: false, message: 'Subscription not found' }
    if (sub.status !== 'Active') return { ok: false, message: `Cannot pause — status is ${sub.status}` }

    // CAS on status so a race with the customer (or status_tick) can't
    // re-pause / overwrite. has_paused_before burns the cycle's one free
    // pause — an admin pause is done on the customer's behalf and follows
    // the same business rule. planned_pause_start cleared: an immediate
    // pause supersedes any scheduled one.
    const { data: rows, error } = await sb
        .from('subscriptions')
        .update({
            status: 'Paused',
            pause_date: new Date().toISOString(),
            has_paused_before: true,
            planned_pause_start: null,
        })
        .eq('id', subscriptionId)
        .eq('status', 'Active')
        .select('id')

    if (error) {
        console.error('adminPauseSub failed:', error)
        return { ok: false, message: error.message }
    }
    if (!rows || rows.length === 0) {
        return { ok: false, message: 'Pause didn\'t take — the subscription changed underneath. Refresh and retry.' }
    }

    // Supersede a skip's pending "meals resume tonight" confirm and send the
    // pause confirm — the customer should hear about state changes to their
    // plan even when an admin made them.
    await eventBus.emit('subscription.notification-cancel', {
        customerId: sub.customer_id as string,
        kinds: ['meal_resumed_confirm'],
    })
    await eventBus.emit('subscription.notification-due', {
        customerId: sub.customer_id as string,
        kind: 'plan_paused_confirm',
        scheduledFor: new Date(),
    })

    await logAdminAction(admin.email, 'pause_subscription', 'subscription', subscriptionId)
    revalidatePath(`/admin/customers/${sub.customer_id}`)
    revalidatePath('/admin/customers')
    return { ok: true, message: 'Subscription paused — customer notified on WhatsApp' }
}

export async function adminResumeSub(subscriptionId: string): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { data: sub } = await sb
        .from('subscriptions')
        .select('id, customer_id, status, week_type, paused_dates')
        .eq('id', subscriptionId)
        .maybeSingle()

    if (!sub) return { ok: false, message: 'Subscription not found' }
    if (sub.status !== 'Paused') return { ok: false, message: `Cannot resume — status is ${sub.status}` }

    // Post-cutoff resume on a delivery day: the sub flips Active before
    // delivery_tick fires at 20:00 AE, which would count a meal the kitchen
    // never prepped. resume_cutoff_date tells the tick to skip today, and
    // today joins paused_dates so review surfaces know it was a paused day.
    // (Identical logic to resumeSubscription in subscription-mutations.ts.)
    const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const todayAE = aeNow.toISOString().slice(0, 10)
    const aeHour = aeNow.getUTCHours()
    const aeIsoDow = ((aeNow.getUTCDay() + 6) % 7) + 1
    const wt = (sub.week_type as string) ?? '6DAYS'
    const isDeliveryToday = wt === '6DAYS' ? aeIsoDow !== 7 : aeIsoDow !== 6 && aeIsoDow !== 7
    const setResumeCutoff = aeHour >= 14 && isDeliveryToday
    const existingPaused = (sub.paused_dates as string[] | null) ?? []
    const nextPausedDates = setResumeCutoff && !existingPaused.includes(todayAE)
        ? [...existingPaused, todayAE]
        : existingPaused

    const { data: rows, error } = await sb
        .from('subscriptions')
        .update({
            status: 'Active',
            pause_date: null,
            ...(setResumeCutoff ? { resume_cutoff_date: todayAE, paused_dates: nextPausedDates } : {}),
        })
        .eq('id', subscriptionId)
        .eq('status', 'Paused')
        .select('id')

    if (error) {
        console.error('adminResumeSub failed:', error)
        return { ok: false, message: error.message }
    }
    if (!rows || rows.length === 0) {
        return { ok: false, message: 'Resume didn\'t take — the subscription changed underneath. Refresh and retry.' }
    }

    await eventBus.emit('subscription.notification-due', {
        customerId: sub.customer_id as string,
        kind: 'plan_resumed_confirm',
        scheduledFor: new Date(),
        payload: { resume_date: todayAE },
    })

    await logAdminAction(admin.email, 'resume_subscription', 'subscription', subscriptionId)
    revalidatePath(`/admin/customers/${sub.customer_id}`)
    revalidatePath('/admin/customers')
    return { ok: true, message: 'Subscription resumed — customer notified on WhatsApp' }
}
