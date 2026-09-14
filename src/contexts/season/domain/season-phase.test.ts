import { describe, it, expect } from 'vitest'
import { allowedSeasonActions, type SeasonSnapshot } from './season-phase'

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
