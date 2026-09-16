'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { captureError } from '@/infra/logging/capture-error'
import { planDeletion, type DeleteImpactRow } from '@/contexts/admin/domain/deletion-plan'
import { MAX_DELETE_BATCH } from './constants'

/**
 * Deleting people from the admin panel.
 *
 * A season of building left seeded test accounts behind and there was no
 * supported way to remove one, which meant doing it by hand in SQL — which is
 * how a real customer gets deleted by accident. Two rules shape everything
 * here: nothing is destroyed before the exact blast radius has been on screen,
 * and every deletion is written to the audit log with a snapshot of who the
 * person was.
 */

export interface DeletePreview {
    ok: boolean
    message?: string
    rows: DeleteImpactRow[]
}

export async function previewCustomerDeletion(ids: string[]): Promise<DeletePreview> {
    await requireAdmin()

    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, message: 'Nobody selected.', rows: [] }
    if (ids.length > MAX_DELETE_BATCH) {
        return { ok: false, message: `Select ${MAX_DELETE_BATCH} or fewer at a time so the list stays reviewable.`, rows: [] }
    }

    const sb = createAdminSupabaseClient()
    const { data, error } = await sb.rpc('admin_customer_delete_impact', { p_ids: ids })
    if (error) {
        captureError(error, { area: 'admin', op: 'previewCustomerDeletion' })
        return { ok: false, message: `Could not work out what this would delete: ${error.message}`, rows: [] }
    }
    return { ok: true, rows: (data ?? []) as DeleteImpactRow[] }
}

export interface DeleteResult {
    ok: boolean
    message: string
    deleted: number
    /** Who actually went. The list drops these from its own state rather than
     *  waiting for a reload — router.refresh() updates the props but not the
     *  state seeded from them, so deleted people used to linger on screen. */
    deletedIds: string[]
    failed: Array<{ id: string; name: string | null; reason: string }>
}

/**
 * Delete the selected customers, their records, and their logins.
 *
 * The impact is re-read here rather than trusted from the client: the numbers
 * an admin agreed to could be minutes old, and the decision that matters is
 * about the rows that exist now. `waitlistAck` must be true if any of them
 * still holds a waitlist spot — destroying a pause credit is irreversible, so
 * it takes a second, separate yes.
 *
 * One person at a time, continuing past a failure. A batch that stops halfway
 * with no report is worse than one that tells you which three did not go.
 */
export async function deleteCustomers(ids: string[], waitlistAck: boolean): Promise<DeleteResult> {
    const admin = await requireAdmin()

    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, message: 'Nobody selected.', deleted: 0, deletedIds: [], failed: [] }
    if (ids.length > MAX_DELETE_BATCH) {
        return { ok: false, message: `Select ${MAX_DELETE_BATCH} or fewer at a time.`, deleted: 0, deletedIds: [], failed: [] }
    }

    const sb = createAdminSupabaseClient()
    const { data, error } = await sb.rpc('admin_customer_delete_impact', { p_ids: ids })
    if (error) {
        return { ok: false, message: `Could not re-check what this would delete: ${error.message}`, deleted: 0, deletedIds: [], failed: [] }
    }

    const plan = planDeletion((data ?? []) as DeleteImpactRow[])
    if (plan.requiresWaitlistAck && !waitlistAck) {
        return {
            ok: false,
            deleted: 0,
            deletedIds: [],
            failed: [],
            message: `${plan.needsWaitlistAck.length} of these still hold a waitlist spot. Tick the waitlist box to confirm you mean it.`,
        }
    }
    if (plan.deletable.length === 0) {
        return { ok: false, message: 'None of these can be deleted.', deleted: 0, deletedIds: [], failed: [] }
    }

    let deleted = 0
    const deletedIds: string[] = []
    const failed: DeleteResult['failed'] = []

    for (const row of plan.deletable) {
        const { data: snapshot, error: delError } = await sb.rpc('admin_delete_customer', { p_customer_id: row.customer_id })
        if (delError) {
            captureError(delError, { area: 'admin', op: 'deleteCustomers', customerId: row.customer_id })
            failed.push({ id: row.customer_id, name: row.name, reason: delError.message })
            continue
        }
        deleted++
        deletedIds.push(row.customer_id)
        // Logged per person, not per batch: the snapshot of who they were is
        // the only record left once the row is gone.
        // The whole record, not a description of it. A summary told us who was
        // lost on 2026-09-16 and nothing about how to put them back; the
        // snapshot holds the customer row, their contact, subscriptions,
        // orders, credits, waitlist spot and login address, so restoring is a
        // deliberate read of this row rather than an impossibility.
        await logAdminAction(admin.email, 'delete_customer', 'customer', row.customer_id, {
            name: row.name,
            email: row.email,
            cid: row.cid,
            rows_removed: row.total_rows,
            impact: row.impact,
            was_on_waitlist: row.on_waitlist,
            waitlist_credit_aed: row.waitlist_credit_aed,
            delivered_meals: row.delivered_meals,
            snapshot,
        })
    }

    revalidatePath('/admin/customers')
    revalidatePath('/admin/contacts')

    const blockedNote = plan.blocked.length > 0
        ? ` ${plan.blocked.length} refused (${plan.blocked[0].blocked_reason?.toLowerCase()}).`
        : ''
    const failedNote = failed.length > 0 ? ` ${failed.length} failed.` : ''

    return {
        ok: deleted > 0,
        deleted,
        deletedIds,
        failed,
        message: deleted === 0
            ? `Nothing was deleted.${failedNote}`
            : `${deleted} ${deleted === 1 ? 'person' : 'people'} deleted.${blockedNote}${failedNote}`,
    }
}

