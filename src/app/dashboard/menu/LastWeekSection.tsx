'use client'

import Link from 'next/link'
import { Check, Sparkles, Trophy, Link2 } from 'lucide-react'
import { BODY, OG, NV, S, TIER1, TIER2, TIER3 } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'
import { useWeeklyDraftActive } from '../_shared/draft-hooks'
import type { WeeklyReviewState, LateItem } from '@/lib/weekly-review'
import { BASE_REWARD_AED, LATE_REWARD_AED } from '@/lib/weekly-review'

/**
 * Review surface on the Menu page — replaces the WeeklyReviewTrigger that
 * previously lived on /plan. Renders as a "Last week" section between
 * "This week" and "Next week", echoing the meal-card grid visual language.
 *
 * Layout: 3-column grid matching this-week's grid. The primary tile is
 * meal-card-shaped (TIER1 + orange edge anchor for urgent state). Catch-up
 * tiles fill subsequent cells using a lighter TIER3 treatment. Submitted
 * state shows a green confirmation bar replacing the primary tile.
 *
 * Phase 8K (all-or-nothing rule): an `AllOrNothingBanner` sits above the
 * grid for Monthly plans only (rewards.total > 1). It surfaces the rule
 * in scannable copy + adapts to the user's current cycle progress.
 *
 * Why on /menu instead of /plan: the trigger lives where attention lives.
 * Users navigate to /menu to see today's meal + this-week's meals — so the
 * review prompt about *last week's meals* sits naturally next to them in
 * the same visual rhythm.
 */

export function LastWeekSection({ state }: { state: WeeklyReviewState }) {
    const { current, late, justSubmitted, rewards } = state

    const hasContent = current || late.length > 0 || justSubmitted
    if (!hasContent) return null

    // Only Monthly plans get the all-or-nothing rule (weeks > 1). Weekly
    // Flex collapses to the monthly wrap, no all-or-nothing.
    const showRuleBanner = rewards.total > 1

    return (
        <section style={{ marginBottom: 32 }}>
            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Eyebrow>Last week</Eyebrow>
                <div style={{ flex: 1, height: 1, background: S.border }} />
                <span style={{
                    fontSize: 11, fontWeight: 600, color: S.fgFaint,
                    letterSpacing: '0.02em',
                }}>
                    {justSubmitted ? 'just submitted'
                        : current ? 'share how it went'
                        : `${late.length} pending`}
                </span>
            </div>

            {showRuleBanner && <AllOrNothingBanner state={state} />}

            {justSubmitted && (
                <SubmittedBar
                    week={justSubmitted.week}
                    rewardPct={justSubmitted.rewardPct}
                    submittedCount={state.rewards.submitted}
                    weeklyTotal={state.rewards.total}
                />
            )}

            <div
                className="last-week-grid"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}
            >
                {current && <PrimaryReviewTile data={current} />}
                {!current && late.length > 0 && (
                    <PrimaryLateTile data={late[0]} />
                )}
                {(current ? late : late.slice(1)).map((item) => (
                    <CatchUpTile key={item.week} data={item} />
                ))}
            </div>
        </section>
    )
}

// ── ALL-OR-NOTHING RULE BANNER ──────────────────────────────────────────────
//
// Phase 8K — persistent inline header that makes the linked-fate rule
// legible. State-aware: copy adapts to how far the user is through the
// cycle. Chain icon signals "linked," constrained typography
// (uppercase-small label + tight body) sits below the title row without
// competing with the meal-card tiles.

