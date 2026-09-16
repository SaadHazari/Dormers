'use server'

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { captureError } from '@/infra/logging/capture-error'
import { unsubscribeSecret, verifyUnsubscribeToken } from '@/contexts/contacts/domain/unsubscribe-token'

/**
 * Unsubscribe, and the undo beside it.
 *
 * No session and no login: the token IS the authorisation, which is what
 * makes a link in an email work at all. It only ever addresses the one contact
 * it was signed for, so a forged or edited link resolves to nothing rather
 * than to somebody else.
 */

export type UnsubState = 'unsubscribed' | 'resubscribed' | 'invalid' | 'error'

async function setStatus(token: string, status: 'unsubscribed' | 'subscribed'): Promise<UnsubState> {
    const contactId = verifyUnsubscribeToken(token, unsubscribeSecret())
    if (!contactId) return 'invalid'

    const sb = createAdminSupabaseClient()
    const { error } = await sb
        .from('contacts')
        .update({
            email_status: status,
            unsubscribed_at: status === 'unsubscribed' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)

    if (error) {
        captureError(error, { area: 'contacts', op: 'unsubscribe', status })
        return 'error'
    }
    return status === 'unsubscribed' ? 'unsubscribed' : 'resubscribed'
}

export async function unsubscribe(token: string): Promise<UnsubState> {
    return setStatus(token, 'unsubscribed')
}

export async function resubscribe(token: string): Promise<UnsubState> {
    return setStatus(token, 'subscribed')
}
