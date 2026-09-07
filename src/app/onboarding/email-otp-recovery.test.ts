/**
 * Regression: mailbox link-scanners (Microsoft Defender SafeLinks on
 * university-hosted domains) prefetch the "Or verify in one tap →" link in
 * the Supabase confirmation email, consuming the SINGLE-USE token that also
 * backs the 6-digit code. Every code the user then types returns otp_expired
 * and onboarding dead-ends — two real customers re-signed up under a second
 * email (KSK2520XVP4 → KSK2956GCAN on Sept 1; ESA3416L88L → ESA37321A83 on
 * Sept 6) and one never came back.
 *
 * The account IS confirmed at that point (the scanner's GET confirmed it)
 * and the onboarding form still holds the password the user just chose, so
 * verifyEmailOtp recovers by signing in with the password instead of
 * surfacing "code is wrong or expired". Password sign-in fails for
 * unconfirmed accounts ("Email not confirmed"), so a genuine wrong-code typo
 * still shows the original OTP error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { verifyOtpMock, signInWithPasswordMock, revalidatePathMock } = vi.hoisted(() => ({
    verifyOtpMock: vi.fn(),
    signInWithPasswordMock: vi.fn(),
    revalidatePathMock: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({
        auth: {
            verifyOtp: verifyOtpMock,
            signInWithPassword: signInWithPasswordMock,
        },
    }),
}))
vi.mock('@/infra/supabase/admin-client', () => ({
    createAdminSupabaseClient: () => ({}),
}))
vi.mock('@/infra/supabase/dorm-locations', () => ({
    getDormLocations: vi.fn(async () => []),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('next/navigation', () => ({
    redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
}))

import { verifyEmailOtp } from './actions'

const OTP_CONSUMED = { message: 'Token has expired or is invalid', code: 'otp_expired' }

beforeEach(() => {
    verifyOtpMock.mockReset()
    signInWithPasswordMock.mockReset()
    revalidatePathMock.mockReset()
})

describe('verifyEmailOtp scanner-consumed-token recovery', () => {
    it('signs in with the password when the code fails but the account is already confirmed', async () => {
        verifyOtpMock.mockResolvedValue({ error: OTP_CONSUMED })
        signInWithPasswordMock.mockResolvedValue({ error: null })

        const res = await verifyEmailOtp('nr745@live.mdx.ac.uk', '123456', 'Str0ng-Passw0rd!')

        expect(res).toEqual({ ok: true })
        expect(signInWithPasswordMock).toHaveBeenCalledWith({
            email: 'nr745@live.mdx.ac.uk',
            password: 'Str0ng-Passw0rd!',
        })
        // The session cookie changed — layouts must re-render authed.
        expect(revalidatePathMock).toHaveBeenCalled()
    })

    it('keeps the original OTP error when the account is not confirmed (real wrong code)', async () => {
        verifyOtpMock.mockResolvedValue({ error: OTP_CONSUMED })
        signInWithPasswordMock.mockResolvedValue({ error: { message: 'Email not confirmed' } })

        const res = await verifyEmailOtp('someone@uni.edu', '123456', 'Str0ng-Passw0rd!')

        expect(res).toEqual({ error: 'Token has expired or is invalid' })
    })

    it('does not attempt password sign-in when no password was provided', async () => {
        verifyOtpMock.mockResolvedValue({ error: OTP_CONSUMED })

        const res = await verifyEmailOtp('someone@uni.edu', '123456')

        expect(res).toEqual({ error: 'Token has expired or is invalid' })
        expect(signInWithPasswordMock).not.toHaveBeenCalled()
    })

    it('leaves the happy path untouched — code verifies, no sign-in fallback fired', async () => {
        verifyOtpMock.mockResolvedValue({ error: null })

        const res = await verifyEmailOtp('someone@gmail.com', '654321', 'Str0ng-Passw0rd!')

        expect(res).toEqual({ ok: true })
        expect(signInWithPasswordMock).not.toHaveBeenCalled()
    })
})
