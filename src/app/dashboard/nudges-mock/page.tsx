'use client'

import { notFound } from 'next/navigation'
import { Clock, ChevronRight, CalendarDays, LayoutDashboard, Utensils, Compass, Trophy, MessagesSquare } from 'lucide-react'
import { BODY, OG, NV, S, TIER1, TIER_POP } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'

// ── Mock states ─────────────────────────────────────────────────────────────

type NudgeState =
    | { kind: 'single-pending'; week: number; daysLeft: number }
    | { kind: 'multiple-pending'; week: number; daysLeft: number; lateCount: number }
    | { kind: 'late-only'; lateCount: number }
    | { kind: 'none' }

export default function NudgesMockPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return (
        <div style={{ padding: '24px clamp(16px, 3vw, 36px) 48px', fontFamily: BODY, color: NV }}>
            <header style={{ marginBottom: 28 }}>
                <Eyebrow>Weekly review nudges · preview</Eyebrow>
                <h1 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
                    Dashboard mini-nudge & sidebar badge
                </h1>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>
                    Two secondary entry points outside the Plan page. Mini-nudge sits among dashboard
                    cards; badge lives on the sidebar Plan icon.
                </p>
            </header>

            <Section label="Dashboard mini-nudge · States">
                <NudgeRow label="Single pending — within 7-day window">
                    <DashboardMiniNudge state={{ kind: 'single-pending', week: 4, daysLeft: 5 }} />
                </NudgeRow>
                <NudgeRow label="Multiple pending — current + catch-up backlog">
                    <DashboardMiniNudge state={{ kind: 'multiple-pending', week: 4, daysLeft: 5, lateCount: 3 }} />
                </NudgeRow>
                <NudgeRow label="Late only — past the 7-day window, 50% reward">
                    <DashboardMiniNudge state={{ kind: 'late-only', lateCount: 1 }} />
                </NudgeRow>
                <NudgeRow label="None pending — card not rendered">
                    <DashboardMiniNudge state={{ kind: 'none' }} />
                </NudgeRow>
            </Section>

            <Section label="Sidebar nav badge · States">
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                    <SidebarPreview badge="active" label="Pending · in window (bright dot)" />
                    <SidebarPreview badge="late" label="Pending · late only (muted dot)" />
                    <SidebarPreview badge="none" label="No pending (no dot)" />
                </div>
            </Section>
        </div>
    )
}

// ── Section / row wrappers ──────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 40 }}>
            <div style={{
                marginBottom: 14,
                paddingBottom: 8,
                borderBottom: `1px dashed ${S.border2}`,
            }}>
                <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: S.fgFaint,
                }}>
                    {label}
                </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {children}
            </div>
        </div>
    )
}

function NudgeRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={{
                fontSize: 11, fontWeight: 600, color: S.fgFaint,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                marginBottom: 8,
            }}>
                {label}
            </div>
            {children}
        </div>
    )
}

// ── Dashboard mini-nudge ────────────────────────────────────────────────────
// Compact row card. Lives in the dashboard grid at ~span 6. Click anywhere
// on the card opens the survey takeover for the most recent pending week,
// OR routes to the Plan page if there's a backlog to triage.

