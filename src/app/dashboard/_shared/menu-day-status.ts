// What each day on /dashboard/menu means for this customer — the one answer
// both menu trees (MenuClient on desktop, MobileMenu) and the dish sheet read.
//
// Until 2026-09-14 this lived inline in MenuClient and read only the live
// status, so the menu told customers things that were not true: a paused
// customer's past days read "Delivered", a plan that started mid-week showed
// its earlier days as delivered, a renewal held for approval claimed days as
// delivered, a paused plan near its end grew "Renew to unlock" locks on days
// the pause was about to push it into, and the day after a plan ended its
// locked cards turned back into full-colour dinners. The order below mirrors
// the dashboard's plan bar (PlanProgress) so the two never disagree about a day.
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import type { SeasonPhase } from '@/contexts/season/domain/season-phase'

export type WeekType = '5DAYS' | '6DAYS'
export type DayPosition = 'past' | 'today' | 'future'

/** The plan a menu day is read against: the live one, or — for a customer
 *  whose last plan has ended — that ended plan. */
export interface MenuPlan {
  status: string | null
  start_date: string
  end_date: string
  plan_name?: string | null
  skipped_dates?: string[] | null
  paused_dates?: string[] | null
  planned_pause_start?: string | null
  resume_cutoff_date?: string | null
  /** Skipped days whose meal became wallet credit near the season end (spec §7.2). */
  credited_skip_dates?: string[] | null
  /** Set while the plan is held for next semester (spec §6.3). */
  season_hold_id?: string | null
}

export interface MenuDayContext {
  plan: MenuPlan | null
  /** AE wall date, YYYY-MM-DD. */
  todayIso: string
  weekType: WeekType
  closureDates: readonly string[]
  /** A Scheduled renewal is queued behind the live plan. */
  hasQueuedRenewal: boolean
  /** The season phase: a held day reads differently during the break and after reopening. */
  seasonPhase?: SeasonPhase
}

export type NoDeliveryReason =
  | 'today-skipped'   // tonight: skipped, Skipped status, or resumed after the 2 PM cutoff
  | 'past-skipped'
  | 'future-skipped'
  | 'pause-start'     // first day of a scheduled pause
  | 'in-pause'        // paused now, paused on that past day, or inside a scheduled pause
  | 'closure'         // company closure — the kitchen is shut
  | 'pre-start'       // bought but not started, incl. a renewal held for approval
  | 'before-plan'     // before a started plan's first day
  | 'after-end'       // today or earlier, after the plan's last dinner
  | 'plan-ends'       // a future day after the last dinner, nothing queued — renewing unlocks it
  | 'season-held'     // held for next semester: today and every later day, until the customer restarts

const DAY_MS = 86_400_000

export function dayPosition(iso: string, todayIso: string): DayPosition {
  return iso < todayIso ? 'past' : iso === todayIso ? 'today' : 'future'
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / DAY_MS)
}

function isDeliveryWeekday(iso: string, weekType: WeekType): boolean {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay()
  return dow !== 0 && !(weekType === '5DAYS' && dow === 6)
}

/** "Tue, 15 Sep" — pinned to UTC so the server and a Dubai browser agree. */
export function formatMenuDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** "tomorrow" or "Tue, 15 Sep". */
export function deliveryDayLabel(iso: string, todayIso: string): string {
  return iso === addDays(todayIso, 1) ? 'tomorrow' : formatMenuDate(iso)
}

/** Live plans count their closures and skips toward the end date; an ended or
 *  not-yet-started plan does not. */
export function isLivePlan(plan: MenuPlan | null): boolean {
  return plan?.status === SUBSCRIPTION_STATUS.ACTIVE
    || plan?.status === SUBSCRIPTION_STATUS.PAUSED
    || plan?.status === SUBSCRIPTION_STATUS.SKIPPED
}

/**
 * Why this day's dinner does not reach the customer, or null when it does
 * (delivered / tonight / upcoming). Off days (Sundays, Saturday on a 5-day
 * week) are the caller's: they have no dinner to explain.
 */
