import { notFound } from 'next/navigation'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { CustomerDetail } from './CustomerDetail'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const sb = createAdminSupabaseClient()
    const { data } = await sb.from('customers').select('name').eq('id', id).maybeSingle()
    return { title: `${data?.name ?? 'Customer'} — Dormers Admin` }
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const sb = createAdminSupabaseClient()

    const [customerRes, subsRes, ordersRes, creditsRes, notifsRes, referralsAsInviterRes, referralsAsInviteeRes] = await Promise.all([
        sb.from('customers').select('*').eq('id', id).maybeSingle(),
        sb.from('subscriptions').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
        sb.from('orders').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
        sb.from('credits').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
        sb.from('customer_notifications').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
        sb.from('referrals').select('*').eq('inviter_user_id', id).order('created_at', { ascending: false }),
        sb.from('referrals').select('*').eq('invitee_email', (await sb.from('customers').select('email').eq('id', id).maybeSingle()).data?.email ?? '___none___').order('created_at', { ascending: false }),
    ])

    if (!customerRes.data) notFound()

    const customer = customerRes.data as Record<string, unknown>
    const subscriptions = (subsRes.data ?? []) as Array<Record<string, unknown>>
    const orders = (ordersRes.data ?? []) as Array<Record<string, unknown>>
    const credits = (creditsRes.data ?? []) as Array<Record<string, unknown>>
    const notifications = (notifsRes.data ?? []) as Array<Record<string, unknown>>
    const referralsAsInviter = (referralsAsInviterRes.data ?? []) as Array<Record<string, unknown>>
    const referralsAsInvitee = (referralsAsInviteeRes.data ?? []) as Array<Record<string, unknown>>

    const creditBalance = credits
        .filter(c => c.status === 'approved')
        .reduce((sum, c) => sum + Number(c.amount_aed ?? 0), 0)

    const creditPending = credits
        .filter(c => c.status === 'pending')
        .reduce((sum, c) => sum + Number(c.amount_aed ?? 0), 0)

    return (
        <CustomerDetail
            customer={customer}
            subscriptions={subscriptions}
            orders={orders}
            credits={credits}
            notifications={notifications}
            referralsAsInviter={referralsAsInviter}
            referralsAsInvitee={referralsAsInvitee}
            creditBalance={creditBalance}
            creditPending={creditPending}
        />
    )
}