function AllOrNothingBanner({ state }: { state: WeeklyReviewState }) {
    const { rewards } = state
    const submitted = rewards.submitted
    const total = rewards.total
    const earnedSoFar = rewards.aedEarned
    const pendingPool = rewards.aedPending
    const allIn = submitted >= total

    let bodyText: string
    let toneColor: string
    let toneBg: string
    let toneBorder: string

    if (allIn) {
        bodyText = `All ${total} in · AED ${earnedSoFar} locked in your wallet for this cycle.`
        toneColor = '#16a34a'
        toneBg = 'rgba(34,197,94,0.07)'
        toneBorder = 'rgba(34,197,94,0.32)'
    } else if (submitted === 0) {
        bodyText = `Submit all ${total} weekly reviews for AED ${total * BASE_REWARD_AED}. Miss any one and the cycle's reward is forfeit.`
        toneColor = '#8c4214'
        toneBg = 'rgba(245,127,32,0.06)'
        toneBorder = 'rgba(245,127,32,0.32)'
    } else {
        const left = total - submitted
        bodyText = `${submitted} of ${total} in · AED ${pendingPool} on the line · ${left} more to lock the full payout.`
        toneColor = '#8c4214'
        toneBg = 'rgba(245,127,32,0.06)'
        toneBorder = 'rgba(245,127,32,0.32)'
    }

    return (
        <div
            role="note"
            style={{
                marginBottom: 16,
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: toneBg,
                border: `1px solid ${toneBorder}`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
            }}
        >
            <div
                style={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: toneBorder,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: toneColor,
                    marginTop: 1,
                }}
                aria-hidden="true"
            >
                <Link2 size={14} strokeWidth={2.4} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontFamily: BODY,
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: toneColor,
                    lineHeight: 1,
                    marginBottom: 4,
                }}>
                    {allIn ? 'Cycle locked in' : 'All or nothing'}
                </div>
                <div style={{
                    fontFamily: BODY,
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: NV,
                    lineHeight: 1.5,
                }}>
                    {bodyText} <span style={{ color: S.fgMuted, fontWeight: 500 }}>
                        Late reviews still count — earn AED {LATE_REWARD_AED} each instead of AED {BASE_REWARD_AED}.
                    </span>
                </div>
            </div>
        </div>
    )
}

// ── Primary tile: pending review (within 7-day full-reward window) ──────────

function PrimaryReviewTile({ data }: { data: { week: number; range: string; daysLeft: number } }) {
    const isLastDay = data.daysLeft === 0
    const rewardSignal = `+AED ${BASE_REWARD_AED}`
    const draftActive = useWeeklyDraftActive(data.week)

    return (
        <Link
            href={`/dashboard/menu/review/${data.week}`}
            className="lw-primary-tile"
            style={{
                ...TIER1,
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                textDecoration: 'none',
                color: NV,
                fontFamily: BODY,
                position: 'relative',
                overflow: 'hidden',
                // 4px orange edge anchor — same visual language as the Plan-page
                // pending card used. One concentrated job for the brand color.
                boxShadow: `inset 4px 0 0 ${OG}, 0 6px 18px rgba(9,24,37,0.07), 0 1px 3px rgba(9,24,37,0.04)`,
                transition: 'transform 150ms, box-shadow 150ms',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Eyebrow>Review</Eyebrow>
                <span style={{
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.04em', color: '#8c4214',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'rgba(245,127,32,0.16)',
                    border: '1px solid rgba(245,127,32,0.55)',
                    whiteSpace: 'nowrap',
                }}>
                    {isLastDay ? 'Last day' : `${data.daysLeft}d left`}
                </span>
            </div>

            <div style={{
                fontSize: 18, fontWeight: 800, color: NV,
                letterSpacing: '-0.01em', lineHeight: 1.2,
                marginTop: 4,
            }}>
                Week {data.week}
            </div>

            <div style={{
                fontSize: 12.5, color: S.fgMuted, lineHeight: 1.4,
            }}>
                {data.range} · share how it went
            </div>

            <div style={{ flex: 1 }} />

            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 14px',
                marginTop: 4,
                borderRadius: 'var(--radius-pill)',
                background: OG,
                color: '#fff',
                fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                boxShadow: '0 4px 14px rgba(245,127,32,0.40)',
                alignSelf: 'flex-start',
            }}>
                {draftActive ? 'Resume review' : 'Start review'} · {rewardSignal}
            </div>

            <style jsx>{`
                .lw-primary-tile:hover {
                    transform: translateY(-2px);
                    box-shadow: inset 4px 0 0 ${OG}, 0 10px 22px rgba(245,127,32,0.16), 0 1px 3px rgba(9,24,37,0.04) !important;
                }
            `}</style>
        </Link>
    )
}

// ── Primary tile: single late review (no current pending) ───────────────────

