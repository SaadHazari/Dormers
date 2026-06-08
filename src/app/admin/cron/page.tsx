import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { CronClient } from './CronClient'

export const metadata = { title: 'Cron Health — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function CronPage() {
    const sb = createAdminSupabaseClient()
    const { data } = await sb.rpc('admin_cron_health')
    const jobs = (data as unknown as Array<Record<string, unknown>>) ?? []
    return <CronClient jobs={jobs} />
}
