/**
 * Customer words for a plan held over the semester break (spec §6.3, §7.4,
 * §7.5, N8, N9, N11). Pure so vitest covers every line. No line mentions a
 * refund unless SEASON_REFUNDS_LIVE is on (spec D6).
 */

import { formatAed } from '@/contexts/season/domain/meal-value'
import type { CustomerHold } from '@/contexts/season/domain/customer-hold'
import { seasonJoinLine } from './season-notice-copy'

export function mealsPhrase(n: number): string {
  return `${n} ${n === 1 ? 'meal' : 'meals'}`
}

export interface HeldCardCopy {
  headline: string
  body: string
  creditLine: string | null
  joinLine: string | null
  /** A ready Scheduled plan restarts by picking a start date on the plan page. */
  pickDate: boolean
}

export function heldCardCopy(input: { hold: CustomerHold; alreadyJoined: boolean; creditAed: number }): HeldCardCopy {
  const { hold } = input
  const meals = mealsPhrase(hold.heldMeals)
  const are = hold.heldMeals === 1 ? 'is' : 'are'
  const scheduled = hold.planStatus === 'Scheduled'
  const creditLine = hold.waitlistCreditFils ? `${formatAed(hold.waitlistCreditFils)} is in your wallet for your next Monthly plan.` : null

  if (hold.state === 'ready') {
    return {
      headline: `We're back. Your ${meals} ${are} ready.`,
      body: scheduled ? 'Pick your start date on your plan page to begin.' : "Tap Resume when you're ready, and your dinners start again.",
      creditLine,
      joinLine: null,
      pickDate: scheduled,
    }
  }
  if (hold.state === 'paused_by_customer') {
    return {
      headline: 'Your plan is paused, and the kitchen is closed between semesters.',
      body: `Your ${meals} ${hold.heldMeals === 1 ? 'waits' : 'wait'} for you. You can resume once we're back.`,
      creditLine: input.alreadyJoined ? 'Your spot for next semester is saved.' : null,
      joinLine: input.alreadyJoined ? null : seasonJoinLine(input.creditAed),
      pickDate: false,
    }
  }
  return {
    headline: `Your ${meals} ${are} kept for next semester.`,
    body: scheduled
      ? "The kitchen is closed between semesters. When we're back, pick your start date."
      : "The kitchen is closed between semesters. When we're back, tap Resume.",
    creditLine,
    joinLine: null,
    pickDate: false,
  }
}
