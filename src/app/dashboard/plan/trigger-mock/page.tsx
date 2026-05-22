'use client'

import { notFound } from 'next/navigation'
import { Clock, ArrowRight, Check, ChevronRight, Sparkles, Coffee, Trophy } from 'lucide-react'
import { BODY, OG, NV, S, TIER1, TIER2, TIER3 } from '../../_shared/tokens'
import { Eyebrow } from '../../_shared/Eyebrow'

// ── States to preview ───────────────────────────────────────────────────────
// Mock data shapes. Real implementation pulls from Supabase: per-user,
// per-completed-week, with `submitted_at` + `reward_pct` fields.
type Pending = { week: number; range: string; daysLeft: number }
type Late = { week: number; range: string; daysLate: number }

const CURRENT_PENDING: Pending = { week: 4, range: 'Dec 16 — Dec 22', daysLeft: 5 }
const CATCH_UP: Late[] = [
    { week: 3, range: 'Dec 9 — Dec 15',  daysLate: 11 },
    { week: 2, range: 'Dec 2 — Dec 8',   daysLate: 18 },
    { week: 1, range: 'Nov 25 — Dec 1',  daysLate: 25 },
]
const LAYER4 = { submitted: 3, total: 4, aedEarned: 18, aedPending: 6, cycle: 'Dec cycle', label: 'Rewards' }

export default function ReviewTriggerMockPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return (
        <div style={{ padding: '24px clamp(16px, 3vw, 36px) 48px', fontFamily: BODY, color: NV }}>
            <header style={{ marginBottom: 28 }}>
                <Eyebrow>Review trigger · preview</Eyebrow>
                <h1 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
                    Plan-page card states
                </h1>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>
                    All states stacked for comparison. Only one of these renders in production at a time, based on the user&rsquo;s submission state.
                </p>
            </header>

            <Section label="State 1 · Pending — within 7-day full-reward window">
                <Row>
                    <PendingCard data={CURRENT_PENDING} />
                    <LayerFourCard data={LAYER4} />
                </Row>
            </Section>

            <Section label="State 2 · Late — outside 7-day window, 50% reward">
                <Row>
                    <LateCard data={CATCH_UP[0]} />
                    <LayerFourCard data={LAYER4} />
                </Row>
            </Section>

            <Section label="State 3 · Just submitted (24h success state, then auto-collapses)">
                <Row alignTop>
                    <SubmittedCard weekNumber={3} rewardPct={100} />
                    <LayerFourCard data={{ ...LAYER4, submitted: 4, aedPending: 0, aedEarned: 24 }} celebrate />
                </Row>
            </Section>

            <Section label="State 4 · Multiple pending — primary card + Layer 4 + catch-up stack below">
                <Row>
                    <PendingCard data={CURRENT_PENDING} />
                    <LayerFourCard data={LAYER4} />
                </Row>
                <CatchUpStack items={CATCH_UP} />
            </Section>

            <Section label="State 5 · No review pending (mid-week) — primary not rendered, Layer 4 stays">
                <Row>
                    <EmptyPlaceholder />
                    <LayerFourCard data={LAYER4} />
                </Row>
            </Section>

            <Section label="Past reviews link (always shown at bottom)">
                <PastReviewsLink count={8} />
            </Section>
        </div>
    )
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function Row({ children, alignTop = false }: { children: React.ReactNode; alignTop?: boolean }) {
    return (
        <div
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 20,
                alignItems: alignTop ? 'flex-start' : 'stretch',
            }}
        >
            {children}
        </div>
    )
}

// ── Section wrapper ─────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 40 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 14,
                    paddingBottom: 8,
                    borderBottom: `1px dashed ${S.border2}`,
                }}
            >
                <span
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.10em',
                        textTransform: 'uppercase',
                        color: S.fgFaint,
                    }}
                >
                    {label}
                </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
        </div>
    )
}

// ── Pending card (within 7-day full-reward window) ──────────────────────────

