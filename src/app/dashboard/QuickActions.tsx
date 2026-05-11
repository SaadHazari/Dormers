import type { CSSProperties } from 'react'
import { SkipForward, Pause as PauseIcon, Play, Check } from 'lucide-react'
import { OG, BODY, S, TIER1 } from './_shared/tokens'
import { Eyebrow } from './_shared/Eyebrow'
import { BtnSpinner } from './_shared/buttons'
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
}: {
    canPause: boolean
    localState: LocalState
    onPause: () => void
    onSkipRequest: () => void
    isPending: boolean
    pendingAction: 'skip' | 'pause' | 'resume' | null
    successAction: 'skip' | 'pause' | 'resume' | null
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
}) {
    const isPaused = localState === 'paused'
    const isSkipped = localState === 'skipped'
    const lockedOut = !!disabledReason
    const skipDisabled = lockedOut || skipPastCutoff || skipNoDelivery
    const skipTooltip = lockedOut ? disabledReason
        : skipNoDelivery ? "Today isn't a delivery day for your plan, so there's nothing to skip."
        : skipPastCutoff ? 'Skip cutoff for today is 2 PM. Try again tomorrow morning.'
        : isTrialPlan ? "Skipping isn't available on a one-time trial. Upgrade to a monthly plan to unlock skips."
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

            {(lockedOut || skipPastCutoff || skipNoDelivery) && (
                <div
                    role="note"
                    style={{
                        marginTop: -6,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--ds-og-wash)',
                        border: '1px solid var(--ds-og-border)',
                        fontFamily: BODY,
                        fontSize: 11.5,
                        color: OG,
                        lineHeight: 1.45,
                    }}
                >
                    {lockedOut
                        ? disabledReason
                        : skipNoDelivery
                            ? "No delivery scheduled today — skip is only available on a delivery day."
                            : 'Skip cutoff is 2 PM — kitchen prep starts then. Try tomorrow morning.'}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Skip — filled primary when active; outlined / disabled otherwise.
                    When the plan is paused, skip is irrelevant so we hide it entirely. */}
                {!isPaused && (() => {
                    const skipIsPrimary = !isSkipped && !skipDisabled
                    const baseStyle: CSSProperties = skipIsPrimary
                        ? { background: OG, color: '#fff', border: '1px solid transparent', boxShadow: '0 4px 16px rgba(245,127,32,0.30)' }
                        : { background: 'transparent', color: S.fg, border: `1px solid ${S.border2}` }
                    return (
                        <button
                            onClick={onSkipRequest}
                            disabled={isPending || isSkipped || skipDisabled}
                            className={skipIsPrimary ? 'qa-row qa-row-primary' : 'qa-row qa-row-outline'}
                            aria-label="Skip today's meal"
                            title={skipTooltip}
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
                {(canPause || isPaused || !isPausableTier) && (() => {
                    const pauseIsPrimary = isPaused && !lockedOut  // resume is the call to action
                    // isSkipped only blocks PAUSE (not Resume) — a paused user can't be skipped.
                    const pauseBlockedBySkip = isSkipped && !isPaused
                    // pausePastFinalDay only locks Pause (not Resume) — a
                    // paused customer who's already on the final day can
                    // still hit Resume to wrap up cleanly.
                    const pauseLockedFinalDay = !!pausePastFinalDay && !isPaused
                    // resumeLockedSameDay only locks Resume (not Pause) — the kitchen
                    // needs one committed no-prep window before the customer flips back.
                    const resumeLockedToday = !!resumeLockedSameDay && isPaused
                    // Non-pausable tier (weekly / trial): always disabled, show upsell.
                    const pauseIsUpsell = !isPausableTier && !isPaused
                    const pauseDisabled = isPending || lockedOut || pauseBlockedBySkip || pauseLockedFinalDay || resumeLockedToday || pauseIsUpsell
                    const pauseTooltip = pauseIsUpsell
                        ? 'Upgrade to a monthly plan to unlock pausing.'
                        : lockedOut
                            ? disabledReason
                            : resumeLockedToday
                                ? 'Your plan was paused today — resume becomes available tomorrow.'
                                : pauseBlockedBySkip
                                    ? "You've skipped today's meal — pausing is available again from tomorrow."
                                    : pauseLockedFinalDay
                                        ? "It's the final day and the kitchen prep window has closed — pausing now wouldn't protect tonight's delivery."
                                        : undefined
                    const baseStyle: CSSProperties = pauseIsPrimary
                        ? { background: OG, color: '#fff', border: '1px solid transparent', boxShadow: '0 4px 16px rgba(245,127,32,0.30)' }
                        : { background: 'transparent', color: S.fg, border: `1px solid ${S.border2}` }
                    return (
                        <button
                            onClick={onPause}
                            disabled={pauseDisabled}
                            className={pauseIsPrimary ? 'qa-row qa-row-primary' : 'qa-row qa-row-outline'}
                            aria-label={isPaused ? 'Resume plan' : 'Pause plan'}
                            title={pauseTooltip}
                            style={{
                                ...baseStyle,
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                justifyContent: 'flex-start',
                                padding: '14px 18px', width: '100%',
                                borderRadius: 'var(--radius-pill)',
                                fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                cursor: pauseDisabled ? 'not-allowed' : 'pointer',
                                opacity: pauseDisabled ? (lockedOut || pauseBlockedBySkip || pauseIsUpsell ? 0.6 : 0.75) : 1,
                                transition: 'opacity 150ms, transform 150ms, box-shadow 150ms, background 150ms, border-color 150ms',
                            }}
                        >
                            {pendingAction === 'pause' || pendingAction === 'resume' ? (
                                // Drive the label off pendingAction directly,
                                // NOT off isPaused. localState flips
                                // optimistically the instant the user clicks,
                                // so a Pause click arrives here with
                                // isPaused=true while pendingAction='pause' —
                                // reading isPaused would mislabel the spinner
                                // "Resuming…" for the entire pause request.
                                <><BtnSpinner /> <span>{pendingAction === 'resume' ? 'Resuming…' : 'Pausing…'}</span></>
                            ) : isPaused ? (
                                <><Play size={16} strokeWidth={2.2} fill="currentColor" /> <span>Resume plan</span></>
                            ) : (
                                <><PauseIcon size={16} strokeWidth={2.2} /> <span>{pauseBlockedBySkip || pauseLockedFinalDay ? 'Pause unavailable today' : 'Pause my plan'}</span></>
                            )}
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
                    )
                })()}
            </div>
        </div>
    )
}
