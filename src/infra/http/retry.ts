/**
 * retryWithJitter — run an async operation with bounded retries, exponential
 * backoff, and full jitter.
 *
 * Pairs with fetchWithTimeout (timeout) and CircuitBreaker (fail-fast) to form
 * the resilient-call stack (see resilient-call.ts). Per Release It! (Nygard):
 * retries recover from transient blips, but UNBOUNDED or UNJITTERED retries
 * cause retry storms / thundering-herd that amplify an outage. So:
 *   - attempts are capped (maxAttempts, default 3 incl. the first try)
 *   - backoff is exponential (baseDelayMs * 2^(n-1), capped at maxDelayMs)
 *   - jitter is FULL (delay = random()*backoff) to de-correlate fleet retries
 *   - only retry when `shouldRetry` says so — NEVER retry a non-idempotent op
 *     or a permanent error (4xx, validation). Default retries everything;
 *     callers of mutating endpoints must pass a predicate.
 *
 * IMPORTANT: this is unwired in Phase 0. It is wired into vendor calls in
 * Phase 5 (circuit breakers + graceful degradation), always behind a graceful
 * fallback so a customer never sees a raw failure.
 */

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number
  /** First backoff base in ms. Default 100. */
  baseDelayMs?: number
  /** Per-delay ceiling in ms. Default 2000. */
  maxDelayMs?: number
  /**
   * Decide whether a given error is worth retrying. Return false for permanent
   * errors (validation, 4xx) and non-idempotent operations. Default: retry all.
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean
  /** Abort between attempts; aborts the inter-attempt sleep too. */
  signal?: AbortSignal
  /** Observability hook fired before each backoff sleep. */
  onRetry?: (info: { error: unknown; attempt: number; delayMs: number }) => void
  /** Test seam — defaults to Math.random. */
  random?: () => number
  /** Test seam — defaults to a real, abortable setTimeout sleep. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 100
const DEFAULT_MAX_DELAY_MS = 2000

export class RetryAbortedError extends Error {
  readonly completedAttempts: number
  constructor(completedAttempts: number) {
    super(`Retry aborted after ${completedAttempts} attempt(s)`)
    this.name = 'RetryAbortedError'
    this.completedAttempts = completedAttempts
  }
}

/**
 * Full-jitter exponential backoff. `attempt` is 1-based and represents the
 * attempt that just failed; the returned delay is how long to wait before the
 * next attempt. delay ∈ [0, min(maxDelayMs, baseDelayMs * 2^(attempt-1))).
 */
export function computeBackoffDelay(
  attempt: number,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
  return Math.floor(random() * ceiling)
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RetryAbortedError(0))
      return
    }
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = () => {
      cleanup()
      reject(new RetryAbortedError(0))
    }
    function cleanup() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function retryWithJitter<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const shouldRetry = options.shouldRetry ?? (() => true)
  const random = options.random ?? Math.random
  const sleep = options.sleep ?? defaultSleep
  const signal = options.signal

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new RetryAbortedError(attempt - 1)
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      const isLastAttempt = attempt >= maxAttempts
      if (isLastAttempt || !shouldRetry(error, attempt)) throw error
      const delayMs = computeBackoffDelay(attempt, baseDelayMs, maxDelayMs, random)
      options.onRetry?.({ error, attempt, delayMs })
      await sleep(delayMs, signal)
    }
  }
  // Unreachable: the loop either returns or throws. Satisfies the type checker.
  throw lastError
}