function PendingCard({ data }: { data: Pending }) {
    return (
        <div
            style={{
                position: 'relative',
                flex: '1 1 720px',
                maxWidth: 720,
                minWidth: 0,
                padding: '24px 28px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #fef4e4 0%, #fdf8ec 60%, #f7ead2 100%)',
                border: '1px solid rgba(245,127,32,0.35)',
                boxShadow: '0 8px 28px rgba(245,127,32,0.10), 0 1px 3px rgba(9,24,37,0.04)',
                overflow: 'hidden',
            }}
        >
            {/* Subtle orange glow wash from top-right */}
            <div
                aria-hidden
                style={{
                    position: 'absolute',
                    top: -80,
                    right: -80,
                    width: 220,
                    height: 220,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(245,127,32,0.18) 0%, rgba(245,127,32,0) 70%)',
                    pointerEvents: 'none',
                }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, position: 'relative' }}>
                <Eyebrow>Weekly review</Eyebrow>
                <RewardChip variant="full" daysLeft={data.daysLeft} />
            </div>

            <div
                style={{
                    fontSize: 'clamp(20px, 2.4vw, 26px)',
                    fontWeight: 800,
                    letterSpacing: '-0.015em',
                    lineHeight: 1.15,
                    color: NV,
                    marginBottom: 6,
                    position: 'relative',
                }}
            >
                Week {data.week} wrapped — share how it went
            </div>

            <div style={{ fontSize: 13.5, color: S.fgMuted, lineHeight: 1.5, marginBottom: 20, position: 'relative' }}>
                Six dinners delivered · {data.range} · 60-second review
            </div>

            <div style={{ position: 'relative' }}>
                <CtaButton variant="primary">
                    Start review
                </CtaButton>
            </div>
        </div>
    )
}

// ── Late card (>7 days, 50% reward) ─────────────────────────────────────────

function LateCard({ data }: { data: Late }) {
    return (
        <div
            style={{
                flex: '1 1 720px',
                maxWidth: 720,
                minWidth: 0,
                padding: '20px 24px',
                borderRadius: 'var(--radius-md)',
                ...TIER2,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <Eyebrow>Weekly review · late</Eyebrow>
                <RewardChip variant="late" />
            </div>

            <div
                style={{
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.2,
                    color: NV,
                    marginBottom: 4,
                }}
            >
                Week {data.week} review
            </div>

            <div style={{ fontSize: 13, color: S.fgMuted, lineHeight: 1.5, marginBottom: 16 }}>
                {data.range} · past the full-reward window. Submission still counts and earns 50%.
            </div>

            <CtaButton variant="muted">Submit review</CtaButton>
        </div>
    )
}

// ── Submitted card (24h success state) ──────────────────────────────────────

function SubmittedCard({ weekNumber, rewardPct }: { weekNumber: number; rewardPct: number }) {
    return (
        <div
            style={{
                flex: '1 1 720px',
                maxWidth: 720,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 20px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(34,197,94,0.07)',
                border: '1px solid rgba(34,197,94,0.30)',
            }}
        >
            <div
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: '#22c55e',
                    color: '#fff',
                    flexShrink: 0,
                }}
            >
                <Check size={16} strokeWidth={3} />
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: NV }}>
                    Week {weekNumber} review submitted
                </div>
                <div style={{ fontSize: 12, color: S.fgMuted, marginTop: 1 }}>
                    {rewardPct}% Dorm Wars reward earned · this confirmation will dismiss in 24h
                </div>
            </div>
            <Sparkles size={16} strokeWidth={2.2} color="#16a34a" />
        </div>
    )
}

// ── Catch-up stack (multiple late reviews) ──────────────────────────────────

