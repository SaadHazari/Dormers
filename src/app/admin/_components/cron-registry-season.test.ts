import { describe, it, expect } from 'vitest'
import { getJobInfo } from './cron-registry'

describe('the Scheduled Jobs page and the season break', () => {
  it('knows the break starters and the watchdog', () => {
    expect(getJobInfo('season_break_tick').group).toBe('engine')
    expect(getJobInfo('season_break_tick_last_retry').group).toBe('engine')
    expect(getJobInfo('season_invariants_tick').group).toBe('watchdog')
    expect(getJobInfo('season_break_tick').actionHref).toBe('/admin/season')
  })
})
