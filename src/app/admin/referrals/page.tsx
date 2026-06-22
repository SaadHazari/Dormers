import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { ReferralsClient } from './ReferralsClient'

export const metadata = { title: 'Referrals — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function ReferralsPage() {
    const sb = createAdminSupabaseClient()

    const [referralsRes, queueRes] = await Promise.all([
        sb.from('referrals')
            .select('id, inviter_cid, inviter_user_id, invitee_first_name, invitee_email, invitee_phone, status, created_at, gift_claimed_at, converted_at')
            .order('created_at', { ascending: false })
            .limit(200),
        sb.from('referral_review_queue')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
    ])

    // Capacity (Phase 7b / L6): scope customers to the inviters referenced by these rows.
    const customerIds = [...new Set(
        (((referralsRes.data ?? []) as Array<{ inviter_user_id: string | null }>)
            .map(r => r.inviter_user_id)
            .filter(Boolean)) as string[],
    )]
    const customersRes = customerIds.length
        ? await sb.from('customers').select('id, name, cid').in('id', customerIds)
        : { data: [] as Array<{ id: string; name: string | null; cid: string | null }> }

    const customerMap = new Map<string, { name: string | null; cid: string | null }>()
    for (const c of (customersRes.data ?? []) as Array<{ id: string; name: string | null; cid: string | null }>) {
        customerMap.set(c.id, { name: c.name, cid: c.cid })
    }

    const referrals = ((referralsRes.data ?? []) as Array<Record<string, unknown>>).map(r => {
        const inviter = r.inviter_user_id ? customerMap.get(r.inviter_user_id as string) : null
        return {
            id: r.id as string,
            inviter_name: inviter?.name ?? null,
            inviter_cid: (r.inviter_cid as string) ?? inviter?.cid ?? null,
            invitee_name: r.invitee_first_name as string | null,
            invitee_email: r.invitee_email as string | null,
            invitee_phone: r.invitee_phone as string | null,
            status: r.status as string,
            created_at: r.created_at as string,
            gift_claimed_at: r.gift_claimed_at as string | null,
            converted_at: r.converted_at as string | null,
        }
    })

    const funnel = {
        total: referrals.length,
        sent: referrals.filter(r => r.status === 'sent').length,
        claimed: referrals.filter(r => ['gift_claimed', 'converted'].includes(r.status)).length,
        converted: referrals.filter(r => r.status === 'converted').length,
        blocked: referrals.filter(r => ['ineligible_existing_customer', 'blocked'].includes(r.status)).length,
    }

    return (
        <ReferralsClient
            referrals={referrals}
            pendingReviewCount={queueRes.count ?? 0}
            funnel={funnel}
        />
    )
}
