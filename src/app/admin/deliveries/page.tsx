import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { DeliveriesClient } from './DeliveriesClient'

export const metadata = { title: 'Delivery Queue — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function DeliveriesPage() {
    const sb = createAdminSupabaseClient()

    const [activeSubsRes, customersRes] = await Promise.all([
        sb.from('subscriptions')
            .select('id, customer_id, plan_name, status, meals_per_day, total_meals, delivered_meals, week_type, start_date, end_date, skipped_dates, paused_dates')
            .in('status', ['Active', 'Paused', 'Skipped'])
            .order('start_date', { ascending: false }),
        sb.from('customers').select('id, name, dorm_name, meal_preference_type, whatsapp_number'),
    ])

    const customerMap = new Map<string, { name: string | null; dorm: string | null; pref: string | null; phone: string | null }>()
    for (const c of (customersRes.data ?? []) as Array<{ id: string; name: string | null; dorm_name: string | null; meal_preference_type: string | null; whatsapp_number: string | null }>) {
        customerMap.set(c.id, { name: c.name, dorm: c.dorm_name, pref: c.meal_preference_type, phone: c.whatsapp_number })
    }

    const subs = ((activeSubsRes.data ?? []) as Array<Record<string, unknown>>).map(s => {
        const cust = customerMap.get(s.customer_id as string)
        return {
            id: s.id as string,
            customer_id: s.customer_id as string,
            customer_name: cust?.name ?? null,
            dorm_name: cust?.dorm ?? null,
            meal_preference: cust?.pref ?? null,
            whatsapp_number: cust?.phone ?? null,
            plan_name: s.plan_name as string,
            status: s.status as string,
            meals_per_day: s.meals_per_day as number,
            total_meals: s.total_meals as number,
            delivered_meals: s.delivered_meals as number,
            week_type: s.week_type as string,
            start_date: s.start_date as string,
            end_date: s.end_date as string,
        }
    })

    return <DeliveriesClient subscriptions={subs} />
}
