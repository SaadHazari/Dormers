import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { PaymentsClient, type Order } from './PaymentsClient'

export const metadata = { title: 'Payments — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function PaymentsPage() {
    const sb = createAdminSupabaseClient()

    const ordersRes = await sb.from('orders')
        .select('id, order_number, customer_id, plan, meal_preference, meals_count, price_per_meal, invoice_status, stripe_session_id, payment_date, payment_method, email_sent_at, whatsapp_sent_at, zoho_synced_at, post_payment_errors, created_at')
        .order('created_at', { ascending: false })
        .limit(100)

    const orders = (ordersRes.data ?? []) as Array<Record<string, unknown>>
    // Capacity (Phase 7b / L6): fetch only the customers referenced by these
    // orders, not the entire (ever-growing) customers table.
    const customerIds = [...new Set(orders.map(o => o.customer_id as string).filter(Boolean))]
    const customersRes = customerIds.length
        ? await sb.from('customers').select('id, name, email').in('id', customerIds)
        : { data: [] as Array<{ id: string; name: string | null; email: string | null }> }
    const customerMap = new Map<string, { name: string | null; email: string | null }>()
    for (const c of (customersRes.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
        customerMap.set(c.id, { name: c.name, email: c.email })
    }

    const enriched: Order[] = orders.map(o => ({
        id: o.id as string,
        customer_id: o.customer_id as string,
        customer_name: customerMap.get(o.customer_id as string)?.name ?? null,
        customer_email: customerMap.get(o.customer_id as string)?.email ?? null,
        plan: o.plan as string | null,
        meal_preference: o.meal_preference as string | null,
        meals_count: o.meals_count as number,
        total_aed: Math.round((o.meals_count as number) * Number(o.price_per_meal)),
        email_sent_at: o.email_sent_at as string | null,
        whatsapp_sent_at: o.whatsapp_sent_at as string | null,
        zoho_synced_at: o.zoho_synced_at as string | null,
        post_payment_errors: o.post_payment_errors as Record<string, unknown> | null,
        created_at: o.created_at as string,
    }))

    return <PaymentsClient orders={enriched} />
}
