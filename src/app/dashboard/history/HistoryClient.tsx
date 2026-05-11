'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cleanPlanName, OG, BODY, DISPLAY } from '../_shared/tokens'
import { PlanGlyph } from '../_shared/PlanGlyph'
import { fmt } from '../_shared/format'

// Translucent-surface S — History rows sit over the BG_GRADIENT page wash
// (set by the layout), so cards use a soft glass over the cream/navy panel.
// Variables flip in dark mode via globals.css.
const S = {
  surface2: 'var(--ds-glass-bg)',
  border:   'var(--ds-border)',
  fgMuted:  'var(--ds-fg-sub)',
  fgSub:    'var(--ds-fg-faint)',
}

export type EndedPlan = {
  id: string
  plan_name: string
  status: string
  start_date: string
  end_date: string
  total_meals: number
  delivered_meals: number
  skipped_meals_count: number
}

export default function HistoryClient({ plans }: { plans: EndedPlan[] }) {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: 'var(--ds-fg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Back link */}
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: BODY, fontSize: 12, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: S.fgMuted, textDecoration: 'none',
            padding: '6px 0',
          }}
          className="history-back"
        >
          <ArrowLeft size={13} strokeWidth={2.4} />
          Back to dashboard
        </Link>

        {/* Header */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgMuted }}>
            Past plans
          </div>
          <h1 style={{
            margin: '6px 0 0 0',
            fontFamily: DISPLAY, fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ds-fg)', lineHeight: 1.1,
          }}>
            Your subscription history.
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: S.fgMuted, lineHeight: 1.6, maxWidth: 56 + 'ch' }}>
            Every plan you&rsquo;ve completed, with delivery and skip totals. Useful for re-ordering an old favorite.
          </p>
        </div>

        {/* List or empty state */}
        <div style={{ marginTop: 28 }}>
          {plans.length === 0 ? (
            <div style={{
              padding: '40px 28px',
              borderRadius: 'var(--radius-md)',
              background: S.surface2, border: `1px solid ${S.border}`,
              boxShadow: 'var(--shadow-sm)',
              textAlign: 'center',
            }}>
              <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 600, color: 'var(--ds-fg)' }}>
                No past plans yet.
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>
                When your current plan ends, it&rsquo;ll show up here.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {plans.map(p => {
                const cleanName = cleanPlanName(p.plan_name)
                const completionPct = p.total_meals > 0 ? Math.round((p.delivered_meals / p.total_meals) * 100) : 0
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 24, alignItems: 'center',
                      padding: '20px 24px',
                      borderRadius: 'var(--radius-md)',
                      background: S.surface2, border: `1px solid ${S.border}`,
                      boxShadow: 'var(--shadow-sm)',
                    }}
                    className="history-row"
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontFamily: BODY, fontSize: 16, fontWeight: 600,
                        color: 'var(--ds-fg)', lineHeight: 1.25, letterSpacing: '-0.005em',
                      }}>
                        <PlanGlyph planName={p.plan_name} size={16} color="currentColor" />
                        {cleanName}
                      </div>
                      <div style={{
                        marginTop: 6, fontSize: 12, color: S.fgMuted, lineHeight: 1.5,
                        fontFeatureSettings: '"tnum"',
                      }}>
                        {fmt(p.start_date)} → {fmt(p.end_date)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                      <Stat label="Delivered" value={`${p.delivered_meals} / ${p.total_meals}`} />
                      <Stat label="Skipped"   value={String(p.skipped_meals_count)} />
                      <Stat label="Completion" value={`${completionPct}%`} accent />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .history-back:hover { color: var(--ds-fg) !important; }
        @media (max-width: 720px) {
          .history-row {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{
        fontFamily: BODY, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: S.fgMuted,
      }}>
        {label}
      </div>
      <div style={{
        marginTop: 4,
        fontFamily: DISPLAY, fontSize: 18, fontWeight: 600,
        color: accent ? OG : 'var(--ds-fg)', lineHeight: 1,
        fontFeatureSettings: '"tnum"',
      }}>
        {value}
      </div>
    </div>
  )
}
