/**
 * Pure copy rules for PlanEndingPausedBanner, extracted so the two places
 * the banner can misspeak are unit-testable without a DOM (vitest runs in
 * the `node` environment here — same reasoning as intake-join-outcome.ts):
 *
 *  1. The headline grammar on the last two days. The banner renders for
 *     daysRemaining 0..7, and "Your plan ends in 0 days" shipped once.
 *  2. The button's credit tag. The prospective per-preference amount can be
 *     zero (admin-configurable), and "Save my spot · AED 0 credit" must
 *     never render — the tag is dropped entirely instead.
 */

export interface PlanEndingHeadline {
  /** Unemphasized lead-in, rendered before the emphasized span. Carries its
   *  own trailing space when the emphasis is a separate word. */
  lead: string
  /** The emphasized (OG_DEEP, extra-bold) portion. The period after it is
   *  rendered by the component, not included here. */
  emphasis: string
}

export function planEndingHeadline(daysRemaining: number): PlanEndingHeadline {
  if (daysRemaining <= 0) return { lead: 'Your plan ends ', emphasis: 'today' }
  if (daysRemaining === 1) return { lead: 'Your plan ends ', emphasis: 'tomorrow' }
  return { lead: 'Your plan ends in ', emphasis: `${daysRemaining} days` }
}

/**
 * Button label with the reward attached at the point of action. The tag only
 * renders for a real positive amount — `creditAed` here is the PROSPECTIVE
 * per-preference amount from intake_settings (a promise, not a balance), so
 * zero/negative means "no credit configured", not "failed mint".
 */
export function saveSpotButtonLabel(creditAed: number): string {
  if (creditAed > 0) return `Save my spot · AED ${creditAed} credit`
  return 'Save my spot'
}
