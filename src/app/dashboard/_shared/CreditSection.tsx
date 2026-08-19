'use client'

import { useEffect, useRef } from 'react'
import { creditOutlook, type CreditRow } from './credit-outlook'
import { classifyCreditSource } from '@/shared/credit-ledger'
import { MONTHLY_PLAN_IDS } from '@/contexts/subscriptions/domain/credit-eligibility'
import { PLAN_KEBAB, type PlanId } from '@/contexts/subscriptions/domain/pricing'
import type { CreditByPlan } from './types'

const BODY = 'var(--font-montserrat), Arial, Helvetica, sans-serif'
const OG = '#f57f20'

/** One credits-table row as the Plan & billing statement needs it. */
export interface CreditItem extends CreditRow {
  source: string | null
  status: 'approved' | 'applied'
  created_at: string
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai',
  })

/**
 * The credit statement — where the sidebar chip lands (#credit).
 *
 * The one place every credit is itemized: the scenario sentences up top
 * (same math as the chip and the plan cards), then each credit with its
 * human name and date, then what's already been used. No balance language
 * anywhere — credit is a discount on the NEXT purchase, so every sentence
 * stays future tense.
 *
 * Renders nothing when the customer has never held a credit.
 */
export function CreditSection({
  items,
  creditByPlan = {},
  anchorId,
}: {
  items: CreditItem[]
  creditByPlan?: CreditByPlan
  /** Native anchor id — the DESKTOP instance only. The plan page mounts this
   *  section twice (desktop tree + MobilePlan, CSS-switched), and a shared
   *  id would be duplicate HTML whose first match is the hidden desktop copy
   *  — #credit on a phone would scroll nowhere. The effect below scrolls
   *  whichever instance is actually visible, so the mobile twin needs no id. */
  anchorId?: string
}) {
  const approved = items.filter(i => i.status === 'approved')
  const applied = items.filter(i => i.status === 'applied').slice(0, 6)

  // The chip links to /dashboard/plan#credit. Only the visible instance may
  // answer: offsetParent is null inside the display:none twin.
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const scrollIfTargeted = () => {
      if (window.location.hash !== '#credit') return
      const el = ref.current
      if (!el || el.offsetParent === null) return
      el.scrollIntoView({ block: 'start' })
    }
    scrollIfTargeted()
    window.addEventListener('hashchange', scrollIfTargeted)
    return () => window.removeEventListener('hashchange', scrollIfTargeted)
  }, [])

  if (approved.length === 0 && applied.length === 0) return null

  const outlook = creditOutlook(approved)

  // Best case on a monthly plan — checkout's own per-plan math when it is
  // on hand (the plan page threads it), the outlook's arithmetic otherwise.
  const monthlyEntries = Object.entries(creditByPlan)
    .filter(([id]) => (MONTHLY_PLAN_IDS as readonly string[]).includes(PLAN_KEBAB[id as PlanId] ?? ''))
  const monthlyBestAed = monthlyEntries.length > 0
    ? Math.max(...monthlyEntries.map(([, v]) => (v?.balanceFils ?? 0) / 100))
    : outlook.universalAed + (outlook.restrictedIsMonthly ? outlook.restrictedAed : 0)

  const lead = outlook.chip
  const showMonthlyLine = monthlyBestAed > (lead?.amountAed ?? 0)

  const restrictionTag = (ids: string[] | null) => {
    if (ids == null) return null
    return ids.some(p => (MONTHLY_PLAN_IDS as readonly string[]).includes(p))
      ? 'Monthly plans'
      : 'Select plans'
  }

  return (
    <section
      ref={ref}
      id={anchorId}
      aria-label="Your credit"
      style={{
        scrollMarginTop: 90,
        background: 'var(--ds-surface2)',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 20,
        padding: '20px 22px',
        fontFamily: BODY,
      }}
    >
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: OG, marginBottom: 12,
      }}>
        Your credit
      </div>

      {/* Scenario sentences — the chip's sentence leads, the monthly best
          case follows only when it genuinely beats the lead. Two futures,
          never a blended number. */}
      {lead && (
        <div style={{ marginBottom: showMonthlyLine ? 4 : 0 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ds-fg)', letterSpacing: '-0.01em', fontFeatureSettings: '"tnum"' }}>
            AED {lead.amountAed}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ds-fg-muted)', marginLeft: 7 }}>
            {lead.sentence.slice(`AED ${lead.amountAed} `.length)}
          </span>
        </div>
      )}
      {showMonthlyLine && (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ds-success-fg)' }}>
          AED {Math.round(monthlyBestAed)} off on a Monthly plan
        </div>
      )}

      {/* Itemized credits — where each one came from, human-named. */}
      {approved.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column' }}>
          {approved.map((item, i) => {
            const tag = restrictionTag(item.eligible_plan_ids)
            return (
              <li
                key={`${item.source ?? 'credit'}-${item.created_at}-${i}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '10px 0',
                  borderTop: '1px solid var(--ds-border-soft)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-fg)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {classifyCreditSource(item.source).label}
                    {tag && (
                      <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                        textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999,
                        background: 'var(--ds-og-wash)', color: '#8c4214',
                        border: '1px solid var(--ds-og-border)',
                      }}>
                        {tag}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ds-fg-faint)', marginTop: 2 }}>
                    {dateLabel(item.created_at)}
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ds-fg)', fontFeatureSettings: '"tnum"', flexShrink: 0 }}>
                  AED {Math.round(Number(item.amount_aed))}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {/* Already used — quiet history, so applied credit never reads as
          money that vanished. */}
      {applied.length > 0 && (
        <ul style={{ listStyle: 'none', margin: approved.length > 0 ? 0 : '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column' }}>
          {applied.map((item, i) => (
            <li
              key={`applied-${item.source ?? 'credit'}-${item.created_at}-${i}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '9px 0',
                borderTop: '1px solid var(--ds-border-soft)',
                opacity: 0.6,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ds-fg-muted)' }}>
                  {classifyCreditSource(item.source).label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ds-fg-faint)', marginTop: 2 }}>
                  {dateLabel(item.created_at)}
                </div>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ds-fg-muted)', fontFeatureSettings: '"tnum"', flexShrink: 0 }}>
                AED {Math.round(Number(item.amount_aed))} used
              </span>
            </li>
          ))}
        </ul>
      )}

      <div style={{
        marginTop: 14, paddingTop: 12,
        borderTop: '1px solid var(--ds-border-soft)',
        fontSize: 11.5, color: 'var(--ds-fg-muted)', lineHeight: 1.5,
      }}>
        {/* Owner-locked vocabulary (2026-08-18): "will be used …
            automatically", common literal words only — see
            intake-join-outcome.ts. */}
        Your credit will be used automatically when you buy your next plan.
      </div>
    </section>
  )
}
