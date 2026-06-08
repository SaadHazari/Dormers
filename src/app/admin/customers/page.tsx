import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { CustomerTable } from './CustomerTable'

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
}

export default async function CustomersPage({
    searchParams,
}: {
    searchParams?: Promise<{ q?: string }>
}) {
    const sp = (await searchParams) ?? {}
    const query = sp.q ?? ''
    const sb = createAdminSupabaseClient()

    const { data, error } = await sb.rpc('admin_customer_search', {
        p_query: query,
        p_limit: 100,
        p_offset: 0,
    })

    if (error) {
        console.error('customers page: search failed', error)
    }

    const customers = (data ?? []) as CustomerRow[]

    return <CustomerTable customers={customers} initialQuery={query} />
}
