'use client'

import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { creditOutlook, type CreditRow } from './_shared/credit-outlook'

const BODY = "'Montserrat', system-ui, sans-serif"
const OG3 = '#f57f20'

/**
 * The credit chip — the sidebar's one sentence about credit.
 *
 * Credit is a discount on the customer's NEXT purchase, not a balance they
 * hold, so the chip speaks future tense and only ever shows an amount that
 * is unconditionally true (see credit-outlook.ts for the sentence rules —
 * restricted credit appears here only when it is all the customer has).
 *
 * It is a Link, not a display: tapping lands on the credit section of
 * Plan & billing where every credit is itemized. The old wallet card wore
 * button clothes and did nothing — a dead tap teaches "this app doesn't
 * respond", so whatever renders here must navigate.
 *
 * Renders nothing on a zero ledger. An empty chip is noise.
 */
export function CreditChip({
  rows,
  expanded,
  onNavigate,
}: {
  rows: CreditRow[]
  expanded: boolean
  /** Close the mobile drawer on tap — same contract as the nav links. */
  onNavigate?: () => void
}) {
  const { chip } = creditOutlook(rows)
  if (!chip) return null

  // The sentence always starts with the amount; split it so the amount can
  // carry the weight and the condition stays quiet.
  const amountText = `AED ${chip.amountAed}`
  const restText = chip.sentence.slice(amountText.length + 1)

  return (
    <div style={{ marginBottom: 12 }}>
      <Link
        href="/dashboard/plan#credit"
        onClick={() => onNavigate?.()}
        aria-label={`${chip.sentence}. See your credit.`}
        data-tooltip={chip.sentence}
        data-tooltip-placement="right"
        className="sidebar-credit-chip"
        style={{
          display: 'flex', alignItems: 'center',
          gap: expanded ? 10 : 0,
          justifyContent: expanded ? 'flex-start' : 'center',
          padding: '9px 10px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(245,127,32,0.10)',
          border: '1px solid rgba(245,127,32,0.22)',
          fontFamily: BODY, color: OG3,
          textDecoration: 'none',
          transition: 'background 150ms, gap 220ms',
        }}
      >
        {expanded ? (
          <>
            <Wallet size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span style={{ minWidth: 0, fontSize: 12, lineHeight: 1.35 }}>
              <span style={{ fontWeight: 800, fontFeatureSettings: '"tnum"' }}>{amountText}</span>
              {' '}
              <span style={{ fontWeight: 600, opacity: 0.9 }}>{restText}</span>
            </span>
          </>
        ) : (
          // Collapsed rail: the amount IS the icon. A number tells the whole
          // story at a glance; a wallet glyph only says "something is here".
          <span
            style={{
              fontSize: 10, fontWeight: 800, lineHeight: 1,
              fontFeatureSettings: '"tnum"', letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}
          >
            {amountText}
          </span>
        )}
      </Link>

      <style jsx global>{`
        .sidebar-credit-chip:hover {
          background: rgba(245,127,32,0.17) !important;
        }
      `}</style>
    </div>
  )
}
