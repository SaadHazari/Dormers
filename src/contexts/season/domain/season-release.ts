/**
 * Whether the season break (spec §8, §9: break tick, holds, delivery guards)
 * is live. Plan A ships the planner without it, so the page must not offer
 * actions or promises that only the break can keep. Plan C turned this on
 * together with the cron job that starts the break (migration season_break_cron).
 */
export const SEASON_BREAK_RELEASE_LIVE = true

/**
 * Whether customers can ask for a refund for held meals (spec D6, §10.3).
 * Plan D turned this on with the owner-approved flow: request on the hold
 * card, WhatsApp to the owner, Approve or Decline on the Season page, Stripe
 * refund with a hold-scoped idempotency key (migration season_refunds).
 */
export const SEASON_REFUNDS_LIVE = true
