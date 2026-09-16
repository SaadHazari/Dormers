import { notFound } from 'next/navigation'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { getReviewsForCustomer, getAdminEmailsForCustomer } from '@/infra/supabase/reviews-repo'
import { CustomerDetail } from './CustomerDetail'
import { getPlanRefundOffer } from '@/contexts/subscriptions/usecases/plan-refund'
import { PLAN_REFUND_STUCK_MS } from '@/contexts/subscriptions/domain/plan-refund'
import type { RefundPanelData } from './RefundPanel'

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

    const [customerRes, subsRes, ordersRes, creditsRes, notifsRes, referralsAsInviterRes, referralsAsInviteeRes, reviews, adminEmails, planRefundsRes, creditNotesRes] = await Promise.all([
        sb.from('customers').select('*').eq('id', id).maybeSingle(),
        sb.from('subscriptions').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
        sb.from('orders').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
        sb.from('credits').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
        sb.from('customer_notifications').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
        sb.from('referrals').select('*').eq('inviter_user_id', id).order('created_at', { ascending: false }),
        sb.from('referrals').select('*').eq('invitee_email', (await sb.from('customers').select('email').eq('id', id).maybeSingle()).data?.email ?? '___none___').order('created_at', { ascending: false }),
        getReviewsForCustomer(id),
        getAdminEmailsForCustomer(id),
        sb.from('plan_refunds').select('id, subscription_id, state, refunded_meals, tonight_kept, cash_refund_fils, credit_share_fils, stripe_refund_id, last_error, allowed_by, created_at, refunded_at, updated_at').eq('customer_id', id).order('created_at', { ascending: false }),
        sb.from('refund_credit_notes').select('id, kind, refund_id, cash_fils, zoho_creditnote_number, zoho_refund_id, emailed_at, attempts, last_error, created_at').eq('customer_id', id).order('created_at', { ascending: false }),
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

    // The plan My Plan shows (getActiveSubscription): the earliest-starting live or scheduled one.
    const currentPlan = subscriptions
        .filter(s => ['Active', 'Paused', 'Skipped', 'Scheduled'].includes(String(s.status)))
        .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0] ?? null
    const refundAllowedAt = (customer.refund_allowed_at as string | null) ?? null
    const planNames = new Map(subscriptions.map(s => [String(s.id), String(s.plan_name)]))
    const pageLoadedAt = Date.now()
    const refund: RefundPanelData = {
        allowedAt: refundAllowedAt,
        allowedBy: (customer.refund_allowed_by as string | null) ?? null,
        currentPlanName: currentPlan ? String(currentPlan.plan_name) : null,
        offer: refundAllowedAt && currentPlan ? await getPlanRefundOffer(id, String(currentPlan.id)) : null,
        refunds: ((planRefundsRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
            id: String(r.id),
            planName: planNames.get(String(r.subscription_id)) ?? 'Plan',
            state: r.state as 'processing' | 'failed' | 'refunded',
            meals: Number(r.refunded_meals),
            tonightKept: r.tonight_kept === true,
            cashFils: Number(r.cash_refund_fils),
            creditFils: Number(r.credit_share_fils),
            stripeRefundId: (r.stripe_refund_id as string | null) ?? null,
            error: (r.last_error as string | null) ?? null,
            at: String(r.refunded_at ?? r.created_at),
            stuck: r.state === 'processing' && pageLoadedAt - new Date(String(r.updated_at)).getTime() > PLAN_REFUND_STUCK_MS,
        })),
        creditNotes: ((creditNotesRes.data ?? []) as Array<Record<string, unknown>>).map(n => ({
            id: String(n.id),
            kind: n.kind as 'plan_refund' | 'season_refund',
            cashFils: Number(n.cash_fils),
            number: (n.zoho_creditnote_number as string | null) ?? null,
            done: !!n.zoho_refund_id && !!n.emailed_at,
            error: (n.last_error as string | null) ?? null,
            at: String(n.created_at),
        })),
    }

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
            reviews={reviews}
            adminEmails={adminEmails}
            refund={refund}
        />
    )
}
