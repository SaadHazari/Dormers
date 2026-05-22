'use client'

import Link from 'next/link'
import {
    Clock, ArrowRight, Check, ChevronRight, Sparkles, Trophy,
} from 'lucide-react'
import { BODY, OG, NV, S, TIER1, TIER2 } from './tokens'
import { Eyebrow } from './Eyebrow'
import { useWeeklyDraftActive } from './draft-hooks'
import type { WeeklyReviewState, LateItem, RewardsCycle } from '@/lib/weekly-review'

/**
 * Plan-page primary trigger surface.
 *
 * Layout: a single Reviews container (active task + catch-up stack folded
 * into ONE mental group, ordered by urgency) sits alongside a Rewards
 * sidebar. The sidebar uses align-items:flex-start so it stops stretching
 * to match the taller task card — which is what created the asymmetric
 * "peer" mismatch when the active card collapsed into the submitted state.
 *
 * Renders nothing when there's truly nothing to show (no pending, no late,
 * no recent submission, no cycle progress) — keeps an idle mid-cycle plan
 * page from showing a lonely Rewards tile.
 */
export function WeeklyReviewTrigger({ state }: { state: WeeklyReviewState }) {
    const { current, late, justSubmitted, rewards } = state

    const hasContent = current || late.length > 0 || justSubmitted || rewards.submitted > 0
    if (!hasContent) return null

    type Primary =
        | { kind: 'submitted'; data: { week: number; rewardPct: 50 | 100 } }
        | { kind: 'pending'; data: { week: number; range: string; daysLeft: number } }
        | { kind: 'late'; data: LateItem }
        | { kind: 'none' }

    const primary: Primary =
        justSubmitted ? { kind: 'submitted', data: justSubmitted }
        : current     ? { kind: 'pending',   data: current }
        : late.length === 1 ? { kind: 'late', data: late[0] }
        : { kind: 'none' }

    // When the primary slot is a single late review, that IS the catch-up.
    // Don't duplicate it as a stack row below.
    const catchUpItems: LateItem[] = primary.kind === 'late' ? [] : late
    const hasAnyReviews = primary.kind !== 'none' || catchUpItems.length > 0

    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            // Always align to top — the sidebar should NOT stretch to match
            // the task card's height. Stretching is what made the rewards
            // tile look like a peer when it's really a status sidebar.
            alignItems: 'flex-start',
            marginBottom: 24,
        }}>
            {hasAnyReviews && (
                <ReviewsContainer primary={primary} catchUp={catchUpItems} />
            )}
            <RewardsCard
                rewards={rewards}
                celebrate={primary.kind === 'submitted' && rewards.submitted >= rewards.total}
            />
        </div>
    )
}

// ── Unified reviews container ───────────────────────────────────────────────
//
// One card. Header strip → primary task (pending/late/submitted) → catch-up
// section with divider. The orange edge anchor (inset shadow) lives on the
// primary task row only — so "needs your attention" reads on ONE thing.

type Primary =
    | { kind: 'submitted'; data: { week: number; rewardPct: 50 | 100 } }
    | { kind: 'pending';   data: { week: number; range: string; daysLeft: number } }
    | { kind: 'late';      data: LateItem }
    | { kind: 'none' }

function ReviewsContainer({ primary, catchUp }: { primary: Primary; catchUp: LateItem[] }) {
    const taskCount =
        (primary.kind === 'pending' || primary.kind === 'late' ? 1 : 0) + catchUp.length

    return (
        <div style={{
            flex: '1 1 720px',
            maxWidth: 720,
            minWidth: 0,
            ...TIER1,
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12,
                padding: '16px 22px 12px',
            }}>
                <Eyebrow>Reviews</Eyebrow>
                <span style={{
                    fontSize: 11, fontWeight: 600, color: S.fgFaint,
                    letterSpacing: '0.02em', fontFeatureSettings: '"tnum"',
                }}>
                    {taskCount > 0
                        ? `${taskCount} to do`
                        : primary.kind === 'submitted' ? 'just submitted' : 'all caught up'}
                </span>
            </div>

            {primary.kind === 'pending'   && <PendingRow data={primary.data} />}
            {primary.kind === 'late'      && <LateRow    data={primary.data} />}
            {primary.kind === 'submitted' && <SubmittedRow data={primary.data} />}

            {catchUp.length > 0 && (
                <CatchUpSection items={catchUp} hasPrimary={primary.kind !== 'none'} />
            )}
        </div>
    )
}

