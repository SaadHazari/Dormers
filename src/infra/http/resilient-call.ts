/**
 * resilientCall — compose the resilience primitives into one call wrapper:
 *
 *     circuit breaker  →  retry (jitter)  →  per-attempt timeout  →  fn
 *
 * Ordering rationale:
 *   - breaker OUTERMOST: when the dependency is known-down, fail fast WITHOUT
 *     even entering the retry loop (no retry storm against a dead vendor). A
 *     fully-exhausted retry sequence counts as ONE breaker failure.
 *   - retry MIDDLE: recover transient blips/timeouts within a single logical call.
 *   - timeout INNERMOST: bound each individual attempt; passes an AbortSignal to
 *     `fn` so fetch-based calls actually abort (SDK calls that ignore the signal
 *     still stop *waiting* via the race).
 *
 * This is the "resilient client" the plan calls for (fetchWithTimeout + retry +
 * breaker). It is generic over any async fn so it wraps both fetch and vendor
 * SDK calls (Stripe, Zoho, etc.).
 *
 * Phase 0: built + tested, wired to NOTHING. Phase 5 wires vendors through it,
 * and EVERY wiring ships with a graceful fallback for the failure/open-circuit
 * case (Prime Directive: never surface a raw failure to a customer).
 */

import { retryWithJitter, type RetryOptions } from './retry'
import {
  getCircuitBreaker,
  type CircuitBreakerOptions,
} from './circuit-breaker'

export class CallTimeoutError extends Error {
  readonly callName: string
  readonly timeoutMs: number
  constructor(callName: string, timeoutMs: number) {
    super(`Call "${callName}" timed out after ${timeoutMs}ms`)
    this.name = 'CallTimeoutError'
    this.callName = callName
    this.timeoutMs = timeoutMs
  }
}

export interface ResilientCallOptions {
  /** Logical dependency name — used as the circuit-breaker key and log tag. */
  name: string
  /** Per-attempt timeout in ms. Omit for no internal timeout (fn may self-bound). */
  timeoutMs?: number
  /** Retry policy, or `false` to disable retries entirely. Default: enabled. */
  retry?: Partial<RetryOptions> | false
  /** Circuit-breaker options, or `false` to disable the breaker. Default: enabled. */
  breaker?: CircuitBreakerOptions | false
  /** External abort (e.g. request cancelled). Propagated to fn + retry. */
  signal?: AbortSignal
}

async function withTimeout<T>(
  callName: string,
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number | undefined,
  parentSignal: AbortSignal | undefined,
): Promise<T> {
  const controller = new AbortController()
  const onParentAbort = () => controller.abort()
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort()
    else parentSignal.addEventListener('abort', onParentAbort, { once: true })
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if (!timeoutMs) {
      return await fn(controller.signal)
    }
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new CallTimeoutError(callName, timeoutMs))
      }, timeoutMs)
    })
    return await Promise.race([fn(controller.signal), timeout])
  } finally {
    if (timer) clearTimeout(timer)
    parentSignal?.removeEventListener('abort', onParentAbort)
  }
}

export async function resilientCall<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: ResilientCallOptions,
): Promise<T> {
  const { name, timeoutMs, signal } = options

  const attempt = () => withTimeout(name, fn, timeoutMs, signal)

  const runWithRetry =
    options.retry === false
      ? attempt
      : () => retryWithJitter(attempt, { ...(options.retry ?? {}), signal })

  if (options.breaker === false) {
    return runWithRetry()
  }

  const breaker = getCircuitBreaker(name, options.breaker || undefined)
  return breaker.run(runWithRetry)
}
