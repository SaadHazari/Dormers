import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { captureError } from '@/infra/logging/capture-error'
import { CustomerTable } from './CustomerTable'
import { CUSTOMER_PAGE_SIZE } from './constants'

export const metadata = { title: 'Customers — Dormers Admin' }
export const dynamic = 'force-dynamic'

export interface CustomerRow {
    id: string
    cid: string | null
    name: string | null
    email: string | null
    whatsapp_number: string | null
    dorm_name: string | null
    meal_preference_type: string | null
    week_type: string | null
    created_at: string
    active_plan: string | null
    sub_status: string | null
    delivered_meals: number | null
    total_meals: number | null
    sub_id: string | null
    sub_start_date: string | null
    sub_end_date: string | null
}

/**
 * Total customers matching the same predicate as admin_customer_search, so the
 * list can say "38 of 412" instead of implying the fetched page is everyone.
 * Returns null if the count fails — the UI then just omits the total rather
 * than blocking the list.
 */
async function countMatching(
    sb: ReturnType<typeof createAdminSupabaseClient>,
    query: string,
): Promise<number | null> {
    let q = sb.from('customers').select('id', { count: 'exact', head: true })
    if (query) {
        const like = `%${query}%`
        q = q.or(
            ['name', 'email', 'whatsapp_number', 'cid', 'dorm_name']
                .map(col => `${col}.ilike.${like}`)
                .join(','),
        )
    }
    const { count, error } = await q
    if (error) {
        captureError(error, { area: 'admin', op: 'customersPage.countMatching' })
        return null
    }
    return count ?? null
}

export default async function CustomersPage({
    searchParams,
}: {
    searchParams?: Promise<{ q?: string }>
}) {
    const sp = (await searchParams) ?? {}
    const query = sp.q ?? ''
    const sb = createAdminSupabaseClient()

    const [searchResult, totalCount] = await Promise.all([
        sb.rpc('admin_customer_search', {
            p_query: query,
            p_limit: CUSTOMER_PAGE_SIZE,
            p_offset: 0,
        }),
        countMatching(sb, query),
    ])

    if (searchResult.error) {
        captureError(searchResult.error, { area: 'admin', op: 'customersPage.search' })
    }

    const customers = (searchResult.data ?? []) as CustomerRow[]

    return (
        // Keyed by query so a new search resets the filter chips and the
        // rendered window instead of leaving a stale "Needs attention" view
        // hiding the person you just searched for.
        <CustomerTable
            key={query}
            customers={customers}
            initialQuery={query}
            totalCount={totalCount}
        />
    )
}
