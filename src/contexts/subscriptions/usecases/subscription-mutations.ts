'use server';

/**
 * Subscriptions context — mutations use-case.
 *
 * Eight server actions on the LIVE subscription. Carved out of the dashboard's
 * actions.ts god-file in Phase D of the layered refactor.
 *
 *   • pauseSubscription       — flip Active → Paused immediately
 *   • resumeSubscription      — flip Paused → Active
 *   • changeStartDate         — reschedule a Scheduled sub (once-per-sub)
 *   • skipMeal                — same-day skip (before 14:00 AE cutoff)
 *   • skipFutureDate          — schedule a skip for a future date
 *   • unskipFutureDate        — reverse a scheduled future skip
 *   • planPause               — schedule a future open-ended pause
 *   • cancelPlannedPause      — cancel before activation, refunds credit
 *
 * All eight share the load/validate/mutate/notify/revalidate skeleton. They
 * live together as one deep module per L2-MODULE-SHAPES.md (#2 Subscriptions).
 */

import { revalidatePath } from 'next/cache';
import { resolvePlan } from '@/contexts/subscriptions/domain/plans';
import { journeyFits, seasonEndsMessage } from '@/contexts/subscriptions/domain/season-horizon';
import { getIntakeState } from '@/infra/config/intake';
import { LIVE_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status';
import { canPause, canPlanPause, canResume, canSkip, skipCapFor, skipsUsedFor } from '@/contexts/subscriptions/domain/subscription-rules';
import { ae9amUtcOnDate, nextEligibleDeliveryDay } from '@/shared/time/dubai-day';
import { eventBus } from '@/shared/events/event-bus';
// Side-effect import — registers the notifications subscriber that turns
// 'subscription.notification-due' emits into customer_notifications inserts.
// Mutations stay decoupled from queueCustomerNotification at the call-site
// level; the import boundary here is the one place we acknowledge the wiring.
import '@/contexts/notifications/usecases/subscribers';
import { withOwnedSubscription } from './with-owned-subscription';
import { getCompanyClosureDates } from '@/infra/supabase/subscriptions-repo';
import type { Subscription } from '@/contexts/subscriptions/domain/subscriptions';
import { decideSkipOutcome, mayPromiseMealOn, skipSeenMismatch, type SeasonSkipNotice, type SkipSeason, type SkipSeen } from '@/contexts/season/domain/skip-outcome';
import { SKIP_CHANGED_COPY, SKIP_ERROR_FALLBACK, SKIP_NO_VALUE_COPY, creditedSkipBlocksPause } from '@/contexts/season/domain/season-skip-errors';
import { applySeasonSkip, applySeasonUnskip, loadSkipSeasonContext, trimSeasonBufferGrants } from '@/contexts/season/usecases/skip-season';
import { announceSeasonSkipCredited } from '@/contexts/season/usecases/season-skip-notices';
import { BREAK_RESUME_COPY, BREAK_START_DATE_COPY, isSeasonBreakError } from '@/contexts/season/domain/season-break-errors';
import { releaseSeasonHold } from '@/contexts/season/usecases/release-hold';
import { captureError } from '@/infra/logging/capture-error';
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client';

// Customers have no write access to subscriptions (security fix 2026-09-16):
// every write below runs with the service role, after withOwnedSubscription
// checked the owner, and still filters on customer_id.
const ownerWrites = () => createAdminSupabaseClient();

// ── Module-local helpers ──────────────────────────────────────────────────

function aeTodayIso(): string {
  const ae = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`;
}

function isWorkingDayForWeekType(d: Date, weekType: string): boolean {
  const isoDow = ((d.getDay() + 6) % 7) + 1; // 1=Mon..7=Sun
  if (weekType === '7DAYS') return true;
  if (weekType === '6DAYS') return isoDow !== 7;
  // 5DAYS
  return isoDow !== 6 && isoDow !== 7;
}

// 1-indexed position of `targetIso` among working days starting at `startIso`.
// Returns -1 if target is before start, or isn't a working day.
function workingDayPosition(startIso: string, targetIso: string, weekType: string): number {
  const target = new Date(targetIso + 'T00:00:00');
  const d = new Date(startIso + 'T00:00:00');
  if (target.getTime() < d.getTime()) return -1;
  let position = 0;
  while (d.getTime() <= target.getTime()) {
    if (isWorkingDayForWeekType(d, weekType)) {
      position++;
      if (d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth() && d.getDate() === target.getDate()) {
        return position;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return -1;
}

// ── pauseSubscription ─────────────────────────────────────────────────────

export async function pauseSubscription(subscriptionId: string) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
  // Validation — see subscription-rules.canPause for the full ruleset.
  const check = canPause(subscription, aeTodayIso());
  if (!check.ok) return { error: check.error };

  // A credited skip still ahead would be paid back twice: by its credit and
  // by the pause extending the plan for that day (season §7.2).
  const creditedAhead = (subscription.credited_skip_dates ?? []).filter((d) => d > aeTodayIso()).sort();
  if (creditedAhead.length > 0) return { error: creditedSkipBlocksPause(creditedAhead[0], false) };

  // Apply Pause. Note: paused_days is NOT touched here — the daily
  // subscription_pause_tick cron at 00:35 AE increments it by 1 for every
  // day the sub stays Paused, and the trigger pushes end_date out via the
  // canonical formula on each increment. has_paused_before stays true even
  // after resume so the 1-pause-per-cycle rule sticks.
  // planned_pause_start is force-cleared — if the customer had scheduled a
  // future pause and is now pausing manually, the plan is superseded by the
  // immediate action.
  // CAS guard: only flip Active → Paused. Stops a double-tap from re-pausing
  // an already-Paused row (which would no-op but reset pause_date) or racing
  // against a same-window skip.
  const { data: pauseRows, error: updateError } = await ownerWrites()
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.PAUSED,
      pause_date: new Date().toISOString(),
      has_paused_before: true,
      planned_pause_start: null,
    })
    .eq('id', subscriptionId)
    .eq('customer_id', auth.user.id)
    .eq('status', SUBSCRIPTION_STATUS.ACTIVE)
    .eq('credited_skip_days', subscription.credited_skip_days)
    .select('id');

  if (updateError) return { error: 'Failed to pause subscription.' };
  if (!pauseRows || pauseRows.length === 0) {
    return { error: 'Pause didn\'t take. Refresh and try again, or message us on WhatsApp.' };
  }

  // ── Supersede the skip's pending resume confirm (last-in wins) ─────────
  // If the customer skipped a meal earlier this cycle, skipMeal pre-queued a
  // morning-after `meal_resumed_confirm` ("meals resume tonight") for the
  // next eligible delivery day. Pausing supersedes that skip: the message is
  // now wrong (no meal is coming), and if left queued it would also land
  // alongside this pause's own resume confirm on the day the customer comes
  // back — two "welcome back" messages for one return. Cancel it so the only
  // resumption message reflects their most recent action: the pause.
  await eventBus.emit('subscription.notification-cancel', {
    customerId: auth.user.id,
    kinds: ['meal_resumed_confirm'],
  });

  // ── WhatsApp confirmation ──────────────────────────────────────────────
  // Immediate "your plan is paused" confirm. Pause is open-ended — the
  // copy explicitly tells the user resume is their call, no fake auto-
  // resume date here. The matching "plan back on" message is scheduled
  // later from resumeSubscription() when the user comes back.
  await eventBus.emit('subscription.notification-due', {
    customerId: auth.user.id,
    kind: 'plan_paused_confirm',
    scheduledFor: new Date(),
  });

  // Revalidate at layout level so the sidebar/topbar plan badge + every nested
  // route under /dashboard sees the new status.
  revalidatePath('/dashboard', 'layout');
  return { success: true };
  }, 'subscription.paused');
}

// ── resumeSubscription ────────────────────────────────────────────────────

export async function resumeSubscription(subscriptionId: string) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
  // ── Season break (spec §7.5, G9) ─────────────────────────────────────────
  // Read fresh: a plan must never restart into a closed kitchen because of a
  // 30-second-old cache. trg_subscriptions_season_guard refuses it too.
  const seasonNow = await getIntakeState({ fresh: true });
  if (seasonNow.phase === 'break') {
    return { error: BREAK_RESUME_COPY, seasonBreak: true as const };
  }
  // Same-day resume lock. Mirrors the UI gate in QuickActions so a client
  // bypass can't create kitchen ambiguity on the day of pause. AE wall-time
  // conversion happens here so the rule itself stays pure + testable.
  const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const todayAE = aeNow.toISOString().slice(0, 10);
  const pauseDateAeIso = subscription.pause_date
    ? new Date(new Date(subscription.pause_date).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
  const check = canResume(subscription, todayAE, pauseDateAeIso);
  if (!check.ok) return { error: check.error };

  // Detect post-cutoff resume on a delivery day. When the customer resumes
  // after 2 PM AE, the sub flips Active before delivery_tick fires at 20:00 AE,
  // which would otherwise increment delivered_meals even though no meal was
  // prepped. Setting resume_cutoff_date = today tells delivery_tick to skip
  // the row. The end_date is already correct — pause_tick ran at 00:10 AE and
  // extended it before any afternoon resume could happen.
  const aeHour = aeNow.getUTCHours();
  const aeIsoDow = ((aeNow.getUTCDay() + 6) % 7) + 1;
  const wt = subscription.week_type ?? '6DAYS';
  // Subscriptions table CHECK enforces wt ∈ {5DAYS, 6DAYS}.
  const isDeliveryToday =
    wt === '6DAYS' ? aeIsoDow !== 7
                   : aeIsoDow !== 6 && aeIsoDow !== 7;
  const setResumeCutoff = aeHour >= 14 && isDeliveryToday;

  // A plan held for next semester restarts through SQL (spec X1): the hold is
  // released in the same transaction, and a queued renewal held behind it follows.
  if (subscription.season_hold_id) {
    const released = await releaseSeasonHold({ customerId: auth.user.id, subscriptionId, startDate: null, resumeCutoff: setResumeCutoff });
    if (!released.ok) {
      return released.seasonBreak ? { error: released.error, seasonBreak: true as const } : { error: released.error };
    }
    await eventBus.emit('subscription.notification-due', {
      customerId: auth.user.id,
      kind: 'plan_resumed_confirm',
      scheduledFor: new Date(),
      payload: { resume_date: todayAE },
    });
    revalidatePath('/dashboard', 'layout');
    return { success: true };
  }

  // Apply Resume. paused_days is NOT touched — the subscription_pause_tick
  // cron has already been incrementing it by 1 for every midnight crossed
  // while paused, and the end_date trigger has been pushing the calendar
  // out accordingly. Adding diffDays here would double-count.
  // CAS guard: only flip Paused → Active. Prevents a stale "resume" from
  // overwriting a sub that's since been Ended by status_tick.
  //
  // paused_dates: when resume happens after the 2 PM AE cutoff on a
  // delivery day, delivery_tick will skip that day (no meal delivered).
  // The 00:10 AE pause_tick has NOT yet run for today (it fires at the
  // start of tomorrow, after the sub is already Active), so we append
  // today here so the review surface knows this day was paused.
  const todayDateOnly = todayAE  // already YYYY-MM-DD
  const existingPaused = subscription.paused_dates
  const nextPausedDates = setResumeCutoff && !existingPaused.includes(todayDateOnly)
    ? [...existingPaused, todayDateOnly]
    : existingPaused

  const { data: resumeRows, error: updateError } = await ownerWrites()
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      pause_date: null,
      ...(setResumeCutoff ? { resume_cutoff_date: todayAE, paused_dates: nextPausedDates } : {}),
    })
    .eq('id', subscriptionId)
    .eq('customer_id', auth.user.id)
    .eq('status', SUBSCRIPTION_STATUS.PAUSED)
    .select('id');

  if (updateError) {
    return isSeasonBreakError(updateError.message)
      ? { error: BREAK_RESUME_COPY, seasonBreak: true as const }
      : { error: 'Failed to resume subscription.' };
  }
  if (!resumeRows || resumeRows.length === 0) {
    return { error: 'Resume didn\'t take. Refresh and try again, or message us on WhatsApp.' };
  }

  // ── WhatsApp confirmation ──────────────────────────────────────────────
  // Immediate "your plan is back on" confirm — mirrors the pause confirm
  // which also sends instantly. Previously deferred to 9 AM on the next
  // delivery day, which left the user with no feedback for up to 3 days
  // (e.g. resume on Friday with a 5-day plan → Monday 9 AM).
  await eventBus.emit('subscription.notification-due', {
    customerId: auth.user.id,
    kind: 'plan_resumed_confirm',
    scheduledFor: new Date(),
    payload: { resume_date: todayAE },
  });

  revalidatePath('/dashboard', 'layout');
  return { success: true };
  }, 'subscription.resumed');
}

// ── changeStartDate ───────────────────────────────────────────────────────

/**
 * Move the start date of a Scheduled subscription. Only allowed *before* the
 * plan begins — once it's active, the only way to extend the timeline is via
 * skip / pause. Recomputes end_date from the plan's duration so the cycle
 * stays the same length.
 */
export async function changeStartDate(subscriptionId: string, newStartDate: string) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
  // Gate on Scheduled — once a plan has started, the operations team is
  // already cooking on a schedule; moving the start date is a manual reschedule.
  if (subscription.status !== SUBSCRIPTION_STATUS.SCHEDULED) {
    return { error: 'Your plan has already started — message us on WhatsApp if you need to reschedule.' };
  }

  // ── Once-per-sub allowance ──────────────────────────────────────────────
  // Per state-machine spec: each Scheduled sub gets one date change. After
  // that the button is disabled in the UI; this server-side check is the
  // authoritative gate.
  // A plan held for next semester picks its start date after reopening, and
  // that change does not use the once-per-plan allowance (spec §7.6).
  const heldForNextSemester = !!subscription.season_hold_id;
  if (subscription.start_date_changed_at && !heldForNextSemester) {
    return { error: 'You can only change the start date once per plan.' };
  }

  // YYYY-MM-DD format + window check (tomorrow ≤ newStart ≤ today + 31).
  // Mirror the same guards as /api/checkout so a tampered call can't bypass.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) {
    return { error: 'Invalid date format' };
  }
  // AE wall-clock (UTC+4) date math in ISO strings — mirrors /api/checkout.
  // The previous server-local Date math drifted a day during the 00:00–04:00
  // AE window (the server runs UTC), letting a date checkout would reject slip
  // through. ISO date strings compare chronologically.
  const AE_OFFSET_MS = 4 * 60 * 60 * 1000;
  const addDaysIso = (iso: string, n: number): string => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const todayAeIso = new Date(Date.now() + AE_OFFSET_MS).toISOString().slice(0, 10);
  if (newStartDate < addDaysIso(todayAeIso, 1) || newStartDate > addDaysIso(todayAeIso, 31)) {
    return { error: 'Pick a date within the next 30 days.' };
  }

  // A start date on a closed night would open the dashboard on "Kitchen
  // closed today" as day one and fire the start-day email into a shut
  // kitchen. Checkout rolls such picks forward; here the customer chose the
  // day on purpose, so say why it will not do.
  if ((await getCompanyClosureDates()).includes(newStartDate)) {
    return { error: 'The kitchen is closed that day — pick the next delivery day.' };
  }

  // Reject non-delivery-day picks for the sub's week_type. Without this, a
  // 5DAYS customer could submit a Saturday — the BEFORE end_date trigger
  // start-shifts internally to Mon for the math, but start_date is stored
  // as Sat, and the dashboard would show "starts Sat" with no Sat delivery.
  // ISO dow: 1=Mon … 7=Sun.
  const reqIsoDow = ((new Date(newStartDate + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
  const wtChange = subscription.week_type ?? '6DAYS';
  // Subscriptions table CHECK enforces week_type ∈ {5DAYS, 6DAYS}.
  const reqIsDelivery =
    wtChange === '6DAYS' ? reqIsoDow !== 7
                         : reqIsoDow !== 6 && reqIsoDow !== 7;
  if (!reqIsDelivery) {
    return { error: 'Pick a working delivery day for your plan (Mon–Fri for 5-day plans, Mon–Sat for 6-day plans).' };
  }

  // ── Seasonal taper ──────────────────────────────────────────────────────
  // With a pause scheduled, a reschedule must not push this Scheduled sub's
  // journey past the term's last delivery day. The client clamps its picker
  // (ChangeStartDateModal / ChangeStartSheet), but that is courtesy only —
  // a stale tab or a direct server-action call would otherwise land a start
  // date whose plan runs into the break. This is the authoritative gate, the
  // sibling of /api/checkout's INTAKE_ENDING 409.
  //
  // No webhook prediction is needed here (unlike checkout): the trigger
  // recomputes end_date straight from the start_date written below, so
  // newStartDate IS the journey's start.
  //
  // getIntakeState fails open (pauseScheduledFor is null on a settings-read
  // blip), so a settings outage lets the reschedule through rather than
  // freezing a legitimate date change.
  const intakeForChange = await getIntakeState({ fresh: true });
  // ── Season break (spec §7.6) ────────────────────────────────────────────
  if (intakeForChange.phase === 'break') {
    return { error: BREAK_START_DATE_COPY };
  }
  if (intakeForChange.pauseScheduledFor) {
    // Unresolvable plan names fall back to the LONGEST journey — the
    // tightest clamp — so an unknown label fails safe (refuse) rather than
    // open (approve a journey that runs past the term).
    const changePlanId = resolvePlan(subscription.plan_name)?.id ?? 'monthly-max';
    const changeWeekType = wtChange === '5DAYS' ? '5DAYS' : '6DAYS';
    const fitsInTerm = journeyFits({
      planId: changePlanId,
      weekType: changeWeekType,
      startDate: newStartDate,
      lastDeliveryDay: intakeForChange.pauseScheduledFor,
    });
    if (!fitsInTerm) {
      return {
        error: `${seasonEndsMessage(intakeForChange.pauseScheduledFor)} Pick an earlier start so the plan finishes in time.`,
      };
    }
  }

  // ── Paused primary ───────────────────────────────────────────────────────
  // A queued start date behind a paused (or pause-planned) primary is
  // tentative — it shifts as the pause stretches. Spending the once-only
  // change on a date that will move is the wrong outcome, so the queued
  // card disables its button while paused and this is the authoritative gate.
  const { data: pausedPrimary } = await auth.supabase
    .from('subscriptions')
    .select('id')
    .eq('customer_id', auth.user.id)
    .neq('id', subscription.id)
    .in('status', LIVE_SUBSCRIPTION_STATUSES)
    .or(`status.eq.${SUBSCRIPTION_STATUS.PAUSED},planned_pause_start.not.is.null`)
    .limit(1);
  if (pausedPrimary && pausedPrimary.length > 0) {
    return { error: 'Your current plan is paused — the start date locks in when you resume. Change it then.' };
  }

  // Reject if a primary live sub exists and the new start_date falls on or
  // before its end_date — otherwise the rescheduled Scheduled would overlap
  // with the customer's still-running primary. The shift trigger handles
  // pushes from the OTHER direction (primary's end_date moving forward),
  // but we never want to silently push the customer's explicit pick.
  const { data: primary } = await auth.supabase
    .from('subscriptions')
    .select('id, end_date')
    .eq('customer_id', auth.user.id)
    .neq('id', subscriptionId)
    .in('status', LIVE_SUBSCRIPTION_STATUSES)
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (primary?.end_date && newStartDate <= primary.end_date) {
    return {
      error: `Your current plan runs until ${primary.end_date}. Pick a date after that.`,
    };
  }

  if (heldForNextSemester) {
    const released = await releaseSeasonHold({ customerId: auth.user.id, subscriptionId, startDate: newStartDate, resumeCutoff: false });
    if (!released.ok) return { error: released.seasonBreak ? BREAK_START_DATE_COPY : released.error };
    await eventBus.emit('subscription.notification-due', {
      customerId: auth.user.id,
      kind: 'plan_start_date_changed_confirm',
      scheduledFor: new Date(),
      payload: { start_date: newStartDate },
    });
    revalidatePath('/dashboard', 'layout');
    return { success: true };
  }

  // Note: end_date is recomputed automatically by the
  // trg_subscriptions_recompute_end_date trigger when start_date changes.
  // We only need to write start_date + the once-only marker.
  const { data: dateRows, error: updateError } = await ownerWrites()
    .from('subscriptions')
    .update({
      start_date: newStartDate,
      start_date_changed_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId)
    .eq('customer_id', auth.user.id)
    .eq('status', SUBSCRIPTION_STATUS.SCHEDULED)
    // CAS the once-per-sub allowance: only a row whose marker is still null can
    // win, so two concurrent submits can't both change the date.
    .is('start_date_changed_at', null)
    .select('id');

  if (updateError) return { error: 'Failed to update start date.' };
  if (!dateRows || dateRows.length === 0) {
    return { error: 'Date change didn\'t take. Refresh and try again, or message us on WhatsApp.' };
  }

  // ── WhatsApp confirmation ──────────────────────────────────────────────
  // One-time receipt — the start_date_changed_at flag means this action
  // can't fire twice per sub, so no spam risk.
  await eventBus.emit('subscription.notification-due', {
    customerId: auth.user.id,
    kind: 'plan_start_date_changed_confirm',
    scheduledFor: new Date(),
    payload: { start_date: newStartDate },
  });

  revalidatePath('/dashboard', 'layout');
  return { success: true };
  }, 'subscription.start_date_changed');
}

// ── Season wind-down skip step (spec §7.2) ────────────────────────────────

type SeasonSkipStep =
  | { ok: false; error: string }
  | { ok: true; kind: 'normal'; season: SkipSeason }
  | { ok: true; kind: 'grant'; season: SkipSeason; makeUpDay: string }
  | { ok: true; kind: 'credited'; season: SkipSeason; notice: SeasonSkipNotice };

/**
 * The season half of skipMeal and skipFutureDate. Decides normal skip, buffer
 * grant or credited skip on fresh data and refuses an outcome the customer's
 * sheet did not show. Grants and credited skips are written here through SQL:
 * they touch columns and rows the customer's client cannot write, and SQL
 * rechecks the season and the amount under a row lock. A credited skip is
 * announced here. A normal skip is left to the caller's own write, and every
 * message stays with the caller. Not exported: a 'use server' module may only
 * export server actions.
 */
async function seasonSkipStep(input: {
  customerId: string
  subscription: Subscription
  mealDate: string
  sameDay: boolean
  todayAe: string
  seen: SkipSeen | undefined
  skipCap: number
}): Promise<SeasonSkipStep> {
  const { subscription } = input;
  // A failed season or closures read refuses the skip even when the season is
  // really open: fail open for sales, never for the kitchen or money (spec §5.1).
  const read = await loadSkipSeasonContext(subscription);
  if (!read.ok) return { ok: false, error: SKIP_ERROR_FALLBACK };
  const ctx = read.context;
  const outcome = decideSkipOutcome({
    season: ctx.season,
    plan: {
      endDate: subscription.end_date,
      weekType: subscription.week_type === '5DAYS' ? '5DAYS' : '6DAYS',
      skippedDates: subscription.skipped_dates ?? [],
      bufferGrants: subscription.season_buffer_grants ?? 0,
    },
    todayAe: input.todayAe,
    closureDates: ctx.closureDates,
    creditFils: ctx.creditFils,
  });
  // An unreadable order is a failed read, not a meal worth nothing.
  if (outcome.kind === 'credited' && ctx.creditReadFailed) return { ok: false, error: SKIP_ERROR_FALLBACK };
  // The customer's sheet showed an outcome; if the fresh answer differs, they
  // refresh rather than get a different result than they confirmed.
  if (skipSeenMismatch(outcome, input.seen)) return { ok: false, error: SKIP_CHANGED_COPY };
  if (outcome.kind === 'normal') return { ok: true, kind: 'normal', season: ctx.season };
  if (outcome.kind === 'credited' && outcome.creditFils == null) return { ok: false, error: SKIP_NO_VALUE_COPY };

  const applied = await applySeasonSkip({
    customerId: input.customerId,
    subscriptionId: subscription.id,
    mealDate: input.mealDate,
    sameDay: input.sameDay,
    outcome: outcome.kind,
    season: ctx.season,
    skipCap: input.skipCap,
    expectedCreditFils: outcome.kind === 'credited' ? outcome.creditFils : null,
  });
  if (!applied.ok) return { ok: false, error: applied.error };
  if (applied.outcome === 'grant') return { ok: true, kind: 'grant', season: ctx.season, makeUpDay: applied.makeUpDay };

  await announceSeasonSkipCredited([
    { subscriptionId: subscription.id, customerId: input.customerId, mealDates: [input.mealDate], creditFils: applied.creditFils, source: 'customer_skip' },
  ]);
  return {
    ok: true,
    kind: 'credited',
    season: ctx.season,
    notice: { outcome: 'credited', creditFils: applied.creditFils, creditStatus: applied.creditStatus, mealDate: input.mealDate },
  };
}

// ── skipMeal (same-day) ───────────────────────────────────────────────────

export async function skipMeal(subscriptionId: string, seen?: SkipSeen) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
  // Skip is only meaningful from Active. Skipped subs can't be skipped again
  // today (already counted); Paused/Scheduled/Ended subs aren't delivering.
  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    return { error: 'Cannot skip a meal on an inactive or paused subscription.' };
  }

  // Operations cutoff: a same-day skip is only honoured before 14:00 Asia/Dubai.
  const SKIP_CUTOFF_HOUR_AE = 14;
  const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000); // shift UTC to AE wall time
  const aeHour = aeNow.getUTCHours();
  if (aeHour >= SKIP_CUTOFF_HOUR_AE) {
    return { error: `Skip cutoff for today is 2 PM. Try again tomorrow morning.` };
  }

  // Today must be a delivery day for this sub's week_type.
  const aeIsoDow = ((aeNow.getUTCDay() + 6) % 7) + 1;
  const wt = subscription.week_type ?? '6DAYS';
  // Subscriptions table CHECK enforces wt ∈ {5DAYS, 6DAYS}.
  const isDeliveryToday =
    wt === '6DAYS' ? aeIsoDow !== 7
                   : aeIsoDow !== 6 && aeIsoDow !== 7;
  if (!isDeliveryToday) {
    return { error: 'Today isn\'t a delivery day for your plan, so there\'s nothing to skip.' };
  }

  // skipCapFor is the single definition of the allowance; skipsUsedFor counts
  // credited season skips against it too (spec X3).
  const maxSkips = skipCapFor(subscription);
  if (skipsUsedFor(subscription) >= maxSkips) {
    return { error: `You have reached the maximum allowed skips (${maxSkips}) for this subscription plan.` };
  }

  // Make-up day guard: skipping a make-up day would loop the extension.
  const todayAEIso = `${aeNow.getUTCFullYear()}-${String(aeNow.getUTCMonth() + 1).padStart(2, '0')}-${String(aeNow.getUTCDate()).padStart(2, '0')}`
  const mealsPerDelivery = subscription.meals_per_day ?? 1;
  const totalDeliveries = Math.max(1, Math.ceil(subscription.total_meals / mealsPerDelivery));
  const todayPosition = workingDayPosition(subscription.start_date, todayAEIso, wt);
  if (todayPosition > totalDeliveries) {
    return { error: "Make-up days can't be skipped. They're extra days earned by earlier skips." };
  }

  // ── Season wind-down (spec §7.2): normal skip, buffer grant or credited skip ──
  const step = await seasonSkipStep({
    customerId: auth.user.id,
    subscription,
    mealDate: todayAEIso,
    sameDay: true,
    todayAe: todayAEIso,
    seen,
    skipCap: maxSkips,
  });
  if (!step.ok) return { error: step.error };

  const nextSkippedDates = [...(subscription.skipped_dates ?? []), todayAEIso]

  if (step.kind === 'normal') {
    // Flip Active → Skipped. The CAS on status stops a double tap counting
    // twice; the CAS on the skip count stops this write from overwriting a
    // reconcile that converted skips underneath it (season §7.2).
    const { data: skipRows, error: updateError } = await ownerWrites()
      .from('subscriptions')
      .update({
        status: SUBSCRIPTION_STATUS.SKIPPED,
        skipped_meals_count: subscription.skipped_meals_count + 1,
        last_skipped_date: new Date().toISOString(),
        skipped_dates: nextSkippedDates,
      })
      .eq('id', subscriptionId)
      .eq('customer_id', auth.user.id)
      .eq('status', SUBSCRIPTION_STATUS.ACTIVE)
      .eq('skipped_meals_count', subscription.skipped_meals_count)
      .select('id');

    if (updateError) return { error: 'Failed to skip meal.' };
    if (!skipRows || skipRows.length === 0) {
      return { error: SKIP_CHANGED_COPY };
    }
  }

  // ── WhatsApp confirmations ──────────────────────────────────────────────
  // meal_skipped_confirm promises a make-up day, so a credited skip never
  // sends it. Every same-day skip still says when meals resume, but only for
  // a day the kitchen really cooks: on or before the wrap-up day, or a buffer
  // day this plan holds a grant for (mayPromiseMealOn).
  if (step.kind !== 'credited') {
    await eventBus.emit('subscription.notification-due', {
      customerId: auth.user.id,
      kind: 'meal_skipped_confirm',
      scheduledFor: new Date(), // immediate
      payload: { meal_date: todayAEIso },
    });
  }
  // A grant skip already moved the plan's end to its make-up day in SQL; the
  // row loaded before the write still carries the old end.
  const resumeOnIso = nextEligibleDeliveryDay({
    fromAeDateIso: todayAEIso,
    weekType:      (wt as '5DAYS' | '6DAYS' | '7DAYS'),
    skippedDates:  nextSkippedDates,
    pausedDates:   subscription.paused_dates ?? [],
    subEndDateIso: step.kind === 'grant' && step.makeUpDay > subscription.end_date ? step.makeUpDay : subscription.end_date,
  });
  const grantsAfter = (subscription.season_buffer_grants ?? 0) + (step.kind === 'grant' ? 1 : 0);
  if (resumeOnIso && mayPromiseMealOn(resumeOnIso, step.season, grantsAfter)) {
    await eventBus.emit('subscription.notification-due', {
      customerId: auth.user.id,
      kind: 'meal_resumed_confirm',
      scheduledFor: ae9amUtcOnDate(resumeOnIso),
      payload: { resume_date: resumeOnIso },
    });
  }

  revalidatePath('/dashboard', 'layout');
  return step.kind === 'credited'
    ? { success: true as const, seasonSkip: step.notice }
    : { success: true as const };
  }, 'subscription.skipped');
}

// ── skipFutureDate ────────────────────────────────────────────────────────

/**
 * Schedule a skip for a FUTURE date. Customer registers an intent to skip a
 * specific upcoming delivery day; the date lands in `skipped_dates`, the
 * skip count increments, and the end_date trigger extends the cycle by one
 * working day. On the morning of the skip date, the status_tick cron at
 * 00:05 AE promotes the sub from Active → Skipped so the existing 20:00 AE
 * delivery cron sees the right state and doesn't increment delivered_meals.
 *
 * Distinct from same-day skipMeal:
 *   • skipMeal      — today only, before 2 PM AE, irreversible. Flips status.
 *   • skipFutureDate — strictly future dates, reversible via unskipFutureDate
 *                       until the day BEFORE the skip. Doesn't flip status now.
 */
export async function skipFutureDate(subscriptionId: string, dateIso: string, seen?: SkipSeen) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
  // Shared skip-eligibility (status + allowance, credited skips included).
  const eligible = canSkip(subscription);
  if (!eligible.ok) return { error: eligible.error };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { error: 'Invalid date format.' };
  }

  const todayIso = aeTodayIso();
  if (dateIso <= todayIso) {
    return { error: 'Pick a date in the future. Use the same-day skip button to skip today\'s meal.' };
  }

  if (dateIso > subscription.end_date) {
    return { error: 'Pick a date inside your current cycle.' };
  }

  const wt = subscription.week_type ?? '6DAYS';
  const targetD = new Date(dateIso + 'T00:00:00');
  if (!isWorkingDayForWeekType(targetD, wt)) {
    return { error: 'That isn\'t a delivery day for your plan, so there\'s nothing to skip.' };
  }

  // A closed kitchen is already paid back by closure_tick.
  if ((await getCompanyClosureDates()).includes(dateIso)) {
    return { error: 'The kitchen is closed that day. It\'s already added to the end of your plan, so there\'s nothing to skip.' };
  }

  const existing: string[] = subscription.skipped_dates ?? [];
  if (existing.includes(dateIso)) {
    return { error: 'You\'ve already scheduled a skip for that day.' };
  }

  const mealsPerDelivery = subscription.meals_per_day ?? 1;
  const totalDeliveries = Math.max(1, Math.ceil(subscription.total_meals / mealsPerDelivery));
  const targetPosition = workingDayPosition(subscription.start_date, dateIso, wt);
  if (targetPosition > totalDeliveries) {
    return { error: 'Make-up days can\'t be skipped. They\'re already extra days earned by earlier skips.' };
  }

  if (subscription.planned_pause_start && dateIso >= subscription.planned_pause_start) {
    return { error: 'That day is inside your planned pause, so there\'s no need to skip. Cancel the planned pause first if you want to skip this day specifically.' };
  }

  // ── Season wind-down (spec §7.2): normal skip, buffer grant or credited skip ──
  const step = await seasonSkipStep({
    customerId: auth.user.id,
    subscription,
    mealDate: dateIso,
    sameDay: false,
    todayAe: todayIso,
    seen,
    skipCap: skipCapFor(subscription),
  });
  if (!step.ok) return { error: step.error };
  if (step.kind === 'credited') {
    // No meal_skip_scheduled_confirm: it promises a make-up day that is not coming.
    revalidatePath('/dashboard', 'layout');
    return { success: true as const, seasonSkip: step.notice };
  }

  if (step.kind === 'normal') {
    // Append + increment. CAS on skipped_meals_count guards concurrent skips.
    const nextSkippedDates = [...existing, dateIso].sort();
    const { data: rows, error: updateError } = await ownerWrites()
      .from('subscriptions')
      .update({
        skipped_meals_count: subscription.skipped_meals_count + 1,
        skipped_dates: nextSkippedDates,
      })
      .eq('id', subscriptionId)
      .eq('customer_id', auth.user.id)
      .eq('skipped_meals_count', subscription.skipped_meals_count)
      .eq('credited_skip_days', subscription.credited_skip_days)
      .select('id');

    if (updateError) return { error: 'Failed to schedule skip.' };
    if (!rows || rows.length === 0) {
      return { error: 'Couldn\'t schedule the skip. Please refresh and try again.' };
    }
  }

  // ── WhatsApp confirmation (normal skip and buffer grant) ─────────────────
  await eventBus.emit('subscription.notification-due', {
    customerId: auth.user.id,
    kind: 'meal_skip_scheduled_confirm',
    scheduledFor: new Date(),
    payload: { meal_date: dateIso },
  });

  revalidatePath('/dashboard', 'layout');
  return { success: true as const };
  }, 'subscription.future_skip_scheduled');
}

// ── unskipFutureDate ──────────────────────────────────────────────────────

/**
 * Reverse a scheduled future skip. Only works for STRICTLY FUTURE dates —
 * today's same-day skips remain irreversible per the operational policy
 * (kitchen prep has already started by the time the customer's looking).
 *
 * Removes the date from `skipped_dates`, decrements `skipped_meals_count`,
 * and the existing end_date trigger contracts the cycle by one working day.
 */
export async function unskipFutureDate(subscriptionId: string, dateIso: string) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE && subscription.status !== SUBSCRIPTION_STATUS.SKIPPED) {
    return { error: 'Cannot un-skip on an inactive subscription.' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { error: 'Invalid date format.' };
  }

  // Same-day un-skip is intentionally not supported. Today's path goes through
  // skipMeal which is irreversible per project policy (kitchen ops cascade).
  const todayIso = aeTodayIso();
  if (dateIso <= todayIso) {
    return { error: 'Past skips and today\'s skip can\'t be undone.' };
  }

  const existing: string[] = subscription.skipped_dates ?? [];
  if (!existing.includes(dateIso)) {
    return { error: 'That day isn\'t scheduled as a skip.' };
  }

  // Any credited skip or buffer grant ANYWHERE on this plan routes the undo
  // through SQL, not just an undo of the credited date itself: contracting
  // the plan by undoing an ordinary skip could strand a later credited date
  // past the new end, and a grant must be released under the same row lock
  // (Task 6 review).
  const hasCreditedSkip = (subscription.credited_skip_dates ?? []).length > 0 || (subscription.credited_skip_days ?? 0) > 0;
  const hasBufferGrant = (subscription.season_buffer_grants ?? 0) > 0;
  if (hasCreditedSkip || hasBufferGrant) {
    const undone = await applySeasonUnskip({ customerId: auth.user.id, subscriptionId, mealDate: dateIso });
    if (!undone.ok) return { error: undone.error };
    if (undone.kind === 'normal') {
      await eventBus.emit('subscription.notification-due', {
        customerId: auth.user.id,
        kind: 'meal_skip_cancelled_confirm',
        scheduledFor: new Date(),
        payload: { meal_date: dateIso },
      });
    }
    revalidatePath('/dashboard', 'layout');
    return { success: true as const };
  }

  const nextSkippedDates = existing.filter((d: string) => d !== dateIso);
  const newCount = Math.max(0, subscription.skipped_meals_count - 1);

  const { data: rows, error: updateError } = await ownerWrites()
    .from('subscriptions')
    .update({
      skipped_meals_count: newCount,
      skipped_dates: nextSkippedDates,
    })
    .eq('id', subscriptionId)
    .eq('customer_id', auth.user.id)
    .eq('skipped_meals_count', subscription.skipped_meals_count)
    .eq('credited_skip_days', subscription.credited_skip_days)
    .select('id');

  if (updateError) return { error: 'Failed to un-skip.' };
  if (!rows || rows.length === 0) {
    return { error: 'Couldn\'t un-skip — please refresh and try again.' };
  }

  // ── WhatsApp confirmation ──────────────────────────────────────────────
  // Symmetric receipt to meal_skip_scheduled_confirm.
  await eventBus.emit('subscription.notification-due', {
    customerId: auth.user.id,
    kind: 'meal_skip_cancelled_confirm',
    scheduledFor: new Date(),
    payload: { meal_date: dateIso },
  });

  revalidatePath('/dashboard', 'layout');
  return { success: true };
  }, 'subscription.future_skip_cancelled');
}

// ── planPause ─────────────────────────────────────────────────────────────

/**
 * Schedule a FUTURE pause start date (Variant B — open-ended).
 *
 * The customer specifies WHEN the pause begins; they resume manually when
 * they're back. On the start date AE, the subscription_status_tick cron at
 * 00:05 AE promotes Active|Skipped → Paused and clears planned_pause_start.
 *
 * Credit accounting: has_paused_before is set true at plan-time. The "1 free
 * pause per cycle" rule is now anchored on plan-commit, not pause-activation.
 * cancelPlannedPause refunds the credit (sets has_paused_before back to false)
 * BEFORE activation; once the cron flips status, the credit is fully spent.
 *
 * Distinct from immediate pauseSubscription:
 *   • pauseSubscription — flips status now. Cascade end_date as paused_days grow.
 *   • planPause         — sets a future date. No status change yet. Customer
 *                          can still pauseSubscription manually to override.
 */
export async function planPause(subscriptionId: string, startDateIso: string) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
  // Status + tier + credit checks live together in subscription-rules.canPlanPause.
  const check = canPlanPause(subscription);
  if (!check.ok) return { error: check.error };

  // Date validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateIso)) {
    return { error: 'Invalid date format.' };
  }

  // Strictly future — same-day pause should use pauseSubscription directly.
  const todayIso = aeTodayIso();
  if (startDateIso <= todayIso) {
    return { error: 'Pick a date in the future. Use Pause now to pause today.' };
  }

  // Within the current cycle, AND not on the literal last day. Pausing on
  // end_date is meaningless (cycle ends after that day) and a potential
  // abuse vector — same rule as same-day pauseSubscription.
  if (startDateIso >= subscription.end_date) {
    return { error: 'Pick a date before your last delivery day — pausing on the final day doesn\'t save a meal.' };
  }

  // Working day for this week_type — pausing on a non-delivery day burns the
  // credit without protecting any meal that day (none was scheduled). Better
  // to start the pause on the next working day.
  const wt = subscription.week_type ?? '6DAYS';
  const targetD = new Date(startDateIso + 'T00:00:00');
  if (!isWorkingDayForWeekType(targetD, wt)) {
    return { error: 'Pick a delivery day — pausing on a non-delivery day doesn\'t save a meal.' };
  }

  // Not a make-up day (cycle's intrinsic length only).
  const mealsPerDelivery = subscription.meals_per_day ?? 1;
  const totalDeliveries = Math.max(1, Math.ceil(subscription.total_meals / mealsPerDelivery));
  const targetPosition = workingDayPosition(subscription.start_date, startDateIso, wt);
  if (targetPosition > totalDeliveries) {
    return { error: 'Pauses can\'t start on a make-up day — those are extra days earned by earlier skips.' };
  }

  // Credited skips are not refundable like normal ones: the credit is already
  // promised. Ask the customer to undo the skip rather than paying it twice.
  const creditedInPause = (subscription.credited_skip_dates ?? []).filter((d) => d >= startDateIso).sort();
  if (creditedInPause.length > 0) return { error: creditedSkipBlocksPause(creditedInPause[0], true) };

  // Auto-cancel any scheduled future skips that fall inside the new pause
  // window. Skipping inside a pause is wasted credit (the pause covers
  // the day) and double-extends the cycle. Refund those credits in the
  // same atomic update so the customer's net state is clean. The modal
  // surfaces this list as a warning before confirm, so this isn't a
  // silent side effect.
  const existingSkippedDates: string[] = subscription.skipped_dates ?? [];
  const skipsToKeep = existingSkippedDates.filter(d => d < startDateIso);
  const cancelledSkipsCount = existingSkippedDates.length - skipsToKeep.length;
  const newSkippedMealsCount = Math.max(0, subscription.skipped_meals_count - cancelledSkipsCount);

  // Commit. CAS on has_paused_before AND on skipped_meals_count guards
  // against concurrent plan-pause / skip-cancel races.
  const { data: rows, error: updateError } = await ownerWrites()
    .from('subscriptions')
    .update({
      planned_pause_start: startDateIso,
      has_paused_before: true,
      skipped_dates: skipsToKeep,
      skipped_meals_count: newSkippedMealsCount,
    })
    .eq('id', subscriptionId)
    .eq('customer_id', auth.user.id)
    .eq('has_paused_before', false)
    .eq('skipped_meals_count', subscription.skipped_meals_count)
    .eq('credited_skip_days', subscription.credited_skip_days)
    .is('planned_pause_start', null)
    .select('id');

  if (updateError) return { error: 'Failed to schedule pause.' };
  if (!rows || rows.length === 0) {
    return { error: 'Couldn\'t schedule the pause — please refresh and try again.' };
  }

  // A cancelled skip may have been the one that used the season buffer; its
  // grant goes with it (review fix A3). Non-fatal: the pause is committed and
  // the trim is idempotent.
  if (cancelledSkipsCount > 0 && (subscription.season_buffer_grants ?? 0) > 0) {
    const trimmed = await trimSeasonBufferGrants({ subscriptionId });
    if (!trimmed.ok) captureError(new Error(trimmed.error), { area: 'season', op: 'planPause.trimBufferGrants', subscriptionId });
  }

  // ── WhatsApp confirmation ──────────────────────────────────────────────
  // Immediate confirm telling the user the date their plan WILL pause —
  // distinct from plan_paused_confirm (which fires when pause is now).
  // The cron's auto-activation on the planned date doesn't get its own
  // message; this scheduling confirm IS the receipt.
  await eventBus.emit('subscription.notification-due', {
    customerId: auth.user.id,
    kind: 'plan_pause_scheduled_confirm',
    scheduledFor: new Date(),
    payload: { start_date: startDateIso },
  });

  revalidatePath('/dashboard', 'layout');
  return { success: true };
  }, 'subscription.pause_scheduled');
}

// ── cancelPlannedPause ────────────────────────────────────────────────────

/**
 * Cancel a pre-scheduled pause. Only valid BEFORE activation (the cron has
 * not yet flipped the sub to Paused). Refunds the pause credit by resetting
 * has_paused_before to false — the customer is restored to "1 unused pause"
 * for this cycle.
 *
 * Once the cron activates the pause (status → Paused), this action no longer
 * applies — the customer is genuinely paused and needs to call
 * resumeSubscription to come back.
 */
export async function cancelPlannedPause(subscriptionId: string) {
  return withOwnedSubscription(subscriptionId, async ({ auth, subscription }) => {
  if (!subscription.planned_pause_start) {
    return { error: 'No pause is scheduled.' };
  }
  // If the sub has already activated into Paused, the customer should use
  // resume, not cancel. The planned_pause_start column gets cleared on
  // activation so this should be unreachable in practice — defensive check.
  if (subscription.status === SUBSCRIPTION_STATUS.PAUSED) {
    return { error: 'Your pause is already active — use Resume to come back.' };
  }

  const { data: rows, error: updateError } = await ownerWrites()
    .from('subscriptions')
    .update({
      planned_pause_start: null,
      has_paused_before: false,
    })
    .eq('id', subscriptionId)
    .eq('customer_id', auth.user.id)
    .eq('planned_pause_start', subscription.planned_pause_start)
    .select('id');

  if (updateError) return { error: 'Failed to cancel scheduled pause.' };
  if (!rows || rows.length === 0) {
    return { error: 'Couldn\'t cancel — please refresh and try again.' };
  }

  // ── WhatsApp confirmation ──────────────────────────────────────────────
  // Symmetric receipt to plan_pause_scheduled_confirm. Tells the customer
  // the pause credit is back on their account — same fact the dashboard
  // shows but worth saying out loud.
  await eventBus.emit('subscription.notification-due', {
    customerId: auth.user.id,
    kind: 'plan_pause_cancelled_confirm',
    scheduledFor: new Date(),
  });

  revalidatePath('/dashboard', 'layout');
  return { success: true };
  }, 'subscription.pause_plan_cancelled');
}
