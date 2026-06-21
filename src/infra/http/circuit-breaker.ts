/**
 * CircuitBreaker — fail fast when a dependency is repeatedly failing, so we
 * stop hammering a down vendor and stop tying up function/connection resources
 * waiting on calls that are very likely to fail.
 *
 * Per Release It! (Nygard): three states.
 *   closed     — calls flow; consecutive failures are counted.
 *   open       — calls fail fast immediately (CircuitOpenError); after
 *                recoveryTimeMs we allow a single trial.
 *   half-open  — one trial call is allowed; success → closed, failure → open.
 *
 * Why this matters here: during a multi-hour Meta/Stripe/Zoho/ZeptoMail/Gemini
 * outage, without a breaker every request and every retry-cron tick pays the
 * full timeout against a dead endpoint, amplifying load when the dependency is
 * weakest. The breaker sheds that load. The audit's macro Critical #2 is
 * "zero circuit breakers anywhere" — this is the primitive that closes it.
 *
 * State is per-process (per warm serverless instance), which is the correct
 * granularity for fail-fast: each instance independently learns the dependency
 * is down and stops calling it. Shared via getCircuitBreaker(name).
 *
 * Phase 0: built and tested, wired to NOTHING. Phase 5 wires it into the vendor
 * clients, always paired with a graceful customer-facing fallback (Prime
 * Directive — a fast-fail must never surface to a customer as a raw error).
 */

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  /** Consecutive failures (in closed state) that trip the breaker open. Default 5. */
  failureThreshold?: number
  /** How long to stay open before allowing a half-open trial, in ms. Default 30000. */
  recoveryTimeMs?: number
  /**
   * Classify whether an error counts as a circuit failure. Default: every error
   * counts. Override to ignore expected, non-outage errors (e.g. HTTP 4xx) so a
   * burst of client errors doesn't trip the breaker on a healthy dependency.
   */
  isFailure?: (error: unknown) => boolean
  /** Test seam — defaults to Date.now. */
  now?: () => number
  /** Observability hook for state transitions. */
  onStateChange?: (change: { name: string; from: CircuitState; to: CircuitState }) => void
}

export class CircuitOpenError extends Error {
  readonly breakerName: string
  readonly retryAfterMs: number
  constructor(breakerName: string, retryAfterMs: number) {
    super(`Circuit "${breakerName}" is open; retry in ~${Math.max(0, retryAfterMs)}ms`)
    this.name = 'CircuitOpenError'
    this.breakerName = breakerName
    this.retryAfterMs = Math.max(0, retryAfterMs)
  }
}

const DEFAULT_FAILURE_THRESHOLD = 5
const DEFAULT_RECOVERY_TIME_MS = 30_000

export class CircuitBreaker {
  readonly name: string
  private readonly failureThreshold: number
  private readonly recoveryTimeMs: number
  private readonly isFailure: (error: unknown) => boolean
  private readonly now: () => number
  private readonly onStateChange?: CircuitBreakerOptions['onStateChange']

  private state: CircuitState = 'closed'
  private consecutiveFailures = 0
  private openedAt = 0
  private halfOpenInFlight = false

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD
    this.recoveryTimeMs = options.recoveryTimeMs ?? DEFAULT_RECOVERY_TIME_MS
    this.isFailure = options.isFailure ?? (() => true)
    this.now = options.now ?? Date.now
    this.onStateChange = options.onStateChange
  }

  /** Current state, accounting for an elapsed recovery window (open → half-open). */
  getState(): CircuitState {
    this.maybeHalfOpen()
    return this.state
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeHalfOpen()

    if (this.state === 'open') {
      throw new CircuitOpenError(this.name, this.recoveryTimeMs - (this.now() - this.openedAt))
    }

    let acquiredHalfOpenSlot = false
    if (this.state === 'half-open') {
      // Allow exactly one trial call while half-open; others fail fast.
      if (this.halfOpenInFlight) {
        throw new CircuitOpenError(this.name, this.recoveryTimeMs)
      }
      this.halfOpenInFlight = true
      acquiredHalfOpenSlot = true
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onError(error)
      throw error
    } finally {
      if (acquiredHalfOpenSlot) this.halfOpenInFlight = false
    }
  }

  private maybeHalfOpen(): void {
    if (this.state === 'open' && this.now() - this.openedAt >= this.recoveryTimeMs) {
      this.transition('half-open')
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0
    if (this.state !== 'closed') this.transition('closed')
  }

  private onError(error: unknown): void {
    if (!this.isFailure(error)) return // expected error — don't penalize the breaker.
    this.consecutiveFailures++
    if (this.state === 'half-open') {
      this.open()
      return
    }
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.open()
    }
  }

  private open(): void {
    this.openedAt = this.now()
    this.transition('open')
  }

  private transition(to: CircuitState): void {
    if (to === this.state) return
    const from = this.state
    this.state = to
    this.onStateChange?.({ name: this.name, from, to })
  }
}

// ── Shared registry ──────────────────────────────────────────────────────
// One breaker per logical dependency name, shared across call sites within a
// process so they learn "this dependency is down" together. First options win.
const registry = new Map<string, CircuitBreaker>()

export function getCircuitBreaker(
  name: string,
  options?: CircuitBreakerOptions,
): CircuitBreaker {
  let breaker = registry.get(name)
  if (!breaker) {
    breaker = new CircuitBreaker(name, options)
    registry.set(name, breaker)
  }
  return breaker
}

/** Test seam — clear the shared registry between tests. */
export function __resetCircuitBreakers(): void {
  registry.clear()
}
