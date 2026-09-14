import { describe, it, expect } from 'vitest'
import { allowedSeasonActions, visibleSeasonActions, seasonDriftMessage, type SeasonSnapshot } from './season-phase'

const today = '2026-09-14'
const snap = (s: Partial<SeasonSnapshot>): SeasonSnapshot => ({
  phase: 'open', wrapUpDay: null, closeDay: null, bufferDays: 1, salesStopped: false, ...s,
})

describe('allowedSeasonActions', () => {
  it('open: schedule, stop sales, or end today', () => {
    expect(allowedSeasonActions(snap({}), today)).toEqual(['schedule', 'stop_sales', 'end_today'])
  })

  it('winding down with sales stopped and no wrap-up day (the live legacy pause)', () => {
    expect(allowedSeasonActions(snap({ phase: 'winding_down', salesStopped: true }), today))
      .toEqual(['schedule', 'resume_sales', 'end_today'])
  })

  it('winding down with a future wrap-up day and sales open', () => {
    expect(allowedSeasonActions(snap({ phase: 'winding_down', wrapUpDay: '2026-10-03', closeDay: '2026-10-05' }), today))
      .toEqual(['move', 'clear', 'stop_sales', 'end_today'])
  })

  it('winding down with a future wrap-up day and sales stopped early', () => {
    expect(allowedSeasonActions(snap({ phase: 'winding_down', wrapUpDay: '2026-10-03', closeDay: '2026-10-05', salesStopped: true }), today))
      .toEqual(['move', 'clear', 'resume_sales', 'end_today'])
  })

  it('winding down after the wrap-up day has passed: nothing to move, sales cannot resume', () => {
    expect(allowedSeasonActions(snap({ phase: 'winding_down', wrapUpDay: '2026-09-12', closeDay: '2026-09-14', salesStopped: true }), today))
      .toEqual(['clear', 'end_today'])
  })

  it('break: reopen only', () => {
    expect(allowedSeasonActions(snap({ phase: 'break', wrapUpDay: '2026-09-12', closeDay: '2026-09-14', salesStopped: true }), today))
      .toEqual(['reopen'])
  })
})

describe('visibleSeasonActions', () => {
  it('removes only end_today and keeps order when the break release is not live', () => {
    expect(visibleSeasonActions(['schedule', 'stop_sales', 'end_today'], false)).toEqual(['schedule', 'stop_sales'])
    expect(visibleSeasonActions(['move', 'clear', 'end_today', 'resume_sales'], false)).toEqual(['move', 'clear', 'resume_sales'])
  })

  it('returns every action unchanged when the break release is live', () => {
    expect(visibleSeasonActions(['schedule', 'stop_sales', 'end_today'], true)).toEqual(['schedule', 'stop_sales', 'end_today'])
  })
})

describe('seasonDriftMessage', () => {
  it('flags a plan blocked while the season still says sales are open', () => {
    expect(seasonDriftMessage(true, snap({ phase: 'winding_down' }))).toBe(
      'The season settings disagree: new plans are blocked, but the season says sales are open. This happens when the old Season page was used. Press Stop sales now once to line them up.',
    )
  })

  it('flags plans on sale while the season says sales are stopped', () => {
    expect(seasonDriftMessage(false, snap({ phase: 'winding_down', salesStopped: true }))).toBe(
      'The season settings disagree: new plans are on sale, but the season says sales are stopped. This happens when the old Season page was used. Press Resume sales once to line them up.',
    )
  })

  it('is null when paused and salesStopped agree', () => {
    expect(seasonDriftMessage(true, snap({ phase: 'winding_down', salesStopped: true }))).toBeNull()
    expect(seasonDriftMessage(false, snap({ phase: 'open', salesStopped: false }))).toBeNull()
  })

  it('is null on the break, even when paused and salesStopped disagree', () => {
    expect(seasonDriftMessage(false, snap({ phase: 'break', salesStopped: true }))).toBeNull()
  })
})
