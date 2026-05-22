import { createClient as createAdmin } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/auth'
import QueueClient, { type PendingReferralRow } from './QueueClient'

export const metadata = { title: 'Referral review queue — Dormers admin' }
export const dynamic = 'force-dynamic'

/**
 * Admin queue for soft-flagged referrals.
 *
 * When a referral converts but the fraud heuristics surface a soft signal
 * (same device, suspicious pattern, etc.), the credit is parked as
 * 'pending' and a row is inserted into referral_review_queue. Until an
 * admin marks the row approved/rejected, the inviter sees that AED stuck
 * in their wallet's pending pool.
 *
 * Stale rows (>24h) escalate via WhatsApp to the admin number stored in
 * vault.decrypted_secrets — the message includes a deep link to this page
 * with the queue row highlighted via ?focus=<id>.
 */
export default async function ReferralReviewQueuePage({
    searchParams,
}: {
    searchParams?: Promise<{ focus?: string }>
}) {
    await requireAdmin()

    const sb = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const sp = (await searchParams) ?? {}
    const focusId = sp.focus ?? null

    // Pull pending queue rows. Originally tried a PostgREST nested
    // select (queue → referrals → customers) but the FK-hint syntax was
    // returning empty joins. Two simpler queries are bulletproof and
    // the extra round-trip is negligible for an admin queue page.
    const { data: queueRows, error: queueErr } = await sb
        .from('referral_review_queue')
        .select('id, reason, flags, status, created_at, alerted_at, referral_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

    if (queueErr) {
        console.error('referral-review-queue page: queue read failed', queueErr)
    }

    type QueueRow = {
        id: string
        reason: string
        flags: Record<string, unknown> | null
        status: string
        created_at: string
        alerted_at: string | null
        referral_id: string
    }
    type ReferralJoin = {
        id: string
        invitee_first_name: string | null
        invitee_phone: string | null
        invitee_email: string | null
        inviter_cid: string | null
        inviter_user_id: string | null
        converted_at: string | null
        gift_claimed_at: string | null
    }

    const queueList = (queueRows ?? []) as QueueRow[]
    const referralIds = queueList.map(r => r.referral_id).filter(Boolean)

    // Hydrate the linked referrals in one batched lookup.
    const referralMap = new Map<string, ReferralJoin>()
    if (referralIds.length > 0) {
        const { data: refs, error: refErr } = await sb
            .from('referrals')
            .select('id, invitee_first_name, invitee_phone, invitee_email, inviter_cid, inviter_user_id, converted_at, gift_claimed_at')
            .in('id', referralIds)
        if (refErr) {
            console.error('referral-review-queue page: referrals read failed', refErr)
        }
        for (const r of (refs ?? []) as ReferralJoin[]) {
            referralMap.set(r.id, r)
        }
    }

    // Resolve inviter customer details + their pending credit amount.
    const inviterIds = Array.from(
        new Set(
            Array.from(referralMap.values()).map(r => r.inviter_user_id).filter(Boolean),
        ),
    ) as string[]

    const customerMap = new Map<string, { name: string | null; email: string | null }>()
    if (inviterIds.length > 0) {
        const { data: customers } = await sb
            .from('customers')
            .select('id, name, email')
            .in('id', inviterIds)
        for (const c of customers ?? []) {
            customerMap.set(c.id as string, {
                name: (c.name as string | null) ?? null,
                email: (c.email as string | null) ?? null,
            })
        }
    }

    const creditMap = new Map<string, number>()
    if (referralIds.length > 0) {
        const { data: credits } = await sb
            .from('credits')
            .select('referral_id, amount_aed')
            .in('referral_id', referralIds)
            .eq('status', 'pending')
        for (const c of credits ?? []) {
            creditMap.set(c.referral_id as string, Number(c.amount_aed))
        }
    }

    const pending: PendingReferralRow[] = queueList
        .map(r => {
            const ref = referralMap.get(r.referral_id)
            if (!ref) return null
            const inviter = ref.inviter_user_id ? customerMap.get(ref.inviter_user_id) : undefined
            const creditAed = creditMap.get(ref.id) ?? 0
            return {
                queueId:            r.id,
                queueReason:        r.reason,
                queueFlags:         r.flags ?? null,
                queueCreatedAt:     r.created_at,
                queueAlertedAt:     r.alerted_at,
                referralId:         ref.id,
                inviteeFirstName:   ref.invitee_first_name,
                inviteePhone:       ref.invitee_phone,
                inviteeEmail:       ref.invitee_email,
                inviteeConvertedAt: ref.converted_at,
                inviteeGiftClaimedAt: ref.gift_claimed_at,
                inviterCid:         ref.inviter_cid,
                inviterUserId:      ref.inviter_user_id,
                inviterName:        inviter?.name ?? null,
                inviterEmail:       inviter?.email ?? null,
                creditAed,
            }
        })
        .filter((r): r is PendingReferralRow => r != null)

    return <QueueClient rows={pending} focusId={focusId} />
}