// ── Primary task: pending (within 7-day full-reward window) ─────────────────

function PendingRow({ data }: { data: { week: number; range: string; daysLeft: number } }) {
    const draftActive = useWeeklyDraftActive(data.week)
    return (
        <div style={{
            padding: '6px 22px 20px',
            boxShadow: `inset 4px 0 0 ${OG}`,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div style={{
                    fontSize: 'clamp(17px, 1.6vw, 19px)',
                    fontWeight: 800,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.2,
                    color: NV,
                    flex: 1, minWidth: 0,
                }}>
                    Week {data.week} wrapped — share how it went
                </div>
                <RewardChip variant="full" daysLeft={data.daysLeft} />
            </div>
            <div style={{ fontSize: 13, color: S.fgMuted, lineHeight: 1.5, marginBottom: 16 }}>
                {data.range} · 60-second review
            </div>
            <CtaButton href={`/dashboard/plan/review/${data.week}`} variant="primary">
                {draftActive ? 'Resume review' : 'Start review'}
            </CtaButton>
        </div>
    )
}

// ── Primary task: single late review (no current pending) ───────────────────

function LateRow({ data }: { data: LateItem }) {
    const draftActive = useWeeklyDraftActive(data.week)
    return (
        <div style={{ padding: '6px 22px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div style={{
                    fontSize: 16, fontWeight: 700, color: NV,
                    letterSpacing: '-0.005em', lineHeight: 1.2,
                    flex: 1, minWidth: 0,
                }}>
                    Week {data.week} review
                </div>
                <RewardChip variant="late" />
            </div>
            <div style={{ fontSize: 13, color: S.fgMuted, lineHeight: 1.5, marginBottom: 14 }}>
                {data.range} · past the full-reward window. Submission still counts and earns 50%.
            </div>
            <CtaButton href={`/dashboard/plan/review/${data.week}`} variant="muted">
                {draftActive ? 'Resume review' : 'Submit review'}
            </CtaButton>
        </div>
    )
}

// ── Primary task: submitted (24h confirmation) ──────────────────────────────

function SubmittedRow({ data }: { data: { week: number; rewardPct: 50 | 100 } }) {
    return (
        <div style={{
            margin: '0 22px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'rgba(34,197,94,0.07)',
            border: '1px solid rgba(34,197,94,0.30)',
        }}>
            <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, borderRadius: '50%',
                background: '#22c55e', color: '#fff', flexShrink: 0,
            }}>
                <Check size={15} strokeWidth={3} />
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: NV, lineHeight: 1.2 }}>
                    Week {data.week} review submitted
                </div>
                <div style={{ fontSize: 11.5, color: S.fgMuted, marginTop: 2 }}>
                    {data.rewardPct}% Dorm Wars reward earned
                </div>
            </div>
            <Sparkles size={15} strokeWidth={2.2} color="#16a34a" />
        </div>
    )
}

// ── Catch-up section (lives INSIDE the reviews container, below primary) ────

function CatchUpSection({ items, hasPrimary }: { items: LateItem[]; hasPrimary: boolean }) {
    const reviewWord = items.length === 1 ? 'review' : 'reviews'
    return (
        <div>
            {hasPrimary && (
                <div style={{
                    margin: '0 22px',
                    borderTop: `1px solid ${S.border}`,
                }} />
            )}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 22px 6px',
            }}>
                <Eyebrow>Catch up · {items.length} {reviewWord} pending</Eyebrow>
                <span style={{
                    fontSize: 11, fontWeight: 600, color: S.fgFaint,
                    letterSpacing: '0.02em',
                }}>
                    50% reward each
                </span>
            </div>
            <div>
                {items.map((item, i) => (
                    <CatchUpRow key={item.week} item={item} firstRow={i === 0} />
                ))}
            </div>

            <style jsx>{`
                .catch-up-row:hover { background: rgba(245,127,32,0.04); }
                .catch-up-row:hover span { background: ${OG}; color: #fff; }
            `}</style>
        </div>
    )
}

