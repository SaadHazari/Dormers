'use client'

import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import { OG, BODY } from './tokens'
import { useMonthlyDraftActive } from './draft-hooks'
import { MONTHLY_REWARD_AED, MONTHLY_LATE_REWARD_AED, wrapVocabFor, type MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'

/**
 * Full-width wrap banner shown ONLY on the no-plan dashboard (post-cron, no
 * queued plan). The user's cycle ended, the cron flipped the sub to ENDED,
 * no follow-up is queued — so getActiveSubscription returns null and the
 * dashboard renders NoPlanView (the pick-plan empty state).
 *
 * Architecture intent (see project_now_tray_architecture memory): on a page
 * with no competing data, the wrap earns the dominant slot. This is the
 * brand-forward moment — narrate the cycle closing AND open the door to the
 * next plan implicitly (the picker is right below). Not subordinate like
 * the dashboard strip; not forcing like the pre-cron overlay.
 *
 * Self-renders nothing when not eligible, so it can be dropped
 * unconditionally above NoPlanView.
 */
export function MonthlyWrapEmptyBanner({ monthlyWindow }: { monthlyWindow: MonthlyReviewWindow }) {
    const vocab = wrapVocabFor(monthlyWindow.planTier)
    const cycleLabel = monthlyWindow.cycleLabel ?? 'cycle'
    const draftActive = useMonthlyDraftActive(cycleLabel)
    if (!monthlyWindow.eligible) return null

    const isLastDay = monthlyWindow.daysLeftForFullReward === 0 && monthlyWindow.daysSinceCycleEnd <= 7
    const isLate = monthlyWindow.daysSinceCycleEnd > 7
    const reward = isLate ? MONTHLY_LATE_REWARD_AED : MONTHLY_REWARD_AED
    const ctaLabel = draftActive ? 'Resume wrap' : 'Start wrap'
    const daysChip = isLate
        ? `${monthlyWindow.daysSinceCycleEnd}d late · 50% reward`
        : isLastDay
            ? 'Last day for full reward'
            : `${monthlyWindow.daysLeftForFullReward}d left for full reward`

    return (
        <Link
            href="/dashboard/menu/review/monthly"
            className="monthly-wrap-empty-banner"
            style={{
                display: 'block',
                marginBottom: 22,
                padding: 'clamp(20px, 2.6vw, 28px)',
                borderRadius: 'var(--radius-md)',
                background: isLate
                    ? 'var(--ds-surface)'
                    : 'linear-gradient(135deg, var(--ds-og-wash-strong) 0%, var(--ds-og-wash) 100%)',
                border: `1px solid ${isLate ? 'var(--ds-border-soft)' : 'var(--ds-og-border-strong)'}`,
                boxShadow: isLate
                    ? '0 1px 3px rgba(9,24,37,0.04)'
                    : `inset 4px 0 0 ${OG}, 0 8px 24px rgba(9,24,37,0.06)`,
                textDecoration: 'none', color: 'var(--ds-fg)',
                fontFamily: BODY,
                transition: 'transform 150ms, box-shadow 150ms',
            }}
        >
            <div style={{
                display: 'flex', alignItems: 'flex-start',
                gap: 'clamp(16px, 2vw, 24px)', flexWrap: 'wrap',
            }}>
                {/* Medallion + cycle label + headline + sub — the narrative
                    half of the banner. */}
                <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{
                        flexShrink: 0,
                        width: 48, height: 48, borderRadius: '50%',
                        background: isLate ? 'rgba(9,24,37,0.06)' : OG,
                        color: isLate ? 'var(--ds-fg-muted)' : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: isLate ? 'none' : '0 8px 20px rgba(245,127,32,0.35)',
                    }}>
                        <Sparkles size={20} strokeWidth={2.2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: isLate ? 'var(--ds-fg-muted)' : OG,
                            marginBottom: 6,
                        }}>
                            {vocab.qualifier} wrap · {cycleLabel}
                        </div>
                        <div style={{
                            fontSize: 'clamp(20px, 2.4vw, 26px)', fontWeight: 800,
                            letterSpacing: '-0.015em', lineHeight: 1.15,
                            color: 'var(--ds-fg)',
                        }}>
                            Wrap your {cycleLabel} before you pick what&rsquo;s next<span style={{ color: OG }}>.</span>
                        </div>
                        <div style={{
                            marginTop: 8, fontSize: 13, lineHeight: 1.5,
                            color: 'var(--ds-fg-muted)', maxWidth: '52ch',
                        }}>
                            {isLate
                                ? `It's been ${monthlyWindow.daysSinceCycleEnd} days, but the wrap is still open. Submit before day 30 to bank AED ${reward}.`
                                : vocab.period === 'meal'
                                    ? `Two minutes to lock AED ${reward}. We'll show you how the meal went and what's next.`
                                    : `Three minutes to lock AED ${reward} and see your ${vocab.period} report. The new plan picker waits below — wrap first while it's fresh.`}
                        </div>
                    </div>
                </div>

                {/* Action half — CTA pill + days-left chip stacked. */}
                <div style={{
                    flexShrink: 0,
                    display: 'flex', flexDirection: 'column', gap: 8,
                    alignItems: 'flex-end', justifyContent: 'center',
                    minWidth: 180,
                }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '12px 22px', borderRadius: 999,
                        background: isLate ? 'transparent' : OG,
                        color: isLate ? OG : '#fff',
                        border: isLate ? `1px solid ${OG}` : 'none',
                        fontSize: 12.5, fontWeight: 800,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        boxShadow: isLate ? 'none' : '0 8px 22px rgba(245,127,32,0.42)',
                        whiteSpace: 'nowrap',
                    }}>
                        {ctaLabel} · +AED {reward}
                        <ArrowRight size={14} strokeWidth={2.4} />
                    </span>
                    <span style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                        color: isLate ? 'var(--ds-fg-muted)' : '#8c4214',
                        fontFeatureSettings: '"tnum"',
                    }}>
                        {daysChip}
                    </span>
                </div>
            </div>

            <style jsx>{`
                .monthly-wrap-empty-banner:hover {
                    transform: translateY(-1px);
                    box-shadow: inset 4px 0 0 ${OG}, 0 12px 30px rgba(245,127,32,0.14), 0 1px 3px rgba(9,24,37,0.04) !important;
                }
            `}</style>
        </Link>
    )
}
