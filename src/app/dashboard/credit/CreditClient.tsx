'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { OG, BODY, DISPLAY, TIER_POP, TIER_POP_TEXT } from '../_shared/tokens'
import { COMPACT } from '../_shared/breakpoints'
import { creditOutlook } from '../_shared/credit-outlook'
import { classifyCreditSource } from '@/shared/credit-ledger'
import { MONTHLY_PLAN_IDS } from '@/contexts/subscriptions/domain/credit-eligibility'
import { PLAN_KEBAB, type PlanId } from '@/contexts/subscriptions/domain/pricing'
import type { CreditByPlan } from '../_shared/types'
import { MobileCredit } from '../_mobile/MobileCredit'

// Glass-over-cream surface — same S the history page rows use, so the two
// record pages read as siblings.
const S = {
  surface2: 'var(--ds-glass-bg)',
  border:   'var(--ds-border)',
  fgMuted:  'var(--ds-fg-sub)',
  fgFaint:  'var(--ds-fg-faint)',
}

/** One credits-table row as the credit page needs it. */
export type CreditItem = {
  amount_aed: number
  eligible_plan_ids: string[] | null
  source: string | null
  status: 'approved' | 'applied'
  created_at: string
}

export const creditDateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai',
  })

/**
 * Eligibility tag for a ledger row — every row answers "where does this
 * work?" in the same spot, so nothing is inferred from absence. Tone does
 * the exception-marking: "Any plan" renders quiet, restricted tags warm.
 */
export function creditEligibilityTag(ids: string[] | null): { label: string; restricted: boolean } {
  if (ids == null) return { label: 'Any plan', restricted: false }
  const monthly = ids.some(p => (MONTHLY_PLAN_IDS as readonly string[]).includes(p))
  return { label: monthly ? 'Monthly plans' : 'Select plans', restricted: true }
}

/**
 * The two future sentences the hero states. Credit is never a balance — the
 * page opens with what the NEXT purchase costs less, in both futures: any
 * plan, and the best plan (today: Monthly). Same engine as the plan cards
 * (checkout's per-plan math), so no surface can disagree.
 */
export function creditScenarios(items: CreditItem[], creditByPlan: CreditByPlan) {
  const approved = items.filter(i => i.status === 'approved')
  const outlook = creditOutlook(approved)
  const monthlyEntries = Object.entries(creditByPlan)
    .filter(([id]) => (MONTHLY_PLAN_IDS as readonly string[]).includes(PLAN_KEBAB[id as PlanId] ?? ''))
  const monthlyBestAed = monthlyEntries.length > 0
    ? Math.max(...monthlyEntries.map(([, v]) => (v?.balanceFils ?? 0) / 100))
    : outlook.universalAed + (outlook.restrictedIsMonthly ? outlook.restrictedAed : 0)
  return { outlook, monthlyBestAed: Math.round(monthlyBestAed) }
}

