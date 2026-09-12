// One countdown for the monthly wrap, wherever it is shown.
//
// The strip, the mobile home tile, the sidebar "Now" tray and the empty
// banner each computed their own chip from the same window and disagreed:
// four days before the cycle ended, desktop said "4d to end" while the phone
// said "11d left to earn" (7 − (−4)), and the phone had no "Last day" branch.
import {
  MONTHLY_REWARD_AED,
  MONTHLY_LATE_REWARD_AED,
  MONTHLY_FULL_REWARD_WINDOW_DAYS,
  type MonthlyReviewWindow,
} from '@/contexts/subscriptions/domain/monthly-review'

export interface WrapCountdown {
  /** Cycle hasn't ended yet — the wrap opened early. */
  isPreEnd: boolean
  /** Final day of the full-reward window. */
  isLastDay: boolean
  /** Past the full-reward window — the late (reduced) reward applies. */
  isLate: boolean
  /** "4d to end" · "3d left" · "Last day" · "9d late" */
  chip: string
  /** AED the customer earns if they wrap now. */
  reward: number
}

export function wrapCountdown(
  w: Pick<MonthlyReviewWindow, 'daysSinceCycleEnd' | 'daysLeftForFullReward'>,
): WrapCountdown {
  const isPreEnd = w.daysSinceCycleEnd < 0
  const isLate = w.daysSinceCycleEnd > MONTHLY_FULL_REWARD_WINDOW_DAYS
  const isLastDay = !isPreEnd && !isLate && w.daysLeftForFullReward === 0
  const chip = isLate
    ? `${w.daysSinceCycleEnd}d late`
    : isPreEnd
      ? `${-w.daysSinceCycleEnd}d to end`
      : isLastDay
        ? 'Last day'
        : `${w.daysLeftForFullReward}d left`
  return { isPreEnd, isLastDay, isLate, chip, reward: isLate ? MONTHLY_LATE_REWARD_AED : MONTHLY_REWARD_AED }
}
