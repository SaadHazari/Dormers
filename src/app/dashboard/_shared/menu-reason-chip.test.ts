import { describe, it, expect } from 'vitest'
import { reasonChip } from './menu-reason-chip'

describe('the label on a grey menu day', () => {
  it('calls the days after a plan a semester break while new plans are closed', () => {
    expect(reasonChip('plan-ends', 'season').label).toBe('Semester break')
  })

  it('offers renewal otherwise — also while a profile or dorm check holds it back', () => {
    expect(reasonChip('plan-ends', 'open').label).toBe('Renew to unlock')
    expect(reasonChip('plan-ends', 'blocked').label).toBe('Renew to unlock')
  })

  it('does not repeat "plan ended" on every day after a finished plan', () => {
    // The end date itself carries the one "Last dinner" marker.
    expect(reasonChip('after-end', 'open').label).toBe('No plan')
  })
})

describe('a day held for next semester', () => {
  it('reads "Kept for you" whatever the renew gate', () => {
    expect(reasonChip('season-held', 'season').label).toBe('Kept for you')
    expect(reasonChip('season-held', 'open').label).toBe('Kept for you')
  })
})
