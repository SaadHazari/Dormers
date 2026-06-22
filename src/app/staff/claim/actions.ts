'use server'

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { hashClaimCode } from '@/contexts/staff/domain/claim-code'
import { timingSafeCompare } from '@/shared/crypto'
import { staffClaimLimiter, identifierKey } from '@/infra/rate-limit/limiters'
import { isFeatureEnabled } from '@/infra/config/feature-flags'

export type ClaimCheckResult =
    | { ok: true; firstName: string }
    | { error: string }

// One message for every mismatch flavor (no row / wrong code / wrong email)
// so the form doesn't leak which staff emails exist.
const GENERIC_FAIL = 'That email and code combination didn\'t match. Check both and try again — or message us on WhatsApp.'

/**
 * The staff front door: checks (email, code) against the registry and, on
 * success, opens the 60-minute claim window (code_verified_at). The intern
 * then completes the NORMAL onboarding — account linkage happens there, in
 * linkStaffClaimIfEligible, where the OTP-verified phone must also match.
 *
 * Public route, service-role lookups, deliberately quiet errors.
 */
export async function verifyStaffClaim(email: string, code: string): Promise<ClaimCheckResult> {
    const cleanEmail = (email ?? '').trim().toLowerCase()
    const cleanCode = (code ?? '').trim()
    if (!cleanEmail || !cleanCode) return { error: 'Enter both your email and the code we sent you.' }

    // Phase 8 (L7): instant kill-switch — pause new staff claims without a
    // redeploy (e.g. if the program is being abused). Fails open.
    if (!(await isFeatureEnabled('staff_program'))) {
        return { error: 'The staff program is paused right now — please check back soon or message us on WhatsApp.' }
    }

    // Shadow rate-limit (Phase 4 / L3): keyed per (hashed) email to catch code
    // brute-forcing of a specific invite. Observe-only for now; fails open.
    await staffClaimLimiter.check(identifierKey('staff', cleanEmail))

    const sb = createAdminSupabaseClient()
    const { data: row } = await sb
        .from('staff_members')
        .select('id, name, status, claim_code_hash, code_expires_at')
        .ilike('email', cleanEmail)
        .neq('status', 'ended')
        .maybeSingle()

    if (!row) return { error: GENERIC_FAIL }
    if (row.status === 'active') {
        return { error: 'This invite has already been claimed. Just log in with your email and password.' }
    }
    if (!timingSafeCompare(hashClaimCode(cleanCode), row.claim_code_hash as string)) {
        return { error: GENERIC_FAIL }
    }
    if (new Date(row.code_expires_at as string) < new Date()) {
        return { error: 'This code has expired — message us on WhatsApp and we\'ll send you a fresh one.' }
    }

    const { error } = await sb
        .from('staff_members')
        .update({ code_verified_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'invited')

    if (error) {
        console.error('verifyStaffClaim window-open failed:', error)
        return { error: 'Something went wrong on our side. Try again in a minute.' }
    }

    const firstName = ((row.name as string) ?? '').split(' ')[0] || 'there'
    return { ok: true, firstName }
}
