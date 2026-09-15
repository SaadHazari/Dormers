import { describe, it, expect, vi } from 'vitest'

const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/admin-alerts/notify', () => ({ notifyAdmin: notifyMock }))

import { announceSeasonReopened, reopenedOwnerMessage } from './season-reopen-notices'

describe('the owner hears about the reopening (spec §11.7)', () => {
  it('counts what is ready and points at the Season page, with no dash', () => {
    const text = reopenedOwnerMessage({ readyHolds: 2, readyCustomerPauses: 1 })
    expect(text).toContain('2 held plans are ready and 1 customer pause can resume')
    expect(text).toContain('Send the reopening notice from the Season page')
    expect(text).not.toMatch(/[–—]/)
    expect(reopenedOwnerMessage({ readyHolds: 1, readyCustomerPauses: 0 })).toContain('1 held plan is ready and 0 customer pauses can resume')
  })

  it('goes through notifyAdmin', async () => {
    await announceSeasonReopened({ readyHolds: 3, readyCustomerPauses: 0 })
    expect(notifyMock).toHaveBeenCalledWith(expect.stringContaining('Reopened. 3 held plans are ready'), 'season_reopen')
  })
})