function CatchUpStack({ items }: { items: Late[] }) {
    return (
        <div
            style={{
                padding: '4px',
                borderRadius: 'var(--radius-md)',
                background: TIER3.background,
                border: TIER3.border,
                boxShadow: TIER3.boxShadow,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 20px 10px',
                }}
            >
                <Eyebrow>Catch up · {items.length} {items.length === 1 ? 'review' : 'reviews'} pending</Eyebrow>
                <span style={{ fontSize: 11, fontWeight: 600, color: S.fgFaint, letterSpacing: '0.02em' }}>
                    50% reward each
                </span>
            </div>
            <div
                style={{
                    background: '#fff',
                    borderRadius: 'calc(var(--radius-md) - 4px)',
                    border: `1px solid ${S.border}`,
                    overflow: 'hidden',
                }}
            >
                {items.map((item, i) => (
                    <button
                        key={item.week}
                        type="button"
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '14px 18px',
                            background: 'transparent',
                            border: 0,
                            borderTop: i === 0 ? 'none' : `1px solid ${S.border}`,
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background 150ms',
                            fontFamily: BODY,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(245,127,32,0.04)'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: NV, lineHeight: 1.2 }}>
                                Week {item.week}{' '}
                                <span style={{ fontWeight: 500, color: S.fgMuted, fontSize: 13 }}>
                                    · {item.range}
                                </span>
                            </div>
                            <div style={{ fontSize: 11.5, color: S.fgFaint, fontFeatureSettings: '"tnum"' }}>
                                {item.daysLate}d late {item.daysLate >= 23 && ' · expires in ' + (30 - item.daysLate) + 'd'}
                            </div>
                        </div>
                        <div
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                color: OG,
                                flexShrink: 0,
                            }}
                        >
                            Submit <ChevronRight size={13} strokeWidth={2.4} />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}

// ── Empty placeholder (no review pending — illustrative only) ───────────────

function EmptyPlaceholder() {
    return (
        <div
            style={{
                flex: '1 1 720px',
                maxWidth: 720,
                minWidth: 0,
                padding: '20px 24px',
                borderRadius: 'var(--radius-md)',
                border: `1px dashed ${S.border2}`,
                background: 'transparent',
                color: S.fgFaint,
                fontSize: 12.5,
                lineHeight: 1.5,
                fontStyle: 'italic',
            }}
        >
            <Coffee size={14} strokeWidth={2.2} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Mid-week — no review trigger renders here. The Plan page shows its normal contents only.
        </div>
    )
}

// ── Past reviews footer link ────────────────────────────────────────────────

function PastReviewsLink({ count }: { count: number }) {
    return (
        <button
            type="button"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 0,
                padding: '4px 0',
                fontFamily: BODY,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: S.fgMuted,
                cursor: 'pointer',
                transition: 'color 150ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = NV)}
            onMouseLeave={(e) => (e.currentTarget.style.color = S.fgMuted)}
        >
            Past reviews · {count} submitted <ChevronRight size={12} strokeWidth={2.4} />
        </button>
    )
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function RewardChip({
    variant,
    daysLeft,
}: {
    variant: 'full' | 'late'
    daysLeft?: number
}) {
    const isFull = variant === 'full'
    return (
        <div
            title={
                isFull
                    ? 'Submit within 7 days of week end for 100% Dorm Wars reward. After that, 50%.'
                    : 'Submitted after the 7-day window. 50% Dorm Wars reward instead of 100%.'
            }
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 11px',
                borderRadius: 'var(--radius-pill)',
                background: isFull
                    ? 'linear-gradient(135deg, rgba(245,127,32,0.18) 0%, rgba(255,170,0,0.12) 100%)'
                    : 'rgba(9,24,37,0.06)',
                border: `1px solid ${isFull ? 'rgba(245,127,32,0.50)' : 'rgba(9,24,37,0.18)'}`,
                color: isFull ? '#b85b14' : S.fgMuted,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'help',
                whiteSpace: 'nowrap',
            }}
        >
            <Clock size={11} strokeWidth={2.4} />
            {isFull
                ? daysLeft === 0 ? <>Last day for full reward</> : <>{daysLeft}d left for full reward</>
                : <>Late · 50% reward</>}
        </div>
    )
}

function CtaButton({ variant, children }: { variant: 'primary' | 'muted'; children: React.ReactNode }) {
    const isPrimary = variant === 'primary'
    return (
        <button
            type="button"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: isPrimary ? '12px 22px' : '10px 18px',
                borderRadius: 'var(--radius-pill)',
                border: isPrimary ? 0 : `1px solid ${S.border2}`,
                background: isPrimary ? OG : TIER1.background,
                color: isPrimary ? '#fff' : NV,
                fontFamily: BODY,
                fontSize: isPrimary ? 13 : 12,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: isPrimary ? '0 6px 20px rgba(245,127,32,0.40)' : '0 1px 2px rgba(9,24,37,0.04)',
                transition: 'background 150ms, color 150ms, box-shadow 150ms, transform 120ms',
            }}
            onMouseEnter={(e) => {
                if (isPrimary) {
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(245,127,32,0.50)'
                } else {
                    e.currentTarget.style.background = '#fff'
                }
            }}
            onMouseLeave={(e) => {
                if (isPrimary) {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(245,127,32,0.40)'
                } else {
                    e.currentTarget.style.background = '#fcf8ee'
                }
            }}
        >
            {children}
            <ArrowRight size={isPrimary ? 14 : 12} strokeWidth={2.4} />
        </button>
    )
}

