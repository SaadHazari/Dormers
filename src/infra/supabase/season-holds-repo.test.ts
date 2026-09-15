import { describe, it, expect, vi } from 'vitest'
import { getCustomerHold, type HoldsClient } from './season-holds-repo'

type Res = { data: unknown; error: unknown }

function fakeClient(holds: Res, credits: Res = { data: null, error: null }) {
  const from = vi.fn((table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(table === 'season_holds' ? holds : credits) }) }),
  }))
  return { client: { from } as unknown as HoldsClient, from }
}

const sub = { id: 'sub-1', plan_name: 'Monthly Premium', status: 'Paused', season_hold_id: 'hold-1' }

describe('getCustomerHold', () => {
  it('reads the hold and its credit amount', async () => {
    const { client } = fakeClient(
      { data: { id: 'hold-1', reason: 'season', state: 'held', held_meals: 9, waitlist_credit_id: 'credit-1' }, error: null },
      { data: { amount_aed: '20' }, error: null },
    )
    expect(await getCustomerHold(client, sub)).toMatchObject({ id: 'hold-1', heldMeals: 9, waitlistCreditFils: 2000 })
  })

  it('reads nothing for a plan without a hold', async () => {
    const { client, from } = fakeClient({ data: null, error: null })
    expect(await getCustomerHold(client, { ...sub, season_hold_id: null })).toBeNull()
    expect(await getCustomerHold(client, null)).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('shows no card when the hold cannot be read', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'permission denied' } })
    expect(await getCustomerHold(client, sub)).toBeNull()
  })
})
