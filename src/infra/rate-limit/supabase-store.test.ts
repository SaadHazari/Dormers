/**
 * Tests for SupabaseRateLimitStore — maps the rate_limit_hit RPC result to the
 * RateLimitStore contract, and THROWS on error (so the RateLimiter fails open).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({ rpc: rpcMock }),
}))

import { SupabaseRateLimitStore } from './supabase-store'

beforeEach(() => {
  rpcMock.mockReset()
})

describe('SupabaseRateLimitStore', () => {
  it('calls rate_limit_hit with the key + window in seconds and maps the row', async () => {
    const resetIso = '2026-06-22T10:00:00.000Z'
    rpcMock.mockResolvedValue({ data: [{ hit_count: 4, reset_at: resetIso }], error: null })

    const store = new SupabaseRateLimitStore()
    const res = await store.hit('chat:abc', 60_000)

    expect(rpcMock).toHaveBeenCalledWith('rate_limit_hit', { p_key: 'chat:abc', p_window_seconds: 60 })
    expect(res).toEqual({ count: 4, resetAt: new Date(resetIso).getTime() })
  })

  it('throws on RPC error (so the limiter fails open)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const store = new SupabaseRateLimitStore()
    await expect(store.hit('k', 1000)).rejects.toThrow(/rate_limit_hit failed: boom/)
  })

  it('throws when no row is returned', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })
    const store = new SupabaseRateLimitStore()
    await expect(store.hit('k', 1000)).rejects.toThrow(/no row/)
  })

  it('rounds sub-second windows up to at least 1 second', async () => {
    rpcMock.mockResolvedValue({ data: [{ hit_count: 1, reset_at: '2026-06-22T10:00:00Z' }], error: null })
    const store = new SupabaseRateLimitStore()
    await store.hit('k', 200)
    expect(rpcMock).toHaveBeenCalledWith('rate_limit_hit', { p_key: 'k', p_window_seconds: 1 })
  })
})
