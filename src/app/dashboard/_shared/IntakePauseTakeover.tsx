'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { ShieldCheck, Check } from 'lucide-react'
import { OG, BODY, TIER_POP_TEXT } from './tokens'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import { deriveJoinOutcome, type JoinOutcome } from './intake-join-outcome'
import { pauseTakeoverCta } from './pause-takeover-actions'

interface Props {
    variant: 'pausing' | 'reopened'
    creditAed: number
    onDismiss: () => void
    /** True when this customer already saved a spot in the CURRENT pause. */
    alreadyJoined?: boolean
}

/**
 * Seasonal intake pause — the two state-change takeovers.
 *
 * Sibling of CheckoutSuccessTakeover / WeeklyReviewTakeover / the monthly
 * wrap force overlay: same full-bleed dark navy gradient, same
 * TIER_POP_TEXT.primary warm-cream body copy, same centered icon-circle +
 * gradient-heading + pill-CTA shape, so all four moments read as one family.
 *
 * `pausing` — shown once to a customer with a live plan, on their first
 * dashboard visit after the pause begins. Leads with reassurance ("Your
 * plan is safe") before it ever says the word "paused" — a pause
 * announcement that reads as "Dormers is closing" would cause the churn
 * this feature exists to prevent.
 *
 * `reopened` — shown once to a customer on the early-access list once
 * intake reopens. Names the credit sitting in their account and points at
 * the plan page.
 *
 * Caller owns the once-only rule: ClientDashboard decides whether to mount
 * this at all (localStorage flag, one per variant — see
 * dismissIntakeTakeover in ClientDashboard.tsx) and what onDismiss does.
 * This component only renders the two messages; it holds no persistence
 * logic of its own.
 */
