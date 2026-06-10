/**
 * Admin notification coverage tests.
 *
 * Verifies that every critical failure path fires notifyAdmin so ops
 * is never blind to money loss, blocked customers, or broken flows.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

describe('handle-stripe-event.ts — all failure paths alert ops', () => {
  const src = read('src/contexts/payments/usecases/handle-stripe-event.ts')

  it('split credit flip failure alerts ops', () => {
    expect(src).toContain('Split credit FLIP failed')
  })

  it('split remainder insert failure alerts ops', () => {
    expect(src).toContain('Split credit REMAINDER insert failed')
  })

  it('customer profile patch failure alerts ops', () => {
    expect(src).toContain('Customer profile patch FAILED')
  })

  it('post-payment fanout crash alerts ops', () => {
    expect(src).toContain('Post-payment fanout CRASHED')
  })

  it('zoho_scheduled_for stamp failure alerts ops', () => {
    expect(src).toContain('zoho_scheduled_for on order')
    expect(src).toContain('no FTA invoice will be generated')
  })

  it('refund credit restore failure alerts ops', () => {
    expect(src).toContain('Refund credit RESTORE failed')
  })

  it('full refund alerts ops about subscription status', () => {
    expect(src).toContain('Full REFUND on order')
  })

  it('dispute alerts ops with auto-pause info', () => {
    expect(src).toContain('Subscription auto-paused')
  })

  it('checkout expiry releases reserved credits', () => {
    expect(src).toContain('Released')
    expect(src).toContain('reserved credit')
  })
})

describe('post-payment-fanout.ts — channel failures alert ops', () => {
  const src = read('src/contexts/payments/usecases/post-payment-fanout.ts')
  it('each channel failure fires notifyAdmin', () => {
    expect(src).toContain('notifyAdmin')
    expect(src).toContain('confirmation was not delivered')
  })
})

describe('checkout/route.ts — all failure paths alert ops', () => {
  const src = read('src/app/api/checkout/route.ts')
  it('Stripe client init failure alerts ops', () => {
    expect(src).toContain('Stripe client INIT FAILED')
  })
  it('outer catch alerts ops', () => {
    expect(src).toContain('Checkout CRASHED')
  })
})

describe('streak-chest credit failure alerts ops', () => {
  const src = read('src/app/api/dorm-wars/streak-chest/route.ts')
  it('notifies admin when credit deposit fails', () => {
    expect(src).toContain('Streak chest credit INSERT FAILED')
    expect(src).toContain('UNIQUE prevents retry')
  })
})

describe('r/[cid]/actions.ts — referral failure paths alert ops', () => {
  const src = read('src/app/r/[cid]/actions.ts')
  it('referral insert failure alerts ops', () => {
    expect(src).toContain('Referral INSERT FAILED')
  })
  it('welcome meal sub insert failure alerts ops', () => {
    expect(src).toContain('Welcome meal subscription INSERT FAILED')
  })
  it('Layer 1 credit insert failure alerts ops', () => {
    expect(src).toContain('Layer 1 credit INSERT FAILED')
  })
  it('trial customer row insert failure returns error', () => {
    expect(src).toContain("return { error: 'Profile setup failed.")
  })
})

describe('review actions — credit failures alert ops', () => {
  it('weekly review credit insert failure alerts ops', () => {
    const src = read('src/app/dashboard/menu/review/actions.ts')
    expect(src).toContain('Weekly review credit INSERT FAILED')
  })
  it('weekly review threshold-flip failure alerts ops', () => {
    const src = read('src/app/dashboard/menu/review/actions.ts')
    expect(src).toContain('threshold-flip FAILED')
  })
  it('monthly review credit insert failure alerts ops', () => {
    const src = read('src/app/dashboard/menu/review/monthly/actions.ts')
    expect(src).toContain('Monthly review credit INSERT FAILED')
  })
})

describe('onboarding customer upsert failure alerts ops', () => {
  const src = read('src/app/onboarding/actions.ts')
  it('fires notifyAdmin when customers row fails', () => {
    expect(src).toContain('Onboarding customer upsert FAILED')
  })
})

describe('start-day email failure alerts ops', () => {
  const src = read('src/app/api/internal/start-day-email-send/route.ts')
  it('fires notifyAdmin when email send fails', () => {
    expect(src).toContain('Start-day email FAILED')
  })
})
