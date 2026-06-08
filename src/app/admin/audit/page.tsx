import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { AuditClient } from './AuditClient'

export const metadata = { title: 'Audit Log — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function AuditPage() {
    const sb = createAdminSupabaseClient()

    const { data } = await sb
        .from('admin_audit_log')
        .select('id, admin_email, action, entity_type, entity_id, payload, created_at')
        .order('created_at', { ascending: false })
        .limit(200)

    const entries = (data ?? []) as Array<{
        id: string
        admin_email: string
        action: string
        entity_type: string | null
        entity_id: string | null
        payload: Record<string, unknown>
        created_at: string
    }>

    return <AuditClient entries={entries} />
}