export default function CreditClient({
  items,
  creditByPlan = {},
}: {
  items: CreditItem[]
  creditByPlan?: CreditByPlan
}) {
  const approved = items.filter(i => i.status === 'approved')
  const used = items.filter(i => i.status === 'applied')
  const { outlook, monthlyBestAed } = creditScenarios(items, creditByPlan)
  const lead = outlook.chip
  const showMonthlyLine = lead != null && monthlyBestAed > lead.amountAed

  return (
    <>
    <div className="credit-desktop" style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: 'var(--ds-fg)' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Back link — same affordance as the history page. */}
        <Link
          href="/dashboard"
          className="credit-back"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: BODY, fontSize: 12, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: S.fgMuted, textDecoration: 'none',
            padding: '6px 0',
          }}
        >
          <ArrowLeft size={13} strokeWidth={2.4} />
          Back to dashboard
        </Link>

        {/* Header */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgMuted }}>
            Your credit
          </div>
          <h1 style={{
            margin: '6px 0 0 0',
            fontFamily: DISPLAY, fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--ds-fg)', lineHeight: 1.1,
          }}>
            My credit<span style={{ color: OG }}>.</span>
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: S.fgMuted, lineHeight: 1.6, maxWidth: '56ch' }}>
            Every credit you hold, where it came from, and how it will be used on your next plan.
          </p>
        </div>

        {/* ── The two futures — navy hero, same surface as My Plan's current-
            plan card, so "the important money fact" wears the same clothes
            everywhere in the family. Never a balance: both numbers are
            discounts on a purchase that hasn't happened yet. ── */}
        {lead ? (
          <div style={{
            ...TIER_POP,
            marginTop: 28,
            borderRadius: 'var(--radius-md)',
            padding: '26px 28px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 24, flexWrap: 'wrap',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: TIER_POP_TEXT.muted }}>
                Off your next plan
              </div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: TIER_POP_TEXT.primary, fontFeatureSettings: '"tnum"' }}>
                  AED {lead.amountAed}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: TIER_POP_TEXT.muted }}>
                  {outlook.universalAed > 0
                    ? 'on any plan'
                    : outlook.restrictedIsMonthly ? 'on a Monthly plan' : 'on select plans'}
                </span>
              </div>
              {showMonthlyLine && (
                <div style={{
                  marginTop: 12,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px', borderRadius: 999,
                  background: 'rgba(245,127,32,0.14)',
                  border: '1px solid rgba(245,127,32,0.35)',
                  fontSize: 12, fontWeight: 700, color: '#ffb066',
                  fontFeatureSettings: '"tnum"',
                }}>
                  AED {monthlyBestAed} on a Monthly plan
                </div>
              )}
              <div style={{ marginTop: 14, fontSize: 12, color: TIER_POP_TEXT.muted, lineHeight: 1.5 }}>
                Your credit will be used automatically when you buy your next plan.
              </div>
            </div>

            <Link
              href="/dashboard/explore-plans"
              className="credit-explore-cta"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 18px', borderRadius: 'var(--radius-pill)',
                background: OG, color: '#fff',
                fontFamily: BODY, fontSize: 13, fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                textDecoration: 'none', whiteSpace: 'nowrap',
                boxShadow: '0 4px 16px rgba(245,127,32,0.40)',
                transition: 'transform 150ms, box-shadow 150ms',
              }}
            >
              Explore plans
              <ArrowRight size={15} strokeWidth={2.4} />
            </Link>
          </div>
        ) : (
          <div style={{
            marginTop: 28,
            padding: '40px 28px',
            borderRadius: 'var(--radius-md)',
            background: S.surface2, border: `1px solid ${S.border}`,
            boxShadow: 'var(--shadow-sm)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ds-fg)' }}>
              No credit right now.
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>
              Reviews, referrals and Dorm Wars all earn credit. It lands here.
            </div>
          </div>
        )}

        {/* ── Ledger — every credit with its origin in human words. ── */}
        {approved.length > 0 && (
          <LedgerGroup title="Available" items={approved} />
        )}
        {used.length > 0 && (
          <LedgerGroup title="Used" items={used} muted />
        )}
      </div>

      <style jsx global>{`
        .credit-back:hover { color: var(--ds-fg) !important; }
        .credit-explore-cta:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(245,127,32,0.50); }
        /* Mobile (≤768) swaps the desktop tree for MobileCredit — same pure
           CSS toggle the history page uses. */
        .credit-mobile { display: none; }
        @media ${COMPACT} {
          .credit-desktop { display: none; }
          .credit-mobile { display: block; }
        }
      `}</style>
    </div>

    <div className="credit-mobile">
      <MobileCredit items={items} creditByPlan={creditByPlan} />
    </div>
    </>
  )
}

function LedgerGroup({ title, items, muted = false }: { title: string; items: CreditItem[]; muted?: boolean }) {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{
        fontFamily: BODY, fontSize: 11, fontWeight: 600,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: S.fgMuted, marginBottom: 10,
      }}>
        {title}
      </div>
      <div style={{
        borderRadius: 'var(--radius-md)',
        background: S.surface2, border: `1px solid ${S.border}`,
        boxShadow: 'var(--shadow-sm)',
        padding: '4px 24px',
        opacity: muted ? 0.75 : 1,
      }}>
        {items.map((item, i) => {
          const tag = creditEligibilityTag(item.eligible_plan_ids)
          return (
            <div
              key={`${item.source ?? 'credit'}-${item.created_at}-${i}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                padding: '14px 0',
                borderTop: i === 0 ? 'none' : `1px solid ${S.border}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: muted ? 600 : 700, color: muted ? S.fgMuted : 'var(--ds-fg)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {classifyCreditSource(item.source).label}
                  {/* Eligibility on EVERY live row — restricted keeps the warm
                      orange, "Any plan" stays quiet so color still marks the
                      exception. Used rows skip it: spent credit has no
                      eligibility left to explain. */}
                  {!muted && (
                    <span style={tag.restricted ? {
                      fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                      textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999,
                      background: 'var(--ds-og-wash)', color: '#8c4214',
                      border: '1px solid var(--ds-og-border)',
                    } : {
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999,
                      background: 'rgba(9,24,37,0.05)', color: S.fgFaint,
                    }}>
                      {tag.label}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: S.fgFaint, marginTop: 3, fontFeatureSettings: '"tnum"' }}>
                  {creditDateLabel(item.created_at)}
                </div>
              </div>
              <div style={{
                fontFamily: DISPLAY, fontSize: 16, fontWeight: 700,
                color: muted ? S.fgMuted : 'var(--ds-fg)',
                fontFeatureSettings: '"tnum"', flexShrink: 0,
              }}>
                AED {Math.round(Number(item.amount_aed))}{muted ? ' used' : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
