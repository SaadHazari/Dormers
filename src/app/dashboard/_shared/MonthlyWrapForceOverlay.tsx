'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { OG, BODY } from './tokens'
import { MONTHLY_REWARD_AED, wrapVocabFor, type MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'

/**
 * Forcing overlay shown on the evening of the last delivery day of a cycle —
 * after the meal is delivered (>= MONTHLY_PRE_CRON_HOUR_AE), before the
 * end-of-night cron flips the subscription to ENDED.
 *
 * Architecture intent (see project_now_tray_architecture memory): this is the
 * single highest-friction prompt in the wrap layer — the narrow window
 * justifies the force. Outside this window the Now tray + dashboard
 * strip/banner take over with graceful degradation.
 *
 * Discipline rules:
 *   • Fires at most once per session (sessionStorage). Reopening the dashboard
 *     within the same session does not re-show. Next session brings it back.
 *   • Backdrop click does NOT dismiss — explicit CTA required (Norman:
 *     hidden cancels create accidental dismissal). ESC dismisses.
 *   • Copy adapts to queued-plan presence — closing one chapter before
 *     opening the next is a stronger narrative hook than a standalone wrap.
 *   • Primary CTA names the reward inline ("+AED 5") — collapses two
 *     cognitive steps into one.
 */

const DISMISS_KEY = 'dormers:monthly-wrap-overlay:dismissed'

export function MonthlyWrapForceOverlay({
    monthlyWindow,
    queuedPlanSummary,
}: {
    monthlyWindow: MonthlyReviewWindow
    queuedPlanSummary: { planName: string; startDate: string } | null
}) {
    const router = useRouter()
    const prefersReducedMotion = useReducedMotion()
    // Visible-until-dismissed local state. Starts true so SSR shows the
    // overlay markup, then the mount effect immediately re-checks sessionStorage
    // and hides it if already dismissed this session. Avoids a flash where the
    // overlay was hidden and then reappears (worse than the inverse).
    const [visible, setVisible] = useState(true)

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            if (window.sessionStorage.getItem(DISMISS_KEY) === '1') {
                setVisible(false)
            }
        } catch { /* sessionStorage blocked — keep visible, no harm */ }
    }, [])

    // ESC dismisses (without persisting — same as "Remind me later" but
    // without the trip back to sessionStorage. Per-session dismissal still
    // applies via the button path.)
    useEffect(() => {
        if (!visible) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') dismiss()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [visible])

    if (!monthlyWindow.preCron || !visible) return null

    const vocab = wrapVocabFor(monthlyWindow.planTier)
    const cycleLabel = monthlyWindow.cycleLabel ?? 'cycle'
    const hasQueued = !!queuedPlanSummary
    // Headline varies by plan tier — "your month, wrapped" works for monthly
    // but reads oddly for a trial. Plain-English headline per tier.
    const headline = hasQueued
        ? 'One chapter closes.'
        : vocab.period === 'meal'
            ? 'Your trial, wrapped.'
            : `Your ${vocab.period}, wrapped.`
    // Plain-English subline. Queued: name the next plan + start date so the
    // arc reads "close one before opening the next." Non-queued: name the
    // freshness window so the why-now is obvious.
    const startDateLabel = queuedPlanSummary?.startDate
        ? formatStartDate(queuedPlanSummary.startDate)
        : ''
    const subline = hasQueued
        ? `Your new ${queuedPlanSummary?.planName ?? 'plan'} starts ${startDateLabel}. Close out your ${cycleLabel} first to lock AED ${MONTHLY_REWARD_AED}.`
        : vocab.period === 'meal'
            ? `That was your trial meal. Wrap it up while it's still fresh — that's where the AED ${MONTHLY_REWARD_AED} lives.`
            : `Your ${cycleLabel} ends tonight. Wrap it up while the meals are still fresh in your head — that's where the AED ${MONTHLY_REWARD_AED} lives.`

    function dismiss() {
        try { window.sessionStorage.setItem(DISMISS_KEY, '1') } catch {}
        setVisible(false)
    }

    function startWrap() {
        // Persist the dismissal so navigating back to the dashboard during
        // the form flow doesn't re-pop the overlay.
        try { window.sessionStorage.setItem(DISMISS_KEY, '1') } catch {}
        router.push('/dashboard/menu/review/monthly')
    }

    return (
        <AnimatePresence>
            <motion.div
                key="monthly-wrap-force-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="monthly-wrap-overlay-title"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.15 : 0.32 }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 320,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 'clamp(20px, 4vw, 40px)',
                    // Dark warm backdrop with a centered radial glow — same
                    // vocabulary as ResumeWelcomeOverlay so this reads as part
                    // of the same overlay family, not a foreign modal.
                    background: 'radial-gradient(ellipse 55% 45% at center, rgba(245,127,32,0.28) 0%, transparent 70%), rgba(9,24,37,0.92)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                }}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 14 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={
                        prefersReducedMotion
                            ? { duration: 0.18 }
                            : { duration: 0.46, ease: [0.16, 1, 0.3, 1] }
                    }
                    style={{
                        position: 'relative',
                        maxWidth: 480, width: '100%',
                        padding: 'clamp(28px, 4vw, 40px)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--ds-bg)',
                        border: '1px solid var(--ds-og-border)',
                        boxShadow: '0 30px 80px rgba(9,24,37,0.55), 0 0 0 6px rgba(245,127,32,0.10)',
                        textAlign: 'center',
                        fontFamily: BODY,
                    }}
                >
                    {/* Medallion — orange disc with sparkles. Spring entry
                        gives it a "this is a moment" feel without spilling
                        into celebration (no confetti — save that for the
                        post-submit reveal). */}
                    <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={
                            prefersReducedMotion
                                ? { duration: 0.2 }
                                : { type: 'spring', stiffness: 220, damping: 16, delay: 0.08 }
                        }
                        style={{
                            margin: '0 auto 18px',
                            width: 72, height: 72,
                            borderRadius: '50%',
                            background: OG,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 14px 36px rgba(245,127,32,0.40), 0 0 0 6px rgba(245,127,32,0.14)',
                        }}
                    >
                        <Sparkles size={30} strokeWidth={2.2} color="#fff" />
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                            prefersReducedMotion
                                ? { duration: 0.2, delay: 0.1 }
                                : { duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: 0.32 }
                        }
                    >
                        <h2
                            id="monthly-wrap-overlay-title"
                            style={{
                                margin: 0,
                                fontFamily: BODY,
                                fontSize: 'clamp(26px, 3.4vw, 32px)',
                                fontWeight: 800,
                                letterSpacing: '-0.02em',
                                lineHeight: 1.15,
                                color: 'var(--ds-fg)',
                            }}
                        >
                            {headline}
                        </h2>
                        <p style={{
                            margin: '14px auto 0',
                            maxWidth: '38ch',
                            fontFamily: BODY, fontSize: 14, fontWeight: 500,
                            color: 'var(--ds-fg-muted)', lineHeight: 1.55,
                        }}>
                            {subline}
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                            prefersReducedMotion
                                ? { duration: 0.2, delay: 0.14 }
                                : { duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: 0.46 }
                        }
                        style={{
                            marginTop: 26,
                            display: 'flex', flexDirection: 'column', gap: 10,
                            alignItems: 'stretch',
                        }}
                    >
                        <button
                            type="button"
                            onClick={startWrap}
                            autoFocus
                            className="mwfo-primary"
                            style={{
                                padding: '13px 20px',
                                borderRadius: 999,
                                border: 'none',
                                background: OG,
                                color: '#fff',
                                fontFamily: BODY, fontSize: 13, fontWeight: 800,
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                                cursor: 'pointer',
                                boxShadow: '0 8px 22px rgba(245,127,32,0.42)',
                                transition: 'transform 150ms, box-shadow 150ms',
                            }}
                        >
                            Wrap it up · +AED {MONTHLY_REWARD_AED}
                        </button>
                        <button
                            type="button"
                            onClick={dismiss}
                            className="mwfo-secondary"
                            style={{
                                padding: '10px 14px',
                                borderRadius: 999,
                                border: '1px solid var(--ds-border-soft)',
                                background: 'transparent',
                                color: 'var(--ds-fg-muted)',
                                fontFamily: BODY, fontSize: 12, fontWeight: 700,
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                                cursor: 'pointer',
                                transition: 'background 150ms, color 150ms',
                            }}
                        >
                            Remind me later
                        </button>
                    </motion.div>
                </motion.div>

                <style jsx>{`
                    .mwfo-primary:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 12px 28px rgba(245,127,32,0.50);
                    }
                    .mwfo-secondary:hover {
                        background: var(--ds-og-wash);
                        color: var(--ds-fg);
                    }
                `}</style>
            </motion.div>
        </AnimatePresence>
    )
}

/**
 * Format a sub start_date ISO into "Mon, May 30" — short, scannable, no year.
 * If parsing fails, returns "soon" so the copy doesn't read like a bug.
 */
function formatStartDate(iso: string): string {
    try {
        const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
        return d.toLocaleDateString('en-AE', {
            weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
        })
    } catch {
        return 'soon'
    }
}
