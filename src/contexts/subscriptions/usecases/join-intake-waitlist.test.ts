/**
 * Opt-in must be idempotent (a double tap grants exactly one credit) and must
 * pick the amount from the customer's meal preference.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  getIntakeStateMock,
  insertWaitlistMock,
  insertWaitlistArgsMock,
  insertCreditMock,
  existingRowMock,
  existingCreditMock,
  customerMock,
  userMock,
} = vi.hoisted(() => ({
  getIntakeStateMock: vi.fn(),
  insertWaitlistMock: vi.fn(),
  // Records the payload passed to intake_waitlist's insert(), so tests can
  // assert the join actually carries the CURRENT cycle's stamp.
  insertWaitlistArgsMock: vi.fn(),
  insertCreditMock: vi.fn(),
  existingRowMock: vi.fn(),
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
          // findCycleCredit: select('id, amount_aed, status').eq(intake_waitlist_id).maybeSingle()
          select: () => ({ eq: () => ({ maybeSingle: existingCreditMock }) }),
        }
      }
      // intake_waitlist. insert(...).select('id').single() for the join,
      // select('id').eq(customer_id).eq(cycle_started_at).maybeSingle() to
      // resolve the existing row's id after a 23505, update to stamp credit_id
      return {
        insert: (payload: unknown) => {
          insertWaitlistArgsMock(payload)
          return { select: () => ({ single: insertWaitlistMock }) }
        },
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: existingRowMock }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }
    },
  }),
}))

import { joinIntakeWaitlist } from './join-intake-waitlist'
import { SPOT_SAVED_NO_CREDIT_YET_MESSAGE } from '../domain/credit-eligibility'

const STATE = {
  paused: true, headline: '', body: '',
  creditNonvegAed: 20, creditVegAed: 15, creditReligiousAed: 20,
  cycleStartedAt: '2026-08-15T18:15:51.035Z', cycleEndedAt: null,
}

beforeEach(() => {
  getIntakeStateMock.mockReset().mockResolvedValue(STATE)
  userMock.mockReset().mockResolvedValue({ id: 'u1', email: 'a@b.c' })
  insertCreditMock.mockReset().mockResolvedValue({ data: { id: 'credit-1' }, error: null })
  insertWaitlistMock.mockReset().mockResolvedValue({ data: { id: 'wl-1' }, error: null })
  insertWaitlistArgsMock.mockReset()
  existingRowMock.mockReset().mockResolvedValue({ data: { id: 'wl-1' }, error: null })
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
    insertWaitlistMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
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
    insertWaitlistMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    existingCreditMock.mockResolvedValue({ data: null, error: null }) // no credit ever minted
    insertCreditMock.mockResolvedValue({ data: { id: 'credit-2' }, error: null })

    const res = await joinIntakeWaitlist()

    expect(res.ok).toBe(true)
    expect(res.alreadyJoined).toBe(true)
    expect(res.creditAed).toBe(20)
    expect(insertCreditMock).toHaveBeenCalledTimes(1)
  })

  it('reports the existing credit amount without minting a second one', async () => {
    // Veg customer means creditAedFor would compute 15. The stored row uses
    // 999, a value creditAedFor could never produce, so this only passes if
    // the action actually reads the row instead of recomputing the amount.
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Veg' }, error: null })
    insertWaitlistMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    // amount_aed comes back from PostgREST as a string
    existingCreditMock.mockResolvedValue({ data: { id: 'credit-9', amount_aed: '999' }, error: null })

    const res = await joinIntakeWaitlist()

    expect(res.ok).toBe(true)
    expect(res.alreadyJoined).toBe(true)
    expect(res.creditAed).toBe(999)
    expect(insertCreditMock).not.toHaveBeenCalled()
  })

  it('reports zero when a concurrent mint races and the retry read still comes back empty', async () => {
    // Scenario: two concurrent taps within the SAME cycle both lose the
    // waitlist insert race (23505), both look up the existing row, and both
    // find no credit yet (extreme read lag). One of them wins the credit
    // insert; this one loses it too (23505), and credits_one_per_intake_waitlist_row
    // means the retry read still comes back empty at the instant this code
    // checks. Zero must be reported rather than a guessed amount — an admin
    // can reconcile from the waitlist row.
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Non Veg' }, error: null })
    insertWaitlistMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    existingCreditMock.mockResolvedValue({ data: null, error: null })
    insertCreditMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })

    const res = await joinIntakeWaitlist()

    expect(res.ok).toBe(true)
    expect(res.alreadyJoined).toBe(true)
    expect(res.creditAed).toBe(0)
    expect(res.message).toBe(SPOT_SAVED_NO_CREDIT_YET_MESSAGE)
  })

  it('reports zero, not the spent amount, when the credit for THIS cycle was already redeemed', async () => {
    // Tab A: gate loaded while joined=false. Tab B: same customer joins,
    // checks out on the credit, flips it to status='applied'. Back in tab A,
    // the stale "Save my spot" tap 23505s, resolves the same waitlist row,
    // and findCycleCredit finds the now-spent credit. The gate must never
    // report that spent money as still waiting (IntakeCreditDisplay's rule,
    // spec §8.1) — it must fall back to the same "no live credit" message
    // used when a credit was never minted at all.
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Non Veg' }, error: null })
    insertWaitlistMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    existingCreditMock.mockResolvedValue({ data: { id: 'credit-1', amount_aed: '20', status: 'applied' }, error: null })

    const res = await joinIntakeWaitlist()

    expect(res.ok).toBe(true)
    expect(res.alreadyJoined).toBe(true)
    expect(res.creditAed).toBe(0)
    expect(res.message).toBe(SPOT_SAVED_NO_CREDIT_YET_MESSAGE)
    expect(insertCreditMock).not.toHaveBeenCalled()
  })

  it('bails out when a 23505 lands but the existing row can no longer be resolved', async () => {
    // Defensive path: the insert says a duplicate exists, but the follow-up
    // read by (customer_id, cycle_started_at) comes back empty. Nothing to
    // mint against, so refuse cleanly instead of crashing on a null id.
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Non Veg' }, error: null })
    insertWaitlistMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    existingRowMock.mockResolvedValue({ data: null, error: null })

    const res = await joinIntakeWaitlist()

    expect(res.ok).toBe(false)
    expect(res.alreadyJoined).toBe(false)
    expect(res.creditAed).toBe(0)
    expect(res.message).toBe('Could not save your spot. Please try again.')
    expect(insertCreditMock).not.toHaveBeenCalled()
  })

  it('lets a customer who joined an earlier cycle join again in a new cycle and earn a fresh credit', async () => {
    // The whole point of this task: the old UNIQUE(customer_id) index would
    // 23505 here regardless of cycle. The per-cycle index does not, so a
    // customer with a row from an earlier pause gets a normal first-time
    // join for THIS pause's cycle_started_at.
    const newCycle = '2026-09-01T00:00:00.000Z'
    getIntakeStateMock.mockResolvedValue({ ...STATE, cycleStartedAt: newCycle })
    customerMock.mockResolvedValue({ data: { meal_preference_type: 'Non Veg' }, error: null })
    insertWaitlistMock.mockResolvedValue({ data: { id: 'wl-new-cycle' }, error: null })

    const res = await joinIntakeWaitlist()

    expect(res.ok).toBe(true)
    expect(res.alreadyJoined).toBe(false)
    expect(res.creditAed).toBe(20)
    expect(insertWaitlistArgsMock).toHaveBeenCalledWith({ customer_id: 'u1', cycle_started_at: newCycle })
  })
})
