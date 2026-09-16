/**
 * Every season message to a customer (spec §12.2, §12.4): which ZeptoMail
 * template a fact uses, and the merge fields it carries; the same for the
 * WhatsApp templates. Pure, so vitest reads every line.
 *
 * The words live in ZeptoMail (docs/email-templates/season-*.html), one
 * template per moment, so delivery is tracked per template in the ZeptoMail
 * dashboard. Nothing here renders copy: this module decides which template
 * and with what numbers.
 *
 * Rules (spec §12.1): plain words, no emoji, no dashes, the customer's own
 * dates and amounts. WhatsApp and email tell the same story.
 */

import { formatShortDay } from './season-dates'

/** The kinds the season_notices outbox queues. */
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

/** Outbox kinds plus the two sent the moment they happen. */
export type SeasonEmailKind = SeasonNoticeKind | 'season_spot_saved' | 'season_refund_declined'

export interface SeasonNoticePayload {
  plan_name?: string
  wrap_up_day?: string
  last_dinner?: string | null
  held_meals?: number | string
  credit_aed?: number | string
  offer_aed?: number | string
  /** The owner's own words on a declined refund (N13b). */
  reason?: string
  /** Whether a refund is really on offer, so an email never promises one the dashboard hides. */
  can_refund?: boolean
}

export interface SeasonEmailTemplate {
  /** The template's name in ZeptoMail, matching its file in docs/email-templates/. */
  name: string
  /** The environment variable holding that template's ZeptoMail key. */
  envKey: string
  /** merge_info for the send. first_name is added by the sender. */
  mergeInfo: Record<string, string>
}

/** One template per moment, so ZeptoMail reports delivery per moment. */
export const SEASON_EMAIL_TEMPLATES: Record<SeasonEmailKind, { name: string; envKey: string }> = {
  season_plan_runs_past: { name: 'season-plan-runs-past', envKey: 'ZEPTOMAIL_TPL_SEASON_PLAN_RUNS_PAST' },
  season_last_dinners: { name: 'season-last-dinners', envKey: 'ZEPTOMAIL_TPL_SEASON_LAST_DINNERS' },
  season_plan_held: { name: 'season-plan-held', envKey: 'ZEPTOMAIL_TPL_SEASON_PLAN_HELD' },
  season_pause_carries: { name: 'season-pause-carries', envKey: 'ZEPTOMAIL_TPL_SEASON_PAUSE_CARRIES' },
  season_plan_ready: { name: 'season-plan-ready', envKey: 'ZEPTOMAIL_TPL_SEASON_PLAN_READY' },
  season_credit_waiting: { name: 'season-credit-waiting', envKey: 'ZEPTOMAIL_TPL_SEASON_CREDIT_WAITING' },
  season_spot_saved: { name: 'season-spot-saved', envKey: 'ZEPTOMAIL_TPL_SEASON_SPOT_SAVED' },
  season_refund_declined: { name: 'season-refund-declined', envKey: 'ZEPTOMAIL_TPL_SEASON_REFUND_DECLINED' },
}

/** "20" or "19.80": the way a customer reads an amount. */
export function aedText(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'there'
}

function meals(n: number | string | undefined): string {
  return String(Math.max(0, Number(n ?? 0)))
}

function day(iso: string | null | undefined): string {
  return iso ? formatShortDay(iso.slice(0, 10)) : ''
}

/**
 * An optional amount is left out entirely when it is zero: ZeptoMail's
 * Mustache treats an empty string as true, so a key that is present at all
 * renders its block (EMAIL-DESIGN.md, trap 2).
 */
function amount(key: string, value: number | string | undefined): Record<string, string> {
  return Number(value ?? 0) > 0 ? { [key]: aedText(value) } : {}
}

/** Same omit-to-hide rule as an amount: the refund block only renders when a refund is really on offer. */
function refundable(p: SeasonNoticePayload): Record<string, string> {
  return p.can_refund ? { can_refund: 'yes' } : {}
}

/** The template and merge fields for one fact. */
export function seasonEmailTemplateFor(kind: SeasonEmailKind, p: SeasonNoticePayload): SeasonEmailTemplate {
  const template = SEASON_EMAIL_TEMPLATES[kind]
  const plan = p.plan_name || 'plan'
  const mergeInfo = ((): Record<string, string> => {
    switch (kind) {
      case 'season_plan_runs_past':
        return { wrap_up_day: day(p.wrap_up_day), held_meals: meals(p.held_meals), ...amount('credit_aed', p.credit_aed), ...refundable(p) }
      case 'season_last_dinners':
        return { last_dinner: day(p.last_dinner), wrap_up_day: day(p.wrap_up_day), ...amount('offer_aed', p.offer_aed) }
      case 'season_plan_held':
        return { plan_name: plan, held_meals: meals(p.held_meals), ...amount('credit_aed', p.credit_aed), ...refundable(p) }
      case 'season_pause_carries':
        return { plan_name: plan, ...amount('offer_aed', p.offer_aed), ...refundable(p) }
      case 'season_plan_ready':
        return { plan_name: plan, held_meals: meals(p.held_meals), ...amount('credit_aed', p.credit_aed) }
      case 'season_credit_waiting':
        return { credit_aed: aedText(p.credit_aed) }
      case 'season_spot_saved':
        return { credit_aed: aedText(p.credit_aed) }
      case 'season_refund_declined':
        return { plan_name: plan, held_meals: meals(p.held_meals), reason: (p.reason ?? '').trim() }
    }
  })()
  return { ...template, mergeInfo }
}

/**
 * The WhatsApp payload the dispatcher reads for this kind (spec §12.4). Dates
 * stay ISO: dispatch_customer_notifications_tick formats them.
 */
export function seasonWhatsAppPayload(kind: SeasonNoticeKind, p: SeasonNoticePayload): Record<string, string> {
  switch (kind) {
    case 'season_plan_runs_past':
      return { wrap_up_day: p.wrap_up_day ?? '', held_meals: meals(p.held_meals), credit_aed: aedText(p.credit_aed) }
    case 'season_last_dinners':
      return { last_dinner: p.last_dinner ?? '', wrap_up_day: p.wrap_up_day ?? '', offer_aed: aedText(p.offer_aed) }
    case 'season_plan_held':
      return { plan_name: p.plan_name ?? 'plan', held_meals: meals(p.held_meals), credit_aed: aedText(p.credit_aed) }
    case 'season_pause_carries':
      return { plan_name: p.plan_name ?? 'plan', offer_aed: aedText(p.offer_aed) }
    case 'season_plan_ready':
      return { held_meals: meals(p.held_meals), plan_name: p.plan_name ?? 'plan' }
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
