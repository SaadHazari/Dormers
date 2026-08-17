/**
 * What do we tell a customer whose plan just ended while intake is paused?
 *
 * The standard subscription-ended fan-out is wrong during a pause on both
 * channels: its WhatsApp template and its email both drive at a renewal, and
 * renewal checkout refuses the customer for as long as the switch is on. Left
 * alone it promises something we will not sell them.
 *
 * Both channels get a season version. Email swaps template
 * (docs/email-templates/season-plan-ended.html); WhatsApp swaps to one of two
 * season templates, because a WhatsApp template cannot carry the email's
 * either/or block and so needs one template per audience.
 *
 * WhatsApp additionally depends on something outside this repo: Meta must have
 * approved the template and the matching `tpl_<kind>` secret must exist in
 * Vault. `seasonWhatsAppReady` is that switch, and it defaults to NOT ready —
 * until it is turned on the row is closed out rather than queued, which is
 * strictly safer than queueing something the dispatcher cannot render.
 *
 * Pure on purpose: the rule is the part worth testing, and it should not need
 * Supabase, ZeptoMail or a pause in production to exercise.
 */

/**
 * Where the season email's button lands.
 *
 * Deliberately NOT /dashboard/plan?renew=1 — that opens a renewal flow that
 * cannot complete while intake is paused, which is exactly the broken promise
 * this whole module exists to prevent. The dashboard home carries the Credit
 * Wallet and the pause takeover, so it serves both audiences.
 */
export const SEASON_CTA_URL = 'https://dormers.ae/dashboard'

/** Which of the template's two mutually exclusive blocks to render. */
export type SeasonEmail = {
  variant: 'season'
  /** 'credit' fills credit_aed, 'offer' fills offer_aed. Never both — the
   *  template treats an empty string as truthy, so the unused key must be
   *  omitted entirely by the sender. */
  block: 'credit' | 'offer'
  aed: number
  ctaLabel: string
  ctaUrl: string
}

/** One Meta template per audience — a WhatsApp template has no conditionals. */
export type SeasonWhatsAppKind = 'intake_ended_credit' | 'intake_ended_offer'

export type WhatsAppPlan =
  /** Normal `subscription_ended` template. */
  | { mode: 'send' }
  /** Paused, but the season templates are not live yet. Row closed out. */
  | { mode: 'skip' }
  /** Paused and ready — queue the matching season template. */
  | { mode: 'season'; kind: SeasonWhatsAppKind; aed: number }

export type EndedNotice = {
  whatsapp: WhatsAppPlan
  email: { variant: 'normal' } | SeasonEmail
}

export interface EndedNoticeInput {
  /** getIntakeState().paused */
  paused: boolean
  /** getWaitlistStatus().unspentCreditAed — money actually sitting in the
   *  wallet right now, across all cycles. Not "did they ever join". */
  unspentCreditAed: number
  /** creditAedFor(state, mealPreferenceType) — what we would give them if
   *  they saved a spot today. Only used when the wallet is empty. */
  offerAed: number
  /** Are BOTH season templates approved at Meta and present in Vault? Defaults
   *  to false. Queueing a kind the dispatcher cannot render is the one failure
   *  we will not risk, so this fails closed: unset means skip, never send. */
  seasonWhatsAppReady?: boolean
}

const WHATSAPP_KIND: Record<'credit' | 'offer', SeasonWhatsAppKind> = {
  credit: 'intake_ended_credit',
  offer: 'intake_ended_offer',
}

/**
 * Decide both channels for one ended subscription.
 *
 * The credit-versus-offer split keys on the balance rather than on waitlist
 * membership so the email can never claim money that is not there: someone
 * who joined an earlier cycle and already redeemed holds nothing, and gets
 * offered a fresh credit instead of being told to go look at an empty wallet.
 */
export function resolveEndedNotice(input: EndedNoticeInput): EndedNotice {
  if (!input.paused) {
    // Intake is open. An unspent credit is not a reason to divert them — they
    // can renew right now and it comes off that renewal at checkout.
    return { whatsapp: { mode: 'send' }, email: { variant: 'normal' } }
  }

  // Guard the balance rather than trusting it. PostgREST returns numerics as
  // strings, so a coercion slip upstream surfaces as NaN, and NaN > 0 is false
  // anyway — being explicit keeps "Your AED NaN is waiting" impossible rather
  // than accidentally impossible.
  const held = Number.isFinite(input.unspentCreditAed) ? input.unspentCreditAed : 0

  const email: SeasonEmail =
    held > 0
      ? { variant: 'season', block: 'credit', aed: held, ctaLabel: 'See my wallet', ctaUrl: SEASON_CTA_URL }
      : { variant: 'season', block: 'offer', aed: input.offerAed, ctaLabel: 'Save my spot', ctaUrl: SEASON_CTA_URL }

  // Both channels tell the same story to the same person, so WhatsApp follows
  // the block the email already chose rather than deciding again.
  const whatsapp: WhatsAppPlan = input.seasonWhatsAppReady
    ? { mode: 'season', kind: WHATSAPP_KIND[email.block], aed: email.aed }
    : { mode: 'skip' }

  return { whatsapp, email }
}
