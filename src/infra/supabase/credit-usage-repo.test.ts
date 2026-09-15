import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCreditUsedFils } from './credit-usage-repo'

/** A client whose credits.select('id, amount_aed').in('id', ids) resolves to `result`. */
function fakeSb(result: { data: unknown; error: unknown }) {
  const inMock = vi.fn(async () => result)
  const selectMock = vi.fn(() => ({ in: inMock }))
  const fromMock = vi.fn(() => ({ select: selectMock }))
  return { sb: { from: fromMock } as unknown as SupabaseClient, fromMock, inMock }
}

describe('loadCreditUsedFils', () => {
  it('adds the rows redeemed in full to the used part of the split row', async () => {
    const { sb, fromMock, inMock } = fakeSb({ data: [{ id: 'c1', amount_aed: 20 }, { id: 'c2', amount_aed: '15.50' }], error: null })
    expect(await loadCreditUsedFils(sb, { fullRowIds: ['c1', 'c2'], splitUseFils: 1024 })).toBe(4574)
    expect(fromMock).toHaveBeenCalledWith('credits')
    expect(inMock).toHaveBeenCalledWith('id', ['c1', 'c2'])
  })

  it('reads nothing when no row was redeemed in full', async () => {
    const { sb, fromMock } = fakeSb({ data: [], error: null })
    expect(await loadCreditUsedFils(sb, { fullRowIds: [], splitUseFils: 1024 })).toBe(1024)
    expect(await loadCreditUsedFils(sb, { fullRowIds: [], splitUseFils: null })).toBe(0)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns null when the credit rows cannot be read, so the caller records neither money column', async () => {
    const { sb } = fakeSb({ data: null, error: { message: 'connection terminated' } })
    expect(await loadCreditUsedFils(sb, { fullRowIds: ['c1'], splitUseFils: 1024 })).toBeNull()
  })

  it('returns null when a row is missing, rather than counting part of the credit', async () => {
    const { sb } = fakeSb({ data: [{ id: 'c1', amount_aed: 20 }], error: null })
    expect(await loadCreditUsedFils(sb, { fullRowIds: ['c1', 'c2'], splitUseFils: null })).toBeNull()
  })

  it('reads a repeated id once', async () => {
    const { sb, inMock } = fakeSb({ data: [{ id: 'c1', amount_aed: 20 }], error: null })
    expect(await loadCreditUsedFils(sb, { fullRowIds: ['c1', 'c1'], splitUseFils: null })).toBe(2000)
    expect(inMock).toHaveBeenCalledWith('id', ['c1'])
  })
})
