'use server'

import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { captureError } from '@/infra/logging/capture-error'
import type { CustomerRow } from './page'
import { CUSTOMER_PAGE_SIZE } from './constants'

/**
 * Fetch the next page of customers for the list's "Load more" button.
 *
 * The list page used to hard-stop at 100 rows with no next page and no
 * indication that anything was missing, so any customer past the cap was
 * invisible. The search RPC already accepted an offset, it just was never used.
 */
export async function loadMoreCustomers(
    query: string,
    offset: number,
): Promise<{ ok: boolean; rows: CustomerRow[]; message?: string }> {
    await requireAdmin()

    if (!Number.isInteger(offset) || offset < 0) {
        return { ok: false, rows: [], message: 'Invalid offset' }
    }

    const sb = createAdminSupabaseClient()
    const { data, error } = await sb.rpc('admin_customer_search', {
        p_query: query ?? '',
        p_limit: CUSTOMER_PAGE_SIZE,
        p_offset: offset,
    })

    if (error) {
        captureError(error, { area: 'admin', op: 'loadMoreCustomers', offset })
        return { ok: false, rows: [], message: 'Could not load more customers' }
    }

    return { ok: true, rows: (data ?? []) as CustomerRow[] }
}
