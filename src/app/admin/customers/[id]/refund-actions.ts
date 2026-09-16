'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { setRefundAllowed, retryPlanRefund } from '@/contexts/subscriptions/usecases/plan-refund'
import { retryRefundCreditNote } from '@/contexts/payments/usecases/refund-credit-note'

type Result = { ok: boolean; message: string }

function done(customerId: string, result: { ok: true; message: string } | { error: string }): Result {
    revalidatePath(`/admin/customers/${customerId}`)
    return 'error' in result ? { ok: false, message: result.error } : { ok: true, message: result.message }
}

export async function setRefundAllowedAction(customerId: string, allowed: boolean): Promise<Result> {
    const admin = await requireAdmin()
    return done(customerId, await setRefundAllowed(admin.email, customerId, allowed))
}

export async function retryPlanRefundAction(customerId: string, refundId: string): Promise<Result> {
    const admin = await requireAdmin()
    return done(customerId, await retryPlanRefund(admin.email, refundId))
}

export async function retryCreditNoteAction(customerId: string, creditNoteId: string): Promise<Result> {
    const admin = await requireAdmin()
    const result = await retryRefundCreditNote(creditNoteId)
    await logAdminAction(admin.email, 'refund_credit_note_retried', 'refund_credit_note', creditNoteId, { ok: 'ok' in result && result.ok })
    revalidatePath(`/admin/customers/${customerId}`)
    if ('skipped' in result) {
        return result.skipped === 'busy'
            ? { ok: false, message: 'This credit note is being sent right now. Refresh in a minute.' }
            : { ok: true, message: 'Nothing to send: this refund had no card payment.' }
    }
    if (!result.ok) return { ok: false, message: `Zoho refused again: ${result.error}` }
    return { ok: true, message: `Credit note ${result.creditnoteNumber ?? ''} sent${result.emailed ? ' to the customer' : ''}.`.replace('  ', ' ') }
}
