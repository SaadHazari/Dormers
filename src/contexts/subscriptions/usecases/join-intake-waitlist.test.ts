/**
 * Opt-in must be idempotent (a double tap grants exactly one credit) and must
 * pick the amount from the customer's meal preference.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  getIntakeStateMock,
  insertWaitlistMock,
  insertCreditMock,
  existingCreditMock,
  customerMock,
  userMock,
} = vi.hoisted(() => ({
  getIntakeStateMock: vi.fn(),
  insertWaitlistMock: vi.fn(),
  insertCreditMock: vi.fn(),
  existingCreditMock: vi.fn(),
  customerMock: vi.fn(),
  userMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/infra/config/intake', async () => {
  const actual = await vi.importActual<typeof import('@/infra/config/intake')>('@/infra/config/intake')
  return { getIntakeState: getIntakeStateMock, creditAedFor: actual.creditAedFor }
})
vi.mock('@/utils/supabase/auth', () => ({ getUserFromHeaders: userMock }))
vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'customers') return { select: () => ({ eq: () => ({ maybeSingle: customerMock }) }) }
      if (table === 'credits') {
        return {
          insert: () => ({ select: () => ({ single: insertCreditMock }) }),
          // findWaitlistCredit: select('id, amount_aed').eq(customer_id).eq(source).maybeSingle()
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: existingCreditMock }) }) }),
        }
      }
      // intake_waitlist. insert for the opt-in, update to stamp credit_id
      return { insert: insertWaitlistMock, update: () => ({ eq: async () => ({ error: null }) }) }
    },
  }),
}))

import { joinIntakeWaitlist } from './join-intake-waitlist'

const STATE = {
  paused: true, headline: '', body: '',
  creditNonvegAed: 20, creditVegAed: 15, creditReligiousAed: 20,
}

beforeEach(() => {
  getIntakeStateMock.mockReset().mockResolvedValue(STATE)
  userMock.mockReset().mockResolvedValue({ id: 'u1', email: 'a@b.c' })
  insertCreditMock.mockReset().mockResolvedValue({ data: { id: 'credit-1' }, error: null })
  insertWaitlistMock.mockReset().mockResolvedValue({ error: null })
  existingCreditMock.mockReset().mockResolvedValue({ data: null, error: null })
  customerMock.mockReset()
})

describe('joinIntakeWaitlist', () => {
  it('grants the veg amount to a Veg customer', async () => {
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Veg' }, error: null })
    const res = await joinIntakeWaitlist()
    expect(res.ok).toBe(true)
    expect(res.creditAed).toBe(15)
  })

  it('grants the non-veg amount to a Religious Preference customer', async () => {
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Religious Preference' }, error: null })
    expect((await joinIntakeWaitlist()).creditAed).toBe(20)
  })

  it('is idempotent, a second join grants no second credit', async () => {
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Non Veg' }, error: null })
    insertWaitlistMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    existingCreditMock.mockResolvedValue({ data: { id: 'credit-1', amount_aed: '20' }, error: null })
    const res = await joinIntakeWaitlist()
    expect(res.ok).toBe(true)
    expect(res.alreadyJoined).toBe(true)
    expect(insertCreditMock).not.toHaveBeenCalled()
  })

  it('refuses when intake is not actually paused', async () => {
    getIntakeStateMock.mockResolvedValue({ ...STATE, paused: false })
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Non Veg' }, error: null })
    const res = await joinIntakeWaitlist()
    expect(res.ok).toBe(false)
    expect(insertCreditMock).not.toHaveBeenCalled()
  })

  it('refuses when there is no signed-in user', async () => {
    userMock.mockResolvedValue(null)
    expect((await joinIntakeWaitlist()).ok).toBe(false)
  })

  it('mints the credit on a retry when the first tap saved the spot but the credit never landed', async () => {
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Non Veg' }, error: null })
    insertWaitlistMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    existingCreditMock.mockResolvedValue({ data: null, error: null }) // no credit ever minted
    insertCreditMock.mockResolvedValue({ data: { id: 'credit-2' }, error: null })

    const res = await joinIntakeWaitlist()

    expect(res.ok).toBe(true)
    expect(res.alreadyJoined).toBe(true)
    expect(res.creditAed).toBe(20)
    expect(insertCreditMock).toHaveBeenCalledTimes(1)
  })

  it('reports the existing credit amount without minting a second one', async () => {
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Veg' }, error: null })
    insertWaitlistMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    // amount_aed comes back from PostgREST as a string
    existingCreditMock.mockResolvedValue({ data: { id: 'credit-9', amount_aed: '15' }, error: null })

    const res = await joinIntakeWaitlist()

    expect(res.ok).toBe(true)
    expect(res.alreadyJoined).toBe(true)
    expect(res.creditAed).toBe(15)
    expect(insertCreditMock).not.toHaveBeenCalled()
  })
})
