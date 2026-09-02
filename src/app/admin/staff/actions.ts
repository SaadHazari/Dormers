'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { normalisePhone } from '@/shared/phone'
import { generateClaimCode, hashClaimCode, CODE_TTL_DAYS } from '@/contexts/staff/domain/claim-code'
import { STAFF_PLAN_NAME, STAFF_SATURDAY_MEAL_AED, unusedSaturdays, approvedRenewalStartDate, type StaffWeekType } from '@/contexts/staff/domain/staff-plan'
import { staffIntakeGate } from '@/contexts/staff/domain/staff-intake-gate'
import { staffSeasonRefusal } from '@/contexts/staff/domain/staff-season-copy'
import { getIntakeState } from '@/infra/config/intake'
import { computeEndDate, isoDate } from '@/contexts/subscriptions/domain/end-date'
import { refundPaymentFils } from '@/infra/stripe/refunds'
import { captureError } from '@/infra/logging/capture-error'

type Result = { ok: boolean; message: string }
type CodeResult = Result & { code?: string }

function aeTodayIso(): string {
    return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Stripe payment intent behind a staff sub's prepaid Saturdays, if any. */
async function paidIntentForSub(sb: ReturnType<typeof createAdminSupabaseClient>, subscriptionId: string) {
    const { data } = await sb
        .from('orders')
        .select('stripe_payment_id')
        .eq('subscription_id', subscriptionId)
        .eq('payment_method', 'stripe')
        .not('stripe_payment_id', 'is', null)
        .maybeSingle()
    return (data?.stripe_payment_id as string | null) ?? null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Register an intern and mint their claim code. The plaintext code is
 * returned ONCE for the admin to send over WhatsApp — only its hash is
 * stored, so there is no "view code again" path. Use regenerate instead.
 */
export async function addStaffMember(
    name: string,
    email: string,
    whatsapp: string,
): Promise<CodeResult> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()
    const phone = normalisePhone(whatsapp)

    if (cleanName.length < 2) return { ok: false, message: 'Name looks too short' }
    if (!EMAIL_RE.test(cleanEmail)) return { ok: false, message: 'That email doesn\'t look valid' }
    if (!/^\+\d{10,15}$/.test(phone)) return { ok: false, message: 'WhatsApp number must be a full number (e.g. 0501234567 or +9715…)' }

    const code = generateClaimCode()
    const expires = new Date(Date.now() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000)

    const { data: row, error } = await sb
        .from('staff_members')
        .insert({
            name: cleanName,
            email: cleanEmail,
            whatsapp_number: phone,
            claim_code_hash: hashClaimCode(code),
            code_expires_at: expires.toISOString(),
            created_by: admin.email,
        })
        .select('id')
        .single()

    if (error) {
        if (error.code === '23505') {
            return { ok: false, message: 'This email already has a live staff record — end it first to re-invite.' }
        }
        console.error('addStaffMember failed:', error)
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, 'add_staff_member', 'staff_members', row.id, {
        name: cleanName, email: cleanEmail, whatsapp: phone, code_expires_at: expires.toISOString(),
    })

    revalidatePath('/admin/staff')
    return { ok: true, message: `${cleanName} registered — send them the code now, it won't be shown again.`, code }
}

/**
 * Mint a fresh code for an unclaimed invite (the old one expired or got
 * lost). Old code stops working immediately — there is only ever one valid
 * code per row.
 */
export async function regenerateStaffCode(staffId: string): Promise<CodeResult> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const code = generateClaimCode()
    const expires = new Date(Date.now() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000)

    const { data: row, error } = await sb
        .from('staff_members')
        .update({
            claim_code_hash: hashClaimCode(code),
            code_expires_at: expires.toISOString(),
            code_verified_at: null,
        })
        .eq('id', staffId)
        .eq('status', 'invited')
        .select('id, name')
        .maybeSingle()

    if (error) {
        console.error('regenerateStaffCode failed:', error)
        return { ok: false, message: error.message }
    }
    if (!row) return { ok: false, message: 'Only unclaimed invites can get a new code.' }

    await logAdminAction(admin.email, 'regenerate_staff_code', 'staff_members', staffId, {
        code_expires_at: expires.toISOString(),
    })

    revalidatePath('/admin/staff')
    return { ok: true, message: `New code for ${row.name} — the old one is dead.`, code }
}

/**
 * Kill an unclaimed invite. Offboarding an ACTIVE staff member (terminate
 * plan + refund unused Saturdays) is a separate, heavier action — this one
 * only covers "invited the wrong person / they never joined".
 */