export function classifyMenuDay(iso: string, ctx: MenuDayContext): NoDeliveryReason | null {
  const { plan, todayIso } = ctx
  if (!plan) return null
  const pos = dayPosition(iso, todayIso)

  // Held for next semester (spec §6.3): nothing is cooked from today on until
  // the customer restarts the plan. Past days keep what really happened.
  if (plan.season_hold_id && pos !== 'past') return 'season-held'

  if (plan.status === SUBSCRIPTION_STATUS.SCHEDULED) {
    // Once start_date has come and the row is still Scheduled, it is a renewal
    // held for approval: nothing is cooking on any day yet.
    if (iso < plan.start_date || plan.start_date <= todayIso) return 'pre-start'
  } else if (iso < plan.start_date) {
    return 'before-plan'
  }

  // A live pause covers today and everything after it.
  if (plan.status === SUBSCRIPTION_STATUS.PAUSED && pos !== 'past') return 'in-pause'

  const skipped = (plan.skipped_dates ?? []).includes(iso)
  if (pos === 'today' && (skipped || plan.status === SUBSCRIPTION_STATUS.SKIPPED || plan.resume_cutoff_date === todayIso)) {
    return 'today-skipped'
  }
  if (skipped) return pos === 'past' ? 'past-skipped' : 'future-skipped'

  // Days the pause tick recorded — still true after the customer resumes.
  if ((plan.paused_dates ?? []).includes(iso)) return 'in-pause'

  // A scheduled pause has no end date: every day from its start is covered,
  // including days past today's end_date (the pause will push it out).
  if (plan.planned_pause_start && pos !== 'past' && iso >= plan.planned_pause_start) {
    return iso === plan.planned_pause_start ? 'pause-start' : 'in-pause'
  }

  if (ctx.closureDates.includes(iso)) return 'closure'

  if (iso > plan.end_date) {
    if (pos !== 'future') return 'after-end'
    if (!ctx.hasQueuedRenewal) return 'plan-ends'
  }
  return null
}

/** The next day a dinner actually reaches the customer, or null when none is
 *  coming (paused, plan over with nothing queued, no plan). */
export function nextDeliveryIso(ctx: MenuDayContext): string | null {
  if (!ctx.plan) return null
  let iso = ctx.todayIso
  for (let i = 0; i < 28; i++) {
    iso = addDays(iso, 1)
    if (!isDeliveryWeekday(iso, ctx.weekType)) continue
    const reason = classifyMenuDay(iso, ctx)
    if (reason === null) return iso
    if (reason === 'plan-ends') return null
  }
  return null
}

/**
 * The thin "last dinner" line above This week: a delivering plan whose last
 * dinner is 1–7 days away with nothing queued. Tonight's last dinner is the
 * top card's to say; a paused plan, or one with a pause scheduled, has an end
 * date that is still going to move.
 */
export function planEndingNotice(ctx: MenuDayContext): { lastDinnerIso: string; daysAway: number } | null {
  const p = ctx.plan
  if (!p || ctx.hasQueuedRenewal || p.planned_pause_start) return null
  if (p.status !== SUBSCRIPTION_STATUS.ACTIVE && p.status !== SUBSCRIPTION_STATUS.SKIPPED) return null
  const daysAway = daysBetween(ctx.todayIso, p.end_date)
  if (daysAway < 1 || daysAway > 7) return null
  return { lastDinnerIso: p.end_date, daysAway }
}

/**
 * The one day that says "Last dinner": the plan's end date, once that date is
 * settled — the plan is delivering or finished, no pause is scheduled to push
 * it out, and no renewal carries on after it. The days after a finished plan
 * never repeat it; there was only one end date.
 */
export function lastDinnerIso(ctx: MenuDayContext): string | null {
  const p = ctx.plan
  if (!p || ctx.hasQueuedRenewal || p.planned_pause_start) return null
  const settled = p.status === SUBSCRIPTION_STATUS.ACTIVE
    || p.status === SUBSCRIPTION_STATUS.SKIPPED
    || p.status === SUBSCRIPTION_STATUS.ENDED
  return settled ? p.end_date : null
}

/**
 * What the menu's Renew controls do. Same gates, same words and same link as
 * the dashboard's plan card (PlanProgress): the season pause hides renewing
 * altogether, an out-of-zone dorm or an unfinished profile greys it out.
 */
