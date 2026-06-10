/**
 * fetchWithTimeout — `fetch` that aborts after `timeoutMs`.
 *
 * Plain `fetch()` has no per-call timeout in Node.js runtimes. A slow or
 * stalled vendor (Stripe, Zoho, ZeptoMail, Meta) can hang an API route
 * indefinitely. This helper enforces a hard ceiling using AbortController.
 *
 * On timeout, throws a typed FetchTimeoutError so callers can distinguish
 * "the upstream took too long" from "the upstream returned 500."
 *
 * Per L1: lives in infra/. Per Release-It (Hunt & Thomas / Nygard): every
 * cross-process call needs a timeout. Without this every vendor SDK call
 * is a thread that can hang forever.
 *
 * Usage:
 *   const res = await fetchWithTimeout(url, { method: 'POST', body }, { timeoutMs: 10_000 })
 *
 * No retries built in — retry policy is per-caller, only safe for idempotent
 * operations (e.g. GETs, or POSTs with vendor-side idempotency keys).
 */

export class FetchTimeoutError extends Error {
  readonly timeoutMs: number
  readonly url: string

  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`)
    this.name = 'FetchTimeoutError'
    this.url = url
    this.timeoutMs = timeoutMs
  }
}

export interface FetchTimeoutOptions {
  /** Hard ceiling in milliseconds. Throws FetchTimeoutError on expiry. */
  timeoutMs: number
}

export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  options: FetchTimeoutOptions,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      throw new FetchTimeoutError(String(url), options.timeoutMs)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
