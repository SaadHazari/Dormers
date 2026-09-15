/**
 * Every season message to a customer (spec §12.2, §12.4): the email words and
 * the WhatsApp template parameters for each kind, from the facts stored on
 * the season_notices row at queue time. Pure, so vitest reads every line.
 *
 * Rules (spec §12.1): plain words, no emoji, no dashes, the customer's own
 * dates and amounts. WhatsApp and email tell the same story.
 */

import { formatShortDay } from './season-dates'

export type SeasonNoticeKind =
  | 'season_plan_runs_past'
  | 'season_last_dinners'
  | 'season_plan_held'
  | 'season_pause_carries'
  | 'season_plan_ready'
  | 'season_credit_waiting'

export const SEASON_NOTICE_KINDS: readonly SeasonNoticeKind[] = [
  'season_plan_runs_past', 'season_last_dinners', 'season_plan_held', 'season_pause_carries', 'season_plan_ready', 'season_credit_waiting',
]

export const DASHBOARD_URL = 'https://dormers.ae/dashboard'
export const WALLET_URL = 'https://dormers.ae/dashboard/credit'

export interface SeasonNoticePayload {
  plan_name?: string
  wrap_up_day?: string
  last_dinner?: string | null
  held_meals?: number | string
  credit_aed?: number | string
  offer_aed?: number | string
}

export interface SeasonEmail {
  subject: string
  bodyText: string
  cta: { label: string; url: string } | null
}

/** "20" or "19.80": the way a customer reads an amount. */
export function aedText(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

function meals(n: number | string | undefined): string {
  const count = Math.max(0, Number(n ?? 0))
  return `${count} ${count === 1 ? 'meal' : 'meals'}`
}

function day(iso: string | null | undefined): string {
  return iso ? formatShortDay(iso.slice(0, 10)) : 'the wrap-up day'
}

/** The email for one notice. Null when the kind has no email (none today). */
export function seasonEmailFor(kind: SeasonNoticeKind, p: SeasonNoticePayload): SeasonEmail {
  const credit = Number(p.credit_aed ?? 0)
  const offer = Number(p.offer_aed ?? 0)
  const plan = p.plan_name || 'plan'
  switch (kind) {
    case 'season_plan_runs_past':
      return {
        subject: `The semester wraps up on ${day(p.wrap_up_day)}`,
        bodyText:
          `The semester wraps up on ${day(p.wrap_up_day)}, and your dinners keep coming until then.\n\n` +
          `Your last ${meals(p.held_meals)} of ${plan} will be kept for next semester` +
          (credit > 0 ? `, with AED ${aedText(credit)} in your wallet for your next Monthly plan.` : '.') +
          ` If you'd rather have your money back, you can ask for a refund for those meals once the break starts, from your home page.`,
        cta: { label: 'See my options', url: DASHBOARD_URL },
      }
    case 'season_last_dinners':
      return {
        subject: 'Your last dinners of the semester',
        bodyText:
          `Your ${plan} finishes on ${day(p.last_dinner)}. The semester wraps up on ${day(p.wrap_up_day)}, so no new plan fits in before the break.\n\n` +
          (offer > 0
            ? `Save your spot for next semester and AED ${aedText(offer)} goes to your wallet the moment you do. It does not expire, and we'll message you the day the kitchen is back.`
            : `Save your spot for next semester and we'll message you the day the kitchen is back.`),
        cta: { label: 'Save my spot', url: DASHBOARD_URL },
      }
    case 'season_plan_held':
      return {
        subject: 'Your meals are kept for next semester',
        bodyText:
          `The kitchen is closed between semesters, so your last ${meals(p.held_meals)} of ${plan} are kept for you.` +
          (credit > 0 ? ` AED ${aedText(credit)} is in your wallet too.` : '') +
          `\n\nWhen we're back, tap Resume and your dinners start again. If you'd rather have your money back, you can ask for a refund for those meals from your home page.`,
        cta: { label: 'See my options', url: DASHBOARD_URL },
      }
    case 'season_pause_carries':
      return {
        subject: 'Your plan waits for you',
        bodyText:
          `Your ${plan} is still paused, and the kitchen is now closed between semesters. Your meals wait for you, so resume when we're back.` +
          (offer > 0 ? `\n\nSave your spot for next semester now and AED ${aedText(offer)} goes to your wallet.` : ''),
        cta: { label: 'Save my spot', url: DASHBOARD_URL },
      }
    case 'season_plan_ready':
      return {
        subject: "We're back. Your meals are ready",
        bodyText:
          `The kitchen is open again. Your ${meals(p.held_meals)} of ${plan} ${Number(p.held_meals ?? 0) === 1 ? 'is' : 'are'} ready.` +
          (credit > 0 ? ` AED ${aedText(credit)} is still in your wallet for your next Monthly plan.` : '') +
          `\n\nTap Resume on your home page when you're ready, and your dinners start again. Nothing restarts on its own.`,
        cta: { label: 'Resume my plan', url: DASHBOARD_URL },
      }
    case 'season_credit_waiting':
      return {
        subject: `AED ${aedText(credit)} is waiting in your wallet`,
        bodyText:
          `We reopened a few days ago, and AED ${aedText(credit)} is still sitting in your wallet from last semester. It comes off your next Monthly plan at checkout and does not expire.`,
        cta: { label: 'Pick my plan', url: 'https://dormers.ae/dashboard/plan' },
      }
  }
}

/**
 * The WhatsApp payload the dispatcher reads for this kind (spec §12.4). Dates
 * stay ISO: dispatch_customer_notifications_tick formats them.
 */
export function seasonWhatsAppPayload(kind: SeasonNoticeKind, p: SeasonNoticePayload): Record<string, string> {
  switch (kind) {
    case 'season_plan_runs_past':
      return { wrap_up_day: p.wrap_up_day ?? '', held_meals: String(p.held_meals ?? 0), credit_aed: aedText(p.credit_aed) }
    case 'season_last_dinners':
      return { last_dinner: p.last_dinner ?? '', wrap_up_day: p.wrap_up_day ?? '', offer_aed: aedText(p.offer_aed) }
    case 'season_plan_held':
      return { plan_name: p.plan_name ?? 'plan', held_meals: String(p.held_meals ?? 0), credit_aed: aedText(p.credit_aed) }
    case 'season_pause_carries':
      return { plan_name: p.plan_name ?? 'plan', offer_aed: aedText(p.offer_aed) }
    case 'season_plan_ready':
      return { held_meals: String(p.held_meals ?? 0), plan_name: p.plan_name ?? 'plan' }
    case 'season_credit_waiting':
      return { credit_aed: aedText(p.credit_aed) }
  }
}

/** A WhatsApp template with an amount of 0 would read wrong; those go by email only. */
export function seasonWhatsAppWanted(kind: SeasonNoticeKind, p: SeasonNoticePayload): boolean {
  if (kind === 'season_plan_runs_past' || kind === 'season_plan_held') return Number(p.credit_aed ?? 0) > 0
  if (kind === 'season_last_dinners' || kind === 'season_pause_carries') return Number(p.offer_aed ?? 0) > 0
  if (kind === 'season_credit_waiting') return Number(p.credit_aed ?? 0) > 0
  return true
}

export function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'there'
}
