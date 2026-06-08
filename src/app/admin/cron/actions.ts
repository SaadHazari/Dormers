'use server'

import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

interface RunDetail {
    runid: number
    status: string
    start_time: string
    end_time: string | null
    duration_ms: number | null
    message: string | null
}

export async function fetchJobHistory(jobname: string): Promise<RunDetail[]> {
    await requireAdmin()
    const sb = createAdminSupabaseClient()
    const { data, error } = await sb.rpc('admin_cron_job_history', {
        p_jobname: jobname,
        p_limit: 20,
    })
    if (error) {
        console.error('fetchJobHistory failed:', error)
        return []
    }
    return (data as unknown as RunDetail[]) ?? []
}
