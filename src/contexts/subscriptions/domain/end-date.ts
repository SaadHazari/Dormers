/**
 * End-date computation — TypeScript port of the canonical Notion formula
 * that drives kitchen-ops scheduling. Used by the dashboard to PREVIEW the
 * new end_date in skip/pause modals (so the user sees the consequence
 * before clicking confirm). The DB-side `compute_subscription_end_date()`
 * Postgres function is the actual source of truth — this file must stay
 * in lockstep with it.
 *
 * Source: see `before-we-focus-on-harmonic-quokka.md` for the full math
 * explanation. Summary:
 *
 *   end_date = S2 + (D − 1) + penalty + pause_days, then shifted forward
 *              if it lands on a non-delivery day.
 *
 *   • S2  = start_date, shifted forward to the next delivery day if
 *           start_date itself falls on a non-delivery day.
 *   • D   = D_base + skip_count
 *   • D_base by plan: trial=1, weekly=W, monthly=4×W (W = days/week)
 *   • penalty (extra calendar days for non-delivery days mid-cycle):
 *       − 7DAYS: 0
 *       − 6DAYS: floor(((wd2 − 1) + (D − 1)) / 6)        (1 Sun per 6 working days)
 *       − 5DAYS: 2 × floor(((wd2 − 1) + (D − 1)) / 5)    (2 weekend days per 5)
 *
 * Day-of-week convention: Notion's `day()` returns 1=Monday … 7=Sunday.
 * JavaScript's Date.getDay() returns 0=Sunday … 6=Saturday. We convert
 * inside `dowMonStart()` so the formula reads identically to Notion.
 */

export type WeekType = '5DAYS' | '6DAYS' | '7DAYS'

export type PlanKind = 'trial' | 'weekly' | 'monthly' | 'gift'

export interface ComputeEndDateInput {
  /** Calendar start date (YYYY-MM-DD or Date). Time portion ignored. */
  startDate: string | Date
  /** Plan family — drives D_base. */
  planKind: PlanKind
  /** 5DAYS = Mon–Fri; 6DAYS = Mon–Sat; 7DAYS = every day. */
  weekType: WeekType
  /** Number of skips taken so far this cycle. Each one extends D by 1. */
  skipCount?: number
  /** Total calendar days spent paused this cycle. Pure calendar shift. */
  pauseDays?: number
}

const W_BY_WEEK: Record<WeekType, number> = {
  '5DAYS': 5,
  '6DAYS': 6,
  '7DAYS': 7,
}

/** Notion-style day-of-week: 1=Mon … 7=Sun. */
function dowMonStart(d: Date): number {
  const js = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  return js === 0 ? 7 : js
}

/** True iff `dow` (1=Mon..7=Sun) is a delivery day for this week_type. */
function isDeliveryDay(dow: number, weekType: WeekType): boolean {
  if (weekType === '7DAYS') return true
  if (weekType === '6DAYS') return dow !== 7        // exclude Sunday
  return dow !== 6 && dow !== 7                     // 5DAYS — exclude Sat + Sun
}

/** Forward shift amount if start lands on a non-delivery day. */
function startShiftDays(dow: number, weekType: WeekType): number {
  if (weekType === '7DAYS') return 0
  if (weekType === '6DAYS') return dow === 7 ? 1 : 0
  // 5DAYS
  if (dow === 6) return 2
  if (dow === 7) return 1
  return 0
}

/** Same logic, applied to the computed end_date if it landed off-window. */
function endShiftDays(dow: number, weekType: WeekType): number {
  return startShiftDays(dow, weekType)
}

/** Parses a YYYY-MM-DD or Date into a UTC midnight Date — avoids TZ drift. */
function toUtcDate(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()))
  }
  // Expect YYYY-MM-DD
  const [y, m, d] = input.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Add `n` days to a UTC midnight date and return a new Date. */
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

/** Returns YYYY-MM-DD from a UTC midnight Date. */
export function isoDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Returns the canonical end_date for the given subscription parameters.
 * Always returns a UTC midnight Date — caller can `isoDate()` for the
 * YYYY-MM-DD string, or pass directly to a date input.
 */
export function computeEndDate(input: ComputeEndDateInput): Date {
  const skipCount = Math.max(0, Math.floor(input.skipCount ?? 0))
  const pauseDays = Math.max(0, Math.floor(input.pauseDays ?? 0))
  const W = W_BY_WEEK[input.weekType]

  // D_base by plan kind
  let dBase: number
  // 'gift' shares trial's 1-day math: one meal, start_date == end_date.
  // Same end-date semantics let the existing Ended-detection cron flip
  // the gift sub to status='Ended' on its delivery day without any extra
  // case-handling downstream.
  if (input.planKind === 'trial' || input.planKind === 'gift') dBase = 1
  else if (input.planKind === 'weekly') dBase = W
  else if (input.planKind === 'monthly') dBase = 4 * W
  else throw new Error(`Unknown planKind: ${input.planKind as string}`)

  const D = dBase + skipCount
  // Trial = 1 meal: end_date is the same day as start (after start-shift).
  // Without this, x = 0 and we'd still get penalty 0 — collapses correctly.

  const S = toUtcDate(input.startDate)
  const wdStart = dowMonStart(S)
  const shift = startShiftDays(wdStart, input.weekType)
  const S2 = addDays(S, shift)
  const wd2 = dowMonStart(S2)
  const x = D - 1 // forward delivery-day offset from S2

  // Calendar-day penalty for skipping non-delivery days mid-cycle
  let penalty: number
  if (input.weekType === '7DAYS') {
    penalty = 0
  } else if (input.weekType === '6DAYS') {
    penalty = Math.floor(((wd2 - 1) + x) / 6)
  } else {
    // 5DAYS
    penalty = 2 * Math.floor(((wd2 - 1) + x) / 5)
  }

  const totalDays = x + penalty
  const calculated = addDays(S2, totalDays + pauseDays)

  // If the calculated end falls on a non-delivery day, push forward to the
  // next working day so kitchen-ops always land on a delivery cadence.
  const endDow = dowMonStart(calculated)
  if (isDeliveryDay(endDow, input.weekType)) return calculated
  return addDays(calculated, endShiftDays(endDow, input.weekType))
}

/**
 * Convenience wrapper that takes Dormers' canonical plan_name string
 * (e.g. "Monthly Premium", "Weekly Flex", "One-Time Trial") and maps it
 * to the planKind the formula expects.
 */
export function planKindFromName(planName: string): PlanKind {
  const n = planName.toLowerCase()
  if (n.includes('monthly')) return 'monthly'
  if (n.includes('weekly')) return 'weekly'
  if (n.includes('trial')) return 'trial'
  throw new Error(`Cannot resolve planKind from: ${planName}`)
}
