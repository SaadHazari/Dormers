// The menu's Today spotlight when nothing is arriving tonight.
//
// Paused, scheduled and plan-less customers used to get the full dinner
// ticket — TONIGHT badge, macros, "View dish" — with only a small truck line
// admitting there was no delivery, while the grid card right below labelled
// the same dish "Paused". Both trees now render one status card instead
// (same family as the resumed-after-cutoff "No delivery tonight" card), and
// this file is the one place its words live.
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'

export type SpotlightStatusKind = 'paused' | 'scheduled' | 'none'

/** null → the dinner ticket renders (Active, or Skipped — the customer chose that). */
export function spotlightStatusKind(subStatus: string | null): SpotlightStatusKind | null {
  if (subStatus === SUBSCRIPTION_STATUS.ACTIVE || subStatus === SUBSCRIPTION_STATUS.SKIPPED) return null
  if (subStatus === SUBSCRIPTION_STATUS.PAUSED) return 'paused'
  if (subStatus === SUBSCRIPTION_STATUS.SCHEDULED) return 'scheduled'
  return 'none'
}

function fmtStart(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Headline carries no trailing period — the card adds the brand orange one. */
export function spotlightStatusCopy(kind: SpotlightStatusKind, startsOn: string | null): { headline: string; body: string } {
  switch (kind) {
    case 'paused':
      return {
        headline: 'Plan paused',
        body: "Nothing's cooking for you while you're paused. Resume from your dashboard and deliveries pick up the next working day.",
      }
    case 'scheduled':
      return startsOn
        ? { headline: `Starts ${fmtStart(startsOn)}`, body: `Your first delivery is ${fmtStart(startsOn)}, 7–8 PM. Until then the kitchen isn't cooking for you.` }
        : { headline: 'Starts soon', body: 'Your first delivery lands the evening your plan begins, 7–8 PM, at your door.' }
    case 'none':
      return {
        headline: 'No active plan',
        body: 'Pick a plan and the kitchen starts cooking for you from the next working day.',
      }
  }
}
