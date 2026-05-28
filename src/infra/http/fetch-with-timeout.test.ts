/**
 * Tests for fetchWithTimeout — abort behavior + error typing.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithTimeout, FetchTimeoutError } from './fetch-with-timeout'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchWithTimeout', () => {
  it('returns the response on a fast call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })))
    const res = await fetchWithTimeout('https://example.test/', {}, { timeoutMs: 1000 })
    expect(res.status).toBe(200)
  })

  it('throws FetchTimeoutError when the call exceeds timeoutMs', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    }))
    await expect(
      fetchWithTimeout('https://slow.test/', {}, { timeoutMs: 30 }),
    ).rejects.toBeInstanceOf(FetchTimeoutError)
  })

  it('re-throws non-abort errors unchanged', async () => {
    const networkError = new Error('ECONNREFUSED')
    vi.stubGlobal('fetch', vi.fn(async () => { throw networkError }))
    await expect(
      fetchWithTimeout('https://broken.test/', {}, { timeoutMs: 100 }),
    ).rejects.toBe(networkError)
  })

  it('exposes the URL and timeout on the typed error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    }))
    try {
      await fetchWithTimeout('https://slow.test/path', {}, { timeoutMs: 25 })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FetchTimeoutError)
      const e = err as FetchTimeoutError
      expect(e.url).toBe('https://slow.test/path')
      expect(e.timeoutMs).toBe(25)
    }
  })
})
