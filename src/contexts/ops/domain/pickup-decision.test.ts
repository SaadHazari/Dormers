/**
 * Locks in the pickup gate the owner asked for on 2026-08-19: a photo whose
 * box count is wrong sends the rider back to shoot it again.
 *
 * And the safety property that makes that survivable — a camera that cannot
 * count a stack must never be able to cancel a day of deliveries. The budget
 * always terminates in a path forward, and that path is always alerted.
 */

import { describe, it, expect } from 'vitest'
import {
  decidePickup,
  pickupPhotoPath,
  MAX_PICKUP_ATTEMPTS,
  type PickupInput,
} from './pickup-decision'

function input(over: Partial<PickupInput> = {}): PickupInput {
  return { expectedTotal: 6, riderCount: 6, geminiCount: 6, attempt: 1, riderAsserted: false, ...over }
}

describe('decidePickup — the rider\'s own count', () => {
  // The failure this was built for: on 2026-08-19 a van holding five boxes
  // was approved as six, because the only number checked against the
  // manifest was a machine guess and nobody asked the man loading the van.
  it('holds the day when the rider counts fewer than the manifest', () => {
    const d = decidePickup(input({ expectedTotal: 6, riderCount: 5, geminiCount: 6 }))
    expect(d.outcome).toBe('rider_disagrees')
    expect(d.accepted).toBe(false)
  })

  it('holds it even when the camera agrees with the manifest', () => {
    // The exact shape of the real incident: AI says 6, van has 5.
    const d = decidePickup(input({ expectedTotal: 6, riderCount: 5, geminiCount: 6, attempt: 1 }))
    expect(d.accepted).toBe(false)
  })

  it('offers confirm-by-hand straight away and spends no photo budget', () => {
    // A better photo cannot conjure a missing box, so more photos are the
    // wrong remedy. One tap should reach the owner instead.
    const d = decidePickup(input({ riderCount: 5 }))
    expect(d.allowAssert).toBe(true)
    expect(d.attemptsLeft).toBe(MAX_PICKUP_ATTEMPTS - 1)
  })

  it('holds the day when the rider counts MORE than the manifest', () => {
    expect(decidePickup(input({ riderCount: 7 })).accepted).toBe(false)
  })
})

describe('decidePickup — counts agree', () => {
  it('opens the day with no alert', () => {
    const d = decidePickup(input())
    expect(d.outcome).toBe('accepted')
    expect(d.accepted).toBe(true)
    expect(d.matched).toBe(true)
    expect(d.alert).toBe(false)
  })

  it('opens the day on a later attempt too', () => {
    const d = decidePickup(input({ attempt: 3 }))
    expect(d.accepted).toBe(true)
    expect(d.matched).toBe(true)
  })
})

describe('decidePickup — wrong number of boxes', () => {
  it('sends the rider back for another photo instead of letting him through', () => {
    const d = decidePickup(input({ geminiCount: 2, attempt: 1 }))
    expect(d.outcome).toBe('retake')
    expect(d.outcome).toBe('retake')
    expect(d.accepted).toBe(false)   // this is the behaviour change
    expect(d.attemptsLeft).toBe(2)
  })

  it('still asks again on the middle attempt', () => {
    const d = decidePickup(input({ geminiCount: 2, attempt: 2 }))
    expect(d.outcome).toBe('retake')
    expect(d.accepted).toBe(false)
    expect(d.attemptsLeft).toBe(1)
  })

  it('stops guessing on the last attempt and demands the rider vouch', () => {
    const d = decidePickup(input({ geminiCount: 2, attempt: 3 }))
    expect(d.outcome).toBe('needs_assertion')
    expect(d.accepted).toBe(false)
    expect(d.alert).toBe(true)
    expect(d.attemptsLeft).toBe(0)
  })

  it('counts too many boxes as a mismatch, not just too few', () => {
    const d = decidePickup(input({ expectedTotal: 6, geminiCount: 9 }))
    expect(d.outcome).toBe('retake')
  })
})

describe('decidePickup — unreadable photo', () => {
  it('asks again while the budget lasts', () => {
    const d = decidePickup(input({ geminiCount: null, attempt: 1 }))
    expect(d.outcome).toBe('retake')
    expect(d.accepted).toBe(false)
  })

  it('falls through to the rider rather than holding the run hostage', () => {
    const d = decidePickup(input({ geminiCount: null, attempt: 3 }))
    expect(d.outcome).toBe('uncountable')
    expect(d.alert).toBe(true)
  })
})

describe('decidePickup — the rider vouches', () => {
  it('lets him through, records it as unmatched, and always alerts', () => {
    const d = decidePickup(input({ geminiCount: 2, attempt: 3, riderAsserted: true }))
    expect(d.accepted).toBe(true)
    expect(d.matched).toBe(false)   // his word opened the gate, not the camera
    expect(d.alert).toBe(true)
  })

  it('never passes silently — an asserted pickup is always reported', () => {
    for (let attempt = 1; attempt <= MAX_PICKUP_ATTEMPTS; attempt++) {
      expect(decidePickup(input({ geminiCount: 2, attempt, riderAsserted: true })).alert).toBe(true)
    }
  })
})

describe('the budget always terminates in a way forward', () => {
  it('no AI answer can leave the rider with nothing to do', () => {
    for (const geminiCount of [null, 0, 2, 99]) {
      const d = decidePickup(input({ geminiCount, attempt: MAX_PICKUP_ATTEMPTS }))
      // Either the day opened, or he is offered a way to close it himself.
      expect(d.accepted || d.allowAssert).toBe(true)
    }
  })

  it('a rider whose count disagrees always has a way out too', () => {
    for (let attempt = 1; attempt <= MAX_PICKUP_ATTEMPTS + 1; attempt++) {
      expect(decidePickup(input({ riderCount: 5, attempt })).allowAssert).toBe(true)
    }
  })
})

describe('pickupPhotoPath', () => {
  it('gives every attempt its own key so nothing is overwritten', () => {
    expect(pickupPhotoPath('2026-08-19', 1)).toBe('2026-08-19/_pickup/pickup-a1.jpg')
    expect(pickupPhotoPath('2026-08-19', 3)).toBe('2026-08-19/_pickup/pickup-a3.jpg')
  })
})
