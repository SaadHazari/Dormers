import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { BroadcastClient } from './BroadcastClient'

export const metadata = { title: 'Broadcast — Dormers Admin' }
export const dynamic = 'force-dynamic'

export interface BroadcastRow {
    id: string
    kind: string
    subject: string
    audience: string
    dorm_name: string | null
    status: string
    recipient_count: number
    created_by: string
    created_at: string
    finished_at: string | null
}

/** How many recipients each listed broadcast has parked (3 failed attempts, never sent). */
const PARKED_SCAN_LIMIT = 5000

export default async function BroadcastPage() {
    const sb = createAdminSupabaseClient()

    const [broadcastsRes, dormsRes] = await Promise.all([
        sb.from('broadcasts')
            .select('id, kind, subject, audience, dorm_name, status, recipient_count, created_by, created_at, finished_at')
            .order('created_at', { ascending: false })
            .limit(20),
        sb.from('customers')
            .select('dorm_name')
            .not('dorm_name', 'is', null),
    ])

    const broadcasts = (broadcastsRes.data ?? []) as BroadcastRow[]

    // Parked counts for every listed broadcast, resolved once here rather than
    // by 20 polling calls: a broadcast can finish 'done' with rows the
    // dispatcher gave up on, and those rows are the whole reason the history
    // table offers Retry failures at all.
    const parked: Record<string, number> = {}
    if (broadcasts.length) {
        const { data: parkedRows } = await sb.from('broadcast_sends')
            .select('broadcast_id')
            .in('broadcast_id', broadcasts.map(b => b.id))
            .is('sent_at', null)
            .gte('attempts', 3)
            .limit(PARKED_SCAN_LIMIT)
        for (const row of (parkedRows ?? []) as Array<{ broadcast_id: string }>) {
            parked[row.broadcast_id] = (parked[row.broadcast_id] ?? 0) + 1
        }
    }

    const dorms = [...new Set(
        ((dormsRes.data ?? []) as Array<{ dorm_name: string | null }>)
            .map(d => (d.dorm_name ?? '').trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b))

    return <BroadcastClient broadcasts={broadcasts} dorms={dorms} parked={parked} />
}
