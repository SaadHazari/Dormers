import { describe, it, expect } from 'vitest'
import {
    cycleLabelFor,
    weeklyWrapGate,
    WEEKLY_WRAP_PREVIEW_DAY,
    WEEKLY_WRAP_UNLOCK_MEALS,
} from './monthly-review'
import { expectedReviewWeeks } from './plans'

/**
 * Weekly customers get ONE survey, not two.
 *
 * Before this change a Weekly Flex customer was asked for a weekly food
 * review AND a plan wrap covering the identical 7 days, with the wrap
 * labelled by its start date ("week of Aug 12") so the two read as the
 * same request. The food review is now off for weekly plans and the wrap
 * is gated on meals eaten rather than days-to-end.
 */

describe('expectedReviewWeeks', () => {
    it('gives weekly plans no food review — the wrap is their only survey', () => {
        expect(expectedReviewWeeks('Weekly Flex')).toBe(0)
    })

    it('leaves monthly plans on all four food reviews', () => {
        expect(expectedReviewWeeks('Monthly Premium')).toBe(4)
        expect(expectedReviewWeeks('Monthly Max')).toBe(4)
    })

    it('still gives trial and gift plans no food review', () => {
        expect(expectedReviewWeeks('One-Time Trial')).toBe(0)
        expect(expectedReviewWeeks('Welcome Meal')).toBe(0)
    })
})

describe('cycleLabelFor', () => {
    it('names the survey, not the date, for weekly and trial', () => {
        // "week of Aug 12" collided with the plan card directly above it,
        // which already showed the same span as "12 Aug to 19 Aug".
        expect(cycleLabelFor('weekly', '2026-08-12')).toBe('Weekly Plan')
        expect(cycleLabelFor('trial', '2026-08-12')).toBe('Trial Meal')
    })

    it('keeps the month name for monthly, which has no collision', () => {
        expect(cycleLabelFor('monthly', '2026-08-12')).toBe('August cycle')
    })

    it('reads correctly after the "your {label}" determiner every template adds', () => {
        expect(`Rate your ${cycleLabelFor('weekly', '2026-08-12')}`).toBe('Rate your Weekly Plan')
        expect(`Close out your ${cycleLabelFor('weekly', '2026-08-12')}`).toBe('Close out your Weekly Plan')
        expect(`Rate your ${cycleLabelFor('trial', '2026-08-12')}`).toBe('Rate your Trial Meal')
    })

    it('returns null without a start date', () => {
        expect(cycleLabelFor('weekly', null)).toBeNull()
    })
})

describe('weeklyWrapGate', () => {
    const gate = (daysSinceStart: number, deliveredMeals: number, cycleEnded = false) =>
        weeklyWrapGate({ daysSinceStart, deliveredMeals, cycleEnded })

    it('stays hidden for the first three days', () => {
        expect(gate(0, 0)).toBe('hidden') // day 1
        expect(gate(1, 1)).toBe('hidden') // day 2
        expect(gate(2, 2)).toBe('hidden') // day 3
    })

    it('appears locked on day 4', () => {
        expect(gate(WEEKLY_WRAP_PREVIEW_DAY - 1, 3)).toBe('locked')
    })

    it('stays locked on day 5 when only four meals have landed', () => {
        // A customer who skipped once is a day behind on meals. Days alone
        // must not open the wrap or they review on four meals, not five.
        expect(gate(4, 4)).toBe('locked')
    })

    it('opens once the fifth meal is delivered', () => {
        expect(gate(4, WEEKLY_WRAP_UNLOCK_MEALS)).toBe('open')
    })

    it('opens at plan end even when the meal count never reached five', () => {
        // Safety net: without this, a customer whose meals fell short of
        // five could never submit and would silently lose the reward.
        expect(gate(7, 3, true)).toBe('open')
    })

    it('opens on a delivery run-up that outpaces the preview day', () => {
        // Defensive: meal count is the real signal, so it wins even if the
        // day arithmetic somehow lags behind it.
        expect(gate(2, WEEKLY_WRAP_UNLOCK_MEALS)).toBe('open')
    })

    it('never hides a wrap whose cycle has already ended', () => {
        expect(gate(0, 0, true)).toBe('open')
    })
})