function PrimaryLateTile({ data }: { data: LateItem }) {
    const rewardSignal = `+AED ${LATE_REWARD_AED}`
    const draftActive = useWeeklyDraftActive(data.week)

    return (
        <Link
            href={`/dashboard/menu/review/${data.week}`}
            className="lw-late-primary-tile"
            style={{
                ...TIER2,
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                textDecoration: 'none',
                color: NV,
                fontFamily: BODY,
                transition: 'transform 150ms, box-shadow 150ms',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Eyebrow>Review · Late</Eyebrow>
                <span style={{
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.04em',
                    color: S.fgMuted,
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'rgba(9,24,37,0.06)',
                    border: '1px solid rgba(9,24,37,0.18)',
                    whiteSpace: 'nowrap',
                }}>
                    50% reward
                </span>
            </div>

            <div style={{
                fontSize: 17, fontWeight: 700, color: NV,
                letterSpacing: '-0.005em', lineHeight: 1.2,
                marginTop: 4,
            }}>
                Week {data.week}
            </div>

            <div style={{
                fontSize: 12.5, color: S.fgMuted, lineHeight: 1.4,
            }}>
                {data.range} · {data.daysLate}d late
            </div>

            <div style={{ flex: 1 }} />

            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 14px',
                marginTop: 4,
                borderRadius: 'var(--radius-pill)',
                background: 'transparent',
                color: OG,
                border: `1px solid ${OG}`,
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                alignSelf: 'flex-start',
                transition: 'background 150ms, color 150ms',
            }}>
                {draftActive ? 'Resume' : 'Submit'} · {rewardSignal}
            </div>

            <style jsx>{`
                .lw-late-primary-tile:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(9,24,37,0.08);
                }
                .lw-late-primary-tile:hover div:last-child {
                    background: ${OG};
                    color: #fff;
                }
            `}</style>
        </Link>
    )
}

// ── Catch-up tile ──────────────────────────────────────────────────────────

function CatchUpTile({ data }: { data: LateItem }) {
    const rewardSignal = `+AED ${LATE_REWARD_AED}`
    const expiringSoon = data.daysLate >= 23
    const draftActive = useWeeklyDraftActive(data.week)

    return (
        <Link
            href={`/dashboard/menu/review/${data.week}`}
            className="lw-catchup-tile"
            style={{
                ...TIER3,
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                textDecoration: 'none',
                color: NV,
                fontFamily: BODY,
                transition: 'transform 150ms, box-shadow 150ms, background 150ms',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Eyebrow>{expiringSoon ? 'Expiring soon' : 'Catch up'}</Eyebrow>
                <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: S.fgFaint,
                    fontFeatureSettings: '"tnum"',
                }}>
                    {data.daysLate}d late
                </span>
            </div>

            <div style={{
                fontSize: 15, fontWeight: 700, color: NV,
                letterSpacing: '-0.005em', lineHeight: 1.2,
                marginTop: 2,
            }}>
                Week {data.week}
            </div>

            <div style={{
                fontSize: 11.5, color: S.fgMuted, lineHeight: 1.4,
            }}>
                {data.range}
            </div>

            <div style={{ flex: 1 }} />

            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: OG,
                marginTop: 4,
            }}>
                {draftActive ? 'Resume' : 'Submit'} · {rewardSignal} →
            </div>

            <style jsx>{`
                .lw-catchup-tile:hover {
                    transform: translateY(-1px);
                    background: rgba(245,127,32,0.04);
                }
            `}</style>
        </Link>
    )
}

// ── Submitted bar (24h confirmation) ────────────────────────────────────────
//
// Two zones inside one container: a top "what just happened" row (icon +
// week + reward earned), and a bottom "where you are in the journey" row
// — a five-node milestone path showing the four weekly reviews + a final
// monthly survey waypoint. The just-submitted node glows; previously-
// submitted nodes are ticked; future nodes are empty.

function SubmittedBar({
    week,
    rewardPct,
    submittedCount,
    weeklyTotal,
}: {
    week: number
    rewardPct: 50 | 100
    submittedCount: number
    weeklyTotal: number
}) {
    return (
        <div style={{
            padding: '14px 18px',
            marginBottom: 16,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(34,197,94,0.07)',
            border: '1px solid rgba(34,197,94,0.30)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: '50%',
                    background: '#22c55e', color: '#fff', flexShrink: 0,
                }}>
                    <Check size={15} strokeWidth={3} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: NV, lineHeight: 1.2 }}>
                        Week {week} review submitted
                    </div>
                    <div style={{ fontSize: 11.5, color: S.fgMuted, marginTop: 2 }}>
                        {rewardPct}% Dorm Wars reward earned
                    </div>
                </div>
                <Sparkles size={15} strokeWidth={2.2} color="#16a34a" />
            </div>

            <div style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: '1px solid rgba(34,197,94,0.20)',
            }}>
                <MilestonePath
                    submittedCount={submittedCount}
                    weeklyTotal={weeklyTotal || 4}
                    justSubmittedWeek={week}
                />
            </div>
        </div>
    )
}

