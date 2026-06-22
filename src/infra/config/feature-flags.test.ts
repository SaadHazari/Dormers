/**
 * Tests for isFeatureEnabled — reads the flag, caches it, and FAILS OPEN
 * (stays enabled) on any error or missing row.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { maybeSingleMock } = vi.hoisted(() => ({ maybeSingleMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) }),
  }),
}))

import { isFeatureEnabled, __resetFeatureFlagCache } from './feature-flags'

beforeEach(() => {
  __resetFeatureFlagCache()
  maybeSingleMock.mockReset()
})

describe('isFeatureEnabled', () => {
  it('returns true when the flag row is enabled', async () => {
    maybeSingleMock.mockResolvedValue({ data: { enabled: true }, error: null })
    expect(await isFeatureEnabled('chat')).toBe(true)
  })

  it('returns false only when the flag is explicitly disabled', async () => {
    maybeSingleMock.mockResolvedValue({ data: { enabled: false }, error: null })
    expect(await isFeatureEnabled('chat')).toBe(false)
  })

  it('fails OPEN (enabled) when the row is missing', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    expect(await isFeatureEnabled('staff_program')).toBe(true)
  })

  it('fails OPEN (enabled) when the read errors', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'db down' } })
    expect(await isFeatureEnabled('referral_claims')).toBe(true)
  })

  it('caches within the TTL (second call does not hit the DB)', async () => {
    maybeSingleMock.mockResolvedValue({ data: { enabled: false }, error: null })
    expect(await isFeatureEnabled('chat')).toBe(false)
    expect(await isFeatureEnabled('chat')).toBe(false)
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)
  })
})
