/**
 * Tests for hashKey — deterministic, namespaced, no raw value leakage.
 * (resolveClientIp depends on next/headers and is exercised via integration.)
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Map() }))

import { hashKey } from './client-ip'

describe('hashKey', () => {
  it('is deterministic for the same value + namespace', () => {
    expect(hashKey('1.2.3.4', 'ratelimit-ip')).toBe(hashKey('1.2.3.4', 'ratelimit-ip'))
  })

  it('differs across namespaces (no cross-feature collision)', () => {
    expect(hashKey('1.2.3.4', 'ratelimit-ip')).not.toBe(hashKey('1.2.3.4', 'referral-ip-v1'))
  })

  it('does not contain the raw value', () => {
    const h = hashKey('user@example.com', 'ratelimit-staff')
    expect(h).not.toContain('user@example.com')
    expect(h).toMatch(/^[a-f0-9]{64}$/)
  })
})
