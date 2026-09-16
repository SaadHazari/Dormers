'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { captureError } from '@/infra/logging/capture-error'

/**
 * Taking people out of the marketing loop, and putting them back.
 *
 * Deliberately NOT deletion. Working through a thousand imported contacts
 * means deciding "not this one" a few hundred times, and a few hundred
 * irreversible decisions is how a real customer disappears — which is exactly
 * what happened on 2026-09-16. Marking someone opted out keeps the record,
 * keeps them findable, and is undone by pressing the other button.
 *
 * broadcast_audience already refuses to include an opted-out contact on the
 * WhatsApp channel whatever the caller asks for, so this is the same switch a
 * STOP reply throws — not a second, parallel notion of "excluded" that some
 * future send could forget to check.
 */

/** Exclusion is reversible, so a bigger batch is reasonable than for deletion. */
const MAX_MARK_BATCH = 500

export interface MarkResult {
    ok: boolean
    message: string
    changed: number
    ids: string[]
}

async function setWhatsAppStatus(
    ids: string[],
    status: 'opted_out' | 'unknown',
    action: string,
): Promise<MarkResult> {
    const admin = await requireAdmin()

    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, message: 'Nobody selected.', changed: 0, ids: [] }
    if (ids.length > MAX_MARK_BATCH) {
        return { ok: false, message: `Select ${MAX_MARK_BATCH} or fewer at a time.`, changed: 0, ids: [] }
    }

    const sb = createAdminSupabaseClient()
    const { data, error } = await sb
        .from('contacts')
        .update({ whatsapp_status: status, updated_at: new Date().toISOString() })
        .in('id', ids)
        .select('id')

    if (error) {
        captureError(error, { area: 'admin', op: action })
        return { ok: false, message: `Could not update those contacts: ${error.message}`, changed: 0, ids: [] }
    }

    const changedIds = (data ?? []).map(r => (r as { id: string }).id)
    await logAdminAction(admin.email, action, 'contacts', undefined, { count: changedIds.length })
    revalidatePath('/admin/contacts')

    const n = changedIds.length
    return {
        ok: true,
        changed: n,
        ids: changedIds,
        message: status === 'opted_out'
            ? `${n} contact${n === 1 ? '' : 's'} will not be messaged.`
            : `${n} contact${n === 1 ? '' : 's'} back in the loop.`,
    }
}

/** Never message these on WhatsApp again. */
export async function excludeFromWhatsApp(ids: string[]): Promise<MarkResult> {
    return setWhatsAppStatus(ids, 'opted_out', 'whatsapp_exclude')
}

/**
 * Undo. Back to 'unknown' rather than 'opted_in' — they still never actually
 * asked for marketing, so they stay behind the consent tick in the composer.
 */
export async function includeInWhatsApp(ids: string[]): Promise<MarkResult> {
    return setWhatsAppStatus(ids, 'unknown', 'whatsapp_include')
}