export async function revokeStaffInvite(staffId: string): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { data: row, error } = await sb
        .from('staff_members')
        .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
            ended_by: admin.email,
        })
        .eq('id', staffId)
        .eq('status', 'invited')
        .select('id, name, email')
        .maybeSingle()

    if (error) {
        console.error('revokeStaffInvite failed:', error)
        return { ok: false, message: error.message }
    }
    if (!row) return { ok: false, message: 'Invite not found, or already claimed — use offboarding for active staff.' }

    await logAdminAction(admin.email, 'revoke_staff_invite', 'staff_members', staffId, {
        name: row.name, email: row.email,
    })

    revalidatePath('/admin/staff')
    return { ok: true, message: `Invite for ${row.name} revoked — their code no longer works.` }
}

/**
 * Send (or re-send) the claim code on command. Because only the code's
 * hash is stored, every send MINTS A FRESH CODE — the previous one stops
 * working the moment this commits. Mint-then-send ordering means a failed
 * send leaves a valid (unsent) code behind; the admin just retries, which
 * mints again. No state can strand.
 */
export async function sendStaffInvite(
    staffId: string,
    channel: 'email' | 'whatsapp',
): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const code = generateClaimCode()
    const expires = new Date(Date.now() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000)

    const { data: row, error } = await sb
        .from('staff_members')
        .update({
            claim_code_hash: hashClaimCode(code),
            code_expires_at: expires.toISOString(),
            code_verified_at: null,
        })
        .eq('id', staffId)
        .eq('status', 'invited')
        .select('id, name, email, whatsapp_number')
        .maybeSingle()

    if (error) {
        console.error('sendStaffInvite mint failed:', error)
        return { ok: false, message: error.message }
    }
    if (!row) return { ok: false, message: 'Only unclaimed invites can be sent a code.' }

    const firstName = (row.name as string).split(' ')[0] || 'there'
    const expiresPretty = expires.toLocaleDateString('en-AE', { day: 'numeric', month: 'long' })

    try {
        if (channel === 'email') {
            const { sendStaffInviteEmail } = await import('@/infra/zeptomail/client')
            await sendStaffInviteEmail({
                toEmail: row.email as string,
                firstName,
                code,
                expiresPretty,
            })
        } else {
            // Two messages: the auth-format code (essential — throws on
            // failure) + the welcome/claim-button utility template
            // (best-effort while it's in Meta review).
            const { sendStaffInviteWhatsApp } = await import('@/infra/meta-whatsapp/client')
            const res = await sendStaffInviteWhatsApp(row.whatsapp_number as string, firstName, code)
            if (!res.welcomeSent) {
                await logAdminAction(admin.email, 'send_staff_invite', 'staff_members', staffId, {
                    channel, code_expires_at: expires.toISOString(), welcome_failed: res.welcomeError,
                })
                revalidatePath('/admin/staff')
                return {
                    ok: true,
                    message: `Code sent to ${row.name} on WhatsApp — but the welcome message didn't go out (${res.welcomeError ?? 'template unavailable'}). Tell them to use dormers.ae/staff/claim.`,
                }
            }
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'send failed'
        console.error(`sendStaffInvite ${channel} failed:`, err)
        return { ok: false, message: `A fresh code was minted but the ${channel} didn't go out: ${msg}` }
    }

    await logAdminAction(admin.email, 'send_staff_invite', 'staff_members', staffId, {
        channel, code_expires_at: expires.toISOString(),
    })

    revalidatePath('/admin/staff')
    return {
        ok: true,
        message: `Fresh code sent to ${row.name} by ${channel === 'email' ? 'email' : 'WhatsApp'} — any older code is now dead.`,
    }
}

/**
 * The green check — and the moment the renewal's start date comes into
 * existence.
 *
 * A pending renewal carries only a guess about when the admin would get to
 * it. Approving used to flip the flag and leave that guess in place, so a
 * renewal approved three weeks late activated retroactively, its end_date
 * computed from a day already gone. The approval now sets the real date:
 * the next working day, or the day after the current cycle ends, whichever
 * is later (approvedRenewalStartDate).
 *
 * original_start_date moves with it. _subscriptions_shift_queued_scheduled
 * floors a queued sub at GREATEST(live.end_date + 1, original_start_date);
 * leaving the old floor behind would let a later end-date change drag the
 * renewal back to a date the admin never approved.
 *
 * end_date needs no work here — trg_subscriptions_recompute_end_date fires
 * on UPDATE OF start_date and recomputes it from the canonical formula.
 *
 * Also drains the customer's pending week-type so menus/labels follow the
 * renewed cycle's cadence.
 */
