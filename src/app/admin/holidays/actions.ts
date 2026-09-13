'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { firstOpenDeliveryDay, isoOfUtc, type DeliveryWeekType } from '@/contexts/subscriptions/domain/open-delivery-day'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CompanyClosure {
    id: string
    closure_date: string
    reason: string
    created_by: string | null
    created_at: string
}

export async function fetchClosures(): Promise<CompanyClosure[]> {
    await requireAdmin()
    const sb = createAdminSupabaseClient()
    const { data } = await sb
        .from('company_closures')
        .select('id, closure_date, reason, created_by, created_at')
        .order('closure_date', { ascending: true })
    return (data ?? []) as CompanyClosure[]
}

export async function addClosure(
    closureDate: string,
    reason: string,
): Promise<{ ok: true } | { error: string }> {
    const user = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { error } = await sb
        .from('company_closures')
        .insert({ closure_date: closureDate, reason, created_by: user.email })

    if (error) {
        if (error.code === '23505') return { error: 'That date already has a closure scheduled.' }
        return { error: error.message }
    }

    await logAdminAction(user.email, 'add_company_closure', 'company_closures', closureDate, {
        reason,
    })
    await rollScheduledStartsPastClosures(sb, [closureDate], user.email)

    revalidatePath('/admin/holidays')
    return { ok: true }
}

export async function addClosureRange(
    startDate: string,
    endDate: string,
    reason: string,
): Promise<{ ok: true; count: number } | { error: string }> {
    const user = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (end < start) return { error: 'End date must be on or after start date.' }

    const dates: { closure_date: string; reason: string; created_by: string }[] = []
    const d = new Date(start)
    while (d <= end) {
        dates.push({
            closure_date: d.toISOString().slice(0, 10),
            reason,
            created_by: user.email,
        })
        d.setDate(d.getDate() + 1)
    }

    const { error } = await sb
        .from('company_closures')
        .upsert(dates, { onConflict: 'closure_date', ignoreDuplicates: true })

    if (error) return { error: error.message }

    await logAdminAction(user.email, 'add_company_closure_range', 'company_closures', `${startDate}..${endDate}`, {
        reason,
        days: dates.length,
    })
    await rollScheduledStartsPastClosures(sb, dates.map((d) => d.closure_date), user.email)

    revalidatePath('/admin/holidays')
    return { ok: true, count: dates.length }
}

/**
 * Insert exactly the given closure dates. Unlike addClosureRange, this does NOT
 * re-expand a start..end span — so days the admin deselected inside a range stay
 * open. The client sends the explicit selected set.
 */
export async function addClosures(
    dates: string[],
    reason: string,
): Promise<{ ok: true; count: number } | { error: string }> {
    const user = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const clean = Array.from(
        new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))),
    ).sort()
    if (clean.length === 0) return { error: 'No valid dates selected.' }

    const rows = clean.map((closure_date) => ({
        closure_date,
        reason,
        created_by: user.email,
    }))

    const { error } = await sb
        .from('company_closures')
        .upsert(rows, { onConflict: 'closure_date', ignoreDuplicates: true })

    if (error) return { error: error.message }

    await logAdminAction(
        user.email,
        'add_company_closure_range',
        'company_closures',
        `${clean[0]}..${clean[clean.length - 1]}`,
        { reason, days: clean.length },
    )
    await rollScheduledStartsPastClosures(sb, clean, user.email)

    revalidatePath('/admin/holidays')
    return { ok: true, count: clean.length }
}

/**
 * A plan scheduled to start on a night that has just been declared closed
 * moves to the first open delivery day. Otherwise its dashboard opens on
 * "Kitchen closed today" as day one, the start-day email fires into a shut
 * kitchen, and closure_tick (which only credits plans that have started)
 * owes it nothing. Moving start_date fires the end-date recompute and the
 * queue-shift triggers, so the rest of the cycle follows.
 */
async function rollScheduledStartsPastClosures(
    sb: SupabaseClient,
    closureDates: string[],
    adminEmail: string,
): Promise<number> {
    if (closureDates.length === 0) return 0
    const { data: subs } = await sb
        .from('subscriptions')
        .select('id, week_type, start_date')
        .eq('status', 'Scheduled')
        .in('start_date', closureDates)
    if (!subs || subs.length === 0) return 0

    const { data: all } = await sb.from('company_closures').select('closure_date')
    const closureSet = new Set((all ?? []).map((r) => r.closure_date as string))

    let moved = 0
    for (const s of subs) {
        const weekType = (s.week_type === '5DAYS' || s.week_type === '7DAYS' ? s.week_type : '6DAYS') as DeliveryWeekType
        const next = isoOfUtc(firstOpenDeliveryDay(new Date(s.start_date + 'T00:00:00Z'), weekType, closureSet))
        if (next === s.start_date) continue
        const { error } = await sb.from('subscriptions').update({ start_date: next }).eq('id', s.id)
        if (error) {
            console.error('rollScheduledStartsPastClosures failed:', s.id, error.message)
            continue
        }
        moved++
        await logAdminAction(adminEmail, 'roll_start_past_closure', 'subscriptions', s.id, {
            from: s.start_date, to: next,
        })
    }
    return moved
}

export async function removeClosure(
    id: string,
    closureDate: string,
): Promise<{ ok: true } | { error: string }> {
    const user = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { error } = await sb
        .from('company_closures')
        .delete()
        .eq('id', id)

    if (error) return { error: error.message }

    await logAdminAction(user.email, 'remove_company_closure', 'company_closures', closureDate, {})

    revalidatePath('/admin/holidays')
    return { ok: true }
}

export async function fetchAffectedSubscriptionCount(): Promise<number> {
    await requireAdmin()
    const sb = createAdminSupabaseClient()
    const { count } = await sb
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['Active', 'Skipped', 'Paused', 'Scheduled'])
    return count ?? 0
}
