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

    // Pull pending rows + the bits of context the admin needs to decide:
    // who invited, who joined, when, why it was flagged, how much AED is
    // locked. Done as one PostgREST nested-select for round-trip economy.
    const { data: rows } = await sb
        .from('referral_review_queue')
        .select(`
            id, reason, flags, status, created_at, alerted_at,
            referral:referrals!referral_review_queue_referral_id_fkey (
                id, invitee_first_name, invitee_phone, invitee_email,
                inviter_cid, inviter_user_id, converted_at, gift_claimed_at
            )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

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
    type RawRow = {
        id: string
        reason: string
        flags: Record<string, unknown> | null
        status: string
        created_at: string
        alerted_at: string | null
        // PostgREST returns one-to-one joins as either object or single-element
        // array depending on how the FK is declared; normalize below.
        referral: ReferralJoin | ReferralJoin[] | null
    }

    const rawRows = (rows ?? []) as unknown as RawRow[]
    const normalized = rawRows.map(r => ({
        ...r,
        referral: Array.isArray(r.referral) ? (r.referral[0] ?? null) : r.referral,
    }))

    // Resolve inviter customer details + their pending credit amount in
    // batched lookups so we don't N+1.
    const inviterIds = Array.from(
        new Set(normalized.map(r => r.referral?.inviter_user_id).filter(Boolean)),
    ) as string[]
    const referralIds = normalized.map(r => r.referral?.id).filter(Boolean) as string[]

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

    const pending: PendingReferralRow[] = normalized
        .filter(r => r.referral != null)
        .map(r => {
            const ref = r.referral!
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

    return <QueueClient rows={pending} focusId={focusId} />
}
