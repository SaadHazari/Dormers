import { describe, it, expect } from 'vitest'
import { pauseTakeoverCta, pausingTakeoverCopy } from './pause-takeover-actions'
import { REOPEN_MESSAGE_PROMISE } from './intake-join-outcome'

describe('pauseTakeoverCta', () => {
  it('offers the join and softens the dismiss when there is a spot to save', () => {
    expect(pauseTakeoverCta({ variant: 'pausing', alreadyJoined: false, justJoined: false }))
      .toEqual({ showJoin: true, joinLabel: 'Save my spot', dismissLabel: 'Not now', showLater: false, laterLabel: '' })
  })

  it('drops the join once the customer is already on the list', () => {
    expect(pauseTakeoverCta({ variant: 'pausing', alreadyJoined: true, justJoined: false }))
      .toEqual({ showJoin: false, joinLabel: '', dismissLabel: 'Got it', showLater: false, laterLabel: '' })
  })

  it('drops the join immediately after a successful tap', () => {
    expect(pauseTakeoverCta({ variant: 'pausing', alreadyJoined: false, justJoined: true }))
      .toEqual({ showJoin: false, joinLabel: '', dismissLabel: 'Got it', showLater: false, laterLabel: '' })
  })

  // The reopened variant has nothing to accept — it is pure payoff. Its
  // dismiss navigates to the plan page, so it is the one branch that also
  // offers a stay-put close.
  it('gives the reopened variant a stay-put close beside the plan-page CTA', () => {
    expect(pauseTakeoverCta({ variant: 'reopened', alreadyJoined: true, justJoined: false }))
      .toEqual({ showJoin: false, joinLabel: '', dismissLabel: 'See your plan options', showLater: true, laterLabel: 'Maybe later' })
  })
})

describe('pausingTakeoverCopy', () => {
  it("names the customer's own last delivery day when the sub has one", () => {
    const copy = pausingTakeoverCopy('2027-01-15')
    expect(copy.headline).toBe('Your meals keep coming.')
    expect(copy.body).toBe(
      'We are between semesters, so new plan purchases are paused. Every delivery you have paid for arrives as scheduled, through 15 January.',
    )
  })

  it('drops the date clause cleanly when no end date is known', () => {
    expect(pausingTakeoverCopy(null).body).toBe(
      'We are between semesters, so new plan purchases are paused. Every delivery you have paid for arrives as scheduled.',
    )
  })

  it('carries the shared reopen promise verbatim, never a paraphrase', () => {
    expect(pausingTakeoverCopy(null).promise).toBe(REOPEN_MESSAGE_PROMISE)
  })
})
