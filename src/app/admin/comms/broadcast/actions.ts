'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'

type PreviewResult = { ok: boolean; count: number; message?: string }

type LaunchInput = {
    kind: 'custom' | 'season_reopen'
    subject: string
    heading: string
    body: string
    ctaLabel?: string
    ctaUrl?: string
    audience: string
    dormName?: string
}
type LaunchResult = { ok: boolean; id?: string; count?: number; message: string }

type ProgressResult = { ok: boolean; status: string; total: number; sent: number; failedParked: number }

type CancelResult = { ok: boolean; message: string }

type RetryResult = { ok: boolean; rearmed: number; message: string }

/**
 * Live count for the audience the admin is currently configuring, shown in
 * the composer before they commit to a send. Uses the same RPC the confirm
 * transaction snapshots from, so the number never lies about what launching
 * would queue.
 */
export async function previewAudience(audience: string, dormName?: string): Promise<PreviewResult> {
    await requireAdmin()

    const sb = createAdminSupabaseClient()
    const { data, error } = await sb.rpc('broadcast_audience', {
        p_audience: audience,
        p_dorm: dormName ?? null,
    })
    if (error) return { ok: false, count: 0, message: `Could not resolve the audience: ${error.message}` }
    return { ok: true, count: data?.length ?? 0 }
}

/**
 * Creates the broadcast row and immediately confirms it, which snapshots the
 * audience into broadcast_sends inside a single transaction (broadcast_confirm).
 * If the snapshot fails we must not leave a 'sending' row with recipient_count
 * 0 behind — the dispatcher's tick would find no pending rows and instantly
 * mark it 'done', silently swallowing what looked like a launch.
 */
export async function launchBroadcast(input: LaunchInput): Promise<LaunchResult> {
    const admin = await requireAdmin()

    const subject = input.subject.trim()
    if (input.kind === 'custom') {
        if (!subject) return { ok: false, message: 'Subject is required.' }
        if (subject.length > 200) return { ok: false, message: 'Subject is too long (max 200 characters).' }
        if (!input.heading.trim()) return { ok: false, message: 'Heading is required.' }
        if (!input.body.trim()) return { ok: false, message: 'Body is required.' }
        if (input.body.length > 8000) return { ok: false, message: 'Body is too long (max 8000 characters).' }
        if ((input.ctaLabel?.trim() ? 1 : 0) !== (input.ctaUrl?.trim() ? 1 : 0)) {
            return { ok: false, message: 'A button needs both a label and a link.' }
        }
        if (input.ctaUrl && !/^https:\/\//.test(input.ctaUrl.trim())) {
            return { ok: false, message: 'The button link must be a full https:// URL.' }
        }
    }
    if (input.kind === 'season_reopen' && input.audience !== 'reopen') {
        return { ok: false, message: 'The reopening notice always goes to the reopen audience.' }
    }
    if (input.audience === 'dorm' && !input.dormName?.trim()) {
        return { ok: false, message: 'Pick a dorm for a dorm-only broadcast.' }
    }

    const sb = createAdminSupabaseClient()
    const { data: created, error } = await sb.from('broadcasts').insert({
        kind: input.kind,
        subject: input.kind === 'season_reopen' ? 'Season reopening (ZeptoMail template)' : subject,
        heading: input.heading?.trim() ?? '',
        body: input.body?.trim() ?? '',
        cta_label: input.ctaLabel?.trim() || null,
        cta_url: input.ctaUrl?.trim() || null,
        audience: input.audience,
        dorm_name: input.dormName?.trim() || null,
        created_by: admin.email,
    }).select('id').single()
    if (error || !created) return { ok: false, message: `Could not create the broadcast: ${error?.message}` }

    const { data: count, error: confirmErr } = await sb.rpc('broadcast_confirm', { p_broadcast_id: created.id })
    if (confirmErr) {
        // A broadcast that failed to snapshot must not sit in 'sending' with
        // recipient_count 0 — the tick would immediately mark it done.
        await sb.from('broadcasts').delete().eq('id', created.id)
        return { ok: false, message: `Could not snapshot the audience: ${confirmErr.message}` }
    }

    await logAdminAction(admin.email, 'launch_broadcast', 'broadcast', created.id, {
        kind: input.kind, audience: input.audience, recipients: count,
    })
    revalidatePath('/admin/comms/broadcast')
    return { ok: true, id: created.id, count: count as number, message: `Broadcast queued to ${count} recipients.` }
}

