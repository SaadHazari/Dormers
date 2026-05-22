'use client'

import Link from 'next/link'
import { Clock, ChevronRight } from 'lucide-react'
import { BODY, OG, NV, S, TIER1 } from './tokens'
import type { WeeklyReviewState } from '@/lib/weekly-review'

/**
 * Compact nudge surfaced on the dashboard home when a weekly review is
 * pending. Sits between QuickActions and PlanProgress at `gridColumn: span 6`.
 *
 * Renders nothing when nothing is pending, so callers can drop it
 * unconditionally into the grid — the cell simply doesn't materialize and
 * PlanProgress slides up to fill the row.
 *
 * Click routes to /dashboard/plan rather than opening the survey takeover
 * directly: the Plan page is the canonical home (primary card + catch-up
 * stack live there) and handles every state including multi-pending.
 */
export function WeeklyReviewNudge({ state }: { state: WeeklyReviewState }) {
    const { current, late } = state

    // Nothing pending → don't render. Grid skips the cell entirely.
    if (!current && late.length === 0) return null

    const isUrgent = !!current
    const lateCount = late.length

    const title = current
        ? lateCount > 0
            ? `${lateCount + 1} reviews pending`
            : `Week ${current.week} review pending`
        : lateCount === 1
            ? '1 late review'
            : `${lateCount} late reviews`

    const sub = current
        ? lateCount > 0
            ? `Week ${current.week} due in ${current.daysLeft}d · ${lateCount} late`
            : current.daysLeft === 0
                ? 'Last day for full reward'
                : `${current.daysLeft}d left for full reward`
        : '50% reward · submissions still count'

    return (
        <Link
            href="/dashboard/menu"
            aria-label={`${title} — open Menu page`}
            style={{
                gridColumn: 'span 6',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                background: isUrgent
                    ? 'linear-gradient(135deg, #fef4e4 0%, #fdf8ec 100%)'
                    : TIER1.background,
                border: `1px solid ${isUrgent ? 'rgba(245,127,32,0.30)' : S.border}`,
                boxShadow: isUrgent
                    ? '0 4px 14px rgba(245,127,32,0.08)'
                    : '0 1px 3px rgba(9,24,37,0.04)',
                textDecoration: 'none',
                color: NV,
                fontFamily: BODY,
                transition: 'transform 150ms, box-shadow 150ms',
            }}
            className="weekly-review-nudge"
        >
            <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: isUrgent
                    ? 'linear-gradient(135deg, rgba(245,127,32,0.18) 0%, rgba(255,170,0,0.14) 100%)'
                    : 'rgba(9,24,37,0.06)',
                border: `1px solid ${isUrgent ? 'rgba(245,127,32,0.45)' : 'rgba(9,24,37,0.10)'}`,
                color: isUrgent ? '#b85b14' : S.fgMuted,
                flexShrink: 0,
            }}>
                <Clock size={16} strokeWidth={2.2} />
            </span>

            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: NV,
                    lineHeight: 1.25,
                    letterSpacing: '-0.005em',
                }}>
                    {title}
                </span>
                <span style={{
                    fontSize: 12,
                    color: S.fgMuted,
                    lineHeight: 1.4,
                    fontFeatureSettings: '"tnum"',
                }}>
                    {sub}
                </span>
            </span>

            <ChevronRight
                size={18}
                strokeWidth={2.2}
                color={isUrgent ? OG : S.fgFaint}
                style={{ flexShrink: 0 }}
            />

            <style jsx>{`
                .weekly-review-nudge:hover {
                    transform: translateY(-1px);
                }
            `}</style>
        </Link>
    )
}
