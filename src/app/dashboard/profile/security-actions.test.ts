/**
 * confirmEmailChange — the code-entry half of the change-email flow. The
 * sheet used to promise "confirm via the link we send" while the rest of the
 * product's auth emails had gone code-only (scanner-safe); this action lets
 * the email-change template drop its link too.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { verifyOtpMock, getUserMock, revalidatePathMock } = vi.hoisted(() => ({
    verifyOtpMock: vi.fn(),
    getUserMock: vi.fn(),
    revalidatePathMock: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({
        auth: { verifyOtp: verifyOtpMock, getUser: getUserMock },
    }),
}))
vi.mock('@/infra/supabase/admin-client', () => ({
    createAdminSupabaseClient: () => ({}),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))

import { confirmEmailChange } from './security-actions'

beforeEach(() => {
    verifyOtpMock.mockReset()
    getUserMock.mockReset()
    revalidatePathMock.mockReset()
})

describe('confirmEmailChange', () => {
    it('rejects a malformed code before touching Supabase', async () => {
        const res = await confirmEmailChange('new@dormers.ae', '12ab')
        expect(res).toEqual({ error: 'Enter the code from your email.' })
        expect(verifyOtpMock).not.toHaveBeenCalled()
    })

    it('verifies the code as an email_change OTP against the inbox it came from', async () => {
        verifyOtpMock.mockResolvedValue({ error: null })
        getUserMock.mockResolvedValue({ data: { user: { email: 'new@dormers.ae' } } })

        const res = await confirmEmailChange('New@Dormers.ae ', '123456')

        expect(verifyOtpMock).toHaveBeenCalledWith({ type: 'email_change', email: 'new@dormers.ae', token: '123456' })
        expect(res).toEqual({ ok: true, done: true, message: 'Email updated.' })
        expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard', 'layout')
    })

    it('reports the second step when secure email change still holds the old address', async () => {
        verifyOtpMock.mockResolvedValue({ error: null })
        getUserMock.mockResolvedValue({ data: { user: { email: 'old@dormers.ae', new_email: 'new@dormers.ae' } } })

        const res = await confirmEmailChange('new@dormers.ae', '123456')

        expect(res).toMatchObject({ ok: true, done: false })
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })

    it('turns an expired or invalid token into a retry message', async () => {
        verifyOtpMock.mockResolvedValue({ error: { message: 'Token has expired or is invalid', code: 'otp_expired' } })

        const res = await confirmEmailChange('new@dormers.ae', '123456')

        expect(res).toEqual({ error: 'That code is wrong or has expired. Send a fresh one and try again.' })
        expect(getUserMock).not.toHaveBeenCalled()
    })
})
