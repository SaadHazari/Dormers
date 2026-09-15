import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({ createAdminSupabaseClient: () => { throw new Error('tests pass a fake client') } }))

import { loadSeasonPageData, type SeasonDataClient } from './season-data'

type Result = { data: unknown; error: { message: string } | null }

/** A chainable, thenable stand-in for the supabase query builder. */
function fakeClient(tables: Record<string, Result>): SeasonDataClient {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: [], error: null }
      const builder = {
        select: () => builder,
        in: () => builder,
        gte: () => builder,
        order: () => builder,
        maybeSingle: () => Promise.resolve(result),
        then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(result).then(onOk, onErr),
      }
      return builder
    },
  } as unknown as SeasonDataClient
}

const SETTINGS = { season_phase: 'winding_down', wrap_up_day: '2026-10-03', buffer_delivery_days: 1, close_day: '2026-10-05', sales_stopped_at: null, kitchen_daily_cost_aed: '500', paused: true }
const SUB = {
  id: 's1', customer_id: 'c1', plan_name: 'Monthly Premium', status: 'Active', start_date: '2026-09-07', end_date: '2026-10-03',
  week_type: '6DAYS', meals_per_day: 1, total_meals: 24, delivered_meals: 6, credited_skip_days: 0, season_buffer_grants: 0,
  skipped_dates: null, planned_pause_start: null, staff_approval: null, last_delivery_tick_date: '2026-09-12',
}

describe('loadSeasonPageData', () => {
  it('maps the settings row, plans, customers, closures and the latest order', async () => {
    const data = await loadSeasonPageData('2026-09-14', fakeClient({
      intake_settings: { data: SETTINGS, error: null },
      subscriptions: { data: [SUB, { ...SUB, id: 's2', customer_id: 'c2', week_type: '5DAYS', status: 'Paused', meals_per_day: null, delivered_meals: null }], error: null },
      customers: { data: [{ id: 'c1', name: '  Omar Farouk ', dorm_name: 'Academic City' }, { id: 'c2', name: null, dorm_name: null }], error: null },
      orders: { data: [
        { subscription_id: 's1', amount_paid_fils: 43200, credit_applied_fils: 0, meals_count: 24, price_per_meal: '19', stripe_session_id: 'cs_live_x', created_at: '2026-09-06T10:00:00Z' },
        { subscription_id: 's1', amount_paid_fils: 99999, credit_applied_fils: 0, meals_count: 24, price_per_meal: '19', stripe_session_id: 'cs_live_y', created_at: '2026-08-01T10:00:00Z' },
        { subscription_id: 's2', amount_paid_fils: null, credit_applied_fils: null, meals_count: 24, price_per_meal: '18', stripe_session_id: null, created_at: '2026-08-20T10:00:00Z' },
      ], error: null },
      company_closures: { data: [{ closure_date: '2026-09-30' }], error: null },
    }))

    expect(data.snapshot).toEqual({ phase: 'winding_down', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', bufferDays: 1, salesStopped: false })
    expect(data.paused).toBe(true)
    expect(data.kitchenDailyCostAed).toBe(500)
    expect(data.todayAe).toBe('2026-09-14')
    expect(data.closureDates).toEqual(['2026-09-30'])
    expect(data.plans).toHaveLength(2)
    expect(data.plans[0]).toMatchObject({ id: 's1', customerName: 'Omar Farouk', dormName: 'Academic City', mealValue: { fils: 1800, exact: true }, skippedDates: [] })
    expect(data.plans[1]).toMatchObject({ id: 's2', customerName: 'Unnamed', weekType: '5DAYS', status: 'Paused', mealsPerDay: 1, deliveredMeals: 0, mealValue: { fils: 1800, exact: false } })
  })

  it('treats a missing settings row as open', async () => {
    const data = await loadSeasonPageData('2026-09-14', fakeClient({ intake_settings: { data: null, error: null } }))
    expect(data.snapshot).toEqual({ phase: 'open', wrapUpDay: null, closeDay: null, bufferDays: 1, salesStopped: false })
    expect(data.paused).toBe(false)
    expect(data.plans).toEqual([])
  })

  it('fails loudly instead of planning from half the facts', async () => {
    await expect(loadSeasonPageData('2026-09-14', fakeClient({
      intake_settings: { data: SETTINGS, error: null },
      subscriptions: { data: null, error: { message: 'permission denied' } },
    }))).rejects.toThrow('Season plans read failed: permission denied')
  })
})
