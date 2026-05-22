'use client'

import Link from 'next/link'
import { Sparkles, Clock, ArrowRight } from 'lucide-react'
import { BODY, OG, NV, S, TIER1 } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'
import { useMonthlyDraftActive } from '../_shared/draft-hooks'
import { MONTHLY_REWARD_AED, type MonthlyReviewWindow } from '@/lib/monthly-review'

/**
 * "Your monthly wrap is ready" trigger card on the Menu page.
 *
 * Sits above the "Last week" section as the highest-priority CTA when a
 * monthly is pending. Visually echoes the weekly Pending tile but bigger
 * — it's the once-per-cycle moment that closes the milestone path.
 *
 * Renders nothing when not eligible (`window.eligible === false`) so
 * mid-cycle pages don't carry a dead section.
 */
export function MonthlyWrapTrigger({ window, cycleLabel }: {
    window: MonthlyReviewWindow
    cycleLabel: string
}) {
    const draftActive = useMonthlyDraftActive(cycleLabel)
    if (!window.eligible) return null

    const isLastDay = window.daysLeftForFullReward === 0
    const isLate = window.daysLeftForFullReward < 0 || (window.daysSinceCycleEnd > 7 && !window.expired)
    const rewardAed = isLate ? Math.round(MONTHLY_REWARD_AED / 2) : MONTHLY_REWARD_AED
    const ctaLabel = draftActive ? 'Resume your wrap' : 'Open your wrap'
    const tagline = draftActive
        ? 'You started this — pick up where you left off.'
        : 'Three minutes to wrap your month. See your meal report at the end.'

    return (
        <section style={{ marginBottom: 32 }}>
            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Eyebrow>{cycleLabel} · monthly wrap</Eyebrow>
                <div style={{ flex: 1, height: 1, background: S.border }} />
                <span style={{
                    fontSize: 11, fontWeight: 600, color: S.fgFaint,
                    letterSpacing: '0.02em',
                }}>
                    {isLate ? 'Late · 50% reward' : isLastDay ? 'Last day for full reward' : `${window.daysLeftForFullReward}d left for full reward`}
                </span>
            </div>

            <Link
                href="/dashboard/menu/review/monthly"
                className="monthly-wrap-tile"
                style={{
                    ...TIER1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    padding: '22px 24px 24px',
                    borderRadius: 'var(--radius-md)',
                    textDecoration: 'none',
                    color: NV,
                    fontFamily: BODY,
                    position: 'relative',
                    overflow: 'hidden',
                    // Same orange edge anchor as the weekly pending tile — one
                    // concentrated job for brand color, recognised by users
                    // who've done weekly reviews this cycle.
                    boxShadow: `inset 4px 0 0 ${OG}, 0 8px 24px rgba(9,24,37,0.08), 0 1px 3px rgba(9,24,37,0.04)`,
                    transition: 'transform 150ms, box-shadow 150ms',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <Eyebrow>Monthly wrap</Eyebrow>
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-pill)',
                        background: isLate
                            ? 'rgba(9,24,37,0.06)'
                            : 'linear-gradient(135deg, rgba(245,127,32,0.18) 0%, rgba(255,170,0,0.14) 100%)',
                        border: `1px solid ${isLate ? 'rgba(9,24,37,0.18)' : 'rgba(245,127,32,0.55)'}`,
                        color: isLate ? S.fgMuted : '#8c4214',
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                    }}>
                        <Clock size={11} strokeWidth={2.4} />
                        {isLate
                            ? 'Late · 50% reward'
                            : isLastDay
                                ? 'Last day'
                                : `${window.daysLeftForFullReward}d left`}
                    </span>
                </div>

                <div style={{
                    fontSize: 'clamp(20px, 2.4vw, 26px)',
                    fontWeight: 800,
                    letterSpacing: '-0.015em',
                    lineHeight: 1.15,
                    color: NV,
                }}>
                    Your Dormers month, wrapped.
                </div>

                <div style={{ fontSize: 13.5, color: S.fgMuted, lineHeight: 1.5 }}>
                    {tagline}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        padding: '12px 22px',
                        borderRadius: 'var(--radius-pill)',
                        background: OG,
                        color: '#fff',
                        fontSize: 13, fontWeight: 700,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        boxShadow: '0 6px 20px rgba(245,127,32,0.40)',
                    }}>
                        {ctaLabel}
                        <ArrowRight size={14} strokeWidth={2.4} />
                    </span>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12, color: S.fgMuted, fontWeight: 600,
                    }}>
                        <Sparkles size={13} strokeWidth={2.2} color={OG} />
                        +AED {rewardAed} Dorm Wars credit
                    </span>
                </div>

                <style jsx>{`
                    .monthly-wrap-tile:hover {
                        transform: translateY(-2px);
                        box-shadow: inset 4px 0 0 ${OG}, 0 12px 30px rgba(245,127,32,0.14), 0 1px 3px rgba(9,24,37,0.04) !important;
                    }
                `}</style>
            </Link>
        </section>
    )
}
