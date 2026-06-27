'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { captureError } from '@/infra/logging/capture-error'

type Result = { ok: boolean; message: string }
type ReviewType = 'weekly' | 'monthly'

function isReviewType(t: string): t is ReviewType {
    return t === 'weekly' || t === 'monthly'
}

/**
 * Flip a review's triage status. We upsert ONLY the status columns so an
 * existing internal note is left untouched (Postgres ON CONFLICT updates just
 * the named columns). The customer's own review row is never modified — all
 * admin state lives in the `review_admin_meta` side-table.
 */
export async function setReviewAddressed(reviewType: string, reviewId: string, addressed: boolean): Promise<Result> {
    const admin = await requireAdmin()
    if (!isReviewType(reviewType)) return { ok: false, message: 'Invalid review type' }

    const sb = createAdminSupabaseClient()
    const now = new Date().toISOString()
    const { error } = await sb.from('review_admin_meta').upsert({
        review_type: reviewType,
        review_id: reviewId,
        status: addressed ? 'addressed' : 'open',
        addressed_by: addressed ? admin.email : null,
        addressed_at: addressed ? now : null,
        updated_at: now,
    }, { onConflict: 'review_type,review_id' })

    if (error) {
        captureError(error, { area: 'admin', op: 'setReviewAddressed' })
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, addressed ? 'review_addressed' : 'review_reopened', `${reviewType}_review`, reviewId)
    revalidatePath('/admin/reviews')
    return { ok: true, message: addressed ? 'Marked as addressed' : 'Reopened' }
}

/**
 * Save (or clear) the internal note on a review. Upserts only the note column,
 * so it never disturbs the addressed status.
 */
export async function saveReviewNote(reviewType: string, reviewId: string, note: string): Promise<Result> {
    const admin = await requireAdmin()
    if (!isReviewType(reviewType)) return { ok: false, message: 'Invalid review type' }

    const trimmed = note.trim()
    if (trimmed.length > 2000) return { ok: false, message: 'Note is too long (max 2000 characters).' }

    const sb = createAdminSupabaseClient()
    const { error } = await sb.from('review_admin_meta').upsert({
        review_type: reviewType,
        review_id: reviewId,
        note: trimmed || null,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'review_type,review_id' })

    if (error) {
        captureError(error, { area: 'admin', op: 'saveReviewNote' })
        return { ok: false, message: error.message }
    }

    await logAdminAction(admin.email, 'review_note_saved', `${reviewType}_review`, reviewId, { length: trimmed.length })
    revalidatePath('/admin/reviews')
    return { ok: true, message: trimmed ? 'Note saved' : 'Note cleared' }
}