function CatchUpRow({ item, firstRow }: { item: LateItem; firstRow: boolean }) {
    const draftActive = useWeeklyDraftActive(item.week)
    return (
        <Link
            href={`/dashboard/plan/review/${item.week}`}
            className="catch-up-row"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 22px',
                borderTop: firstRow ? 'none' : `1px solid ${S.border}`,
                background: 'transparent',
                textDecoration: 'none',
                color: NV,
                transition: 'background 150ms',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: NV, lineHeight: 1.2 }}>
                    Week {item.week}{' '}
                    <span style={{ fontWeight: 500, color: S.fgMuted, fontSize: 13 }}>
                        · {item.range}
                    </span>
                </div>
                <div style={{
                    fontSize: 11.5, color: S.fgFaint,
                    fontFeatureSettings: '"tnum"', marginTop: 2,
                }}>
                    {item.daysLate}d late{item.daysLate >= 23 ? ` · expires in ${30 - item.daysLate}d` : ''}
                </div>
            </div>
            {/* Outlined orange — visually secondary to the active task's filled
                CTA above. Without this hierarchy, two equally-loud filled
                buttons compete on the same screen and the user can't tell
                which to do first. */}
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 14px',
                background: 'transparent',
                color: OG,
                border: `1px solid ${OG}`,
                borderRadius: 'var(--radius-pill)',
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                flexShrink: 0,
                transition: 'background 150ms, color 150ms',
            }}>
                {draftActive ? 'Resume' : 'Submit'} <ChevronRight size={12} strokeWidth={2.6} />
            </span>
        </Link>
    )
}

// ── Rewards companion (sidebar — no longer a peer card) ─────────────────────

function RewardsCard({ rewards, celebrate = false }: { rewards: RewardsCycle; celebrate?: boolean }) {
    const { submitted, total, aedEarned, aedPending, cycle, label } = rewards
    const isComplete = submitted >= total
    const pct = total > 0 ? Math.min(100, (submitted / total) * 100) : 0

    return (
        <div style={{
            flex: '0 0 280px',
            maxWidth: 280,
            padding: '18px 20px',
            borderRadius: 'var(--radius-md)',
            ...(celebrate
                ? { background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.28)' }
                : TIER2),
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            position: 'relative',
            overflow: 'hidden',
        }}>
            {celebrate && (
                <div aria-hidden style={{
                    position: 'absolute',
                    top: -50, left: -50,
                    width: 160, height: 160,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(34,197,94,0.16) 0%, rgba(34,197,94,0) 70%)',
                    pointerEvents: 'none',
                }} />
            )}

            {/* Header — eyebrow + Trophy (always present so the card has ONE
                visual identity across states; color flips with completion). */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                position: 'relative',
            }}>
                <Eyebrow>{label} · {cycle}</Eyebrow>
                <Trophy
                    size={14}
                    strokeWidth={2.2}
                    color={isComplete ? '#16a34a' : 'rgba(9,24,37,0.32)'}
                />
            </div>

            {/* Hero AED value — Refactoring UI "key metric large, context small".
                The earned amount is the headline of this card; everything else
                supports it. AED prefix at small uppercase reads as the unit; the
                number is the visual anchor. */}
            <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{
                        fontSize: 13,
                        color: NV,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                    }}>
                        AED
                    </span>
                    <span style={{
                        fontSize: 32,
                        color: NV,
                        fontWeight: 800,
                        lineHeight: 1,
                        letterSpacing: '-0.025em',
                        fontFeatureSettings: '"tnum"',
                    }}>
                        {aedEarned}
                    </span>
                </div>
                <div style={{
                    marginTop: 4,
                    fontSize: 12, color: S.fgMuted, lineHeight: 1.4,
                }}>
                    {isComplete
                        ? <span style={{ color: '#16a34a', fontWeight: 700 }}>Full payout unlocked</span>
                        : <>Earned{aedPending > 0 ? ` · AED ${aedPending} still to go` : ''}</>}
                </div>
            </div>

            {/* Progress — bumped from 4px to 7px so it reads as a real metric
                rather than a hairline decoration. Same orange-gradient fill
                in-progress, green when complete. */}
            <div style={{ position: 'relative' }}>
                <div style={{
                    height: 7,
                    borderRadius: 3.5,
                    background: 'rgba(9,24,37,0.08)',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: 3.5,
                        background: isComplete
                            ? '#22c55e'
                            : 'linear-gradient(90deg, #fbd9a8 0%, #f57f20 100%)',
                        boxShadow: isComplete ? '0 0 8px rgba(34,197,94,0.40)' : 'none',
                        transition: 'width 350ms cubic-bezier(0.4, 0, 0.2, 1), background 250ms',
                    }} />
                </div>
                <div style={{
                    marginTop: 8, fontSize: 11.5, color: S.fgMuted,
                    letterSpacing: '0.02em', fontFeatureSettings: '"tnum"',
                }}>
                    {submitted} of {total} weeks reviewed
                </div>
            </div>

            {/* Meaningfulness — answers "what IS this AED?" without sending the
                user to another page to find out. Recognition over recall. */}
            <div style={{
                fontSize: 11.5,
                color: S.fgMuted,
                lineHeight: 1.5,
                position: 'relative',
            }}>
                Applied as credit on your next plan.
            </div>

            <Link
                href="/dashboard/dorm-wars"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    paddingTop: 4,
                    fontFamily: BODY,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: S.fgFaint,
                    textDecoration: 'none',
                    alignSelf: 'flex-start',
                    position: 'relative',
                    transition: 'color 150ms',
                }}
                className="rewards-link"
            >
                View Dorm Wars <ChevronRight size={11} strokeWidth={2.2} />
                <style jsx>{`
                    .rewards-link:hover { color: ${S.fgMuted}; }
                `}</style>
            </Link>
        </div>
    )
}