export async function approveStaffRenewal(subscriptionId: string): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    // Read before write: the start date depends on the sub's cadence and on
    // whether this intern still has a cycle running.
    const { data: pending } = await sb
        .from('subscriptions')
        .select('id, customer_id, week_type')
        .eq('id', subscriptionId)
        .eq('plan_name', STAFF_PLAN_NAME)
        .eq('staff_approval', 'pending')
        .eq('status', 'Scheduled')
        .maybeSingle()
    if (!pending) return { ok: false, message: 'Renewal not found or already handled.' }

    // The cycle this renewal follows, if one is still running. Latest end
    // date wins so a paused cycle's extended tail is respected.
    const { data: liveCycle } = await sb
        .from('subscriptions')
        .select('end_date')
        .eq('customer_id', pending.customer_id)
        .eq('plan_name', STAFF_PLAN_NAME)
        .in('status', ['Active', 'Paused', 'Skipped'])
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle()

    const weekType: StaffWeekType = pending.week_type === '6DAYS' ? '6DAYS' : '5DAYS'
    const startDate = approvedRenewalStartDate({
        approvedOnIso: aeTodayIso(),
        weekType,
        currentCycleEndIso: (liveCycle?.end_date as string | undefined) ?? null,
    })

    // Approval is what starts the cycle, so the season rule belongs here as
    // much as at the moment the intern chose. A renewal queued while the
    // shop was open can reach this button after a pause has been called.
    const intake = await getIntakeState()
    const gate = staffIntakeGate({
        paused: intake.paused,
        pauseScheduledFor: intake.pauseScheduledFor,
        cycleEndIso: isoDate(computeEndDate({
            startDate: new Date(startDate + 'T00:00:00Z'),
            planKind: 'monthly', weekType, skipCount: 0, pauseDays: 0,
        })),
    })
    if (!gate.ok) return { ok: false, message: staffSeasonRefusal(gate, 'admin') }

    const { data: sub, error } = await sb
        .from('subscriptions')
        .update({
            staff_approval: 'approved',
            start_date: startDate,
            original_start_date: startDate,
        })
        .eq('id', subscriptionId)
        .eq('plan_name', STAFF_PLAN_NAME)
        // CAS on the gate columns: a second approver (or a decline landing
        // first) loses rather than double-stamping a start date.
        .eq('staff_approval', 'pending')
        .eq('status', 'Scheduled')
        .select('id, customer_id, week_type, start_date')
        .maybeSingle()

    if (error) {
        console.error('approveStaffRenewal failed:', error)
        return { ok: false, message: error.message }
    }
    if (!sub) return { ok: false, message: 'Renewal not found or already handled.' }

    await sb.from('customers')
        .update({ week_type: sub.week_type, pending_week_type: null })
        .eq('id', sub.customer_id)

    await logAdminAction(admin.email, 'approve_staff_renewal', 'subscription', subscriptionId, {
        customer_id: sub.customer_id, week_type: sub.week_type, start_date: sub.start_date,
    })

    revalidatePath('/admin/staff')
    const firstDelivery = new Date(sub.start_date + 'T00:00:00').toLocaleDateString('en-AE', {
        weekday: 'long', day: 'numeric', month: 'long',
    })
    return { ok: true, message: `Renewal approved — first delivery ${firstDelivery}.` }
}

/**
 * Decline a queued staff renewal. A prepaid 6-day renewal is refunded IN
 * FULL first — the sub only flips to Ended once Stripe accepts the refund,
 * so money can never be stranded on a declined cycle.
 */
export async function declineStaffRenewal(subscriptionId: string): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { data: sub } = await sb
        .from('subscriptions')
        .select('id, customer_id, week_type, staff_approval, status')
        .eq('id', subscriptionId)
        .eq('plan_name', STAFF_PLAN_NAME)
        .maybeSingle()
    if (!sub || sub.staff_approval !== 'pending' || sub.status !== 'Scheduled') {
        return { ok: false, message: 'Renewal not found or already handled.' }
    }

    let refundNote = 'free cycle, nothing to refund'
    const intent = await paidIntentForSub(sb, subscriptionId)
    if (intent) {
        try {
            const refundId = await refundPaymentFils(intent, undefined, `refund:decline:${subscriptionId}`) // full refund
            refundNote = `AED ${STAFF_SATURDAY_MEAL_AED * 4} refunded (${refundId})`
        } catch (err) {
            captureError(err, { area: 'staff', op: 'declineStaffRenewal.refund' })
            return { ok: false, message: 'Stripe refund failed — renewal left pending. Check Stripe and retry.' }
        }
    }

    const { error } = await sb
        .from('subscriptions')
        .update({ status: 'Ended' })
        .eq('id', subscriptionId)
        .eq('staff_approval', 'pending')
    if (error) {
        console.error('declineStaffRenewal end failed:', error)
        return { ok: false, message: `Refund went through (${refundNote}) but ending the sub failed: ${error.message}` }
    }

    await logAdminAction(admin.email, 'decline_staff_renewal', 'subscription', subscriptionId, {
        customer_id: sub.customer_id, refund: refundNote,
    })

    revalidatePath('/admin/staff')
    return { ok: true, message: `Renewal declined — ${refundNote}.` }
}

