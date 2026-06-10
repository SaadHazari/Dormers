/**
 * Tier 4 audit fix verification tests — 61 LOW findings.
 * Tests cover the subset that was actually fixed (not observational/positive findings).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

// ── Money safety ────────────────────────────────────────────────────────────

describe('#33: Negative stripeNetFils guard', () => {
  const src = read('src/app/api/checkout/route.ts')
  it('rejects when discount exceeds plan price', () => {
    expect(src).toContain('stripeNetFils < 0')
    expect(src).toContain('Discount exceeds plan price')
  })
})

describe('#35: Referral credit insert has error handling + admin alert', () => {
  const src = read('src/app/r/[cid]/actions.ts')
  const fn = src.slice(src.indexOf('creditInviterOnConversion'))
  it('checks credit insert error', () => {
    expect(fn).toContain('error: creditErr')
  })
  it('fires admin alert on credit failure', () => {
    expect(fn).toContain('Layer 1 credit INSERT FAILED')
    expect(fn).toContain('notifyAdmin')
  })
})

describe('#36: depositCredit validates positive amount', () => {
  const src = read('src/contexts/dorm-wars/usecases/awarder.ts')
  it('throws on non-positive amountAed', () => {
    expect(src).toContain('amountAed <= 0')
    expect(src).toContain('amountAed must be positive')
  })
})

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('#8: planKindFromName handles Welcome Meal / gift', () => {
  const src = read('src/contexts/subscriptions/domain/end-date.ts')
  it('maps welcome/gift to gift planKind', () => {
    expect(src).toContain("n.includes('welcome') || n.includes('gift')")
    expect(src).toContain("return 'gift'")
  })
})

describe('#30: changeStartDate only allows Scheduled status', () => {
  const src = read('src/contexts/subscriptions/usecases/subscription-mutations.ts')
  const fn = src.slice(src.indexOf('export async function changeStartDate'))
  it('checks status === SCHEDULED directly, not a secondary gate', () => {
    expect(fn).toContain("subscription.status !== SUBSCRIPTION_STATUS.SCHEDULED")
    expect(fn).not.toContain('new Date(subscription.start_date).getTime() > Date.now()')
  })
})

describe('#34: Free checkout does not fall back to Trial', () => {
  const src = read('src/contexts/payments/usecases/free-checkout.ts')
  it('throws on unresolvable plan, no Trial fallback', () => {
    expect(src).toContain("const planDef = resolvePlan(planString)")
    expect(src).not.toContain("resolvePlan('Trial')")
    expect(src).toContain("cannot resolve plan")
  })
})

// ── Error visibility ────────────────────────────────────────────────────────

describe('#20: Weekly review credit insert failure alerts ops', () => {
  const src = read('src/app/dashboard/menu/review/actions.ts')
  it('fires notifyAdmin on credit insert failure', () => {
    expect(src).toContain('Weekly review credit INSERT FAILED')
    expect(src).toContain('notifyAdmin')
  })
})

describe('#17+#18: SSR data fetchers log errors', () => {
  const src = read('src/infra/supabase/subscriptions-repo.ts')
  it('getCustomer logs errors', () => {
    expect(src).toContain('getCustomer failed')
  })
  it('getActiveSubscription logs errors', () => {
    expect(src).toContain('getActiveSubscription failed')
  })
})

// ── Code hygiene ────────────────────────────────────────────────────────────

describe('#26+#27: AIChatbot stale comments removed', () => {
  const src = read('src/app/components/AIChatbot.tsx')
  it('no "Updated Import" comment', () => {
    expect(src).not.toContain('Updated Import')
  })
  it('no "Make sure this matches" comment', () => {
    expect(src).not.toContain('Make sure this matches')
  })
  it('no "Closes the chat automatically" inline comment', () => {
    expect(src).not.toContain('Closes the chat automatically')
  })
  it('no "Manually managing input" comment', () => {
    expect(src).not.toContain('Manually managing input')
  })
  it('no "v5 destructured vars" comment', () => {
    expect(src).not.toContain('v5 destructured vars')
  })
})

// ── Infrastructure ──────────────────────────────────────────────────────────

describe('#57: fetchWithTimeout catches both DOMException and native AbortError', () => {
  const src = read('src/infra/http/fetch-with-timeout.ts')
  it('checks DOMException AbortError', () => {
    expect(src).toContain("err instanceof DOMException && err.name === 'AbortError'")
  })
  it('also checks native Error AbortError', () => {
    expect(src).toContain("err instanceof Error && err.name === 'AbortError'")
  })
})
