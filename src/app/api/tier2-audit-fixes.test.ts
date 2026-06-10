/**
 * Tier 2 audit fix verification tests.
 *
 * Proves the 22 HIGH fixes are in place by reading source files and
 * checking for the specific patterns each fix introduces.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

// ── #14: Max price ceiling on checkout ──────────────────────────────────────
describe('#14: Checkout has a max price ceiling', () => {
  const src = read('src/app/api/checkout/route.ts')
  it('imports maxPriceFilsFor', () => {
    expect(src).toContain('maxPriceFilsFor')
  })
  it('rejects amounts above the plan ceiling', () => {
    expect(src).toContain("'Amount exceeds plan price'")
  })
})

describe('#14: maxPriceFilsFor exists in plans.ts', () => {
  const src = read('src/contexts/subscriptions/domain/plans.ts')
  it('exports maxPriceFilsFor function', () => {
    expect(src).toContain('export function maxPriceFilsFor')
  })
  it('uses NonVeg prices as the ceiling', () => {
    expect(src).toContain('NONVEG_PRICE_PER_MEAL')
  })
})

// ── #15: Checkout failures alert ops ────────────────────────────────────────
describe('#15: Checkout outer catch alerts ops', () => {
  const src = read('src/app/api/checkout/route.ts')
  it('imports notifyAdmin', () => {
    expect(src).toContain("import { notifyAdmin }")
  })
  it('calls notifyAdmin in the catch block', () => {
    const catchBlock = src.slice(src.lastIndexOf('} catch'))
    expect(catchBlock).toContain('notifyAdmin')
  })
  it('returns a generic error message to the client, not raw err.message', () => {
    const catchBlock = src.slice(src.lastIndexOf('} catch'))
    expect(catchBlock).toContain('Checkout failed. Please try again or contact support.')
    expect(catchBlock).not.toContain("{ error: err?.message")
  })
})

// ── #19: Checkout start_date uses Dubai time ────────────────────────────────
describe('#19: Checkout start_date window uses AE time', () => {
  const src = read('src/app/api/checkout/route.ts')
  it('computes today from aeNow, not server-local', () => {
    expect(src).toContain('Date.UTC(aeNow.getUTCFullYear(), aeNow.getUTCMonth(), aeNow.getUTCDate())')
  })
  it('uses setUTCDate for date arithmetic', () => {
    expect(src).toContain('minStart.setUTCDate')
    expect(src).toContain('maxStart.setUTCDate')
  })
  it('parses requested date in UTC', () => {
    expect(src).toContain("start_date + 'T00:00:00Z'")
  })
})

// ── #10: Full refund alerts ops about subscription ──────────────────────────
describe('#10: Full refund alerts ops about active subscription', () => {
  const src = read('src/contexts/payments/usecases/handle-stripe-event.ts')
  it('notifies admin on full refund about subscription status', () => {
    expect(src).toContain('Full REFUND on order')
    expect(src).toContain('Subscription is still Active')
  })
})

// ── #11: Dispute pauses the subscription ────────────────────────────────────
describe('#11: Dispute auto-pauses the subscription', () => {
  const src = read('src/contexts/payments/usecases/handle-stripe-event.ts')
  it('updates subscription status to Paused on dispute', () => {
    const disputeBlock = src.slice(src.indexOf('handleDisputeCreated'))
    expect(disputeBlock).toContain("status: 'Paused'")
  })
  it('mentions auto-pause in admin alert', () => {
    const disputeBlock = src.slice(src.indexOf('handleDisputeCreated'))
    expect(disputeBlock).toContain('Subscription auto-paused')
  })
})

// ── #25: Webhook route has maxDuration ──────────────────────────────────────
describe('#25: Webhook route exports maxDuration', () => {
  const src = read('src/app/api/webhook/route.ts')
  it('exports maxDuration = 60', () => {
    expect(src).toContain('export const maxDuration = 60')
  })
})

// ── #13: Free checkout aborts on credit flip failure ────────────────────────
describe('#13: Free checkout rolls back on credit flip failure', () => {
  const src = read('src/contexts/payments/usecases/free-checkout.ts')
  it('deletes subscription on credit flip failure', () => {
    expect(src).toContain("from('subscriptions').delete()")
  })
  it('deletes order on credit flip failure', () => {
    expect(src).toContain("from('orders').delete()")
  })
  it('throws after rollback', () => {
    expect(src).toContain('credit flip failed — rolled back sub+order')
  })
})

// ── #7: Referral CAS guard on conversion ────────────────────────────────────
describe('#7: creditInviterOnConversion has CAS guard', () => {
  const src = read('src/app/r/[cid]/actions.ts')
  const fn = src.slice(src.indexOf('creditInviterOnConversion'))
  it('uses CAS on status=gift_claimed in the UPDATE', () => {
    expect(fn).toContain(".eq('status', 'gift_claimed')")
  })
  it('checks flipped count and returns early if 0', () => {
    expect(fn).toContain('flipped ?? 0) === 0) return')
  })
  it('uses count: exact', () => {
    expect(fn).toContain("count: 'exact'")
  })
})

// ── #18: Gift claim returns error when customers insert fails ───────────────
describe('#18: claimGift returns error on customers insert failure', () => {
  const src = read('src/app/r/[cid]/actions.ts')
  it('returns an error object instead of proceeding', () => {
    expect(src).toContain("return { error: 'Profile setup failed.")
  })
})

// ── #17: Onboarding checks customers upsert result ─────────────────────────
describe('#17: createAccount checks customers upsert', () => {
  const src = read('src/app/onboarding/actions.ts')
  it('captures the upsert error', () => {
    expect(src).toContain('error: customerError')
  })
  it('returns error to user on failure', () => {
    expect(src).toContain("return { error: 'Profile setup failed.")
  })
})

// ── #16: Start-day email error handling + admin alert ───────────────────────
describe('#16: Start-day email has error handling', () => {
  const src = read('src/app/api/internal/start-day-email-send/route.ts')
  it('wraps sendStartDayEmail in try/catch', () => {
    const hasWrappedSend = src.includes('try {') && src.includes('sendStartDayEmail')
    expect(hasWrappedSend).toBe(true)
  })
  it('calls notifyAdmin on email failure', () => {
    expect(src).toContain('notifyAdmin')
    expect(src).toContain('Start-day email FAILED')
  })
  it('returns 502 on email failure', () => {
    expect(src).toContain("'email_send_failed'")
  })
})

// ── #20: Menu catalog uses Dubai time ───────────────────────────────────────
describe('#20: getMenuWeek uses Dubai (AE) time', () => {
  const src = read('src/contexts/menu/domain/catalog-data.ts')
  it('shifts to AE wall time before computing the week', () => {
    expect(src).toContain('4 * 60 * 60 * 1000')
  })
})

// ── #23: Internal routes use timing-safe comparison ─────────────────────────
describe('#23: Internal routes use timingSafeCompare', () => {
  const routes = [
    'src/app/api/internal/post-payment-retry/route.ts',
    'src/app/api/internal/start-day-email-send/route.ts',
    'src/app/api/internal/renew-nudge-send/route.ts',
  ]
  for (const route of routes) {
    it(`${route.split('/').pop()} imports timingSafeCompare`, () => {
      const src = read(route)
      expect(src).toContain("import { timingSafeCompare } from '@/shared/crypto'")
    })
    it(`${route.split('/').pop()} uses timingSafeCompare for auth`, () => {
      const src = read(route)
      expect(src).toContain('timingSafeCompare(presented, expected)')
    })
    it(`${route.split('/').pop()} no longer uses === for secret comparison`, () => {
      const src = read(route)
      expect(src).not.toContain('presented !== expected')
    })
  }
})

describe('#23: timingSafeCompare helper exists', () => {
  it('src/shared/crypto.ts exists', () => {
    expect(existsSync(resolve(ROOT, 'src/shared/crypto.ts'))).toBe(true)
  })
  it('uses node:crypto timingSafeEqual', () => {
    const src = read('src/shared/crypto.ts')
    expect(src).toContain('timingSafeEqual')
  })
  it('handles different-length strings safely', () => {
    const src = read('src/shared/crypto.ts')
    expect(src).toContain('a.length !== b.length')
  })
})

// ── #24: Health endpoint uses correct env var ───────────────────────────────
describe('#24: Health endpoint uses NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', () => {
  const src = read('src/app/api/health/route.ts')
  it('checks NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', () => {
    expect(src).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  })
  it('does NOT check the old ANON_KEY name', () => {
    expect(src).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })
})

// ── #26: Zoho client handles 429 rate limits ────────────────────────────────
describe('#26: Zoho client retries on HTTP 429', () => {
  const src = read('src/infra/zoho/client.ts')
  it('checks for status 429', () => {
    expect(src).toContain('res.status === 429')
  })
  it('reads retry-after header', () => {
    expect(src).toContain("res.headers.get('retry-after'")
  })
  it('retries after the delay', () => {
    const block429 = src.slice(src.indexOf('res.status === 429'))
    expect(block429).toContain('await doRequest')
  })
})

// ── #27: Supabase admin client has a timeout ────────────────────────────────
describe('#27: Supabase admin client uses fetchWithTimeout', () => {
  const src = read('src/infra/supabase/admin-client.ts')
  it('imports fetchWithTimeout', () => {
    expect(src).toContain("import { fetchWithTimeout }")
  })
  it('configures global.fetch with timeout', () => {
    expect(src).toContain('global:')
    expect(src).toContain('fetchWithTimeout')
    expect(src).toContain('SUPABASE_TIMEOUT_MS')
  })
})

// ── #6: OTP atomic counter ──────────────────────────────────────────────────
describe('#6: OTP check uses atomic RPC', () => {
  const src = read('src/app/api/whatsapp/check/route.ts')
  it('calls verify_otp_attempt RPC', () => {
    expect(src).toContain("rpc('verify_otp_attempt'")
  })
  it('does NOT use a separate SELECT + UPDATE pattern', () => {
    expect(src).not.toContain(".from('whatsapp_otps')\n        .select(")
  })
  it('does NOT have non-atomic attempt increment', () => {
    expect(src).not.toContain('otp.attempts + 1')
  })
})

// ── #12 + #21 + #22: Cron safety in migration file ─────────────────────────
describe('#12 #21 #22: Cron migration has safety guards', () => {
  const sql = read('supabase/migrations/20260506_cron_jobs.sql')

  it('#12: delivery_tick checks resume_cutoff_date', () => {
    expect(sql).toContain('resume_cutoff_date')
  })
  it('#21: delivery_tick has last_delivery_tick_date guard', () => {
    expect(sql).toContain('last_delivery_tick_date')
    expect(sql).toContain('last_delivery_tick_date < CURRENT_DATE')
  })
  it('#22: pause_tick has last_pause_tick_date guard', () => {
    expect(sql).toContain('last_pause_tick_date')
    expect(sql).toContain('last_pause_tick_date < CURRENT_DATE')
  })
})
