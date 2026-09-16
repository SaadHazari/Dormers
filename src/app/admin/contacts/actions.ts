'use server'

import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { captureError } from '@/infra/logging/capture-error'
import type { ContactRow } from './page'
import { CONTACT_PAGE_SIZE } from './constants'

/** Fetch the next page of contacts for the list's "Load more" button. */
export async function loadMoreContacts(
    query: string,
    offset: number,
): Promise<{ ok: boolean; rows: ContactRow[]; message?: string }> {
    await requireAdmin()

    if (!Number.isInteger(offset) || offset < 0) {
        return { ok: false, rows: [], message: 'Invalid offset' }
    }

    const sb = createAdminSupabaseClient()
    const { data, error } = await sb.rpc('admin_contact_search', {
        p_query: query ?? '',
        p_limit: CONTACT_PAGE_SIZE,
        p_offset: offset,
    })

    if (error) {
        captureError(error, { area: 'admin', op: 'loadMoreContacts', offset })
        return { ok: false, rows: [], message: 'Could not load more contacts' }
    }

    return { ok: true, rows: (data ?? []) as ContactRow[] }
}