export function IntakePauseTakeover({ variant, creditAed, onDismiss, alreadyJoined }: Props) {
    const [dismissing, setDismissing] = useState(false)
    const prefersReducedMotion = useReducedMotion()
    const router = useRouter()

    const [outcome, setOutcome] = useState<JoinOutcome | null>(null)
    const [joining, startJoin] = useTransition()

    const cta = pauseTakeoverCta({
        variant,
        alreadyJoined: !!alreadyJoined,
        justJoined: !!outcome?.joined,
    })

    // Every displayed value comes from the action's own result, never from the
    // prospective `creditAed` prop — that prop is what the settings row would
    // mint, not what actually landed. Promising an amount that was never
    // created is the exact regression intake-join-outcome.ts exists to stop.
    const handleJoin = () => {
        startJoin(async () => {
            const result = await joinIntakeWaitlist()
            const nextOutcome = deriveJoinOutcome(result)
            setOutcome(nextOutcome)
            // The Credit Wallet is server-rendered in dashboard/layout.tsx, so a
            // fresh mint is invisible until the server components re-render —
            // without this, a customer who just joined dismisses the takeover
            // into a sidebar with no wallet at all.
            if (nextOutcome.joined) {
                router.refresh()
            }
        })
    }

    const handleDismiss = () => {
        setDismissing(true)
        onDismiss()
    }

    const initial = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 100,
                background: `
                    radial-gradient(ellipse 90% 60% at 92% -8%, rgba(245,127,32,0.13) 0%, transparent 55%),
                    radial-gradient(ellipse 70% 50% at 8% 108%, rgba(255,170,0,0.07) 0%, transparent 55%),
                    linear-gradient(135deg, #1c4255 0%, #0a1c2a 55%, #061421 100%)
                `,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px clamp(20px, 4vw, 48px)',
                fontFamily: BODY,
                color: TIER_POP_TEXT.primary,
                overflow: 'auto',
            }}
        >
            <motion.div
                initial={initial}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.15 : 0.32 }}
                style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}
            >
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, ${OG} 0%, #ffaa00 100%)`,
                        boxShadow: '0 12px 40px rgba(245,127,32,0.55)',
                        marginBottom: 28,
                    }}
                >
                    {variant === 'pausing' ? (
                        <ShieldCheck size={34} strokeWidth={2.4} color="#fff" />
                    ) : (
                        <Check size={36} strokeWidth={3} color="#fff" />
                    )}
                </div>

                {variant === 'pausing' ? (
                    <>
                        <H1>Your plan is safe.</H1>
                        <Sub>
                            New plans are paused between semesters. Every delivery you have already paid for continues exactly as scheduled. We will message you the day we reopen.
                        </Sub>
                    </>
                ) : (
                    <>
                        <H1>We are back.</H1>
                        <Sub>New plans are open again.</Sub>
                        <div
                            style={{
                                margin: '0 auto 36px',
                                fontFamily: BODY,
                                fontSize: 'clamp(18px, 2.4vw, 22px)',
                                fontWeight: 800,
                                letterSpacing: '-0.01em',
                                color: '#fbe5b5',
                                fontFeatureSettings: '"tnum"',
                            }}
                        >
                            Your AED {creditAed} is ready.
                        </div>
                    </>
                )}

                {outcome?.message && (
                    <p style={{
                        margin: '0 0 18px 0', fontSize: 14, lineHeight: '22px',
                        color: TIER_POP_TEXT.primary, textAlign: 'center',
                    }}>
                        {outcome.message}
                    </p>
                )}
                {outcome?.error && (
                    <p style={{
                        margin: '0 0 18px 0', fontSize: 14, lineHeight: '22px',
                        color: '#ffb4a2', textAlign: 'center',
                    }}>
                        {outcome.error}
                    </p>
                )}

                {variant === 'pausing' && !alreadyJoined && !outcome?.joined && (
                    <p style={{
                        margin: '0 0 18px 0', fontSize: 14, lineHeight: '22px',
                        color: TIER_POP_TEXT.primary, textAlign: 'center',
                    }}>
                        {creditAed > 0
                            ? `Tap below to join our waitlist and get AED ${creditAed} credit the day new plans reopen.`
                            : 'Tap below to join our waitlist and hear first the day new plans reopen.'}
                    </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    {cta.showJoin && (
                        <button
                            type="button"
                            onClick={handleJoin}
                            disabled={joining}
                            style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                minHeight: 48, padding: '14px 32px',
                                borderRadius: 'var(--radius-pill)', border: 0,
                                background: OG, color: '#fff',
                                fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                                cursor: joining ? 'default' : 'pointer',
                                boxShadow: '0 8px 28px rgba(245,127,32,0.50)',
                                opacity: joining ? 0.85 : 1,
                            }}
                        >
                            {joining ? 'Saving your spot' : cta.joinLabel}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleDismiss}
                        disabled={dismissing}
                        style={cta.showJoin ? {
                            // Secondary when it sits under an offer: still a real
                            // control, visibly not the primary one.
                            minHeight: 44, padding: '10px 24px',
                            borderRadius: 'var(--radius-pill)',
                            border: '1px solid rgba(245,240,232,0.28)',
                            background: 'transparent', color: TIER_POP_TEXT.primary,
                            fontFamily: BODY, fontSize: 12, fontWeight: 700,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            cursor: dismissing ? 'default' : 'pointer',
                        } : {
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            minHeight: 48, padding: '14px 32px',
                            borderRadius: 'var(--radius-pill)', border: 0,
                            background: OG, color: '#fff',
                            fontFamily: BODY, fontSize: 13, fontWeight: 700,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            cursor: dismissing ? 'default' : 'pointer',
                            boxShadow: '0 8px 28px rgba(245,127,32,0.50)',
                            opacity: dismissing ? 0.85 : 1,
                        }}
                    >
                        {dismissing ? (
                            variant === 'reopened' ? 'Loading your plan' : 'Closing'
                        ) : variant === 'reopened' ? (
                            <>
                                {cta.dismissLabel}
                                <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>→</span>
                            </>
                        ) : (
                            cta.dismissLabel
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

function H1({ children }: { children: React.ReactNode }) {
    return (
        <h1
            style={{
                margin: '0 0 14px',
                fontFamily: BODY,
                fontSize: 'clamp(28px, 4.2vw, 48px)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                backgroundImage:
                    'linear-gradient(180deg, #fdf8ef 0%, #f0e6cf 55%, #d6c8a8 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
                filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.25))',
            }}
        >
            {children}
        </h1>
    )
}

function Sub({ children }: { children: React.ReactNode }) {
    return (
        <p
            style={{
                margin: '0 auto 32px',
                fontFamily: BODY,
                fontSize: 'clamp(14px, 1.5vw, 17px)',
                fontWeight: 400,
                lineHeight: 1.55,
                color: 'rgba(245,238,222,0.72)',
                maxWidth: 420,
            }}
        >
            {children}
        </p>
    )
}
