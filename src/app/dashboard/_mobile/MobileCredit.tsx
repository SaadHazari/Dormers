'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { MobileColumn, HERO, CARD, S, BODY, eyebrow, SectionTitle } from './kit'
import { classifyCreditSource } from '@/shared/credit-ledger'
import type { CreditByPlan } from '../_shared/types'
import {
  creditScenarios, creditDateLabel, creditEligibilityTag, type CreditItem,
} from '../credit/CreditClient'

const CREAM = 'rgba(245,240,232,0.92)'
const CREAM_MUTED = 'rgba(245,240,232,0.65)'

/**
 * MobileCredit — the height-optimised <768 credit page.
 *
 * Same statement the desktop page makes, stacked: the two-futures dark hero
 * (kit HERO, the same surface MobilePlan's current-plan card wears), then the
 * ledger as compact rows. Pure render; the page fetches.
 */
export function MobileCredit({ items, creditByPlan = {} }: { items: CreditItem[]; creditByPlan?: CreditByPlan }) {
  const approved = items.filter(i => i.status === 'approved')
  const used = items.filter(i => i.status === 'applied')
  const { outlook, monthlyBestAed } = creditScenarios(items, creditByPlan)
  const lead = outlook.chip
  const showMonthlyLine = lead != null && monthlyBestAed > lead.amountAed

  return (
    <MobileColumn style={{ color: S.fg, paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>

      {/* Header — identical to MobilePlan's: SectionTitle cleared of the
          fixed hamburger (paddingLeft 56). No back link; this is a
          first-class page and the drawer owns wayfinding. */}
      <div style={{ paddingLeft: 56, minHeight: 34, display: 'flex', alignItems: 'center' }}>
        <SectionTitle size={24}>My credit</SectionTitle>
      </div>

      {/* The two futures — never a balance. */}
      {lead ? (
        <section style={{ ...HERO, fontFamily: BODY }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM_MUTED }}>
            Off your next plan
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: CREAM, fontFeatureSettings: '"tnum"' }}>
              AED {lead.amountAed}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: CREAM_MUTED }}>
              {outlook.universalAed > 0
                ? 'on any plan'
                : outlook.restrictedIsMonthly ? 'on a Monthly plan' : 'on select plans'}
            </span>
          </div>
          {showMonthlyLine && (
            <div style={{
              marginTop: 12,
              display: 'inline-flex', alignItems: 'center',
              padding: '6px 12px', borderRadius: 999,
              background: 'rgba(245,127,32,0.14)',
              border: '1px solid rgba(245,127,32,0.35)',
              fontSize: 12, fontWeight: 700, color: '#ffb066',
              fontFeatureSettings: '"tnum"',
            }}>
              AED {monthlyBestAed} on a Monthly plan
            </div>
          )}
          <div style={{ marginTop: 13, fontSize: 11.5, color: CREAM_MUTED, lineHeight: 1.5 }}>
            Your credit will be used automatically when you buy your next plan.
          </div>
          <Link
            href="/dashboard/explore-plans"
            style={{
              marginTop: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '13px', borderRadius: 999,
              background: '#f57f20', color: '#fff',
              fontFamily: BODY, fontSize: 12.5, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(245,127,32,0.40)',
            }}
          >
            Explore plans
            <ArrowRight size={14} strokeWidth={2.4} />
          </Link>
        </section>
      ) : (
        <section style={{ ...CARD, padding: '26px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: S.fg }}>No credit right now.</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>
            Reviews, referrals and Dorm Wars all earn credit. It lands here.
          </div>
        </section>
      )}

      {approved.length > 0 && <MobileLedger title="Available" items={approved} />}
      {used.length > 0 && <MobileLedger title="Used" items={used} muted />}
    </MobileColumn>
  )
}

function MobileLedger({ title, items, muted = false }: { title: string; items: CreditItem[]; muted?: boolean }) {
  return (
    <div>
      <span style={{ ...eyebrow, display: 'block', marginBottom: 8 }}>{title}</span>
      <div style={{ ...CARD, padding: '2px 16px', opacity: muted ? 0.75 : 1 }}>
        {items.map((item, i) => {
          const tag = creditEligibilityTag(item.eligible_plan_ids)
          return (
            <div
              key={`${item.source ?? 'credit'}-${item.created_at}-${i}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '13px 0',
                borderTop: i === 0 ? 'none' : '1px solid rgba(9,24,37,0.07)',
                fontFamily: BODY,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: muted ? 600 : 700, color: muted ? S.fgMuted : S.fg, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  {classifyCreditSource(item.source).label}
                  {/* Eligibility on every live row — tone marks the exception.
                      Mirrors the desktop ledger. */}
                  {!muted && (
                    <span style={tag.restricted ? {
                      fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em',
                      textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999,
                      background: 'var(--ds-og-wash)', color: '#8c4214',
                      border: '1px solid var(--ds-og-border)',
                    } : {
                      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
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
              <div style={{ fontSize: 14.5, fontWeight: 800, color: muted ? S.fgMuted : S.fg, fontFeatureSettings: '"tnum"', flexShrink: 0 }}>
                AED {Math.round(Number(item.amount_aed))}{muted ? ' used' : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
