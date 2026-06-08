'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'

type Result = { ok: boolean; message: string }

export async function adminCompMeal(
    customerId: string,
    subscriptionId: string | undefined,
    reason: string,
): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { error } = await sb.from('comped_meal_ledger').insert({
        customer_id: customerId,
        subscription_id: subscriptionId ?? null,
        meal_date: new Date().toISOString().slice(0, 10),
        cogs_aed: 0,
        reason,
    })

    if (error) {
        console.error('adminCompMeal failed:', error)
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, 'comp_meal', 'customer', customerId, { reason, subscriptionId })
    revalidatePath(`/admin/customers/${customerId}`)
    return { ok: true, message: `Comped meal recorded for reason: ${reason}` }
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

    const { error } = await sb
        .from('subscriptions')
        .update({
            status: 'Paused',
            pause_date: new Date().toISOString(),
        })
        .eq('id', subscriptionId)

    if (error) {
        console.error('adminPauseSub failed:', error)
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, 'pause_subscription', 'subscription', subscriptionId)
    revalidatePath(`/admin/customers/${sub.customer_id}`)
    return { ok: true, message: 'Subscription paused' }
}

export async function adminResumeSub(subscriptionId: string): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { data: sub } = await sb
        .from('subscriptions')
        .select('id, customer_id, status')
        .eq('id', subscriptionId)
        .maybeSingle()

    if (!sub) return { ok: false, message: 'Subscription not found' }
    if (sub.status !== 'Paused') return { ok: false, message: `Cannot resume — status is ${sub.status}` }

    const { error } = await sb
        .from('subscriptions')
        .update({
            status: 'Active',
            pause_date: null,
        })
        .eq('id', subscriptionId)

    if (error) {
        console.error('adminResumeSub failed:', error)
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, 'resume_subscription', 'subscription', subscriptionId)
    revalidatePath(`/admin/customers/${sub.customer_id}`)
    return { ok: true, message: 'Subscription resumed' }
}
