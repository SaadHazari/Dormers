import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import AdminShell from './AdminShell'

export const metadata = { title: 'Admin — Dormers' }
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    await requireAdmin()

    const sb = createAdminSupabaseClient()

    const [referralQ, layer4Q] = await Promise.all([
        sb.from('referral_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('layer4_rewards').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])

    return (
        <AdminShell
            pendingReferrals={referralQ.count ?? 0}
            pendingLayer4={layer4Q.count ?? 0}
        >
            {children}
        </AdminShell>
    )
}
