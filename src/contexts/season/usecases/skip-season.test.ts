import { describe, it, expect, vi, beforeEach } from 'vitest'

type Result = { data: unknown; error: { message: string } | null }

const { tables, selects } = vi.hoisted(() => ({
  tables: {} as Record<string, Result>,
  selects: [] as Array<[string, string]>,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      const result = tables[table] ?? { data: null, error: { message: `no fixture for ${table}` } }
      const builder = {
        select: (cols: string) => { selects.push([table, cols]); return builder },
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve(result),
        then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(result).then(onOk, onErr),
      }
      return builder
    },
  }),
}))

import { loadOrderMoney, loadSkipSeasonContext } from './skip-season'

const SUB = { id: 'sub-1', plan_name: 'Monthly Premium', meals_per_day: 1 }
const WIND_DOWN = { season_phase: 'winding_down', wrap_up_day: '2026-10-03', close_day: '2026-10-05', buffer_delivery_days: 1 }
const ORDER = { amount_paid_fils: 22000, credit_applied_fils: 0, meals_count: 20, price_per_meal: 22, stripe_session_id: 'cs_test_x' }

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  selects.length = 0
})

describe('loadOrderMoney', () => {
  it('reads the session id with the money so the test-mode rule can see it', async () => {
    tables.orders = { data: ORDER, error: null }
    expect(await loadOrderMoney('sub-1')).toEqual({
      ok: true,
      order: { amountPaidFils: 22000, creditAppliedFils: 0, mealsCount: 20, pricePerMealAed: 22, stripeSessionId: 'cs_test_x', stripePaymentId: null },
    })
    expect(selects).toEqual([['orders', 'amount_paid_fils, credit_applied_fils, meals_count, price_per_meal, stripe_session_id, stripe_payment_id']])
  })

  it('reports a failed read as a failure, and no order as null', async () => {
    tables.orders = { data: null, error: { message: 'boom' } }
    expect(await loadOrderMoney('sub-1')).toEqual({ ok: false })
    tables.orders = { data: null, error: null }
    expect(await loadOrderMoney('sub-1')).toEqual({ ok: true, order: null })
  })
})

describe('loadSkipSeasonContext', () => {
  it('fails when the season row cannot be read, whatever the season is', async () => {
    tables.intake_settings = { data: null, error: { message: 'timeout' } }
    expect(await loadSkipSeasonContext(SUB)).toEqual({ ok: false })
    tables.intake_settings = { data: null, error: null }
    expect(await loadSkipSeasonContext(SUB)).toEqual({ ok: false })
  })

  it('outside a wind-down it reads nothing else', async () => {
    tables.intake_settings = { data: { season_phase: 'open', wrap_up_day: null, close_day: null, buffer_delivery_days: 1 }, error: null }
    expect(await loadSkipSeasonContext(SUB)).toEqual({
      ok: true,
      context: { season: { phase: 'open', wrapUpDay: null, closeDay: null, bufferDays: 1 }, closureDates: new Set(), creditFils: null, creditReadFailed: false },
    })
    expect(selects.map(([t]) => t)).toEqual(['intake_settings'])
  })

  it('while winding down it prices the skip from the order and carries the closures', async () => {
    tables.intake_settings = { data: WIND_DOWN, error: null }
    tables.company_closures = { data: [{ closure_date: '2026-09-21' }], error: null }
    tables.orders = { data: ORDER, error: null }
    const read = await loadSkipSeasonContext(SUB)
    expect(read).toEqual({
      ok: true,
      context: {
        season: { phase: 'winding_down', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1 },
        closureDates: new Set(['2026-09-21']),
        creditFils: 1980, // cs_test_ money is not money: 90% of the AED 22 list price
        creditReadFailed: false,
      },
    })
  })

  it('fails when the closures cannot be read', async () => {
    tables.intake_settings = { data: WIND_DOWN, error: null }
    tables.company_closures = { data: null, error: { message: 'timeout' } }
    tables.orders = { data: ORDER, error: null }
    expect(await loadSkipSeasonContext(SUB)).toEqual({ ok: false })
  })

  it('an unreadable order is reported as a failed read, not a meal worth nothing', async () => {
    tables.intake_settings = { data: WIND_DOWN, error: null }
    tables.company_closures = { data: [], error: null }
    tables.orders = { data: null, error: { message: 'timeout' } }
    const read = await loadSkipSeasonContext(SUB)
    expect(read.ok && read.context.creditFils).toBeNull()
    expect(read.ok && read.context.creditReadFailed).toBe(true)
  })
})
