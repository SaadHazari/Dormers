'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { OG, BODY } from './tokens'
import { MONTHLY_REWARD_AED, MONTHLY_LATE_REWARD_AED, WEEKLY_WRAP_UNLOCK_MEALS, wrapVocabFor, type MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'

/**
 * Slim 1-line dashboard strip — surfaces a pending monthly wrap WITHOUT
 * competing with the new plan's hero. Used in the post-cron, queued-plan
 * case: the previous cycle's wrap is still open (30-day window), but a new
 * cycle is now active and its hero owns the focal slot.
 *
 * Architecture intent (see project_now_tray_architecture memory): visually
 * subordinate to the hero — no surface, no shadow, smaller type. The eye
 * lands on the hero first; the strip is a quiet "still open" reminder
 * that the user can act on whenever they're ready. Always-on tray entry
 * exists in parallel; this strip is the dashboard-specific reinforcement.
 *
 * Renders nothing when not eligible (cycle hasn't ended, wrap submitted,
 * or past the 30-day cap) — caller can drop it unconditionally above the
 * hero and it self-removes.
 */
export function MonthlyWrapStrip({ monthlyWindow }: { monthlyWindow: MonthlyReviewWindow }) {
    if (!monthlyWindow.eligible && !monthlyWindow.locked) return null

    const vocab = wrapVocabFor(monthlyWindow.planTier)
    const cycleLabel = monthlyWindow.cycleLabel ?? 'cycle'

    // Locked weekly preview: a plain row instead of a Link, so it says the
    // reward is coming without offering a destination that would turn the
    // customer away at the door.
    if (monthlyWindow.locked) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center',
                gap: 10, flexWrap: 'wrap',
                padding: '10px 4px',
                marginBottom: 12,
                borderBottom: '1px solid var(--ds-border-soft)',
                fontFamily: BODY,
                color: 'var(--ds-fg-faint)',
                fontSize: 12.5, lineHeight: 1.3,
            }}>
                <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
                    textTransform: 'uppercase', color: 'var(--ds-fg-tint)',
                }}>
                    {vocab.qualifier} wrap
                </span>
                <span aria-hidden style={{ opacity: 0.4 }}>·</span>
                <span style={{ fontWeight: 600, color: 'var(--ds-fg-muted)' }}>
                    Close out your {cycleLabel}
                </span>
                <span aria-hidden style={{ opacity: 0.4 }}>·</span>
                <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                    padding: '2px 7px', borderRadius: 999,
                    background: 'rgba(9,24,37,0.06)',
                    color: 'var(--ds-fg-muted)',
                    border: '1px solid rgba(9,24,37,0.18)',
                }}>
                    Opens after meal {WEEKLY_WRAP_UNLOCK_MEALS}
                </span>
                <span style={{
                    marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontWeight: 700, color: 'var(--ds-fg-muted)',
                    fontFeatureSettings: '"tnum"',
                }}>
                    +AED {MONTHLY_REWARD_AED}
                </span>
            </div>
        )
    }

    const isPreEnd = monthlyWindow.daysSinceCycleEnd < 0
    const isLastDay = !isPreEnd && monthlyWindow.daysLeftForFullReward === 0 && monthlyWindow.daysSinceCycleEnd <= 7
    const isLate = monthlyWindow.daysSinceCycleEnd > 7
    const reward = isLate ? MONTHLY_LATE_REWARD_AED : MONTHLY_REWARD_AED
    const daysChip = isLate
        ? `${monthlyWindow.daysSinceCycleEnd}d late`
        : isPreEnd
            ? `${-monthlyWindow.daysSinceCycleEnd}d to end`
            : isLastDay
                ? 'Last day'
                : `${monthlyWindow.daysLeftForFullReward}d left`

    return (
        <Link
            href="/dashboard/menu/review/monthly"
            className="monthly-wrap-strip"
            style={{
                display: 'flex', alignItems: 'center',
                gap: 10, flexWrap: 'wrap',
                padding: '10px 4px',
                marginBottom: 12,
                borderBottom: '1px solid var(--ds-border-soft)',
                textDecoration: 'none',
                fontFamily: BODY,
                color: 'var(--ds-fg-muted)',
                fontSize: 12.5, lineHeight: 1.3,
                transition: 'color 150ms, background 150ms',
            }}
        >
            <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: isLate ? 'var(--ds-fg-tint)' : OG,
            }}>
                {vocab.qualifier} wrap
            </span>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <span style={{ fontWeight: 600, color: 'var(--ds-fg)' }}>
                Close out your {cycleLabel}
            </span>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                padding: '2px 7px', borderRadius: 999,
                background: isLate ? 'rgba(9,24,37,0.06)' : 'var(--ds-og-wash)',
                color: isLate ? 'var(--ds-fg-muted)' : '#8c4214',
                border: `1px solid ${isLate ? 'rgba(9,24,37,0.18)' : 'var(--ds-og-border)'}`,
                fontFeatureSettings: '"tnum"',
            }}>
                {daysChip}
            </span>
            <span style={{
                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
                fontWeight: 700, color: isLate ? 'var(--ds-fg-muted)' : OG,
                fontFeatureSettings: '"tnum"',
            }}>
                +AED {reward}
                <ArrowRight size={13} strokeWidth={2.4} />
            </span>

            <style jsx>{`
                /* :global() — class sits on a <Link>; styled-jsx only attaches
                   its scope hash to plain DOM elements, so without :global()
                   this rule never matches. */
                :global(.monthly-wrap-strip:hover) { background: var(--ds-og-wash); }
            `}</style>
        </Link>
    )
}