// ── Milestone path (cycle journey visualization) ────────────────────────────
//
// 5 nodes: N weekly reviews + 1 final monthly survey. The monthly node is a
// future feature placeholder — visually present so the user sees the shape
// of the journey, but not interactive yet.

function MilestonePath({
    submittedCount,
    weeklyTotal,
    justSubmittedWeek,
}: {
    submittedCount: number
    weeklyTotal: number
    justSubmittedWeek: number
}) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 0,
            width: '100%',
        }}>
            {Array.from({ length: weeklyTotal }).map((_, i) => {
                const weekNum = i + 1
                const isSubmitted = weekNum <= submittedCount
                const isJustSubmitted = weekNum === justSubmittedWeek
                const isLastWeekly = i === weeklyTotal - 1
                return (
                    <MilestoneSegment
                        key={weekNum}
                        label={`W${weekNum}`}
                        state={isSubmitted ? 'done' : 'pending'}
                        celebrate={isJustSubmitted}
                        showConnector={!isLastWeekly}
                        connectorActive={isSubmitted && weekNum + 1 <= submittedCount}
                    />
                )
            })}
            {/* Connector from last weekly → monthly node */}
            <Connector active={false} dashed />
            <MilestoneSegment
                label="Final"
                state="future"
                isMonthly
            />
        </div>
    )
}

function MilestoneSegment({
    label,
    state,
    celebrate = false,
    showConnector = false,
    connectorActive = false,
    isMonthly = false,
}: {
    label: string
    state: 'done' | 'pending' | 'future'
    celebrate?: boolean
    showConnector?: boolean
    connectorActive?: boolean
    isMonthly?: boolean
}) {
    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <MilestoneNode state={state} celebrate={celebrate} isMonthly={isMonthly} />
                <span style={{
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: state === 'done' ? '#16a34a' : S.fgFaint,
                    fontFeatureSettings: '"tnum"',
                }}>
                    {label}
                </span>
            </div>
            {showConnector && <Connector active={connectorActive} />}
        </>
    )
}

function MilestoneNode({
    state,
    celebrate = false,
    isMonthly = false,
}: {
    state: 'done' | 'pending' | 'future'
    celebrate?: boolean
    isMonthly?: boolean
}) {
    const size = isMonthly ? 30 : 26
    const baseStyle: React.CSSProperties = {
        width: size, height: size,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 200ms, box-shadow 200ms, transform 200ms',
    }

    if (state === 'done') {
        return (
            <div style={{
                ...baseStyle,
                background: '#22c55e',
                color: '#fff',
                boxShadow: celebrate
                    ? '0 0 0 4px rgba(34,197,94,0.18), 0 6px 18px rgba(34,197,94,0.45)'
                    : '0 2px 6px rgba(34,197,94,0.30)',
                transform: celebrate ? 'scale(1.08)' : 'scale(1)',
            }}>
                <Check size={isMonthly ? 16 : 14} strokeWidth={3} />
            </div>
        )
    }

    if (isMonthly) {
        return (
            <div style={{
                ...baseStyle,
                background: 'rgba(245,127,32,0.08)',
                color: 'rgba(245,127,32,0.55)',
                border: '1.5px dashed rgba(245,127,32,0.45)',
            }}>
                <Trophy size={14} strokeWidth={2.2} />
            </div>
        )
    }

    return (
        <div style={{
            ...baseStyle,
            background: 'rgba(255,255,255,0.55)',
            border: `1.5px solid rgba(9,24,37,0.18)`,
            color: 'rgba(9,24,37,0.30)',
            fontSize: 11, fontWeight: 700,
        }}>
            {/* Empty inside — the label below tells the user which week */}
        </div>
    )
}

function Connector({ active, dashed = false }: { active: boolean; dashed?: boolean }) {
    return (
        <div style={{
            flex: 1,
            height: 0,
            borderTop: dashed
                ? `1.5px dashed ${active ? '#22c55e' : 'rgba(9,24,37,0.22)'}`
                : `1.5px solid ${active ? '#22c55e' : 'rgba(9,24,37,0.18)'}`,
            // Align with the center of the milestone node (which has a label below it)
            marginBottom: 14,
        }} />
    )
}