// ── Reward chip (countdown / late indicator) ────────────────────────────────

function RewardChip({ variant, daysLeft }: { variant: 'full' | 'late'; daysLeft?: number }) {
    const isFull = variant === 'full'
    const isLastDay = isFull && daysLeft === 0
    return (
        <div
            title={isFull
                ? 'Submit within 7 days of week end for 100% Dorm Wars reward. After that, 50%.'
                : 'Submitted after the 7-day window. 50% Dorm Wars reward instead of 100%.'}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 11px',
                borderRadius: 'var(--radius-pill)',
                background: isFull
                    ? 'rgba(245,127,32,0.16)'
                    : 'rgba(9,24,37,0.06)',
                border: `1px solid ${isFull ? 'rgba(245,127,32,0.55)' : 'rgba(9,24,37,0.18)'}`,
                color: isFull ? '#8c4214' : S.fgMuted,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'help',
                whiteSpace: 'nowrap',
                flexShrink: 0,
            }}
        >
            <Clock size={11} strokeWidth={2.4} />
            {isFull
                ? isLastDay ? <>Last day for full reward</> : <>{daysLeft}d left for full reward</>
                : <>Late · 50% reward</>}
        </div>
    )
}

// ── CTA button (primary orange / muted neutral) ─────────────────────────────

function CtaButton({ href, variant, children }: { href: string; variant: 'primary' | 'muted'; children: React.ReactNode }) {
    const isPrimary = variant === 'primary'
    return (
        <Link
            href={href}
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
                textDecoration: 'none',
                boxShadow: isPrimary ? '0 6px 20px rgba(245,127,32,0.40)' : '0 1px 2px rgba(9,24,37,0.04)',
                transition: 'transform 120ms, box-shadow 150ms, background 150ms',
            }}
            className={isPrimary ? 'wr-cta-primary' : 'wr-cta-muted'}
        >
            {children}
            <ArrowRight size={isPrimary ? 14 : 12} strokeWidth={2.4} />
            <style jsx>{`
                .wr-cta-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(245,127,32,0.50); }
                .wr-cta-muted:hover { background: #fff; }
            `}</style>
        </Link>
    )
}
