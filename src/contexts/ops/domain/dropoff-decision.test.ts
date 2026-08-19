/**
 * Locks in the two rules that matter most about a drop-off:
 *
 *   1. A count dispute never silences a dorm. Every terminal outcome where
 *      the rider was standing at the door marks the food delivered, which is
 *      what releases the customer WhatsApps.
 *   2. A rider can add evidence but never clear a flag. Retaking a photo can
 *      earn `verified`, but it cannot un-send the alert the first attempt
 *      already triggered, and the budget is hard-capped.
 */

import { describe, it, expect } from 'vitest'
import {
  decideDropoff,
  preflightDropoff,
  attemptPhotoPath,
  MAX_VERIFY_ATTEMPTS,
  type DropoffInput,
} from './dropoff-decision'

function input(over: Partial<DropoffInput> = {}): DropoffInput {
  return {
    expectedCount: 7,
    riderCount: 7,
    geminiCount: 7,
    imageQuality: 'clear',
    confidence: 'high',
    attempt: 1,
    ...over,
  }
}

describe('decideDropoff — triple match', () => {
  it('verifies and delivers when all three counts agree', () => {
    const d = decideDropoff(input())
    expect(d.outcome).toBe('verified')
    expect(d.verified).toBe(true)
    expect(d.delivered).toBe(true)
    expect(d.escalate).toBe(false)
  })

  it('verifies on the second attempt too', () => {
    const d = decideDropoff(input({ attempt: 2 }))
    expect(d.outcome).toBe('verified')
    expect(d.verified).toBe(true)
  })
})

describe('decideDropoff — count mismatch', () => {
  it('flags the owner AND delivers on the first attempt', () => {
    const d = decideDropoff(input({ geminiCount: 5, attempt: 1 }))
    expect(d.outcome).toBe('mismatch_retake')
    expect(d.escalate).toBe(true)
    expect(d.delivered).toBe(true)   // students are not punished for a miscount
    expect(d.verified).toBe(false)
    expect(d.allowRetake).toBe(true)
    expect(d.attemptsLeft).toBe(1)
  })

  it('flags again and locks on the last attempt', () => {
    const d = decideDropoff(input({ geminiCount: 5, attempt: 2 }))
    expect(d.outcome).toBe('mismatch_final')
    expect(d.escalate).toBe(true)
    expect(d.delivered).toBe(true)
    expect(d.allowRetake).toBe(false)
    expect(d.attemptsLeft).toBe(0)
  })

  it('treats a stale expected count as a mismatch, not a pass', () => {
    // kitchen packed one extra: rider and AI agree, expected does not
    const d = decideDropoff(input({ expectedCount: 6, riderCount: 7, geminiCount: 7 }))
    expect(d.verified).toBe(false)
    expect(d.escalate).toBe(true)
  })

  it('never lets a retake set verified without a real match', () => {
    const first = decideDropoff(input({ geminiCount: 5, attempt: 1 }))
    const second = decideDropoff(input({ geminiCount: 5, attempt: 2 }))
    expect(first.verified).toBe(false)
    expect(second.verified).toBe(false)
  })
})

describe('decideDropoff — unreadable photo', () => {
  it('asks for a retake without alerting anyone on the first attempt', () => {
    const d = decideDropoff(input({ imageQuality: 'unclear', geminiCount: null, confidence: 'low', attempt: 1 }))
    expect(d.outcome).toBe('retake')
    expect(d.escalate).toBe(false)
    expect(d.delivered).toBe(false)  // the rider is about to shoot again
    expect(d.allowRetake).toBe(true)
  })

  it('escalates but still delivers when the second photo is also unreadable', () => {
    const d = decideDropoff(input({ imageQuality: 'unclear', geminiCount: null, confidence: 'low', attempt: 2 }))
    expect(d.outcome).toBe('unclear_final')
    expect(d.escalate).toBe(true)
    expect(d.delivered).toBe(true)   // a dark photo is not proof the food is missing
    expect(d.allowRetake).toBe(false)
  })

  it('treats a low-confidence null count as unreadable', () => {
    const d = decideDropoff(input({ imageQuality: 'clear', geminiCount: null, confidence: 'low', attempt: 1 }))
    expect(d.outcome).toBe('retake')
  })
})

describe('decideDropoff — counter unavailable', () => {
  it('hands the decision to the rider when Gemini returns nothing usable', () => {
    const d = decideDropoff(input({ geminiCount: null, confidence: 'medium', imageQuality: 'clear' }))
    expect(d.outcome).toBe('manual')
    expect(d.delivered).toBe(false)  // only the rider's explicit confirm delivers
    expect(d.escalate).toBe(false)
    expect(d.verified).toBe(false)
  })
})

describe('preflightDropoff', () => {
  it('passes a fresh drop-off through', () => {
    expect(preflightDropoff({ verified: false, verifyAttempts: 0 })).toBe('ok')
  })

  it('short-circuits a dorm that already passed', () => {
    expect(preflightDropoff({ verified: true, verifyAttempts: 1 })).toBe('already_verified')
  })

  it('locks once the photo budget is spent', () => {
    expect(preflightDropoff({ verified: false, verifyAttempts: MAX_VERIFY_ATTEMPTS })).toBe('locked')
  })

  it('stays locked no matter how many times the rider reloads', () => {
    expect(preflightDropoff({ verified: false, verifyAttempts: 9 })).toBe('locked')
  })
})

describe('attemptPhotoPath', () => {
  it('gives every attempt its own key so nothing is overwritten', () => {
    const a1 = attemptPhotoPath('2026-08-19', 'uninest-muhaisnah', 1, 1)
    const a2 = attemptPhotoPath('2026-08-19', 'uninest-muhaisnah', 1, 2)
    expect(a1).toBe('2026-08-19/uninest-muhaisnah/trip-1-a1.jpg')
    expect(a2).toBe('2026-08-19/uninest-muhaisnah/trip-1-a2.jpg')
    expect(a1).not.toBe(a2)
  })
})
