/**
 * Whether the season break (spec §8, §9: break tick, holds, delivery guards)
 * is live. Plan A ships the planner without it, so the page must not offer
 * actions or promises that only the break can keep. Plan C flips this to
 * true in the same change that deploys the break.
 */
export const SEASON_BREAK_RELEASE_LIVE = false

/**
 * Whether customers can ask for a refund for held meals (spec D6, §10.3).
 * Plan D flips this when the owner-approved refund flow ships. Until then no
 * surface shows a refund option or promises one.
 */
export const SEASON_REFUNDS_LIVE = false
