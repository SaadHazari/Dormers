'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  MobileColumn, SectionTitle, CARD, S, BODY,
  CompactMetricStrip, PlanGlyph, cleanPlanName,
} from './kit'
import { fmt } from '../_shared/format'
import type { EndedPlan } from '../history/HistoryClient'

/**
 * MobileHistory — the height-optimised <768 subscription-history surface.
 *
 * Pure render (HistoryClient holds no state): a recognition list the user scans
 * to find a past plan they liked. Each row is a compact stacked block —
 * name + glyph → date range → a left-aligned CompactMetricStrip (Delivered /
 * Skipped / Completion). ~6 rows per screen. No re-order action exists; the
 * "re-order a favourite" line is copy only (spec §7.7).
 */
export function MobileHistory({ plans }: { plans: EndedPlan[] }) {
  return (
    <MobileColumn style={{ color: S.fg, paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>

      {/* Back link + header — cleared of the fixed hamburger (paddingLeft 56). */}
      <div style={{ paddingLeft: 56 }}>
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 4px', margin: '-6px -4px',
            fontFamily: BODY, fontSize: 12, fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: S.fgSub, textDecoration: 'none', touchAction: 'manipulation',
          }}
        >
          <ArrowLeft size={13} strokeWidth={2.4} aria-hidden /> Back to dashboard
        </Link>

        <div style={{ marginTop: 10, fontFamily: BODY, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgFaint }}>
          Past plans
        </div>
        <SectionTitle size={23} style={{ marginTop: 5 }}>Your plan history</SectionTitle>
        <p style={{ marginTop: 8, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>
          Every plan you&rsquo;ve finished. Deliveries and skips at a glance.
        </p>
      </div>

      {/* List or empty state */}
      {plans.length === 0 ? (
        <div style={{ ...CARD, padding: '32px 22px', textAlign: 'center' }}>
          <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 800, color: S.fg }}>
            No past plans yet.
          </div>
          <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>
            When your current plan ends, it&rsquo;ll show up here.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plans.map(p => {
            const cleanName = cleanPlanName(p.plan_name)
            const completionPct = p.total_meals > 0 ? Math.round((p.delivered_meals / p.total_meals) * 100) : 0
            return (
              <div key={p.id} style={{ ...CARD, padding: '12px 14px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <PlanGlyph planName={p.plan_name} size={16} color="currentColor" />
                  <span style={{ fontFamily: BODY, fontSize: 15, fontWeight: 700, color: S.fg, letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cleanName}
                  </span>
                </div>
                <div style={{ fontFamily: BODY, fontSize: 12, color: S.fgMuted, lineHeight: 1.4, fontFeatureSettings: '"tnum"' }}>
                  {fmt(p.start_date)} → {fmt(p.end_date)}
                </div>
                <CompactMetricStrip
                  columns={3}
                  ariaLabel={`${cleanName} delivery summary`}
                  metrics={[
                    { label: 'Delivered',  value: `${p.delivered_meals}/${p.total_meals}` },
                    { label: 'Skipped',    value: p.skipped_meals_count },
                    { label: 'Completion', value: `${completionPct}%`, accent: true },
                  ]}
                />
              </div>
            )
          })}
        </div>
      )}
    </MobileColumn>
  )
}
