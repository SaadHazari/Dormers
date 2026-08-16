import { describe, it, expect } from 'vitest'
import { pauseTakeoverCta } from './pause-takeover-actions'

describe('pauseTakeoverCta', () => {
  it('offers the join and softens the dismiss when there is a spot to save', () => {
    expect(pauseTakeoverCta({ variant: 'pausing', alreadyJoined: false, justJoined: false }))
      .toEqual({ showJoin: true, joinLabel: 'Save my spot', dismissLabel: 'Not now' })
  })

  it('drops the join once the customer is already on the list', () => {
    expect(pauseTakeoverCta({ variant: 'pausing', alreadyJoined: true, justJoined: false }))
      .toEqual({ showJoin: false, joinLabel: '', dismissLabel: 'Got it' })
  })

  it('drops the join immediately after a successful tap', () => {
    expect(pauseTakeoverCta({ variant: 'pausing', alreadyJoined: false, justJoined: true }))
      .toEqual({ showJoin: false, joinLabel: '', dismissLabel: 'Got it' })
  })

  // The reopened variant has nothing to accept — it is pure payoff.
  it('leaves the reopened variant untouched', () => {
    expect(pauseTakeoverCta({ variant: 'reopened', alreadyJoined: true, justJoined: false }))
      .toEqual({ showJoin: false, joinLabel: '', dismissLabel: 'See your plan options' })
  })
})
