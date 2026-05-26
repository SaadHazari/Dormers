'use client'

import { Check } from 'lucide-react'
import { BODY, OG, TIER_POP_TEXT } from './tokens'

interface Props {
    firstName: string
    planName: string
    firstDeliveryDateIso: string
    mealsCount: number
    totalAed: number
    onDismiss: () => void
}

/**
 * Post-checkout success takeover — replaces the previous spinner-then-cold-
 * dashboard pattern with a single celebratory moment that confirms the
 * payment, shows the order summary, reassures the user that WhatsApp + email
 * confirmations are on the way, and points them to the most-valuable next
 * action (customize their first meals before kitchen cutoff).
 *
 * Renders once `?checkout_success=true` is present AND the just-created
 * subscription has been detected by the polling logic in ClientDashboard.
 * Dismissal (either CTA) clears the search param so the takeover doesn't
 * re-appear on subsequent dashboard visits.
 *
 * Visual language matches WeeklyReviewTakeover / MonthlyReviewTakeover so
 * the review-loop and post-purchase moments feel like one family.
 */
export function CheckoutSuccessTakeover({
    firstName,
    planName,
    firstDeliveryDateIso,
    mealsCount,
    totalAed,
    onDismiss,
}: Props) {
    const deliveryPretty = new Date(firstDeliveryDateIso + 'T00:00:00Z').toLocaleDateString(
        'en-GB',
        { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' },
    )

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
            <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
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
                    <Check size={36} strokeWidth={3} color="#fff" />
                </div>

                <H1>
                    You&rsquo;re in, <Accent>{firstName}</Accent>.
                </H1>
                <Sub>
                    Your payment landed safely and your plan is live. We&rsquo;ve got it from here &mdash; your first meal arrives {deliveryPretty}.
                </Sub>

                <div
                    style={{
                        margin: '0 auto 18px',
                        maxWidth: 420,
                        padding: '18px 22px',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(245,240,232,0.04)',
                        border: '1px solid rgba(245,240,232,0.10)',
                        boxShadow: 'inset 0 1px 0 rgba(245,240,232,0.06)',
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr',
                        rowGap: 10,
                        columnGap: 20,
                        fontSize: 14,
                        textAlign: 'left',
                    }}
                >
                    <SummaryLabel>Plan</SummaryLabel>
                    <SummaryValue>{planName}</SummaryValue>
                    <SummaryLabel>First meal</SummaryLabel>
                    <SummaryValue>{deliveryPretty}</SummaryValue>
                    <SummaryLabel>Meals</SummaryLabel>
                    <SummaryValue>{mealsCount}</SummaryValue>
                    <SummaryLabel>Paid</SummaryLabel>
                    <SummaryValue>AED {totalAed.toFixed(2)}</SummaryValue>
                </div>

                <p
                    style={{
                        margin: '0 auto 32px',
                        fontSize: 12,
                        color: TIER_POP_TEXT.faint,
                        letterSpacing: '0.02em',
                    }}
                >
                    Confirmation sent to your WhatsApp and email.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                        type="button"
                        onClick={onDismiss}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            padding: '14px 32px',
                            borderRadius: 'var(--radius-pill)',
                            border: 0,
                            background: OG,
                            color: '#fff',
                            fontFamily: BODY,
                            fontSize: 13,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            cursor: 'pointer',
                            boxShadow: '0 8px 28px rgba(245,127,32,0.50)',
                            transition: 'transform 150ms cubic-bezier(0.16,1,0.3,1)',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)'
                        }}
                    >
                        Take me to my dashboard
                        <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>→</span>
                    </button>
                </div>
            </div>
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

function Accent({ children }: { children: React.ReactNode }) {
    return (
        <span
            style={{
                color: '#fbe5b5',
                WebkitTextFillColor: '#fbe5b5',
                backgroundImage: 'none',
                textDecorationLine: 'underline',
                textDecorationColor: OG,
                textDecorationThickness: '0.08em',
                textUnderlineOffset: '0.18em',
                textDecorationSkipInk: 'none',
            }}
        >
            {children}
        </span>
    )
}

function Sub({ children }: { children: React.ReactNode }) {
    return (
        <p
            style={{
                margin: '0 auto 36px',
                fontFamily: BODY,
                fontSize: 'clamp(14px, 1.5vw, 17px)',
                fontWeight: 400,
                lineHeight: 1.55,
                color: 'rgba(245,238,222,0.72)',
                maxWidth: 460,
            }}
        >
            {children}
        </p>
    )
}

function SummaryLabel({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: TIER_POP_TEXT.muted,
                alignSelf: 'center',
            }}
        >
            {children}
        </div>
    )
}

function SummaryValue({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                fontSize: 14,
                fontWeight: 700,
                color: TIER_POP_TEXT.primary,
                textAlign: 'right',
                fontFeatureSettings: '"tnum"',
            }}
        >
            {children}
        </div>
    )
}