// ── Layer 4 reward progress card (motivation-loop companion) ───────────────

type L4Data = { submitted: number; total: number; aedEarned: number; aedPending: number; cycle: string; label: string }

function LayerFourCard({ data, celebrate = false }: { data: L4Data; celebrate?: boolean }) {
    const { submitted, total, aedEarned, aedPending, cycle, label } = data
    const isComplete = submitted >= total
    const pct = Math.min(100, (submitted / total) * 100)

    return (
        <div
            style={{
                flex: '0 0 320px',
                maxWidth: 320,
                padding: '16px 18px',
                borderRadius: 'var(--radius-md)',
                ...(celebrate
                    ? {
                        background: 'rgba(34,197,94,0.06)',
                        border: '1px solid rgba(34,197,94,0.28)',
                    }
                    : TIER2),
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {celebrate && (
                <div
                    aria-hidden
                    style={{
                        position: 'absolute',
                        top: -50,
                        left: -50,
                        width: 160,
                        height: 160,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(34,197,94,0.16) 0%, rgba(34,197,94,0) 70%)',
                        pointerEvents: 'none',
                    }}
                />
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                <Eyebrow>{label} · {cycle}</Eyebrow>
                {celebrate && <Trophy size={13} strokeWidth={2.2} color="#16a34a" />}
            </div>

            <div style={{ fontSize: 13, color: S.fgMuted, lineHeight: 1.5, position: 'relative' }}>
                <strong style={{ color: NV, fontWeight: 700 }}>AED {aedEarned}</strong> earned
                {!isComplete && aedPending > 0 && (
                    <span style={{ color: S.fgFaint }}> · AED {aedPending} to go</span>
                )}
                {isComplete && (
                    <span style={{ color: '#16a34a', fontWeight: 700 }}> · full payout unlocked</span>
                )}
            </div>

            <div style={{ position: 'relative' }}>
                <div
                    style={{
                        height: 4,
                        borderRadius: 2,
                        background: 'rgba(9,24,37,0.07)',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            width: `${pct}%`,
                            height: '100%',
                            borderRadius: 2,
                            background: isComplete
                                ? '#22c55e'
                                : 'linear-gradient(90deg, #fbd9a8 0%, #f57f20 100%)',
                            boxShadow: isComplete ? '0 0 8px rgba(34,197,94,0.40)' : 'none',
                            transition: 'width 350ms cubic-bezier(0.4, 0, 0.2, 1), background 250ms',
                        }}
                    />
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: S.fgFaint, letterSpacing: '0.02em', fontFeatureSettings: '"tnum"' }}>
                    {submitted} of {total} weeks reviewed
                </div>
            </div>

            <button
                type="button"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    marginTop: 'auto',
                    paddingTop: 4,
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                    fontFamily: BODY,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: S.fgFaint,
                    padding: 0,
                    transition: 'color 150ms',
                    position: 'relative',
                    alignSelf: 'flex-start',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = S.fgMuted)}
                onMouseLeave={(e) => (e.currentTarget.style.color = S.fgFaint)}
            >
                View Dorm Wars <ChevronRight size={11} strokeWidth={2.2} />
            </button>
        </div>
    )
}