function DashboardMiniNudge({ state }: { state: NudgeState }) {
    if (state.kind === 'none') {
        return (
            <div style={{
                maxWidth: 560,
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                border: `1px dashed ${S.border2}`,
                color: S.fgFaint,
                fontSize: 12.5,
                fontStyle: 'italic',
                lineHeight: 1.5,
            }}>
                Not rendered in production — dashboard reads as normal.
            </div>
        )
    }

    const isUrgent = state.kind === 'single-pending' || state.kind === 'multiple-pending'

    const title =
        state.kind === 'single-pending' ? `Week ${state.week} review pending`
        : state.kind === 'multiple-pending' ? `${state.lateCount + 1} reviews pending`
        : `${state.lateCount} late review${state.lateCount === 1 ? '' : 's'}`

    const sub =
        state.kind === 'single-pending'
            ? state.daysLeft === 0 ? 'Last day for full reward' : `${state.daysLeft}d left for full reward`
        : state.kind === 'multiple-pending' ? `Week ${state.week} due in ${state.daysLeft}d · ${state.lateCount} late`
        : '50% reward · submissions still count'

    return (
        <button
            type="button"
            style={{
                maxWidth: 560,
                width: '100%',
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
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: BODY,
                transition: 'transform 150ms, box-shadow 150ms, border-color 150ms',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = isUrgent
                    ? '0 6px 20px rgba(245,127,32,0.14)'
                    : '0 4px 10px rgba(9,24,37,0.06)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = isUrgent
                    ? '0 4px 14px rgba(245,127,32,0.08)'
                    : '0 1px 3px rgba(9,24,37,0.04)'
            }}
        >
            {/* Icon medallion */}
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36, height: 36,
                borderRadius: '50%',
                background: isUrgent
                    ? 'linear-gradient(135deg, rgba(245,127,32,0.18) 0%, rgba(255,170,0,0.14) 100%)'
                    : 'rgba(9,24,37,0.06)',
                border: `1px solid ${isUrgent ? 'rgba(245,127,32,0.45)' : 'rgba(9,24,37,0.10)'}`,
                color: isUrgent ? '#b85b14' : S.fgMuted,
                flexShrink: 0,
            }}>
                <Clock size={16} strokeWidth={2.2} />
            </div>

            {/* Text block */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: NV,
                    lineHeight: 1.25,
                    letterSpacing: '-0.005em',
                    marginBottom: 2,
                }}>
                    {title}
                </div>
                <div style={{
                    fontSize: 12,
                    color: S.fgMuted,
                    lineHeight: 1.4,
                    fontFeatureSettings: '"tnum"',
                }}>
                    {sub}
                </div>
            </div>

            {/* Chevron */}
            <ChevronRight
                size={18}
                strokeWidth={2.2}
                color={isUrgent ? OG : S.fgFaint}
                style={{ flexShrink: 0 }}
            />
        </button>
    )
}

// ── Sidebar nav badge ───────────────────────────────────────────────────────
// Renders a simulated 76px sidebar rail fragment so the badge can be seen
// in its actual context (navy gradient + cream icons). Real implementation
// just adds a badge prop to the existing Sidebar NAV item rendering.

function SidebarPreview({ badge, label }: { badge: 'active' | 'late' | 'none'; label: string }) {
    return (
        <div>
            <div style={{
                fontSize: 11, fontWeight: 600, color: S.fgFaint,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                marginBottom: 10,
            }}>
                {label}
            </div>

            {/* Sidebar rail mock */}
            <div style={{
                width: 76,
                padding: '14px 0',
                borderRadius: 'var(--radius-md)',
                background: TIER_POP.background,
                border: TIER_POP.border,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
            }}>
                <RailIcon Icon={LayoutDashboard} />
                <RailIcon Icon={Utensils} />
                <RailIcon Icon={CalendarDays} active badge={badge} />
                <RailIcon Icon={Compass} />
                <RailIcon Icon={Trophy} />
                <RailIcon Icon={MessagesSquare} />
            </div>
        </div>
    )
}

function RailIcon({
    Icon,
    active = false,
    badge = 'none',
}: {
    Icon: typeof CalendarDays
    active?: boolean
    badge?: 'active' | 'late' | 'none'
}) {
    return (
        <div style={{
            position: 'relative',
            width: 44, height: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            background: active ? 'rgba(245,127,32,0.14)' : 'transparent',
            border: active ? '1px solid rgba(245,127,32,0.35)' : '1px solid transparent',
            color: active ? '#ffc66b' : 'rgba(237,232,218,0.72)',
            transition: 'background 150ms',
        }}>
            <Icon size={20} strokeWidth={2.0} />

            {badge !== 'none' && (
                <span
                    aria-label={badge === 'active' ? 'Pending review' : 'Late review'}
                    style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: badge === 'active' ? OG : 'rgba(237,232,218,0.45)',
                        border: '2px solid #1a3e4f',
                        boxShadow: badge === 'active' ? '0 0 8px rgba(245,127,32,0.7)' : 'none',
                    }}
                />
            )}
        </div>
    )
}
