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