export type RenewGate =
  | { kind: 'open'; href: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'season'; note: string }

export function renewGateFor(opts: {
  planName: string | null | undefined
  intakePaused: boolean
  outOfZone: boolean
  profileIncomplete: boolean
}): RenewGate {
  if (opts.intakePaused) return { kind: 'season', note: "New plans are closed over the semester break — we'll message you when they reopen." }
  if (opts.outOfZone) return { kind: 'blocked', reason: 'Outside delivery radius — message us on WhatsApp' }
  if (opts.profileIncomplete) return { kind: 'blocked', reason: 'Complete your profile first' }
  return {
    kind: 'open',
    href: opts.planName ? `/dashboard/explore-plans?plan=${encodeURIComponent(opts.planName)}` : '/dashboard/explore-plans',
  }
}

/**
 * The line on the dish sheet saying why this dinner won't come. `renew` tells
 * the days after the plan apart: semester break (why, and what happens next),
 * renewal on hold (what's holding it), or simply renewable.
 */
/** A skipped day paid back as wallet credit, not with a make-up day. */
function creditedOn(plan: MenuPlan | null, iso: string): boolean {
  return (plan?.credited_skip_dates ?? []).includes(iso)
}

export function noDeliveryNote(reason: NoDeliveryReason, iso: string, ctx: MenuDayContext, renew?: RenewGate): string {
  const p = ctx.plan
  switch (reason) {
    case 'today-skipped':
      if (p?.resume_cutoff_date === ctx.todayIso) {
        return "You resumed after the 2 PM kitchen cutoff, so this dinner isn't coming tonight. The day moves to the end of your plan."
      }
      return creditedOn(p, iso)
        ? "You skipped tonight. There was no delivery day left before the semester wraps up, so this meal's value went to your wallet."
        : "You skipped tonight, so this dinner won't come to you. The day is added to the end of your plan."
    case 'past-skipped':
      return creditedOn(p, iso) ? 'You skipped this day, and its value went to your wallet.' : 'You skipped this day.'
    case 'future-skipped':
      return creditedOn(p, iso)
        ? "You've scheduled a skip for this day. There's no delivery day left before the semester wraps up to move it to, so its value goes to your wallet."
        : "You've scheduled a skip for this day, so this dinner won't come to you. The day is added to the end of your plan."
    case 'pause-start':
      return "Your pause begins this day, so this dinner won't come to you."
    case 'in-pause':
      return dayPosition(iso, ctx.todayIso) === 'past'
        ? 'You were paused this day.'
        : "You're paused, so this dinner won't come to you."
    case 'closure':
      return isLivePlan(p)
        ? 'The kitchen is closed this day. It is added to the end of your plan, so nothing is lost.'
        : 'The kitchen is closed this day.'
    case 'pre-start':
      return p && p.start_date > ctx.todayIso
        ? `Your plan starts ${formatMenuDate(p.start_date)}, after this day.`
        : "Your plan hasn't started yet."
    case 'before-plan':
      return 'This day was before your plan started.'
    case 'after-end':
      return 'Your plan had ended by this day.'
    case 'season-held':
      if (ctx.seasonPhase === 'break') return 'The kitchen is closed between semesters. Your meals are kept for you, so nothing is lost.'
      return p?.status === SUBSCRIPTION_STATUS.SCHEDULED
        ? 'Your meals are ready. Pick your start date on your plan page and your dinners begin.'
        : 'Your meals are ready. Resume your plan and this dinner comes to you.'
    case 'plan-ends':
      if (renew?.kind === 'season' && p) {
        const tense = p.end_date < ctx.todayIso ? 'was' : 'is'
        return `Dormers is on its semester break, so new plans are closed and this dinner isn't cooked for you. Your plan's last dinner ${tense} ${formatMenuDate(p.end_date)}. We'll message you as soon as plans reopen.`
      }
      if (renew?.kind === 'blocked') {
        return `This day comes after your plan's last dinner. Renewing unlocks it, but renewal is on hold: ${renew.reason}.`
      }
      return "This day comes after your plan's last dinner."
  }
}
