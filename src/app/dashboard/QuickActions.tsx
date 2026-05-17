import type { CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SkipForward, Pause as PauseIcon, Play, Check, CalendarPlus, CalendarClock } from 'lucide-react'
import { OG, BODY, S, TIER1 } from './_shared/tokens'
import { Eyebrow } from './_shared/Eyebrow'
import { BtnSpinner } from './_shared/buttons'
import { Tooltip } from './_shared/Tooltip'
import type { LocalState } from './_shared/types'

/**
 * Quick actions card — sits next to PlanProgress on the dashboard.
 * Hosts Skip / Pause / Resume buttons with optimistic state visuals
 * (pending spinner, success check) plus a small skip-quota chip.
 *
 * Pure presentational — all state owned by ActiveDashboard, passed
 * through here. Was 124 inline LOC in ClientDashboard.tsx.
 */
export function QuickActions({
    canPause,
    localState,
    onPause,
    onSkipRequest,
    onPlanSkip,
    isPending,
    pendingAction,
    successAction,
    skipQuota,
    disabledReason,
    skipPastCutoff,
    skipNoDelivery,
    pausePastFinalDay,
    resumeLockedSameDay,
    isPausableTier,
    isTrialPlan,
    plannedPauseDate = null,
}: {
    canPause: boolean
    localState: LocalState
    onPause: () => void
    onSkipRequest: () => void
    // Opens the future-skip modal in picker mode. When absent the
    // "Plan a skip" button stays hidden — keeps the card's affordance
    // surface honest when the parent hasn't wired up the handler.
    // (Queued renewals no longer disable this — the modal shows a
    //  warning banner explaining the cascade, and the DB trigger keeps
    //  the queued start_date in sync.)
    onPlanSkip?: () => void
    isPending: boolean
    // Expanded action keys for the future-facing buttons. plan-skip /
    // plan-pause / cancel-plan-pause drive their respective button's
    // pending → success → steady microinteraction; unskip is included
    // for completeness (the un-skip surface is the calendar-bar pill
    // rather than a QuickActions button).
    pendingAction: 'skip' | 'pause' | 'resume' | 'plan-skip' | 'unskip' | 'plan-pause' | 'cancel-plan-pause' | null
    successAction: 'skip' | 'pause' | 'resume' | 'plan-skip' | 'unskip' | 'plan-pause' | 'cancel-plan-pause' | null
    skipQuota: { total: number; left: number }
    // When set, both skip + pause are disabled with this message surfaced as a
    // tooltip and a small inline note. Used for paid-but-not-yet-started subs:
    // operations can't honour either action before the kitchen has even begun
    // delivering — so we make it impossible to do the wrong thing rather than
    // letting the user tap and see a server error.
    disabledReason?: string
    // Independent skip-only lockout — kitchen prep cutoff (2 PM Asia/Dubai).
    // Different message, different audience, only blocks skip (pause stays
    // available). When set, this overrides skipCaption with a "back tomorrow"
    // chip so the disabled state has its own visual treatment.
    skipPastCutoff?: boolean
    // Today is a non-delivery day for this sub's week_type (Sun on 6DAYS,
    // Sat or Sun on 5DAYS). Skip would burn a credit + push end_date for
    // a meal that was never scheduled, so we lock it. Pause stays available.
    skipNoDelivery?: boolean
    // Final delivery day + after 2 PM Asia/Dubai. Pausing now would push the
    // end_date out, but the kitchen prep window has already closed — so the
    // pause wouldn't actually protect tonight's delivery, only deliver
    // tomorrow's mistake. Lock the pause until the cycle ends.
    pausePastFinalDay?: boolean
    // The sub was paused today (AE calendar). Resume is locked until tomorrow
    // so the kitchen has at least one committed no-prep window before the
    // customer can flip back. Only blocks Resume, never Pause.
    resumeLockedSameDay?: boolean
    // Whether this plan tier supports pausing at all (Monthly Premium / Max).
    // False for Weekly Flex and Trial. When false the pause button is still
    // rendered but disabled with an upsell chip rather than hidden entirely.
    isPausableTier: boolean
    // True for One-Time / Trial plans. Surfaces an upsell tooltip on the
    // disabled skip button instead of silently showing "No skips".
    isTrialPlan: boolean
    // When set, the customer has a pre-scheduled pause that hasn't activated
    // yet. The Pause button transforms into a "Planned pause from [date]"
    // chip-style state, and tapping it opens the cancel-confirmation modal.
    // YYYY-MM-DD AE wall date.
    plannedPauseDate?: string | null
}) {
    const isPaused = localState === 'paused'
    const isSkipped = localState === 'skipped'
    const lockedOut = !!disabledReason
    // Out of skip credits — the plan supports skips but the customer has
    // used them all. Was a bug previously: the button stayed bright-orange
    // and clickable, only surfacing the limit AFTER the customer tapped
    // and the server rejected. Disabling at the UI layer + outlined
    // treatment matches every other "you can't do this" state.
    const skipQuotaExhausted = skipQuota.total > 0 && skipQuota.left === 0
    const skipDisabled = lockedOut || skipPastCutoff || skipNoDelivery || skipQuotaExhausted
    const skipTooltip = lockedOut ? disabledReason
        : skipNoDelivery ? "Today isn't a delivery day for your plan, so there's nothing to skip."
        : skipPastCutoff ? 'Skip cutoff for today is 2 PM. Try again tomorrow morning.'
        : isTrialPlan ? "Skipping isn't available on a one-time trial. Upgrade to a monthly plan to unlock skips."
        : isSkipped ? "You've already skipped tonight's meal."
        : skipQuotaExhausted ? `You've used all ${skipQuota.total} skips for this cycle.`
        // Active state: surface useful context the button label doesn't show.
        : skipQuota.total > 0
            ? `Skip tonight's delivery — ${skipQuota.left} of ${skipQuota.total} ${skipQuota.total === 1 ? 'skip' : 'skips'} left this cycle`
            : undefined

    // Caption that lives in a small chip on the right of the skip button.
    // Surfaces the cycle remainder so the user can plan ahead — and the
    // "Last one" / "None left" wording leans into loss-aversion when the
    // pool is running low, nudging the user to think before they tap.
    const skipCaption =
        skipNoDelivery         ? 'No delivery' :
        skipPastCutoff         ? 'Past 2 PM' :
        isTrialPlan            ? 'Trial only' :
        skipQuota.total === 0  ? 'No skips' :
        skipQuota.left  === 0  ? 'None left' :
        skipQuota.left  === 1  ? 'Last one' :
                                 `${skipQuota.left} left`

    return (
        <div style={{
            ...TIER1,
            gridColumn: 'span 4',
            padding: 'clamp(26px, 2.8vw, 36px)', borderRadius: 'var(--radius-md)',
            display: 'flex', flexDirection: 'column', gap: 18,
        }} className="quick-actions-card">
            <Eyebrow>Quick actions</Eyebrow>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Skip — filled primary when active; outlined / disabled otherwise.
                    When the plan is paused, skip is irrelevant so we hide it entirely. */}
                {!isPaused && (() => {
                    const skipIsPrimary = !isSkipped && !skipDisabled
                    const baseStyle: CSSProperties = skipIsPrimary
                        ? { background: OG, color: '#fff', border: '1px solid transparent', boxShadow: '0 4px 16px rgba(245,127,32,0.30)' }
                        : { background: 'transparent', color: S.fg, border: `1px solid ${S.border2}` }
                    return (
                        <Tooltip label={skipTooltip}>
                        <button
                            onClick={onSkipRequest}
                            disabled={isPending || isSkipped || skipDisabled}
                            className={skipIsPrimary ? 'qa-row qa-row-primary' : 'qa-row qa-row-outline'}
                            aria-label="Skip today's meal"
                            style={{
                                ...baseStyle,
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                justifyContent: 'flex-start',
                                padding: '14px 18px', width: '100%',
                                borderRadius: 'var(--radius-pill)',
                                fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                cursor: (isSkipped || skipDisabled) ? 'not-allowed' : 'pointer',
                                opacity: isPending || isSkipped || skipDisabled ? 0.6 : 1,
                                transition: 'opacity 150ms, transform 150ms, box-shadow 150ms, background 150ms, border-color 150ms',
                            }}
                        >
                            {pendingAction === 'skip' ? (
                                <><BtnSpinner /> <span>Skipping…</span></>
                            ) : successAction === 'skip' ? (
                                <><Check size={16} strokeWidth={2.4} /> <span>Skipped today</span></>
                            ) : (
                                <><SkipForward size={16} strokeWidth={2.2} /> <span>{isSkipped ? 'Skipped today' : "Skip tonight's meal"}</span></>
                            )}
                            <span style={{
                                marginLeft: 'auto',
                                fontFamily: BODY,
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: '0.10em',
                                textTransform: 'uppercase',
                                padding: '4px 9px',
                                borderRadius: 999,
                                background: skipIsPrimary ? 'rgba(255,255,255,0.20)' : 'var(--ds-skeleton-base)',
                                color: 'inherit',
                                whiteSpace: 'nowrap',
                                fontFeatureSettings: '"tnum"',
                            }}>
                                {skipCaption}
                            </span>
                        </button>
                        </Tooltip>
                    )
                })()}

                {/* Plan-a-skip — opens the picker-mode FutureSkipModal so the
                    customer can schedule a future-date skip (e.g., planned trip
                    home). Hidden for trial-tier plans (no skip credits at all)
                    and when the parent hasn't wired up a handler. Disabled (with
                    a tooltip) when: paused / sub-not-started / out of credits /
                    queued renewal. Always an outlined secondary — Skip + Resume
                    own the primary slot when relevant. */}
                {onPlanSkip && skipQuota.total > 0 && !isTrialPlan && (() => {
                    const planSkipDisabled =
                        isPending
                        || isPaused
                        || lockedOut                       // sub paid-but-not-started
                        || skipQuota.left === 0
                    const planSkipTooltip =
                        lockedOut ? disabledReason
                        : isPaused ? 'Resume your plan to schedule a skip.'
                        : skipQuota.left === 0 ? `You've used all ${skipQuota.total} skips for this cycle.`
                        // Active state: same info QuickActions skip-tonight tooltip carries.
                        : `Schedule a skip for a future day — ${skipQuota.left} of ${skipQuota.total} ${skipQuota.total === 1 ? 'skip' : 'skips'} left this cycle`
                    return (
                        <Tooltip label={planSkipTooltip}>
                        <button
                            onClick={onPlanSkip}
                            disabled={planSkipDisabled}
                            className="qa-row qa-row-outline"
                            aria-label="Plan a skip for a future date"
                            style={{
                                background: 'transparent', color: S.fg, border: `1px solid ${S.border2}`,
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                justifyContent: 'flex-start',
                                padding: '14px 18px', width: '100%',
                                borderRadius: 'var(--radius-pill)',
                                fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                cursor: planSkipDisabled ? 'not-allowed' : 'pointer',
                                opacity: planSkipDisabled ? 0.55 : 1,
                                transition: 'opacity 150ms, transform 150ms, box-shadow 150ms, background 150ms, border-color 150ms',
                            }}
                        >
                            <AnimatePresence mode="wait" initial={false}>
                                {pendingAction === 'plan-skip' ? (
                                    <motion.span key="plan-skip-pending"
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        transition={{ duration: 0.12 }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <BtnSpinner />
                                        <span>Scheduling…</span>
                                    </motion.span>
                                ) : pendingAction === 'unskip' ? (
                                    <motion.span key="unskip-pending"
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        transition={{ duration: 0.12 }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <BtnSpinner />
                                        <span>Removing skip…</span>
                                    </motion.span>
                                ) : successAction === 'plan-skip' ? (
                                    <motion.span key="plan-skip-success"
                                        initial={{ opacity: 0, scale: 0.82, y: 3 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.30, ease: [0.34, 1.56, 0.64, 1] }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <Check size={16} strokeWidth={2.6} />
                                        <span>Skip scheduled</span>
                                    </motion.span>
                                ) : successAction === 'unskip' ? (
                                    <motion.span key="unskip-success"
                                        initial={{ opacity: 0, scale: 0.82, y: 3 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.30, ease: [0.34, 1.56, 0.64, 1] }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <Check size={16} strokeWidth={2.6} />
                                        <span>Skip removed</span>
                                    </motion.span>
                                ) : (
                                    <motion.span key="plan-skip-rest"
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <CalendarPlus size={16} strokeWidth={2.2} />
                                        <span>Plan a skip</span>
                                    </motion.span>
                                )}
                            </AnimatePresence>
                            {pendingAction !== 'plan-skip' && pendingAction !== 'unskip' && successAction !== 'plan-skip' && successAction !== 'unskip' && (
                                <span style={{
                                    marginLeft: 'auto',
                                    fontFamily: BODY,
                                    fontSize: 10,
                                    fontWeight: 800,
                                    letterSpacing: '0.10em',
                                    textTransform: 'uppercase',
                                    padding: '4px 9px',
                                    borderRadius: 999,
                                    background: 'var(--ds-skeleton-base)',
                                    color: 'inherit',
                                    whiteSpace: 'nowrap',
                                    fontFeatureSettings: '"tnum"',
                                }}>
                                    Future day
                                </span>
                            )}
                        </button>
                        </Tooltip>
                    )
                })()}

                {/* Pause / Resume — Resume becomes the filled primary when paused;
                    Pause is a secondary outline when active.
                    Always rendered for non-pausable tiers (weekly / trial) as a
                    disabled upsell rather than hidden, so the upgrade path is visible.
                    When the plan is in 'Skipped' state for today, pausing is
                    disabled — today's day is already accounted for, so a pause
                    on top would double-count against the kitchen-ops calendar.
                    Auto-clears at midnight AE when the cron flips back to Active. */}
                {(canPause || isPaused || !isPausableTier || !!plannedPauseDate) && (() => {
                    const isSuccessResume = successAction === 'resume'
                    const hasPlannedPause = !!plannedPauseDate && !isPaused
                    const pauseIsPrimary = (isPaused && !lockedOut) || isSuccessResume
                    // isSkipped only blocks PAUSE (not Resume) — a paused user can't be skipped.
                    const pauseBlockedBySkip = isSkipped && !isPaused && !hasPlannedPause
                    // pausePastFinalDay only locks Pause (not Resume) — a
                    // paused customer who's already on the final day can
                    // still hit Resume to wrap up cleanly.
                    const pauseLockedFinalDay = !!pausePastFinalDay && !isPaused && !hasPlannedPause
                    // resumeLockedSameDay only locks Resume (not Pause) — the kitchen
                    // needs one committed no-prep window before the customer flips back.
                    const resumeLockedToday = !!resumeLockedSameDay && isPaused
                    // Non-pausable tier (weekly / trial): always disabled, show upsell.
                    const pauseIsUpsell = !isPausableTier && !isPaused && !hasPlannedPause
                    // Planned-pause state always remains tappable (it opens the
                    // cancel-confirm modal). Only disabled while a transition
                    // is in flight.
                    const pauseDisabled = hasPlannedPause
                        ? isPending
                        : isPending || lockedOut || pauseBlockedBySkip || pauseLockedFinalDay || resumeLockedToday || pauseIsUpsell
                    const pauseTooltip = hasPlannedPause
                        ? 'Tap to cancel your scheduled pause.'
                        : pauseIsUpsell
                            ? 'Upgrade to a monthly plan to unlock pausing.'
                            : lockedOut
                                ? disabledReason
                                : resumeLockedToday
                                    ? 'Your plan was paused today — resume becomes available tomorrow.'
                                    : pauseBlockedBySkip
                                        ? "You've skipped today's meal — pausing is available again from tomorrow."
                                        : pauseLockedFinalDay
                                            ? "This is your last delivery day — pausing now wouldn't protect any future meal."
                                            // Active states:
                                            : isPaused
                                                ? 'Resume your plan — deliveries continue from tomorrow.'
                                                : 'Pause your plan — 1 free pause available this cycle.'
                    const baseStyle: CSSProperties = pauseIsPrimary
                        ? { background: OG, color: '#fff', border: '1px solid transparent', boxShadow: '0 4px 16px rgba(245,127,32,0.30)' }
                        : hasPlannedPause
                            ? { background: 'var(--ds-og-wash)', color: S.fg, border: `1px solid var(--ds-og-border)` }
                            : { background: 'transparent', color: S.fg, border: `1px solid ${S.border2}` }
                    return (
                        <Tooltip label={pauseTooltip}>
                        <button
                            onClick={onPause}
                            disabled={pauseDisabled || isSuccessResume}
                            className={pauseIsPrimary ? `qa-row qa-row-primary${isSuccessResume ? ' qa-resume-success' : ''}` : 'qa-row qa-row-outline'}
                            aria-label={isSuccessResume ? 'Plan resumed' : isPaused ? 'Resume plan' : 'Pause plan'}
                            style={{
                                ...baseStyle,
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                justifyContent: 'flex-start',
                                padding: '14px 18px', width: '100%',
                                borderRadius: 'var(--radius-pill)',
                                fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                cursor: isSuccessResume ? 'default' : pauseDisabled ? 'not-allowed' : 'pointer',
                                opacity: isSuccessResume ? 1 : pauseDisabled ? (lockedOut || pauseBlockedBySkip || pauseIsUpsell ? 0.6 : 0.75) : 1,
                                transition: 'opacity 150ms, transform 150ms, box-shadow 150ms, background 150ms, border-color 150ms',
                            }}
                        >
                            <AnimatePresence mode="wait" initial={false}>
                                {/* Drive state key off the action/outcome, not isPaused,
                                    so AnimatePresence can sequence the exit→enter correctly
                                    when pendingAction clears and isSuccessResume fires. */}
                                {pendingAction === 'pause' || pendingAction === 'resume' || pendingAction === 'plan-pause' || pendingAction === 'cancel-plan-pause' ? (
                                    <motion.span key="pending"
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        transition={{ duration: 0.12 }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <BtnSpinner />
                                        {/* Drive the label off pendingAction directly,
                                            NOT off isPaused — see comment in original code. */}
                                        <span>
                                            {pendingAction === 'resume' ? 'Resuming…'
                                                : pendingAction === 'plan-pause' ? 'Scheduling…'
                                                : pendingAction === 'cancel-plan-pause' ? 'Cancelling…'
                                                : 'Pausing…'}
                                        </span>
                                    </motion.span>
                                ) : isSuccessResume ? (
                                    <motion.span key="success-resume"
                                        initial={{ opacity: 0, scale: 0.82, y: 3 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.30, ease: [0.34, 1.56, 0.64, 1] }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <Check size={16} strokeWidth={2.6} />
                                        <span>Plan resumed</span>
                                    </motion.span>
                                ) : successAction === 'plan-pause' ? (
                                    <motion.span key="success-plan-pause"
                                        initial={{ opacity: 0, scale: 0.82, y: 3 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.30, ease: [0.34, 1.56, 0.64, 1] }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <Check size={16} strokeWidth={2.6} />
                                        <span>Pause scheduled</span>
                                    </motion.span>
                                ) : successAction === 'cancel-plan-pause' ? (
                                    <motion.span key="success-cancel-plan-pause"
                                        initial={{ opacity: 0, scale: 0.82, y: 3 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.30, ease: [0.34, 1.56, 0.64, 1] }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <Check size={16} strokeWidth={2.6} />
                                        <span>Pause cancelled</span>
                                    </motion.span>
                                ) : isPaused ? (
                                    <motion.span key="resume"
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <Play size={16} strokeWidth={2.2} fill="currentColor" />
                                        <span>Resume plan</span>
                                    </motion.span>
                                ) : hasPlannedPause ? (
                                    <motion.span key="planned-pause"
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <CalendarClock size={16} strokeWidth={2.2} color={OG} />
                                        <span>
                                            Pause planned · {plannedPauseDate
                                                ? new Date(plannedPauseDate + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
                                                : ''}
                                        </span>
                                    </motion.span>
                                ) : (
                                    <motion.span key="pause"
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                    >
                                        <PauseIcon size={16} strokeWidth={2.2} />
                                        <span>{pauseBlockedBySkip || pauseLockedFinalDay ? 'Pause unavailable today' : 'Pause my plan'}</span>
                                    </motion.span>
                                )}
                            </AnimatePresence>
                            {pauseIsUpsell && (
                                <span style={{
                                    marginLeft: 'auto',
                                    fontFamily: BODY,
                                    fontSize: 10,
                                    fontWeight: 800,
                                    letterSpacing: '0.10em',
                                    textTransform: 'uppercase',
                                    padding: '4px 9px',
                                    borderRadius: 999,
                                    background: 'var(--ds-skeleton-base)',
                                    color: 'inherit',
                                    whiteSpace: 'nowrap',
                                }}>
                                    Monthly only
                                </span>
                            )}
                        </button>
                        </Tooltip>
                    )
                })()}
            </div>
        </div>
    )
}
