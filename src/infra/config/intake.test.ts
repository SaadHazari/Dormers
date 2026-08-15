/**
 * Tests for getIntakeState — reads the single settings row, caches it, and
 * FAILS OPEN (not paused) on any error or missing row. A settings-table
 * problem must never block a sale.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { maybeSingleMock } = vi.hoisted(() => ({ maybeSingleMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({ select: () => ({ maybeSingle: maybeSingleMock }) }),
  }),
}))

import { getIntakeState, creditAedFor, __resetIntakeCache } from './intake'

const ROW = {
  paused: true,
  headline: 'We are between semesters.',
  body: 'Back when the dorms fill up.',
  credit_nonveg_aed: 20,
  credit_veg_aed: 15,
  credit_religious_aed: 20,
}

beforeEach(() => {
  __resetIntakeCache()
  maybeSingleMock.mockReset()
})

describe('getIntakeState', () => {
  it('reports paused when the row says paused', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null })
    const state = await getIntakeState()
    expect(state.paused).toBe(true)
    expect(state.headline).toBe('We are between semesters.')
    expect(state.creditVegAed).toBe(15)
  })

  it('reports open when the row says not paused', async () => {
    maybeSingleMock.mockResolvedValue({ data: { ...ROW, paused: false }, error: null })
    expect((await getIntakeState()).paused).toBe(false)
  })

  it('fails OPEN when the row is missing', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    expect((await getIntakeState()).paused).toBe(false)
  })

  it('fails OPEN when the read errors', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'db down' } })
    expect((await getIntakeState()).paused).toBe(false)
  })

  it('still returns usable credit defaults when it fails open', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const state = await getIntakeState()
    expect(state.creditNonvegAed).toBe(20)
    expect(state.creditVegAed).toBe(15)
    expect(state.creditReligiousAed).toBe(20)
  })

  it('caches within the TTL (second call does not hit the DB)', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null })
    await getIntakeState()
    await getIntakeState()
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)
  })
})

describe('creditAedFor', () => {
  const state = {
    paused: true,
    headline: '',
    body: '',
    creditNonvegAed: 20,
    creditVegAed: 15,
    creditReligiousAed: 20,
  }

  it('gives the non-veg amount to a Non Veg customer', () => {
    expect(creditAedFor(state, 'Non Veg')).toBe(20)
  })

  it('gives the veg amount to a Veg customer', () => {
    expect(creditAedFor(state, 'Veg')).toBe(15)
  })

  it('gives the religious amount to a Religious Preference customer', () => {
    expect(creditAedFor(state, 'Religious Preference')).toBe(20)
  })

  it('falls back to the non-veg amount for an unknown or missing preference', () => {
    expect(creditAedFor(state, null)).toBe(20)
    expect(creditAedFor(state, 'Something Else')).toBe(20)
  })
})
