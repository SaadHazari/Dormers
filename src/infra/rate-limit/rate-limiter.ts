/**
 * RateLimiter — fixed-window request limiter with a SHADOW mode and a hard
 * fail-open guarantee.
 *
 * Closes the audit's macro Critical #3: three unauthenticated, money-spending
 * endpoints (/api/chat → Gemini tokens, /api/whatsapp/start → paid WhatsApp
 * templates, verifyStaffClaim → brute force) have no rate limiting. A viral
 * spike or a scripted abuser both translate directly into third-party spend +
 * function-concurrency exhaustion.
 *
 * Prime Directive compliance (a real customer must NEVER be wrongly blocked):
 *   1. mode 'shadow' (DEFAULT): the limiter computes would-be blocks and reports
 *      them via onDecision, but ALWAYS allows. We run shadow first against real
 *      traffic, confirm no real customer trips the limit, tune thresholds, and
 *      only THEN flip to 'enforce' (Phase 4).
 *   2. FAIL OPEN: if the backing store throws (DB blip), we allow the request.
 *      A limiter outage must never become a customer outage.
 *   3. Generous limits + a friendly 429 + WhatsApp escape are the caller's
 *      responsibility when enforcing.
 *
 * Store: the in-memory store here is per-process (good enough for shadow
 * logging and dev). Phase 4 swaps in a durable, shared store (Supabase token
 * bucket / Upstash) for true cross-instance enforcement.
 *
 * Phase 0: built + tested, wired to NOTHING.
 */

export type RateLimitMode = 'shadow' | 'enforce'

export interface RateLimitDecision {
  /** Whether the request is permitted. In shadow mode this is ALWAYS true. */
  allowed: boolean
  /** Whether the request WOULD be blocked if enforcing (the signal we watch in shadow). */
  wouldBlock: boolean
  mode: RateLimitMode
  limit: number
  /** Remaining allowance in the current window (clamped at 0). */
  remaining: number
  /** Epoch ms when the current window resets. */
  resetAt: number
  key: string
  name: string
  /** True when the store errored and we allowed the request defensively. */
  failedOpen: boolean
}

export interface RateLimitStore {
  /**
   * Record one hit for `key` in its current window and return the running count
   * plus the window reset time. Implementations create/roll the window as needed.
   */
  hit(key: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>
}

/** Per-process fixed-window store. Phase 4 replaces with a durable shared store. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>()

  async hit(key: string, windowMs: number, now: number) {
    let bucket = this.buckets.get(key)
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      this.buckets.set(key, bucket)
    }
    bucket.count++
    return { count: bucket.count, resetAt: bucket.resetAt }
  }

  /** Test/maintenance seam. */
  reset(): void {
    this.buckets.clear()
  }
}

export interface RateLimiterOptions {
  /** Logical limiter name — used for logging/metrics tags. */
  name: string
  /** Max allowed hits per window. */
  limit: number
  /** Window length in ms. */
  windowMs: number
  /** Default 'shadow' — observe without blocking. Flip to 'enforce' only after shadow proves safe. */
  mode?: RateLimitMode
  /** Defaults to a fresh InMemoryRateLimitStore. */
  store?: RateLimitStore
  /** Test seam — defaults to Date.now. */
  now?: () => number
  /** Observability hook — log/metric every decision (especially wouldBlock in shadow). */
  onDecision?: (decision: RateLimitDecision) => void
}

export class RateLimiter {
  readonly name: string
  private readonly limit: number
  private readonly windowMs: number
  private readonly mode: RateLimitMode
  private readonly store: RateLimitStore
  private readonly now: () => number
  private readonly onDecision?: (decision: RateLimitDecision) => void

  constructor(options: RateLimiterOptions) {
    this.name = options.name
    this.limit = options.limit
    this.windowMs = options.windowMs
    this.mode = options.mode ?? 'shadow'
    this.store = options.store ?? new InMemoryRateLimitStore()
    this.now = options.now ?? Date.now
    this.onDecision = options.onDecision
  }

  async check(key: string): Promise<RateLimitDecision> {
    const now = this.now()
    try {
      const { count, resetAt } = await this.store.hit(key, this.windowMs, now)
      const wouldBlock = count > this.limit
      const decision: RateLimitDecision = {
        allowed: this.mode === 'enforce' ? !wouldBlock : true,
        wouldBlock,
        mode: this.mode,
        limit: this.limit,
        remaining: Math.max(0, this.limit - count),
        resetAt,
        key,
        name: this.name,
        failedOpen: false,
      }
      this.onDecision?.(decision)
      return decision
    } catch {
      // FAIL OPEN — a limiter/store outage must never block a real customer.
      const decision: RateLimitDecision = {
        allowed: true,
        wouldBlock: false,
        mode: this.mode,
        limit: this.limit,
        remaining: this.limit,
        resetAt: now + this.windowMs,
        key,
        name: this.name,
        failedOpen: true,
      }
      this.onDecision?.(decision)
      return decision
    }
  }
}
