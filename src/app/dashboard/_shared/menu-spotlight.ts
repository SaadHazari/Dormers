// The menu's Tonight card: which card shows, and the words on it. Both menu
// trees render from here, so desktop and mobile can't tell a customer two
// different stories about tonight.
//
// Paused, scheduled and plan-less customers used to get the full dinner ticket
// with only a small truck line admitting there was no delivery (atlas p150,
// 2026-09-12). On 2026-09-14 the card learned the rest: a skipped night stops
// showing "Tonight's dish" above a "Not tonight" card, a renewal held for
// approval stops quoting a start date that has passed, a returning customer is
// told when their plan ended, and the last dinner of a plan says so.
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { deliveryDayLabel, formatMenuDate, isLivePlan, nextDeliveryIso, type MenuDayContext } from './menu-day-status'

export type Spotlight =
  | { kind: 'rest' }
  | { kind: 'closure' }
  | { kind: 'none' }
  | { kind: 'ended' }
  | { kind: 'scheduled'; held: boolean }
  | { kind: 'resumed-late' }
  | { kind: 'paused' }
  | { kind: 'skipped' }
  | { kind: 'dinner'; lastDinner: boolean }

export type NoticeSpotlight = Exclude<Spotlight, { kind: 'dinner' } | { kind: 'rest' }>

export function spotlightFor(ctx: MenuDayContext, { todayIsOff }: { todayIsOff: boolean }): Spotlight {
  const { plan, todayIso } = ctx
  if (todayIsOff) return { kind: 'rest' }
  // The truest reason tonight, whatever the plan says.
  if (ctx.closureDates.includes(todayIso)) return { kind: 'closure' }
  if (!plan) return { kind: 'none' }
  if (plan.status === SUBSCRIPTION_STATUS.ENDED) return { kind: 'ended' }
  if (plan.status === SUBSCRIPTION_STATUS.SCHEDULED) return { kind: 'scheduled', held: plan.start_date < todayIso }
  // A live row whose end date passed before the midnight status tick ran.
  if (todayIso > plan.end_date) return { kind: 'ended' }
  if (plan.resume_cutoff_date === todayIso) return { kind: 'resumed-late' }
  if (plan.status === SUBSCRIPTION_STATUS.PAUSED) return { kind: 'paused' }
  if (plan.planned_pause_start && plan.planned_pause_start <= todayIso) return { kind: 'paused' }
  if (plan.status === SUBSCRIPTION_STATUS.SKIPPED || (plan.skipped_dates ?? []).includes(todayIso)) return { kind: 'skipped' }
  return { kind: 'dinner', lastDinner: plan.end_date === todayIso && !ctx.hasQueuedRenewal }
}

/** The section eyebrow above the card. */
export function spotlightEyebrow(s: Spotlight): string {
  return s.kind === 'dinner' ? "Today's delivery" : 'Tonight'
}

/** Rest-day card (Sunday, or Saturday on a 5-day week). */
export function restDayCopy(ctx: MenuDayContext): { headline: string; body: string } {
  const isSunday = new Date(ctx.todayIso + 'T00:00:00Z').getUTCDay() === 0
  const next = nextDeliveryIso(ctx)
  return {
    headline: isSunday ? 'Sunday — no delivery' : 'No delivery — rest day',
    body: next ? `Rest up. Next delivery ${deliveryDayLabel(next, ctx.todayIso)}, 7–8 PM.` : 'The kitchen rests today.',
  }
}

/** Headline carries no trailing period — the card adds the brand orange one. */
export function spotlightCopy(s: NoticeSpotlight, ctx: MenuDayContext): { headline: string; body: string } {
  const p = ctx.plan
  const next = nextDeliveryIso(ctx)
  const nextLabel = next ? `${deliveryDayLabel(next, ctx.todayIso)}, 7–8 PM` : null
  switch (s.kind) {
    case 'closure':
      return {
        headline: 'Kitchen closed today',
        body: isLivePlan(p)
          ? 'No delivery tonight — the kitchen is closed. This day is added to the end of your plan, so nothing is lost.'
          : 'No deliveries tonight — the kitchen is closed.',
      }
    case 'resumed-late':
      return {
        headline: 'No delivery tonight',
        body: `You resumed after the 2 PM kitchen cutoff, so your first delivery is ${nextLabel ?? 'your next delivery day'}. Tonight's slot moves to the end of your plan — nothing is lost.`,
      }
    case 'skipped':
      return {
        headline: 'Skipped tonight',
        body: nextLabel ? `You skipped tonight's dinner. Your next delivery is ${nextLabel}.` : "You skipped tonight's dinner.",
      }
    case 'paused':
      return {
        headline: 'Plan paused',
        body: "Nothing's cooking for you while you're paused. Resume and deliveries pick up the next working day.",
      }
    case 'scheduled':
      // Held renewals mirror the dashboard hero: no date until the team approves.
      if (s.held || !p) return { headline: 'Almost there', body: 'Your meals begin as soon as the team approves this plan.' }
      return {
        headline: `Starts ${formatMenuDate(p.start_date)}`,
        body: `Your first delivery is ${formatMenuDate(p.start_date)}, 7–8 PM. Until then the kitchen isn't cooking for you.`,
      }
    case 'ended':
      return {
        headline: 'Your plan has ended',
        body: p ? `Your last dinner was ${formatMenuDate(p.end_date)}.` : 'Your last plan has finished.',
      }
    case 'none':
      return {
        headline: 'No active plan',
        body: 'Pick a plan and the kitchen starts cooking for you from the next working day.',
      }
  }
}
