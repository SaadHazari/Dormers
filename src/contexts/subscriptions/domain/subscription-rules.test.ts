/**
 * Tests for the centralised Subscription rules. These run as pure unit
 * tests — no mocking, no Supabase. Each rule maps to one or more test
 * cases per branch, locking in the user-facing error copy.
 */

import { describe, it, expect } from 'vitest'
import { canPause, canPlanPause, canSkip, canResume } from './subscription-rules'
import type { Subscription } from './subscriptions'

function fakeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    customer_id: 'user-1',
    plan_name: 'Monthly Premium',
    status: 'Active',
    start_date: '2026-05-01',
    end_date: '2026-12-31',
    meals_per_day: 1,
    total_meals: 24,
    delivered_meals: 5,
    paused_days: 0,
    pause_date: null,
    has_paused_before: false,
    last_skipped_date: null,
    skipped_meals_count: 0,
    created_at: '2026-04-30T00:00:00Z',
    week_type: '6DAYS',
    start_date_changed_at: null,
    veg_days: null,
    resume_cutoff_date: null,
    skipped_dates: [],
    planned_pause_start: null,
    original_start_date: '2026-05-01',
    bonus_skips: 0,
    paused_dates: [],
    start_email_sent_at: null,
    closure_days: 0,
    ...overrides,
  }
}

describe('canPause', () => {
  it('passes for an Active Monthly Premium with credit unspent', () => {
    expect(canPause(fakeSub(), '2026-06-01')).toEqual({ ok: true })
  })

  it('rejects an already-paused sub', () => {
    expect(canPause(fakeSub({ status: 'Paused' }), '2026-06-01'))
      .toEqual({ ok: false, error: 'Subscription is already paused.' })
  })

  it('rejects an ended sub', () => {
    expect(canPause(fakeSub({ status: 'Ended' }), '2026-06-01'))
      .toEqual({ ok: false, error: 'Cannot pause an ended subscription.' })
  })

  it('rejects plans that cannot pause (e.g. Weekly Flex)', () => {
    expect(canPause(fakeSub({ plan_name: 'Weekly Flex' }), '2026-06-01'))
      .toEqual({ ok: false, error: 'Only Monthly Premium and Monthly Max plans can be paused.' })
  })

  it('rejects when pause credit is already spent (paused-and-resumed earlier this cycle)', () => {
    expect(canPause(fakeSub({ has_paused_before: true, planned_pause_start: null }), '2026-06-01'))
      .toEqual({ ok: false, error: 'You have already used your 1 allowed pause for this subscription.' })
  })

  it('allows immediate pause to override a queued plan (has_paused_before + planned_pause_start)', () => {
    expect(canPause(fakeSub({ has_paused_before: true, planned_pause_start: '2026-07-01' }), '2026-06-01'))
      .toEqual({ ok: true })
  })

  it('rejects pause on the literal last delivery day', () => {
    expect(canPause(fakeSub({ end_date: '2026-06-01' }), '2026-06-01'))
      .toEqual({ ok: false, error: 'Can\'t pause on your last delivery day — there\'s no future meal to protect.' })
  })
})

describe('canPlanPause', () => {
  it('passes on Active with no existing plan', () => {
    expect(canPlanPause(fakeSub())).toEqual({ ok: true })
  })

  it('rejects when an existing plan_pause is already queued', () => {
    expect(canPlanPause(fakeSub({ planned_pause_start: '2026-07-01' })))
      .toEqual({ ok: false, error: 'You already have a pause scheduled. Cancel it first to pick a different date.' })
  })

  it('rejects on Paused or Ended subs', () => {
    expect(canPlanPause(fakeSub({ status: 'Paused' })))
      .toEqual({ ok: false, error: 'Pauses can only be scheduled on an active subscription.' })
  })

  it('rejects when credit already spent', () => {
    expect(canPlanPause(fakeSub({ has_paused_before: true })))
      .toEqual({ ok: false, error: 'You\'ve already used your 1 allowed pause for this subscription.' })
  })
})

describe('canSkip', () => {
  it('passes when under the skip cap on Active', () => {
    expect(canSkip(fakeSub())).toEqual({ ok: true })
  })

  it('rejects when skip cap reached (Monthly Premium = 3 by default)', () => {
    const max = 3  // Monthly Premium default cap, per plans.ts
    expect(canSkip(fakeSub({ skipped_meals_count: max })))
      .toEqual({ ok: false, error: `You've used all ${max} of your skips for this cycle.` })
  })

  it('counts Dorm Wars bonus_skips toward the cap', () => {
    // base 3 + 1 bonus = 4; with 3 used the user still has 1 left
    expect(canSkip(fakeSub({ skipped_meals_count: 3, bonus_skips: 1 })))
      .toEqual({ ok: true })
  })

  it('rejects on Ended subs', () => {
    expect(canSkip(fakeSub({ status: 'Ended' })))
      .toEqual({ ok: false, error: 'Skips can only be scheduled on an active subscription.' })
  })
})

describe('canResume', () => {
  it('passes on Paused with a prior pause_date', () => {
    expect(canResume(fakeSub({ status: 'Paused' }), '2026-06-02', '2026-06-01'))
      .toEqual({ ok: true })
  })

  it('rejects same-day resume (pause and resume on same AE day is locked)', () => {
    expect(canResume(fakeSub({ status: 'Paused' }), '2026-06-01', '2026-06-01'))
      .toEqual({ ok: false, error: 'Your plan was paused today — resume becomes available tomorrow.' })
  })

  it('rejects when not paused', () => {
    expect(canResume(fakeSub({ status: 'Active' }), '2026-06-02', null))
      .toEqual({ ok: false, error: 'Subscription is not currently paused.' })
  })
})
