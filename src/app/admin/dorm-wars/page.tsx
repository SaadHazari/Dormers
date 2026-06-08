import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { DormWarsClient } from './DormWarsClient'

export const metadata = { title: 'Dorm Wars — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function DormWarsPage() {
    const sb = createAdminSupabaseClient()

    const [streaksRes, cycleRes, lifetimeRes, layer4Res, layer4PendingRes, customersRes] = await Promise.all([
        sb.from('streaks')
            .select('customer_id, count, last_visit_date_utc, last_chest_day')
            .order('count', { ascending: false })
            .limit(50),
        sb.from('cycle_rewards')
            .select('id, customer_id, milestone, kind, value_aed, awarded_at')
            .order('awarded_at', { ascending: false })
            .limit(100),
        sb.from('lifetime_rewards')
            .select('id, customer_id, tier, perk, awarded_at')
            .order('awarded_at', { ascending: false }),
        sb.from('layer4_rewards')
            .select('id, customer_id, kind, value_aed, status, claimed_at')
            .order('claimed_at', { ascending: false })
            .limit(100),
        sb.from('layer4_rewards')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
        sb.from('customers').select('id, name'),
    ])

    const customerMap = new Map<string, string>()
    for (const c of (customersRes.data ?? []) as Array<{ id: string; name: string | null }>) {
        if (c.name) customerMap.set(c.id, c.name)
    }

    const addName = (rows: Array<Record<string, unknown>>) =>
        rows.map(r => ({ ...r, customer_name: customerMap.get(r.customer_id as string) ?? null }))

    return (
        <DormWarsClient
            streaks={addName((streaksRes.data ?? []) as Array<Record<string, unknown>>)}
            cycleRewards={addName((cycleRes.data ?? []) as Array<Record<string, unknown>>)}
            lifetimeRewards={addName((lifetimeRes.data ?? []) as Array<Record<string, unknown>>)}
            layer4Rewards={addName((layer4Res.data ?? []) as Array<Record<string, unknown>>)}
            pendingLayer4Count={layer4PendingRes.count ?? 0}
        />
    )
}
