'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { getIntakeState } from '@/infra/config/intake'
import { captureError } from '@/infra/logging/capture-error'
import { getNumberHealth, listMessageTemplates } from '@/infra/meta-whatsapp/client'
import {
    estimateCostAed, qualityVerdict, readTemplate, remainingAllowance,
    type MetaTemplate,
} from '@/contexts/contacts/domain/whatsapp-marketing'

type PreviewResult = { ok: boolean; count: number; message?: string }

type LaunchInput = {
    kind: 'custom' | 'season_reopen'
    channel?: 'email' | 'whatsapp'
    templateName?: string
    templateLanguage?: string
    templateVariables?: Record<string, string>
    includeUnknownConsent?: boolean
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
export async function previewAudience(
    audience: string,
    dormName?: string,
    channel: 'email' | 'whatsapp' = 'email',
    includeUnknown = false,
): Promise<PreviewResult> {
    await requireAdmin()

    const sb = createAdminSupabaseClient()
    // Channel is part of the question, not a filter applied afterwards: the
    // audience function excludes anyone unreachable or opted out on the
    // channel being sent, so this count is exactly what launching would queue.
    const { count, error } = await sb.rpc('broadcast_audience', {
        p_audience: audience,
        p_dorm: dormName ?? null,
        p_channel: channel,
        // Only ever true because a person ticked the box in the confirm step.
        p_include_unknown: includeUnknown,
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
    const channel = input.channel ?? 'email'

    // A WhatsApp broadcast carries no subject, heading or body: Meta only
    // accepts an approved template with its variables filled in. Validated
    // against the registry rather than the request, so a template that Meta
    // has paused or rejected since it was picked cannot be launched.
    if (channel === 'whatsapp') {
        if (input.kind !== 'custom') return { ok: false, message: 'Only a custom broadcast can go out on WhatsApp.' }
        if (!input.templateName || !input.templateLanguage) {
            return { ok: false, message: 'Pick an approved WhatsApp template.' }
        }
        const sbCheck = createAdminSupabaseClient()
        const { data: tpl } = await sbCheck.from('whatsapp_templates')
            .select('approved_at, status')
            .eq('name', input.templateName)
            .eq('language', input.templateLanguage)
            .maybeSingle()
        if (!tpl?.approved_at) {
            return { ok: false, message: `That template is ${(tpl?.status ?? 'not in the registry').toLowerCase()}. Sync templates and pick an approved one.` }
        }

        // Guardrail 3: never send into a red number. Read at launch, not at
        // page load, so a rating that dropped while the composer was open
        // still stops the send.
        const health = await getNumberHealth().catch(err => {
            captureError(err as Error, { area: 'admin', op: 'launchBroadcast.numberHealth' })
            return null
        })
        if (health && qualityVerdict(health.qualityRating) === 'block') {
            return { ok: false, message: 'The WhatsApp number\'s quality rating is RED. Sending now risks the number the signup flow depends on. Nothing was queued.' }
        }

        // Guardrail 4: never exceed what Meta will accept in a rolling 24h.
        const { data: sent24 } = await sbCheck.rpc('whatsapp_sent_last_24h')
        const { count: audienceSize } = await sbCheck.rpc('broadcast_audience', {
            p_audience: input.audience,
            p_dorm: input.dormName ?? null,
            p_channel: 'whatsapp',
            p_include_unknown: input.includeUnknownConsent ?? false,
        }, { count: 'exact', head: true })
        const remaining = remainingAllowance(health?.tier, Number(sent24 ?? 0))
        if ((audienceSize ?? 0) > remaining) {
            return {
                ok: false,
                message: `That audience is ${audienceSize} people but this number can only reach ${remaining} more in the next 24 hours. Send to a smaller group, or wait.`,
            }
        }
    }

    if (channel === 'email' && input.kind === 'custom') {
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
    const isWhatsApp = channel === 'whatsapp'
    const { data: created, error } = await sb.from('broadcasts').insert({
        kind: input.kind,
        channel,
        template_name: isWhatsApp ? input.templateName : null,
        template_language: isWhatsApp ? input.templateLanguage : null,
        template_variables: isWhatsApp ? (input.templateVariables ?? {}) : {},
        included_unknown_consent: isWhatsApp ? (input.includeUnknownConsent ?? false) : false,
        subject: isSeasonReopen
            ? 'Season reopening (ZeptoMail template)'
            : isWhatsApp ? `WhatsApp: ${input.templateName}` : subject,
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

    // Plan F (spec N17): held plans are not in the reopen audience; they hear
    // "your meals are ready" through the season outbox the moment the notice
    // launches, and the launch is stamped so the two-hour reminder stays quiet.
    let readyQueued = 0
    if (isSeasonReopen) {
        const { data: ready, error: readyErr } = await sb.rpc('season_queue_reopen_notices')
        if (readyErr) console.error('season_queue_reopen_notices failed after the reopen launch:', readyErr.message)
        readyQueued = Number((ready as { queued?: number } | null)?.queued ?? 0)
    }

    await logAdminAction(admin.email, 'launch_broadcast', 'broadcast', created.id, {
        kind: input.kind, channel,
        audience: input.audience, recipients: count, held_plans_told: readyQueued,
        // Recorded because including contacts who never opted in is a
        // deliberate choice someone made, and it should be attributable.
        template: isWhatsApp ? `${input.templateName}/${input.templateLanguage}` : undefined,
        included_unknown_consent: isWhatsApp ? (input.includeUnknownConsent ?? false) : undefined,
    })
    revalidatePath('/admin/comms/broadcast')
    return {
        ok: true, id: created.id, count: count as number,
        message: `Broadcast queued to ${count} recipients.${readyQueued > 0 ? ` ${readyQueued} held ${readyQueued === 1 ? 'plan hears' : 'plans hear'} their meals are ready.` : ''}`,
    }
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

// ── WhatsApp channel ───────────────────────────────────────────────────────

export interface TemplateSyncResult {
    ok: boolean
    message: string
    approved?: number
    total?: number
}

/**
 * Pull the template list from Meta into whatsapp_templates.
 *
 * Read from Meta rather than typed in by an admin, because "approved" has to
 * mean Meta approved it — and a template can be paused or rejected long after
 * it first went live. approved_at is set only while the status says APPROVED
 * and cleared the moment it does not, which is what stops the composer from
 * offering a template that would 132000 on the first send.
 */
export async function syncWhatsAppTemplates(): Promise<TemplateSyncResult> {
    const admin = await requireAdmin()

    let raw: unknown[]
    try {
        raw = await listMessageTemplates()
    } catch (err) {
        captureError(err as Error, { area: 'admin', op: 'syncWhatsAppTemplates' })
        return { ok: false, message: `Could not read the templates from Meta: ${(err as Error).message}` }
    }

    const rows = raw.map(t => readTemplate(t as MetaTemplate)).map(t => ({
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        approved_at: t.approved ? new Date().toISOString() : null,
        variables: t.variables,
        named_params: t.namedParams,
        body_preview: t.bodyPreview,
        synced_at: new Date().toISOString(),
    }))
    if (rows.length === 0) return { ok: false, message: 'Meta returned no templates for this business account.' }

    const sb = createAdminSupabaseClient()
    const { error } = await sb.from('whatsapp_templates').upsert(rows, { onConflict: 'name,language' })
    if (error) return { ok: false, message: `Could not save the templates: ${error.message}` }

    const approved = rows.filter(r => r.approved_at).length
    await logAdminAction(admin.email, 'sync_whatsapp_templates', 'whatsapp_templates', undefined, {
        total: rows.length, approved,
    })
    revalidatePath('/admin/comms/broadcast')
    return {
        ok: true,
        approved,
        total: rows.length,
        message: `${rows.length} template${rows.length === 1 ? '' : 's'} from Meta, ${approved} approved and ready to send.`,
    }
}

export interface PreflightResult {
    ok: boolean
    message?: string
    qualityRating?: string
    verdict: 'ok' | 'warn' | 'block'
    tier?: string
    sentLast24h: number
    remaining: number
    displayNumber?: string
    estimatedCostAed: number
    ratePerMessageAed: number
}

/**
 * What an admin needs to see before pressing send on WhatsApp: the number's
 * health, what it has already sent today, how many more it can reach, and
 * what this send will cost.
 *
 * Read at confirm time rather than page load, so a rating that dropped while
 * the composer was open is the rating the decision is made against.
 */
export async function whatsappPreflight(recipients: number): Promise<PreflightResult> {
    await requireAdmin()

    // UAE marketing conversation rate. An env var rather than a constant
    // because Meta reprices, and a stale number on a confirm screen is worse
    // than an obviously configurable one.
    const rate = Number(process.env.WHATSAPP_MARKETING_RATE_AED ?? '0.12')

    const sb = createAdminSupabaseClient()
    const { data: sent24 } = await sb.rpc('whatsapp_sent_last_24h')
    const sentLast24h = Number(sent24 ?? 0)

    let health: Awaited<ReturnType<typeof getNumberHealth>> | null = null
    try {
        health = await getNumberHealth()
    } catch (err) {
        captureError(err as Error, { area: 'admin', op: 'whatsappPreflight' })
        // Meta being unreadable is not permission to send blind: fall through
        // as 'warn' with the smallest tier assumed.
        return {
            ok: false,
            verdict: 'warn',
            message: 'Could not read the number\'s health from Meta. Treating it as unverified.',
            sentLast24h,
            remaining: remainingAllowance(undefined, sentLast24h),
            estimatedCostAed: estimateCostAed(recipients, rate),
            ratePerMessageAed: rate,
        }
    }

    return {
        ok: true,
        qualityRating: health.qualityRating,
        verdict: qualityVerdict(health.qualityRating),
        tier: health.tier,
        displayNumber: health.displayNumber,
        sentLast24h,
        remaining: remainingAllowance(health.tier, sentLast24h),
        estimatedCostAed: estimateCostAed(recipients, rate),
        ratePerMessageAed: rate,
    }
}

// ── Audience counts, all at once ───────────────────────────────────────────

export interface AudienceCount {
    /** Who this send would reach with the current settings. */
    count: number
    /** WhatsApp only: how many of them explicitly opted in. */
    optedIn: number
    /** WhatsApp only: how many there are if people who never opted in are included. */
    all: number
}

/**
 * Every audience's count in one call, for the audience cards.
 *
 * The old composer counted one audience at a time behind a dropdown, so the
 * only way to compare "Waitlist" with "2024 customers" was to pick one, wait,
 * pick the other, and remember. Choosing by number needs all the numbers on
 * screen at once.
 *
 * On WhatsApp each audience is counted twice — with and without people who
 * never opted in — so a card can say "12 opted in, 787 more if you include
 * everyone" instead of just showing a zero.
 */
export async function countAudiences(
    audiences: string[],
    channel: 'email' | 'whatsapp',
    includeUnknown: boolean,
    dormName?: string,
): Promise<{ ok: boolean; counts: Record<string, AudienceCount>; message?: string }> {
    await requireAdmin()

    const sb = createAdminSupabaseClient()
    const count = async (audience: string, withUnknown: boolean): Promise<number> => {
        if (audience === 'dorm' && !dormName) return 0
        const { count: n, error } = await sb.rpc('broadcast_audience', {
            p_audience: audience,
            p_dorm: audience === 'dorm' ? dormName : null,
            p_channel: channel,
            p_include_unknown: withUnknown,
        }, { count: 'exact', head: true })
        if (error) throw error
        return n ?? 0
    }

    try {
        const entries = await Promise.all(audiences.map(async a => {
            if (channel === 'email') {
                const n = await count(a, false)
                return [a, { count: n, optedIn: n, all: n }] as const
            }
            const [optedIn, all] = await Promise.all([count(a, false), count(a, true)])
            return [a, { count: includeUnknown ? all : optedIn, optedIn, all }] as const
        }))
        return { ok: true, counts: Object.fromEntries(entries) }
    } catch (err) {
        captureError(err as Error, { area: 'admin', op: 'countAudiences' })
        return { ok: false, counts: {}, message: 'Could not count the audiences. Reload and try again.' }
    }
}
