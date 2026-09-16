import { describe, it, expect, vi } from 'vitest'

const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/admin-alerts/notify', () => ({ notifyAdmin: notifyMock }))

import { announceSeasonReopened, reopenedOwnerMessage } from './season-reopen-notices'

describe('the owner hears about the reopening (spec §11.7)', () => {
  it('counts what is ready and points at the Season page, with no dash', () => {
    const text = reopenedOwnerMessage({ readyHolds: 2, readyCustomerPauses: 1 })
    expect(text).toContain('2 kept plans are ready to restart and 1 customer-paused plan can resume')
    expect(text).toContain('Press Tell customers we are open on the Season page')
    expect(text).not.toMatch(/[–—]/)
    expect(reopenedOwnerMessage({ readyHolds: 1, readyCustomerPauses: 0 })).toContain('1 kept plan is ready to restart and 0 customer-paused plans can resume')
  })

  it('goes through notifyAdmin', async () => {
    await announceSeasonReopened({ readyHolds: 3, readyCustomerPauses: 0 })
    expect(notifyMock).toHaveBeenCalledWith(expect.stringContaining('Kitchen reopened. 3 kept plans are ready to restart'), 'season_reopen')
  })
})
