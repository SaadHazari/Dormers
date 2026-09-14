// The small label a menu day wears, shared by the desktop grid (MenuClient)
// and the mobile cards (MobileMenu). The two trees each kept their own copy
// of this table; they drifted once already.
import { Moon, Lock, Clock, Check, Sparkles, UtensilsCrossed } from 'lucide-react'
import { OG } from './tokens'
import type { DayPosition, NoDeliveryReason, RenewGate } from './menu-day-status'

export interface ReasonChip {
  Icon: typeof Moon
  label: string
  color: string
}

const SKIP = 'rgba(140,110,60,0.78)'
const PAUSE = 'rgba(30,58,79,0.76)'
const PLAN = 'rgba(90,84,72,0.80)'

/**
 * `renewKind` decides the days after the plan: during the semester break new
 * plans are closed, so they read "Semester break" with no lock; otherwise
 * renewing unlocks them — even while a profile or dorm check holds it back
 * (tapping then says what is holding it).
 */
export function reasonChip(reason: NoDeliveryReason, renewKind: RenewGate['kind']): ReasonChip {
  switch (reason) {
    case 'today-skipped':  return { Icon: Moon, label: 'Not tonight', color: SKIP }
    case 'past-skipped':
    case 'future-skipped': return { Icon: Moon, label: 'Skipped', color: SKIP }
    case 'pause-start':    return { Icon: Moon, label: 'Pause begins', color: PAUSE }
    case 'in-pause':       return { Icon: Moon, label: 'Paused', color: PAUSE }
    case 'closure':        return { Icon: UtensilsCrossed, label: 'Kitchen closed', color: 'rgba(9,24,37,0.80)' }
    case 'pre-start':      return { Icon: Clock, label: 'Starts soon', color: 'rgba(29,95,163,0.70)' }
    case 'before-plan':    return { Icon: Clock, label: 'Before your plan', color: PLAN }
    // Days after a finished plan, up to today. The plan ended once — on its
    // last dinner's card — so these don't repeat "Plan ended".
    case 'after-end':      return { Icon: Moon, label: 'No plan', color: PLAN }
    case 'plan-ends':      return renewKind === 'season'
      ? { Icon: Moon, label: 'Semester break', color: PAUSE }
      : { Icon: Lock, label: 'Renew to unlock', color: PLAN }
  }
}

/** The plan's end date — the one card that says "Last dinner", in its day's own colour. */
export function lastDinnerChip(position: DayPosition): ReasonChip {
  if (position === 'past') return { Icon: Check, label: 'Last dinner', color: 'rgba(29,138,48,0.80)' }
  if (position === 'today') return { Icon: Sparkles, label: 'Last dinner', color: OG }
  return { Icon: Clock, label: 'Last dinner', color: 'rgba(29,95,163,0.70)' }
}

/** Grey card surface + photo filter for any day whose dinner won't reach the customer. */
export const GREY_CARD_BG = 'rgba(225,220,210,0.62)'
export const GREY_PHOTO_FILTER = 'grayscale(1) brightness(0.92)'
