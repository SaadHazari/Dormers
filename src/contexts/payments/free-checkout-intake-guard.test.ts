import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getIntakeStateMock } = vi.hoisted(() => ({ getIntakeStateMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/config/intake', () => ({ getIntakeState: getIntakeStateMock }))

import { assertIntakeOpen } from './usecases/free-checkout'

beforeEach(() => getIntakeStateMock.mockReset())

describe('assertIntakeOpen', () => {
  it('throws while intake is paused', async () => {
    getIntakeStateMock.mockResolvedValue({ paused: true, body: 'Paused for the season.' })
    await expect(assertIntakeOpen()).rejects.toThrow(/paused/i)
  })

  it('resolves while intake is open', async () => {
    getIntakeStateMock.mockResolvedValue({ paused: false, body: '' })
    await expect(assertIntakeOpen()).resolves.toBeUndefined()
  })
})
