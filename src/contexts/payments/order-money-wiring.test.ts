/**
 * Both order-creating paths record what was paid (season spec §10.1, D7),
 * count credit through the one reader, and record neither money column when
 * the credit rows cannot be read. Source-level, like
 * src/app/api/admin-notification-coverage.test.ts: the handlers need Stripe,
 * Supabase and Zoho to run end to end. The reader's own read-error behaviour
 * is tested in src/infra/supabase/credit-usage-repo.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

describe('the Stripe webhook records order money', () => {
  it('records the card charge and the credit used, split rows by their used part, once', () => {
    const src = read('src/contexts/payments/usecases/handle-stripe-event.ts')
    expect(src).toContain("import { loadCreditUsedFils } from '@/infra/supabase/credit-usage-repo'")
    expect(src).toContain('loadCreditUsedFils(supabaseAdmin, {')
    expect(src).toContain('splitUseFils: splitToProcess?.useFils ?? null')
    expect(src).toContain('orderMoneyColumns({ cardChargeFils: session.amount_total, creditUsedFils: creditUsed })')
    expect(src).toContain(".is('amount_paid_fils', null)")
  })

  it('writes neither column when the credit rows cannot be read, and tells ops', () => {
    const src = read('src/contexts/payments/usecases/handle-stripe-event.ts')
    expect(src).toContain('const orderMoney = creditUsed === null')
    expect(src).toMatch(/if \(creditUsed === null\) \{[\s\S]*?Order money NOT recorded[\s\S]*?\} else if \(orderMoney\) \{/)
  })
})

describe('free checkout records order money', () => {
  it('records no card charge and the credit used, split rows by their used part', () => {
    const src = read('src/contexts/payments/usecases/free-checkout.ts')
    expect(src).toContain("import { loadCreditUsedFils } from '@/infra/supabase/credit-usage-repo'")
    expect(src).toContain('fullRowIds: appliedCreditIdsFull,')
    expect(src).toContain('splitUseFils: splitCredit?.useFils ?? null')
    expect(src).toContain('orderMoneyColumns({ cardChargeFils: 0, creditUsedFils: creditUsed })')
    expect(src).toContain('...(orderMoney ?? {})')
  })

  it('writes neither column when the credit rows cannot be read, and tells ops', () => {
    const src = read('src/contexts/payments/usecases/free-checkout.ts')
    expect(src).toContain('const orderMoney = creditUsed === null ? null')
    expect(src).toMatch(/if \(creditUsed === null\) \{[\s\S]*?Order money NOT recorded/)
  })
})

describe('the backfill counts credit and reports Stripe failures safely', () => {
  it('counts credit through the same reader as the webhook and free checkout', () => {
    const src = read('scripts/backfill-order-money.ts')
    expect(src).toContain("import { loadCreditUsedFils } from '../src/infra/supabase/credit-usage-repo'")
    expect(src.match(/loadCreditUsedFils\(sb, \{/g)).toHaveLength(2)
  })

  it('refuses a live key in .env.local before anything else, and never prints a Stripe error message', () => {
    const src = read('scripts/backfill-order-money.ts')
    const guard = src.indexOf('envFileDefinesLiveKey(existsSync(ENV_FILE)')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(src.indexOf('createClient(url, serviceKey'))
    expect(src).toContain('return { unresolvable: stripeErrorSummary(err) }')
    expect(src).not.toContain('(err as Error).message')
  })

  it('counts a write only when the order row really changed', () => {
    const src = read('scripts/backfill-order-money.ts')
    expect(src).toContain("{ count: 'exact' }")
    expect(src).toContain('count === 1')
  })
})

describe('the refund webhook and season refunds (spec §10.3)', () => {
  it('reads refund_reason and, for a season refund, skips the credit restore and the "still Active" alert but still tells the customer', () => {
    const src = read('src/contexts/payments/usecases/handle-stripe-event.ts')
    expect(src).toContain(".select('id, customer_id, invoice_status, refund_reason')")
    expect(src).toContain("const seasonRefund = orderRow.refund_reason === 'season_hold'")
    expect(src).toMatch(/if \(isFullRefund && seasonRefund\) \{[\s\S]*?\} else if \(isFullRefund\) \{[\s\S]*?\.from\('credits'\)/)
    expect(src).toContain('if (isFullRefund && !seasonRefund) {')
    expect(src).toMatch(/invoice_status: isFullRefund \? 'Refunded' : 'Partially Refunded'/)
    expect(src).toContain("'refund_processed'")
  })
})
