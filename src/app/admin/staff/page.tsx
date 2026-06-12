import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { STAFF_PLAN_NAME, STAFF_SATURDAY_MEAL_AED, SATURDAYS_PER_CYCLE } from '@/contexts/staff/domain/staff-plan'
import { StaffClient, type StaffRow, type PendingRenewal } from './StaffClient'

export const metadata = { title: 'Staff — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function StaffPage() {
    const sb = createAdminSupabaseClient()

    const [{ data: staffRows }, { data: pendingSubs }] = await Promise.all([
        sb.from('staff_members')
            .select('id, name, email, whatsapp_number, status, code_expires_at, claimed_at, customer_id, created_at, ended_at')
            .order('created_at', { ascending: false }),
        sb.from('subscriptions')
            .select('id, customer_id, week_type, start_date, created_at')
            .eq('plan_name', STAFF_PLAN_NAME)
            .eq('staff_approval', 'pending')
            .eq('status', 'Scheduled')
            .order('created_at', { ascending: true }),
    ])

    const rows = (staffRows ?? []) as StaffRow[]
    const byCustomer = new Map(rows.filter(r => r.customer_id).map(r => [r.customer_id as string, r]))

    const pending: PendingRenewal[] = (pendingSubs ?? []).map(s => ({
        subscriptionId: s.id as string,
        staffName: byCustomer.get(s.customer_id as string)?.name ?? 'Unknown intern',
        weekType: (s.week_type as string) === '6DAYS' ? '6DAYS' : '5DAYS',
        startDate: s.start_date as string,
        paidAed: (s.week_type as string) === '6DAYS' ? STAFF_SATURDAY_MEAL_AED * SATURDAYS_PER_CYCLE : 0,
    }))

    return <StaffClient rows={rows} pendingRenewals={pending} />
}
