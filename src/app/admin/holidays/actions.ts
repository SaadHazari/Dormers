'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'

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

    revalidatePath('/admin/holidays')
    return { ok: true, count: clean.length }
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