export interface ContactDeleteResult {
    ok: boolean
    message: string
    deleted: number
    deletedIds: string[]
    skipped: number
}

/**
 * Delete contacts that have no account behind them.
 *
 * A contact linked to a customer is deliberately refused: deleting it would
 * leave the customer with no contact row, and the customers trigger would just
 * make a new one on their next profile edit. Those go through
 * deleteCustomers() instead, which removes both.
 */
export async function deleteContacts(ids: string[]): Promise<ContactDeleteResult> {
    const admin = await requireAdmin()

    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, message: 'Nobody selected.', deleted: 0, deletedIds: [], skipped: 0 }
    if (ids.length > MAX_DELETE_BATCH) {
        return { ok: false, message: `Select ${MAX_DELETE_BATCH} or fewer at a time.`, deleted: 0, deletedIds: [], skipped: 0 }
    }

    const sb = createAdminSupabaseClient()
    const { data: rows, error: readError } = await sb
        .from('contacts')
        .select('id, name, email, phone_e164, source, customer_id')
        .in('id', ids)
    if (readError) {
        return { ok: false, message: `Could not read those contacts: ${readError.message}`, deleted: 0, deletedIds: [], skipped: 0 }
    }

    const all = (rows ?? []) as Array<{ id: string; name: string | null; email: string | null; phone_e164: string | null; source: string; customer_id: string | null }>
    const free = all.filter(r => r.customer_id === null)
    const skipped = all.length - free.length
    if (free.length === 0) {
        return { ok: false, deleted: 0, deletedIds: [], skipped, message: 'All of those have an account. Delete them from Customers instead.' }
    }

    const { data: gone, error } = await sb
        .from('contacts')
        .delete()
        .in('id', free.map(r => r.id))
        // Belt and braces: the filter is re-applied at the database so a
        // contact that gained an account between the read and the delete is
        // left alone rather than orphaning a live customer.
        .is('customer_id', null)
        .select('id')
    if (error) {
        captureError(error, { area: 'admin', op: 'deleteContacts' })
        return { ok: false, message: `Could not delete: ${error.message}`, deleted: 0, deletedIds: [], skipped }
    }

    const deletedIds = (gone ?? []).map(g => (g as { id: string }).id)
    const deleted = deletedIds.length
    await logAdminAction(admin.email, 'delete_contacts', 'contacts', undefined, {
        deleted,
        skipped,
        people: free.slice(0, 50).map(r => ({ name: r.name, email: r.email, phone: r.phone_e164, source: r.source })),
    })
    revalidatePath('/admin/contacts')

    return {
        ok: true,
        deleted,
        deletedIds,
        skipped,
        message: `${deleted} contact${deleted === 1 ? '' : 's'} deleted.${skipped > 0 ? ` ${skipped} skipped — they have an account.` : ''}`,
    }
}
