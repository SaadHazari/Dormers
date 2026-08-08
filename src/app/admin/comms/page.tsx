import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { CommsClient } from './CommsClient'

export const metadata = { title: 'Messages — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function CommsPage() {
    const sb = createAdminSupabaseClient()

    const notifsRes = await sb.from('customer_notifications')
        .select('id, customer_id, kind, scheduled_for, sent_at, wamid, meta_status_code, created_at')
        .order('created_at', { ascending: false })
        .limit(200)

    // Capacity (Phase 7b / L6): scope customers to those referenced by these rows.
    const customerIds = [...new Set(((notifsRes.data ?? []) as Array<{ customer_id: string }>).map(n => n.customer_id).filter(Boolean))]
    const customersRes = customerIds.length
        ? await sb.from('customers').select('id, name').in('id', customerIds)
        : { data: [] as Array<{ id: string; name: string | null }> }

    const customerMap = new Map<string, string>()
    for (const c of (customersRes.data ?? []) as Array<{ id: string; name: string | null }>) {
        if (c.name) customerMap.set(c.id, c.name)
    }

    const notifications = ((notifsRes.data ?? []) as Array<Record<string, unknown>>).map(n => ({
        id: n.id as string,
        customer_id: n.customer_id as string,
        customer_name: customerMap.get(n.customer_id as string) ?? null,
        kind: n.kind as string,
        scheduled_for: n.scheduled_for as string | null,
        sent_at: n.sent_at as string | null,
        wamid: n.wamid as string | null,
        meta_status_code: n.meta_status_code as number | null,
        created_at: n.created_at as string,
    }))

    const failedCount = notifications.filter(n =>
        !n.sent_at && n.scheduled_for && new Date(n.scheduled_for).getTime() < Date.now() - 600_000
    ).length

    return <CommsClient notifications={notifications} failedCount={failedCount} />
}
