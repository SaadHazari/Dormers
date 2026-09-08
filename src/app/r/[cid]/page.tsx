import { getMenuDishes } from '@/infra/supabase/menu-catalog'
import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { dormNames } from '@/shared/dorm-registry'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import ReferralLandingPage from './ReferralClient'
import { InvalidReferralLink } from './InvalidReferralLink'

/**
 * Referral landing page — `/r/[cid]`.
 *
 * The CID is checked HERE, before the form renders. It used to not be checked
 * at all: any string returned a normal-looking welcome page, and the visitor
 * filled in their name, received a WhatsApp OTP (a paid template send), typed
 * it in, verified an email OTP, picked their dorm — and only then did
 * claimGift's step 1 tell them "This referral link is invalid or has expired."
 * Five minutes of work and one paid message for a guaranteed dead end, and
 * WhatsApp truncating a long link makes that a routine path, not an edge case.
 *
 * The information was already on hand: the page asks the same question on load
 * to personalise the headline with the inviter's first name, gets nothing back,
 * and carried on anyway. The check belongs on the server rather than in that
 * client lookup, because /api/referral/inviter returns `firstName: null` both
 * for "no such CID" and for "you tripped the rate limiter" — the client cannot
 * tell a bad link from a throttled one, and must not fail a real invite.
 */

async function inviterExists(cid: string): Promise<boolean> {
    const clean = cid.toUpperCase().trim()
    if (!clean) return false
    try {
        const sb = createAdminSupabaseClient()
        const { data, error } = await sb
            .from('customers')
            .select('id')
            .eq('cid', clean)
            .maybeSingle()
        // Fail OPEN on a lookup error. A Supabase blip must never turn a real
        // invite into a dead end — claimGift re-validates the CID before it
        // writes anything, so the worst case is the old behaviour for the
        // duration of the outage, not a wrongly-rejected customer.
        if (error) {
            console.error('referral CID lookup failed — allowing through:', error.message)
            return true
        }
        return Boolean(data)
    } catch (err) {
        console.error('referral CID lookup threw — allowing through:', err)
        return true
    }
}

export default async function ReferralPage({
    params,
}: {
    params: Promise<{ cid: string }>
}) {
    const { cid } = await params

    const [valid, menuData, locs] = await Promise.all([
        inviterExists(cid),
        getMenuDishes(),
        getDormLocations(),
    ])

    if (!valid) return <InvalidReferralLink />

    return <ReferralLandingPage menuData={menuData} dorms={dormNames(locs)} />
}
