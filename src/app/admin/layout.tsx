import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import AdminShell from './AdminShell'

export const metadata = { title: 'Admin — Dormers' }
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const sb = createAdminSupabaseClient()

    const badgePromise = Promise.allSettled([
        sb.from('referral_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('layer4_rewards').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])

    await requireAdmin()

    const [referralQ, layer4Q] = await badgePromise

    return (
        <AdminShell
            pendingReferrals={referralQ.status === 'fulfilled' ? referralQ.value.count ?? 0 : 0}
            pendingLayer4={layer4Q.status === 'fulfilled' ? layer4Q.value.count ?? 0 : 0}
        >
            {children}
        </AdminShell>
    )
}
