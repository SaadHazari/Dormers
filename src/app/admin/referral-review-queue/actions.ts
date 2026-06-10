'use server'

import { createClient as createAdmin } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { logAdminAction } from '@/contexts/admin/usecases/audit'

function admin() {
    return createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
}

/**
 * Approve a soft-flagged referral. Two-step atomic-ish update:
 *   1. Flip referral_review_queue.status: pending → approved
 *   2. Flip the linked credits row's status: pending → approved (now
 *      spendable in the inviter's wallet)
 *
 * We re-check admin auth at the action level so a direct POST attack
 * can't bypass the page guard.
 */
export async function approveReferralReview(
    queueId: string,
    adminEmail: string | null,
): Promise<{ ok: true } | { error: string }> {
    const user = await requireAdmin()
    const sb = admin()

    const { data: row } = await sb
        .from('referral_review_queue')
        .select('id, referral_id, status')
        .eq('id', queueId)
        .maybeSingle()
    if (!row) return { error: 'row_not_found' }
    if (row.status !== 'pending') return { error: 'row_not_pending' }

    // Flip the queue row first. If the credit update fails after this,
    // ops can re-run a manual UPDATE on credits — the queue row reflects
    // the admin's decision.
    const { error: queueError } = await sb
        .from('referral_review_queue')
        .update({
            status:      'approved',
            reviewed_by: adminEmail ?? user.email,
            reviewed_at: new Date().toISOString(),
        })
        .eq('id', queueId)
    if (queueError) {
        console.error('approveReferralReview: queue update failed', queueError)
        return { error: 'queue_update_failed' }
    }

    // Flip the credit linked to this referral. Scoped to status=pending
    // so this is idempotent — re-running on already-approved credits is
    // a no-op.
    const { error: creditError } = await sb
        .from('credits')
        .update({ status: 'approved' })
        .eq('referral_id', row.referral_id)
        .eq('status', 'pending')
    if (creditError) {
        console.error('approveReferralReview: credit update failed', creditError)
        return { error: 'credit_update_failed' }
    }

    // Audit trail — this is the highest-value queue decision (it makes a
    // credit spendable); every other admin mutation logs, so must this.
    await logAdminAction(user.email, 'approve_referral_review', 'referral_review_queue', queueId, {
        referral_id: row.referral_id,
    })

    revalidatePath('/admin/referral-review-queue')
    return { ok: true }
}

/**
 * Reject a soft-flagged referral. Mirrors approve but flips the credit
 * to 'rejected' so the inviter's wallet stops showing it as pending.
 */
export async function rejectReferralReview(
    queueId: string,
    adminEmail: string | null,
    reason?: string,
): Promise<{ ok: true } | { error: string }> {
    const user = await requireAdmin()
    const sb = admin()

    const { data: row } = await sb
        .from('referral_review_queue')
        .select('id, referral_id, status, flags')
        .eq('id', queueId)
        .maybeSingle()
    if (!row) return { error: 'row_not_found' }
    if (row.status !== 'pending') return { error: 'row_not_pending' }

    // Persist the reject reason into flags so we have an audit trail.
    const flags = (row.flags as Record<string, unknown> | null) ?? {}
    const updatedFlags = { ...flags, reject_reason: reason ?? 'unspecified' }

    const { error: queueError } = await sb
        .from('referral_review_queue')
        .update({
            status:      'rejected',
            reviewed_by: adminEmail ?? user.email,
            reviewed_at: new Date().toISOString(),
            flags:       updatedFlags,
        })
        .eq('id', queueId)
    if (queueError) {
        console.error('rejectReferralReview: queue update failed', queueError)
        return { error: 'queue_update_failed' }
    }

    const { error: creditError } = await sb
        .from('credits')
        .update({ status: 'rejected' })
        .eq('referral_id', row.referral_id)
        .eq('status', 'pending')
    if (creditError) {
        console.error('rejectReferralReview: credit update failed', creditError)
        return { error: 'credit_update_failed' }
    }

    await logAdminAction(user.email, 'reject_referral_review', 'referral_review_queue', queueId, {
        referral_id: row.referral_id, reason: reason ?? 'unspecified',
    })

    revalidatePath('/admin/referral-review-queue')
    return { ok: true }
}
