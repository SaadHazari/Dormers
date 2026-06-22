import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { isVegOnDayName } from '@/contexts/subscriptions/domain/veg-day'
import { DeliveriesClient } from './DeliveriesClient'

export const metadata = { title: 'Delivery Queue — Dormers Admin' }
export const dynamic = 'force-dynamic'

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Today's delivery day in UAE time. Sunday never delivers, so religious-mix
 *  customers resolve against Monday — the day the admin is actually prepping. */
function deliveryDayName(): string {
    const aeDow = new Date(Date.now() + 4 * 60 * 60 * 1000).getUTCDay()
    return DAYS_OF_WEEK[aeDow === 0 ? 1 : aeDow]
}

export default async function DeliveriesPage() {
    const sb = createAdminSupabaseClient()

    const activeSubsRes = await sb.from('subscriptions')
        .select('id, customer_id, plan_name, status, meals_per_day, total_meals, delivered_meals, week_type, start_date, end_date, skipped_dates, paused_dates')
        .in('status', ['Active', 'Paused', 'Skipped'])
        .order('start_date', { ascending: false })

    // Capacity (Phase 7b / L6): scope customers to active-sub customers only.
    const customerIds = [...new Set(((activeSubsRes.data ?? []) as Array<{ customer_id: string }>).map(s => s.customer_id).filter(Boolean))]
    const customersRes = customerIds.length
        ? await sb.from('customers').select('id, name, dorm_name, meal_preference_type, veg_days, whatsapp_number').in('id', customerIds)
        : { data: [] as Array<{ id: string; name: string | null; dorm_name: string | null; meal_preference_type: string | null; veg_days: string[] | null; whatsapp_number: string | null }> }

    const customerMap = new Map<string, { name: string | null; dorm: string | null; pref: string | null; vegDays: string[] | null; phone: string | null }>()
    for (const c of (customersRes.data ?? []) as Array<{ id: string; name: string | null; dorm_name: string | null; meal_preference_type: string | null; veg_days: string[] | null; whatsapp_number: string | null }>) {
        customerMap.set(c.id, { name: c.name, dorm: c.dorm_name, pref: c.meal_preference_type, vegDays: c.veg_days, phone: c.whatsapp_number })
    }

    const dayName = deliveryDayName()

    const subs = ((activeSubsRes.data ?? []) as Array<Record<string, unknown>>).map(s => {
        const cust = customerMap.get(s.customer_id as string)
        return {
            id: s.id as string,
            customer_id: s.customer_id as string,
            customer_name: cust?.name ?? null,
            dorm_name: cust?.dorm ?? null,
            meal_preference: cust?.pref ?? null,
            veg_today: isVegOnDayName(cust?.pref, cust?.vegDays, dayName),
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