/**
 * Offboarding — internship over. Locked semantics (2026-06-12):
 * terminate immediately, refund what wasn't enjoyed.
 *
 *   1. staff record → ended (their claim/renewal access dies)
 *   2. any queued renewal → ended, full refund if prepaid
 *   3. the live cycle → ended today; on a prepaid 6-day cycle the
 *      Saturdays still ahead are refunded at the flat AED 20 each
 *
 * Refund failures do NOT block the termination — the plan must end the day
 * employment ends; the message tells the admin to settle the refund in
 * Stripe manually.
 */
export async function offboardStaffMember(staffId: string): Promise<Result> {
    const admin = await requireAdmin()
    const sb = createAdminSupabaseClient()

    const { data: staff, error: staffErr } = await sb
        .from('staff_members')
        .update({ status: 'ended', ended_at: new Date().toISOString(), ended_by: admin.email })
        .eq('id', staffId)
        .eq('status', 'active')
        .select('id, name, customer_id')
        .maybeSingle()
    if (staffErr) return { ok: false, message: staffErr.message }
    if (!staff?.customer_id) return { ok: false, message: 'Staff member not found or not active.' }

    const today = aeTodayIso()
    const notes: string[] = []

    const { data: subsRaw } = await sb
        .from('subscriptions')
        .select('id, status, week_type, end_date')
        .eq('customer_id', staff.customer_id)
        .eq('plan_name', STAFF_PLAN_NAME)
        .in('status', ['Active', 'Paused', 'Skipped', 'Scheduled'])

    for (const sub of subsRaw ?? []) {
        const wasQueued = sub.status === 'Scheduled'
        const { data: endedRows, error: endErr } = await sb
            .from('subscriptions')
            .update(wasQueued ? { status: 'Ended' } : { status: 'Ended', end_date: today })
            .eq('id', sub.id)
            // CAS: only the call that actually flips a still-live sub to Ended
            // proceeds to refund. A concurrent offboard finds it already Ended
            // and skips, so the Stripe refund (no idempotency key) can't double-fire.
            .in('status', ['Active', 'Paused', 'Skipped', 'Scheduled'])
            .select('id')
        if (endErr) {
            notes.push(`could not end sub ${sub.id}: ${endErr.message}`)
            continue
        }
        if (!endedRows || endedRows.length === 0) {
            // Already ended by a concurrent offboard — don't refund twice.
            continue
        }

        if (sub.week_type === '6DAYS') {
            const intent = await paidIntentForSub(sb, sub.id as string)
            if (intent) {
                // Queued cycle: nothing enjoyed → full refund. Live cycle:
                // refund the Saturdays still ahead of today, flat AED 20 each.
                const saturdays = wasQueued ? 4 : unusedSaturdays(today, sub.end_date as string)
                if (saturdays > 0) {
                    try {
                        const refundId = await refundPaymentFils(intent, saturdays * STAFF_SATURDAY_MEAL_AED * 100, `refund:offboard:${sub.id}`)
                        notes.push(`refunded ${saturdays} Saturday${saturdays === 1 ? '' : 's'} (AED ${saturdays * STAFF_SATURDAY_MEAL_AED}, ${refundId})`)
                    } catch (err) {
                        captureError(err, { area: 'staff', op: 'offboardStaffMember.refund' })
                        notes.push(`REFUND FAILED for ${saturdays} Saturdays — settle manually in Stripe (intent ${intent})`)
                    }
                }
            }
        }
    }

    await logAdminAction(admin.email, 'offboard_staff_member', 'staff_members', staffId, {
        name: staff.name, customer_id: staff.customer_id, notes,
    })

    revalidatePath('/admin/staff')
    revalidatePath('/admin/customers')
    const detail = notes.length ? ` — ${notes.join('; ')}` : ''
    return { ok: true, message: `${staff.name} offboarded, plan terminated${detail}.` }
}
