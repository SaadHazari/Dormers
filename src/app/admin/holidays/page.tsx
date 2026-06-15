import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { HolidaysClient } from './HolidaysClient'

export const metadata = { title: 'Holidays — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function HolidaysPage() {
    const sb = createAdminSupabaseClient()

    const [closuresRes, subsCountRes] = await Promise.all([
        sb
            .from('company_closures')
            .select('id, closure_date, reason, created_by, created_at')
            .order('closure_date', { ascending: true }),
        sb
            .from('subscriptions')
            .select('id', { count: 'exact', head: true })
            .in('status', ['Active', 'Skipped', 'Paused', 'Scheduled']),
    ])

    const closures = (closuresRes.data ?? []) as Array<{
        id: string
        closure_date: string
        reason: string
        created_by: string | null
        created_at: string
    }>

    return (
        <HolidaysClient
            closures={closures}
            activeSubscriptionCount={subsCountRes.count ?? 0}
        />
    )
}
