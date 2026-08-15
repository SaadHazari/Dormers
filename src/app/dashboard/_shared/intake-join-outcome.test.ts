/**
 * Regression coverage for the final-review Critical 2 bug: IntakePausedGate
 * and PlanEndingPausedBanner discarded joinIntakeWaitlist()'s own result and
 * always rendered the caller's prospective `creditAed` prop instead — so a
 * failed mint (creditAed: 0, a "we will sort your credit" message) still
 * showed "AED 20 is waiting in your account" to the customer. These pure
 * helpers now carry that logic, so this test guards it directly without
 * needing a DOM (this repo's vitest config runs in the `node` environment).
 */

import { describe, it, expect, vi } from 'vitest'

// join-intake-waitlist.ts is a 'use server' action that transitively imports
// infra/config/intake.ts, which is server-only-guarded — mock it out so this
// pure-function test (intentionally run outside any React/server context)
// can import the SPOT_SAVED_NO_CREDIT_YET_MESSAGE constant and JoinWaitlistResult
// type without pulling in the server-only guard. Same pattern as
// join-intake-waitlist.test.ts.
vi.mock('server-only', () => ({}))

import { deriveJoinOutcome, intakeCreditDisplay } from './intake-join-outcome'
import type { JoinWaitlistResult } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import { SPOT_SAVED_NO_CREDIT_YET_MESSAGE } from '@/contexts/subscriptions/domain/credit-eligibility'

describe('deriveJoinOutcome', () => {
  it('reports the actual minted amount and message on success, never a caller-supplied one', () => {
    const result: JoinWaitlistResult = {
      ok: true, alreadyJoined: false, creditAed: 20,
      message: 'Your spot is saved. AED 20 is waiting in your account.',
    }
    const outcome = deriveJoinOutcome(result)
    expect(outcome.joined).toBe(true)
    expect(outcome.creditAed).toBe(20)
    expect(outcome.message).toBe('Your spot is saved. AED 20 is waiting in your account.')
    expect(outcome.error).toBeNull()
  })

  it('reports zero — not a prospective amount — when the mint failed but the tap still succeeded', () => {
    const result: JoinWaitlistResult = {
      ok: true, alreadyJoined: false, creditAed: 0,
      message: SPOT_SAVED_NO_CREDIT_YET_MESSAGE,
    }
    const outcome = deriveJoinOutcome(result)
    expect(outcome.joined).toBe(true)
    expect(outcome.creditAed).toBe(0)
    expect(outcome.message).toBe(SPOT_SAVED_NO_CREDIT_YET_MESSAGE)
  })

  it('never flips to joined on failure, and surfaces the reason instead of silence', () => {
    const result: JoinWaitlistResult = {
      ok: false, alreadyJoined: false, creditAed: 0,
      message: 'Could not save your spot. Please try again.',
    }
    const outcome = deriveJoinOutcome(result)
    expect(outcome.joined).toBe(false)
    expect(outcome.creditAed).toBeNull()
    expect(outcome.error).toBe('Could not save your spot. Please try again.')
  })
})

describe('intakeCreditDisplay', () => {
  it('shows the amount when a real credit was minted', () => {
    const display = intakeCreditDisplay(20, 'Your spot is saved. AED 20 is waiting in your account.')
    expect(display.hasCredit).toBe(true)
    expect(display.creditAed).toBe(20)
    expect(display.text).toBe('AED 20 is waiting in your account')
  })

  it('never shows a credit amount when the real balance is zero, even if a message is missing', () => {
    const display = intakeCreditDisplay(0, null)
    expect(display.hasCredit).toBe(false)
    expect(display.creditAed).toBe(0)
    expect(display.text).toBe(SPOT_SAVED_NO_CREDIT_YET_MESSAGE)
  })

  it('prefers the supplied message over the generic fallback when the balance is zero', () => {
    const display = intakeCreditDisplay(0, 'Custom reassurance copy.')
    expect(display.hasCredit).toBe(false)
    expect(display.text).toBe('Custom reassurance copy.')
  })
})
