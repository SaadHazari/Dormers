import { describe, it, expect } from 'vitest'
import { getJobInfo } from './cron-registry'

describe('the Scheduled Jobs page and the season break', () => {
  it('knows the break starters and the watchdog', () => {
    expect(getJobInfo('season_break_tick').group).toBe('engine')
    expect(getJobInfo('season_break_tick_last_retry').group).toBe('engine')
    expect(getJobInfo('season_invariants_tick').group).toBe('watchdog')
    expect(getJobInfo('season_break_tick').actionHref).toBe('/admin/season')
  })

  it('knows the season outbox and the owner digest (Plan E)', () => {
    expect(getJobInfo('dispatch_season_notices_tick').group).toBe('customer')
    expect(getJobInfo('season_admin_digest_tick').group).toBe('watchdog')
    expect(getJobInfo('season_admin_digest_tick_close_day').group).toBe('watchdog')
    expect(getJobInfo('dispatch_subscription_ended_0045_ae').label).toContain('10 AM')
    for (const job of ['season_admin_digest_tick', 'season_admin_digest_tick_close_day']) {
      expect(getJobInfo(job).does).not.toMatch(/AED|cost/i)
    }
  })
})
