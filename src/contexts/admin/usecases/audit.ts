import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

export async function logAdminAction(
    adminEmail: string,
    action: string,
    entityType?: string,
    entityId?: string,
    payload?: Record<string, unknown>,
) {
    const sb = createAdminSupabaseClient()
    const { error } = await sb
        .from('admin_audit_log')
        .insert({
            admin_email: adminEmail,
            action,
            entity_type: entityType ?? null,
            entity_id: entityId ?? null,
            payload: payload ?? {},
        })
    if (error) {
        console.error('audit: failed to log admin action', { action, entityType, entityId, error })
    }
}
