/**
 * Customer words for a plan held over the semester break (spec §6.3, §7.4,
 * §7.5, N8, N9, N11). Pure so vitest covers every line. No line mentions a
 * refund unless SEASON_REFUNDS_LIVE is on (spec D6).
 */

import { formatAed } from '@/contexts/season/domain/meal-value'
import { formatShortDay } from '@/contexts/season/domain/season-dates'
import type { CustomerHold } from '@/contexts/season/domain/customer-hold'
import type { ResumeSplit } from '@/contexts/season/domain/resume-split'
import { REFUND_COPY, refundAmountsPhrase, type RefundAmounts } from '@/contexts/season/domain/season-refund'
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
  /** Spec §10.3: the refund on offer, or the request in flight. Null when refunds are off or not offered. */
  refundLine: string | null
  /** 'ask' shows Ask for a refund, 'cancel' shows Cancel request. */
  refundAction: 'ask' | 'cancel' | null
  /** N13b: the owner's words on a declined request. */
  declineLine: string | null
}

function refundLinesFor(hold: CustomerHold): Pick<HeldCardCopy, 'refundLine' | 'refundAction' | 'declineLine'> {
  const declineLine = hold.refundDeclineReason ? `About your refund request: ${hold.refundDeclineReason}` : null
  if (hold.state === 'refund_requested' || hold.state === 'refund_processing' || hold.state === 'refund_failed') {
    const amounts = hold.refundRequested ? ` (${refundAmountsPhrase(hold.refundRequested)})` : ''
    return {
      refundLine: `${REFUND_COPY.requested}${amounts}`,
      refundAction: hold.state === 'refund_requested' ? 'cancel' : null,
      declineLine: null,
    }
  }
  if (hold.refundOffer) {
    return {
      refundLine: `You can ask for a refund for ${hold.heldMeals === 1 ? 'this meal' : `these ${hold.heldMeals} meals`} instead: ${refundAmountsPhrase(hold.refundOffer)}.`,
      refundAction: 'ask',
      declineLine,
    }
  }
  return { refundLine: null, refundAction: null, declineLine }
}

export function heldCardCopy(input: { hold: CustomerHold; alreadyJoined: boolean; creditAed: number }): HeldCardCopy {
  const { hold } = input
  const meals = mealsPhrase(hold.heldMeals)
  const are = hold.heldMeals === 1 ? 'is' : 'are'
  const scheduled = hold.planStatus === 'Scheduled'
  const creditLine = hold.waitlistCreditFils ? `${formatAed(hold.waitlistCreditFils)} is in your wallet for your next Monthly plan.` : null
  const refund = refundLinesFor(hold)

  if (hold.state === 'refund_requested' || hold.state === 'refund_processing' || hold.state === 'refund_failed') {
    return {
      headline: `Refund requested for your ${meals}.`,
      body: hold.state === 'refund_requested'
        ? 'Your meals stay kept for next semester until we confirm. You can cancel the request if you change your mind.'
        : 'Your meals stay kept for next semester until the refund lands.',
      creditLine,
      joinLine: null,
      pickDate: false,
      ...refund,
    }
  }
  if (hold.state === 'ready') {
    return {
      headline: `We're back. Your ${meals} ${are} ready.`,
      body: scheduled ? 'Pick your start date on your plan page to begin.' : "Tap Resume when you're ready, and your dinners start again.",
      creditLine,
      joinLine: null,
      pickDate: scheduled,
      ...refund,
    }
  }
  if (hold.state === 'paused_by_customer') {
    return {
      headline: 'Your plan is paused, and the kitchen is closed between semesters.',
      body: `Your ${meals} ${hold.heldMeals === 1 ? 'waits' : 'wait'} for you. You can resume once we're back.`,
      creditLine: input.alreadyJoined ? 'Your spot for next semester is saved.' : null,
      joinLine: input.alreadyJoined ? null : seasonJoinLine(input.creditAed),
      pickDate: false,
      refundLine: null,
      refundAction: null,
      declineLine: null,
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
    ...refund,
  }
}

export interface SheetCopy {
  headline: string
  lines: string[]
}

/** N7: the split before a resume while winding down. `refund` is what the held meals would return (spec §10.3). */
export function resumeSplitCopy(input: { split: ResumeSplit; refundsLive: boolean; refund: RefundAmounts | null }): SheetCopy {
  const { split } = input
  const wrapUp = formatShortDay(split.wrapUpDay)
  const meals = mealsPhrase(split.heldMeals)
  const lines = [
    split.firstDinner
      ? `Dinners from ${formatShortDay(split.firstDinner)} to ${wrapUp}.`
      : `There is no delivery day left before the semester wraps up on ${wrapUp}.`,
    `Your ${split.firstDinner ? 'other ' : ''}${meals} will be kept for next semester${split.creditAed ? `, with ${formatAed(Math.round(split.creditAed * 100))} in your wallet` : ''}.`,
  ]
  if (input.refundsLive && input.refund && (input.refund.cashFils > 0 || input.refund.creditFils > 0)) {
    lines.push(`Once the break starts you can ask for a refund for those ${meals} instead (${refundAmountsPhrase(input.refund)}).`)
  }
  return { headline: 'Resume your plan?', lines }
}

/** N11: Resume tapped during the break. */
export function breakResumeCopy(input: { alreadyJoined: boolean; creditAed: number }): SheetCopy & { joinLine: string | null } {
  return {
    headline: 'The kitchen is closed between semesters.',
    lines: ["Your plan can resume once we're back."],
    joinLine: input.alreadyJoined ? null : seasonJoinLine(input.creditAed),
  }
}

export interface BreakNoticeCopy {
  headline: string
  lines: string[]
  joinLine: string | null
}

/** N8 (a plan held by the break) and N9 (a customer pause carried over). Null otherwise. */
export function breakNoticeCopy(input: { hold: CustomerHold; alreadyJoined: boolean; creditAed: number }): BreakNoticeCopy | null {
  const { hold } = input
  if (hold.state === 'held') {
    const last = hold.planStatus === 'Scheduled' ? '' : 'last '
    const lines = [
      `The kitchen is closed between semesters, so your ${last}${mealsPhrase(hold.heldMeals)} of ${hold.planName} ${hold.heldMeals === 1 ? 'is' : 'are'} kept for you.`,
    ]
    if (hold.waitlistCreditFils) lines.push(`${formatAed(hold.waitlistCreditFils)} is in your wallet too.`)
    lines.push(hold.planStatus === 'Scheduled' ? "When we're back, pick your start date." : "When we're back, tap Resume.")
    if (hold.refundOffer) lines.push(`If you'd rather have your money back, you can ask for a refund for them from your home page (${refundAmountsPhrase(hold.refundOffer)}).`)
    return { headline: 'Your meals are kept for next semester.', lines, joinLine: null }
  }
  if (hold.state === 'paused_by_customer') {
    return {
      headline: 'The kitchen is closed between semesters.',
      lines: [`Your ${hold.planName} is still paused, and your meals wait for you. Resume when we're back.`],
      joinLine: input.alreadyJoined ? null : seasonJoinLine(input.creditAed),
    }
  }
  return null
}

/** Once per hold: a new season creates a new hold, so the notice shows again. */
export function breakNoticeSeenKey(holdId: string): string {
  return `dormers:season-break-notice-ack:${holdId}`
}
