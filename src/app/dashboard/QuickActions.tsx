import type { CSSProperties } from 'react'
import { SkipForward, Pause as PauseIcon, Play, Check } from 'lucide-react'
import { OG, NV, BODY, S, TIER1 } from './_shared/tokens'
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
}) {
    const isPaused = localState === 'paused'
    const isSkipped = localState === 'skipped'
    const lockedOut = !!disabledReason
    const skipDisabled = lockedOut || skipPastCutoff
    const skipTooltip = lockedOut ? disabledReason
        : skipPastCutoff ? 'Skip cutoff for today is 2 PM. Try again tomorrow morning.'
        : undefined

    // Caption that lives in a small chip on the right of the skip button.
    // Surfaces the cycle remainder so the user can plan ahead — and the
    // "Last one" / "None left" wording leans into loss-aversion when the
    // pool is running low, nudging the user to think before they tap.
    const skipCaption =
        skipPastCutoff         ? 'Past 2 PM' :
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

            {(lockedOut || skipPastCutoff) && (
                <div
                    role="note"
                    style={{
                        marginTop: -6,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(245,127,32,0.08)',
                        border: '1px solid rgba(245,127,32,0.22)',
                        fontFamily: BODY,
                        fontSize: 11.5,
                        color: '#a35100',
                        lineHeight: 1.45,
                    }}
                >
                    {lockedOut
                        ? disabledReason
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
                        : { background: 'transparent', color: NV, border: `1px solid ${S.border2}` }
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
                                background: skipIsPrimary ? 'rgba(255,255,255,0.20)' : 'rgba(9,24,37,0.07)',
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
                    Pause is a secondary outline when active. Hidden if not pausable. */}
                {(canPause || isPaused) && (() => {
                    const pauseIsPrimary = isPaused && !lockedOut  // resume is the call to action
                    const baseStyle: CSSProperties = pauseIsPrimary
                        ? { background: OG, color: '#fff', border: '1px solid transparent', boxShadow: '0 4px 16px rgba(245,127,32,0.30)' }
                        : { background: 'transparent', color: NV, border: `1px solid ${S.border2}` }
                    return (
                        <button
                            onClick={onPause}
                            disabled={isPending || lockedOut}
                            className={pauseIsPrimary ? 'qa-row qa-row-primary' : 'qa-row qa-row-outline'}
                            aria-label={isPaused ? 'Resume plan' : 'Pause plan'}
                            title={lockedOut ? disabledReason : undefined}
                            style={{
                                ...baseStyle,
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                justifyContent: 'flex-start',
                                padding: '14px 18px', width: '100%',
                                borderRadius: 'var(--radius-pill)',
                                fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                cursor: lockedOut ? 'not-allowed' : 'pointer',
                                opacity: (isPending || lockedOut) ? (lockedOut ? 0.6 : 0.75) : 1,
                                transition: 'opacity 150ms, transform 150ms, box-shadow 150ms, background 150ms, border-color 150ms',
                            }}
                        >
                            {pendingAction === 'pause' || pendingAction === 'resume' ? (
                                <><BtnSpinner /> <span>{isPaused ? 'Resuming…' : 'Pausing…'}</span></>
                            ) : isPaused ? (
                                <><Play size={16} strokeWidth={2.2} fill="currentColor" /> <span>Resume plan</span></>
                            ) : (
                                <><PauseIcon size={16} strokeWidth={2.2} /> <span>Pause my plan</span></>
                            )}
                        </button>
                    )
                })()}
            </div>
        </div>
    )
}