/**
 * Polled by the composer while a broadcast is in flight. `sent` and
 * `failedParked` key on the same columns the dispatcher writes: sent_at set
 * means delivered, attempts >= 3 with sent_at still null means the dispatcher
 * gave up on that row until an admin retries it.
 */
export async function getBroadcastProgress(id: string): Promise<ProgressResult> {
    await requireAdmin()

    const sb = createAdminSupabaseClient()
    const { data: broadcast, error } = await sb
        .from('broadcasts')
        .select('status, recipient_count')
        .eq('id', id)
        .maybeSingle()
    if (error || !broadcast) return { ok: false, status: 'unknown', total: 0, sent: 0, failedParked: 0 }

    const [{ count: sent }, { count: failedParked }] = await Promise.all([
        sb.from('broadcast_sends').select('id', { count: 'exact', head: true })
            .eq('broadcast_id', id).not('sent_at', 'is', null),
        sb.from('broadcast_sends').select('id', { count: 'exact', head: true })
            .eq('broadcast_id', id).is('sent_at', null).gte('attempts', 3),
    ])

    return {
        ok: true,
        status: broadcast.status as string,
        total: broadcast.recipient_count as number,
        sent: sent ?? 0,
        failedParked: failedParked ?? 0,
    }
}

/**
 * Admin kill switch. Only stops a broadcast that is still 'sending' — rows
 * already sent stay sent, the dispatcher just stops picking up pending ones.
 */
export async function cancelBroadcast(id: string): Promise<CancelResult> {
    const admin = await requireAdmin()

    const sb = createAdminSupabaseClient()
    const { data: updated, error } = await sb
        .from('broadcasts')
        .update({ status: 'cancelled', finished_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'sending')
        .select('id')
        .maybeSingle()
    if (error) return { ok: false, message: `Could not cancel the broadcast: ${error.message}` }
    if (!updated) return { ok: false, message: 'This broadcast is not currently sending.' }

    await logAdminAction(admin.email, 'cancel_broadcast', 'broadcast', id, {})
    revalidatePath('/admin/comms/broadcast')
    return { ok: true, message: 'Broadcast cancelled.' }
}

/**
 * Re-arms rows the dispatcher parked after 3 failed attempts, then flips the
 * broadcast back to 'sending' if it had already settled into 'done' or
 * 'cancelled' — a broadcast can reach 'done' with parked rows still in it
 * (the dispatcher only looks at pending rows), so this is what recovers it.
 */
export async function retryBroadcastFailures(id: string): Promise<RetryResult> {
    const admin = await requireAdmin()

    const sb = createAdminSupabaseClient()
    const { data: rearmed, error } = await sb
        .from('broadcast_sends')
        .update({ attempts: 0, last_error: null })
        .eq('broadcast_id', id)
        .is('sent_at', null)
        .gte('attempts', 3)
        .select('id')
    if (error) return { ok: false, rearmed: 0, message: `Could not retry: ${error.message}` }

    const rearmedCount = rearmed?.length ?? 0
    if (rearmedCount > 0) {
        await sb
            .from('broadcasts')
            .update({ status: 'sending' })
            .eq('id', id)
            .in('status', ['done', 'cancelled'])
    }

    await logAdminAction(admin.email, 'retry_broadcast_failures', 'broadcast', id, { rearmed: rearmedCount })
    revalidatePath('/admin/comms/broadcast')
    return { ok: true, rearmed: rearmedCount, message: `${rearmedCount} recipient${rearmedCount === 1 ? '' : 's'} re-queued.` }
}
