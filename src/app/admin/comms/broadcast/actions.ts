'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { getIntakeState } from '@/infra/config/intake'

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
 *
 * A HEAD request with count:'exact' asks PostgREST for the Content-Range
 * total instead of the rows themselves — a plain data?.length read is capped
 * at PostgREST's default max-rows (1000), which would silently under-report
 * a bigger audience in the confirm modal. broadcast_audience is marked
 * STABLE precisely so PostgREST accepts GET/HEAD against it.
 */
export async function previewAudience(audience: string, dormName?: string): Promise<PreviewResult> {
    await requireAdmin()

    const sb = createAdminSupabaseClient()
    const { count, error } = await sb.rpc('broadcast_audience', {
        p_audience: audience,
        p_dorm: dormName ?? null,
    }, { count: 'exact', head: true })
    if (error) return { ok: false, count: 0, message: `Could not resolve the audience: ${error.message}` }
    return { ok: true, count: count ?? 0 }
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
    // Nothing should be able to announce "we're back" while checkout still
    // refuses customers — intake being paused would make the reopening
    // notice a lie the moment it lands.
    if (input.kind === 'season_reopen') {
        const state = await getIntakeState()
        if (state.paused) {
            return { ok: false, message: 'Intake is still paused. Reopen intake before sending the reopening notice.' }
        }
    }

    const sb = createAdminSupabaseClient()
    // season_reopen is entirely template-driven (ZeptoMail renders heading,
    // body, and the CTA per recipient) — leftover custom-mode state in the
    // client (a heading typed before switching modes, a half-filled CTA
    // pair) must never reach the row. A stray cta_label with no cta_url (or
    // vice versa) would also violate the cta_pairs DB constraint with a raw
    // error instead of a clean one.
    const isSeasonReopen = input.kind === 'season_reopen'
    const { data: created, error } = await sb.from('broadcasts').insert({
        kind: input.kind,
        subject: isSeasonReopen ? 'Season reopening (ZeptoMail template)' : subject,
        heading: isSeasonReopen ? '' : (input.heading?.trim() ?? ''),
        body: isSeasonReopen ? '' : (input.body?.trim() ?? ''),
        cta_label: isSeasonReopen ? null : (input.ctaLabel?.trim() || null),
        cta_url: isSeasonReopen ? null : (input.ctaUrl?.trim() || null),
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
 * broadcast back to 'sending' if it had already settled into 'done' — a
 * broadcast can reach 'done' with parked rows still in it (the dispatcher
 * only looks at pending rows), so this is what recovers it.
 *
 * 'cancelled' is excluded from the flip and checked up front: cancelling is
 * the admin's kill switch, so Retry must never resurrect a stopped broadcast
 * and resume sending to its remaining unsent recipients.
 *
 * Ordered so a partial failure is always recoverable by pressing Retry
 * again: status check and count first (nothing touched yet), flip the
 * status second (still nothing touched if this fails), re-arm the rows
 * last. If re-arming fails after the flip, the rows still have attempts >= 3
 * and the broadcast is already 'sending', so a second attempt picks up
 * exactly where this one left off instead of getting stuck (re-arming first
 * would zero out attempts, and a status-flip failure after that would leave
 * no rows with attempts >= 3 for a retry to find).
 */
export async function retryBroadcastFailures(id: string): Promise<RetryResult> {
    const admin = await requireAdmin()

    const sb = createAdminSupabaseClient()

    const { data: broadcast, error: statusErr } = await sb
        .from('broadcasts')
        .select('status')
        .eq('id', id)
        .maybeSingle()
    if (statusErr) return { ok: false, rearmed: 0, message: `Could not check the broadcast: ${statusErr.message}` }
    if (broadcast?.status === 'cancelled') {
        return { ok: false, rearmed: 0, message: 'This broadcast was stopped. Nothing was re-queued.' }
    }

    const { count: parked, error: countErr } = await sb
        .from('broadcast_sends')
        .select('id', { count: 'exact', head: true })
        .eq('broadcast_id', id)
        .is('sent_at', null)
        .gte('attempts', 3)
    if (countErr) return { ok: false, rearmed: 0, message: `Could not check parked recipients: ${countErr.message}` }
    if (!parked) return { ok: false, rearmed: 0, message: 'Nothing to retry.' }

    const { error: flipErr } = await sb
        .from('broadcasts')
        .update({ status: 'sending' })
        .eq('id', id)
        .eq('status', 'done')
    if (flipErr) return { ok: false, rearmed: 0, message: `Could not resume the broadcast: ${flipErr.message}` }

    const { error: rearmErr } = await sb
        .from('broadcast_sends')
        .update({ attempts: 0, last_error: null })
        .eq('broadcast_id', id)
        .is('sent_at', null)
        .gte('attempts', 3)
    if (rearmErr) {
        return { ok: false, rearmed: 0, message: 'Rows were not re-armed. Press Retry failures again.' }
    }

    await logAdminAction(admin.email, 'retry_broadcast_failures', 'broadcast', id, { rearmed: parked })
    revalidatePath('/admin/comms/broadcast')
    return { ok: true, rearmed: parked, message: `${parked} recipient${parked === 1 ? '' : 's'} re-queued.` }
}
