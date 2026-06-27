'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { captureError } from '@/infra/logging/capture-error'
import { sendAdminCustomerEmail } from '@/infra/zeptomail/client'

type Result = { ok: boolean; message: string }

/**
 * Send an admin-composed, on-brand email to one customer. The admin writes the
 * subject + body in the panel; the body is wrapped in the approved Dormers
 * shell before sending. The recipient is resolved from the customer record
 * server-side (never trust a client-passed address for an outward send).
 *
 * Every attempt — sent or failed — is logged to admin_customer_emails so the
 * customer's message history is complete; a ZeptoMail outage (breaker open)
 * returns a friendly error rather than throwing.
 */
export async function sendCustomerEmail(
    customerId: string,
    subject: string,
    bodyText: string,
    includeSupportBox: boolean,
): Promise<Result> {
    const admin = await requireAdmin()

    const subj = subject.trim()
    const body = bodyText.trim()
    if (!subj) return { ok: false, message: 'Subject is required.' }
    if (subj.length > 200) return { ok: false, message: 'Subject is too long (max 200 characters).' }
    if (!body) return { ok: false, message: 'Message body is required.' }
    if (body.length > 5000) return { ok: false, message: 'Message is too long (max 5000 characters).' }

    const sb = createAdminSupabaseClient()

    const { data: customer } = await sb.from('customers').select('email, name').eq('id', customerId).maybeSingle()
    if (!customer?.email) return { ok: false, message: 'This customer has no email on file.' }
    const toEmail = customer.email as string
    const firstName = ((customer.name as string | null) ?? '').trim().split(/\s+/)[0] || 'there'

    let sendError: string | null = null
    try {
        await sendAdminCustomerEmail({ toEmail, firstName, subject: subj, bodyText: body, includeSupportBox })
    } catch (err) {
        sendError = err instanceof Error ? err.message : 'send failed'
        captureError(err, { area: 'admin', op: 'sendCustomerEmail' })
    }

    // Record the attempt either way (so the history shows failures too).
    await sb.from('admin_customer_emails').insert({
        customer_id: customerId,
        to_email: toEmail,
        subject: subj,
        body,
        include_support_box: includeSupportBox,
        sent_by: admin.email,
        status: sendError ? 'failed' : 'sent',
        error: sendError,
    })

    await logAdminAction(admin.email, 'send_customer_email', 'customer', customerId, {
        subject: subj, status: sendError ? 'failed' : 'sent',
    })
    revalidatePath(`/admin/customers/${customerId}`)

    if (sendError) return { ok: false, message: `Couldn't send — ${sendError}` }
    return { ok: true, message: `Email sent to ${toEmail}` }
}
