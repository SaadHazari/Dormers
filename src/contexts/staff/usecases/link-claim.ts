import 'server-only'

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { normalisePhone } from '@/shared/phone'
import { CLAIM_WINDOW_MINUTES } from '../domain/claim-code'

/**
 * Links a freshly created account to a pending staff claim — the final lock
 * in the claim chain. Runs inside onboarding's createAccount after the
 * customers row exists.
 *
 * A row links ONLY when all three match:
 *   1. the registry email equals the signup email (claim code was issued
 *      against it),
 *   2. the registry whatsapp_number equals the OTP-VERIFIED signup phone
 *      (possession proven — a forwarded code can't pass this),
 *   3. the claim screen verified the code within the last 60 minutes
 *      (code_verified_at window, opened by /staff/claim).
 *
 * CAS on status='invited' makes the claim single-use even under a double
 * submit. Returns true when a claim linked — onboarding then routes the
 * intern to the staff plan chooser instead of the dashboard.
 */
export async function linkStaffClaimIfEligible(
    userId: string,
    email: string,
    phone: string,
): Promise<boolean> {
    try {
        const sb = createAdminSupabaseClient()
        const windowStart = new Date(Date.now() - CLAIM_WINDOW_MINUTES * 60 * 1000).toISOString()

        const { data, error } = await sb
            .from('staff_members')
            .update({
                status: 'active',
                claimed_at: new Date().toISOString(),
                customer_id: userId,
                code_verified_at: null,
            })
            .eq('status', 'invited')
            .ilike('email', email.trim())
            .eq('whatsapp_number', normalisePhone(phone))
            .gte('code_verified_at', windowStart)
            .select('id')

        if (error) {
            console.error('linkStaffClaimIfEligible failed:', error.message)
            return false
        }
        return (data?.length ?? 0) > 0
    } catch (err) {
        // A staff-linkage hiccup must never break a normal signup.
        console.error('linkStaffClaimIfEligible crashed:', err)
        return false
    }
}
