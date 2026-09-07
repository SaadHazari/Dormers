/**
 * Regression: every confirmation email's "verify in one tap" link carries a
 * PKCE token (`pkce_...`) because signUp runs through the @supabase/ssr
 * server client. GoTrue's /verify consumes the token and 303s BACK to this
 * route with `?code=<auth code>` — but the route only ever read `token_hash`,
 * so every click (human or mailbox scanner) confirmed the account server-side
 * and then rendered "Email confirmation failed". Supabase auth logs show all
 * four September victims hitting exactly this: one GET on the pkce verify
 * URL, then a dead typed code and a dead-end error page.
 *
 * The route now exchanges `code` for a session, so a click in the browser
 * that started onboarding (where the PKCE verifier cookie lives) completes
 * sign-in and lands on `next`. Cross-browser clicks and scanners still fail
 * the exchange and fall through to the /login error redirect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const { verifyOtpMock, exchangeCodeMock } = vi.hoisted(() => ({
    verifyOtpMock: vi.fn(),
    exchangeCodeMock: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({
        auth: {
            verifyOtp: verifyOtpMock,
            exchangeCodeForSession: exchangeCodeMock,
        },
    }),
}))

import { GET } from './route'

function req(query: string): NextRequest {
    return { url: `https://dormers.ae/auth/confirm?${query}` } as NextRequest
}

beforeEach(() => {
    verifyOtpMock.mockReset()
    exchangeCodeMock.mockReset()
})

describe('/auth/confirm GET', () => {
    it('exchanges a PKCE ?code= for a session and lands on next', async () => {
        exchangeCodeMock.mockResolvedValue({ error: null })

        const res = await GET(req('code=abc123&next=/dashboard'))

        expect(exchangeCodeMock).toHaveBeenCalledWith('abc123')
        expect(res.headers.get('location')).toBe('https://dormers.ae/dashboard')
    })

    it('falls through to the login error redirect when the exchange fails (cross-browser click / scanner)', async () => {
        exchangeCodeMock.mockResolvedValue({ error: { message: 'code verifier missing' } })

        const res = await GET(req('code=abc123&next=/dashboard'))

        expect(res.headers.get('location')).toContain('/login?error=')
    })

    it('still verifies token_hash links', async () => {
        verifyOtpMock.mockResolvedValue({ error: null })

        const res = await GET(req('token_hash=xyz&type=email&next=/dashboard'))

        expect(verifyOtpMock).toHaveBeenCalledWith({ type: 'email', token_hash: 'xyz' })
        expect(res.headers.get('location')).toBe('https://dormers.ae/dashboard')
    })

    it('redirects to the login error when nothing usable is present', async () => {
        const res = await GET(req('next=/dashboard'))

        expect(res.headers.get('location')).toContain('/login?error=')
        expect(exchangeCodeMock).not.toHaveBeenCalled()
        expect(verifyOtpMock).not.toHaveBeenCalled()
    })

    it('refuses an off-origin next even on success', async () => {
        exchangeCodeMock.mockResolvedValue({ error: null })

        const res = await GET(req('code=abc123&next=https://evil.example'))

        expect(res.headers.get('location')).toBe('https://dormers.ae/dashboard')
    })
})
