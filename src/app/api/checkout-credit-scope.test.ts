/**
 * Task 7: the checkout route must pass the resolved plan id through to
 * getRedeemableCredit so a plan-restricted credit (e.g. the seasonal-pause
 * waitlist credit, which is monthly-only) never reaches the coupon synth for
 * a plan it cannot be spent on.
 *
 * This lives in its own file — deliberately not appended to
 * intake-pause-guard.test.ts — because mocking
 * @/infra/supabase/subscriptions-repo here would change the module
 * environment that file's two tests already pass under.
 *
 * The route does real work between the auth check and the credit fetch
 * (profile-completion gate, price-bounds validation, live-sub checks,
 * price-override lookup), so a bare `{ auth: { getUser } }` stub like
 * task 6's isn't enough to actually reach the line under test — it would
 * just crash on the first `.from()` call and the assertion would trivially
 * fail. This mock builds a minimal chainable Supabase query-builder stub
 * (any method chains, `.maybeSingle()`/`.single()`/direct-await resolve to
 * a canned per-table result) so the route runs its real logic through to
 * the credit fetch with a complete customer profile, a 6DAYS week type, no
 * live/scheduled/paused subs, and no price overrides.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getIntakeStateMock, customerRow } = vi.hoisted(() => ({
  getIntakeStateMock: vi.fn(),
  customerRow: {
    name: 'Test Customer',
    dorm_name: 'Dorm A',
    meal_preference_type: 'NonVeg',
    whatsapp_number: '+971500000000',
    whatsapp_verified: true,
    week_type: '6DAYS',
    pending_week_type: null,
    out_of_zone: false,
  },
}))

/**
 * Minimal Supabase query-builder double. Any chain method (select/eq/in/
 * order/limit/lt/gte/lte/or/update/insert/delete/...) returns the same
 * builder so arbitrary chains never throw. `.maybeSingle()` / `.single()`
 * and a direct `await` both resolve to a canned result keyed by table name.
 */
function makeSupabaseMock() {
  function resultFor(table: string) {
    if (table === 'customers') return { data: customerRow, error: null }
    if (table === 'plan_pricing') return { data: [], error: null }
    return { data: null, error: null, count: 0 }
  }
  function from(table: string) {
    const result = resultFor(table)
    const builder: unknown = new Proxy(() => builder, {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
        if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve(result)
        return () => builder
      },
    })
    return builder
  }
  return {
    from,
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } } }) },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/infra/config/intake', () => ({
  getIntakeState: getIntakeStateMock,
  creditAedFor: () => 20,
}))
vi.mock('@/infra/stripe/client', () => ({
  stripeClient: () => ({}),
}))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => makeSupabaseMock(),
}))
vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => makeSupabaseMock(),
}))
vi.mock('@/infra/admin-alerts/notify', () => ({ notifyAdmin: vi.fn() }))
vi.mock('@/infra/supabase/subscriptions-repo', () => ({
  getRedeemableCredit: vi.fn(async () => ({ rows: [], balanceFils: 0, lockedFils: 0, lockedRequiresMonthly: false })),
}))

import { POST } from './checkout/route'

beforeEach(() => getIntakeStateMock.mockReset())

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('checkout credit fetch is plan-scoped', () => {
  it('passes the resolved plan id to getRedeemableCredit', async () => {
    getIntakeStateMock.mockResolvedValue({ paused: false, headline: '', body: '' })
    const { getRedeemableCredit } = await import('@/infra/supabase/subscriptions-repo')
    const spy = vi.mocked(getRedeemableCredit)
    // 12000 fils (AED 120) sits inside Weekly Flex's 6DAYS price band
    // (AED 19-23/meal × 6 meals = 11400-13800 fils) so the route's price
    // validation passes and execution actually reaches the credit fetch.
    // `plan` must be the label resolvePlan matches against ('Weekly Flex'),
    // not the kebab id — the kebab id is what planDef.id resolves TO, which
    // is what we assert got passed through as the third argument below.
    await POST(req({ amount: 12000, plan: 'Weekly Flex' }))
    const planArg = spy.mock.calls.at(-1)?.[2]
    expect(planArg).toBe('weekly-flex')
  })
})
