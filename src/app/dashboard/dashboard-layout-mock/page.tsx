'use client'

import { notFound } from 'next/navigation'
import { Clock, ChevronRight } from 'lucide-react'
import { BODY, OG, NV, S, TIER1, TIER3 } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'

// Spatial mock of the dashboard layout with the proposed mini-nudge slot.
// Real cards (Hero, QuickActions, PlanProgress, StatRow) are stubbed as
// placeholders sized to their actual span + approximate render height so
// the visual flow reads honestly. The MiniNudge is the real component.

export default function DashboardLayoutMockPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return (
        <div style={{ padding: '24px clamp(16px, 3vw, 36px) 48px', fontFamily: BODY, color: NV }}>
            <header style={{ marginBottom: 28 }}>
                <Eyebrow>Dashboard layout · preview</Eyebrow>
                <h1 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
                    Mini-nudge slotted into the dashboard grid
                </h1>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>
                    Two snapshots: dashboard as it renders today (no pending review) vs. dashboard with a
                    pending review (mini-nudge slotted between QuickActions row and PlanProgress).
                </p>
            </header>

            <Section label="Snapshot A · No pending review — original layout">
                <DashGrid>
                    <Placeholder span={12} height={84} label="StatRow" />
                    <Placeholder span={8} height={320} label="HeroToday" />
                    <Placeholder span={4} height={320} label="QuickActions" />
                    <Placeholder span={12} height={220} label="PlanProgress" />
                </DashGrid>
            </Section>

            <Section label="Snapshot B · Pending review — mini-nudge inserted at span 6">
                <DashGrid>
                    <Placeholder span={12} height={84} label="StatRow" />
                    <Placeholder span={8} height={320} label="HeroToday" />
                    <Placeholder span={4} height={320} label="QuickActions" />
                    <div style={{ gridColumn: 'span 6' }}>
                        <DashboardMiniNudge week={4} daysLeft={5} />
                    </div>
                    <Placeholder span={12} height={220} label="PlanProgress" />
                </DashGrid>
            </Section>

            <Section label="Snapshot C · Pending review (multiple) — same slot, copy adapts">
                <DashGrid>
                    <Placeholder span={12} height={84} label="StatRow" />
                    <Placeholder span={8} height={320} label="HeroToday" />
                    <Placeholder span={4} height={320} label="QuickActions" />
                    <div style={{ gridColumn: 'span 6' }}>
                        <DashboardMiniNudge week={4} daysLeft={5} lateCount={3} />
                    </div>
                    <Placeholder span={12} height={220} label="PlanProgress" />
                </DashGrid>
            </Section>

            <div style={{
                marginTop: 36,
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                background: TIER1.background,
                border: TIER1.border,
                fontSize: 12.5,
                color: S.fgMuted,
                lineHeight: 1.6,
                maxWidth: 760,
            }}>
                <strong style={{ color: NV, fontWeight: 700 }}>Layout note:</strong>{' '}
                The right-side half of the mini-nudge row is left intentionally empty for now.
                It&rsquo;s the natural slot for a future companion tile (e.g.{' '}
                <em>&ldquo;AED 18 earned this cycle&rdquo;</em> stat from the Rewards card we built on the Plan page).
                Adding one isn&rsquo;t blocking — empty whitespace is fine.
            </div>
        </div>
    )
}

// ── Section wrapper ─────────────────────────────────────────────────────────

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
            {children}
        </div>
    )
}

// ── Faux dashboard grid (matches .dash-grid spec from globals) ──────────────

function DashGrid({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gap: 20,
        }}>
            {children}
        </div>
    )
}

// ── Placeholder for real dashboard cards ────────────────────────────────────

function Placeholder({ span, height, label }: { span: number; height: number; label: string }) {
    return (
        <div style={{
            gridColumn: `span ${span}`,
            minHeight: height,
            borderRadius: 'var(--radius-md)',
            background: TIER3.background,
            border: `1px dashed ${S.border2}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: S.fgFaint,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontFamily: BODY,
        }}>
            {label}
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: S.fgFaint, opacity: 0.7 }}>
                · span {span}
            </span>
        </div>
    )
}

// ── Mini-nudge (real component, inlined for self-contained mock) ────────────

function DashboardMiniNudge({
    week,
    daysLeft,
    lateCount = 0,
}: {
    week: number
    daysLeft: number
    lateCount?: number
}) {
    const isMultiple = lateCount > 0
    const title = isMultiple ? `${lateCount + 1} reviews pending` : `Week ${week} review pending`
    const sub = isMultiple
        ? `Week ${week} due in ${daysLeft}d · ${lateCount} late`
        : daysLeft === 0
            ? 'Last day for full reward'
            : `${daysLeft}d left for full reward`

    return (
        <button
            type="button"
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #fef4e4 0%, #fdf8ec 100%)',
                border: '1px solid rgba(245,127,32,0.30)',
                boxShadow: '0 4px 14px rgba(245,127,32,0.08)',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: BODY,
                transition: 'transform 150ms, box-shadow 150ms',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(245,127,32,0.14)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(245,127,32,0.08)'
            }}
        >
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36, height: 36,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(245,127,32,0.18) 0%, rgba(255,170,0,0.14) 100%)',
                border: '1px solid rgba(245,127,32,0.45)',
                color: '#b85b14',
                flexShrink: 0,
            }}>
                <Clock size={16} strokeWidth={2.2} />
            </div>

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

            <ChevronRight size={18} strokeWidth={2.2} color={OG} style={{ flexShrink: 0 }} />
        </button>
    )
}
