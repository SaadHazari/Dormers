// The small label a greyed-out menu day wears, shared by the desktop grid
// (MenuClient) and the mobile cards (MobileMenu). The two trees each kept
// their own copy of this table; they drifted once already.
import { Moon, Lock, Clock, UtensilsCrossed } from 'lucide-react'
import type { NoDeliveryReason } from './menu-day-status'

export interface ReasonChip {
  Icon: typeof Moon
  label: string
  color: string
}

const SKIP = 'rgba(140,110,60,0.78)'
const PAUSE = 'rgba(30,58,79,0.76)'
const PLAN = 'rgba(90,84,72,0.80)'

/**
 * `renewOpen` decides the after-the-plan label: "Renew to unlock" only when
 * renewing is actually possible right now (not during the season pause, not
 * for an out-of-zone dorm or an unfinished profile).
 */
export function reasonChip(reason: NoDeliveryReason, renewOpen: boolean): ReasonChip {
  switch (reason) {
    case 'today-skipped':  return { Icon: Moon, label: 'Not tonight', color: SKIP }
    case 'past-skipped':
    case 'future-skipped': return { Icon: Moon, label: 'Skipped', color: SKIP }
    case 'pause-start':    return { Icon: Moon, label: 'Pause begins', color: PAUSE }
    case 'in-pause':       return { Icon: Moon, label: 'Paused', color: PAUSE }
    case 'closure':        return { Icon: UtensilsCrossed, label: 'Kitchen closed', color: 'rgba(9,24,37,0.80)' }
    case 'pre-start':      return { Icon: Clock, label: 'Starts soon', color: 'rgba(29,95,163,0.70)' }
    case 'before-plan':    return { Icon: Clock, label: 'Before your plan', color: PLAN }
    // A day already gone: renewing can't bring it back, so no lock.
    case 'after-end':      return { Icon: Moon, label: 'Plan ended', color: PLAN }
    case 'plan-ends':      return renewOpen
      ? { Icon: Lock, label: 'Renew to unlock', color: PLAN }
      : { Icon: Moon, label: 'After your plan', color: PLAN }
  }
}

/** Grey card surface + photo filter for any day whose dinner won't reach the customer. */
export const GREY_CARD_BG = 'rgba(225,220,210,0.62)'
export const GREY_PHOTO_FILTER = 'grayscale(1) brightness(0.92)'
