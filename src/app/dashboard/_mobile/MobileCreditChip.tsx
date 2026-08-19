'use client'

import Link from 'next/link'
import { ChevronRight, Wallet } from 'lucide-react'
import { creditOutlook, type CreditRow } from '../_shared/credit-outlook'
import { BODY, OG, OG_DEEP } from './kit'

/**
 * Mobile home credit chip — the phone's ambient view of the credit chip.
 *
 * On mobile the sidebar lives behind the hamburger, so without this row a
 * customer never sees their credit unless they open the drawer. Same one
 * unconditional sentence as the sidebar chip (credit-outlook.ts), same
 * landing spot (#credit on Plan & billing).
 *
 * Deliberately quieter than the banner slots around it: a compact row in
 * the credit's orange-wash identity, not a card — it must not compete with
 * the hero or the plan card it sits between. Renders nothing at zero.
 */
export function MobileCreditChip({ rows }: { rows: CreditRow[] }) {
  const { chip } = creditOutlook(rows)
  if (!chip) return null

  const amountText = `AED ${chip.amountAed}`
  const restText = chip.sentence.slice(amountText.length + 1)

  return (
    <Link
      href="/dashboard/credit"
      aria-label={`${chip.sentence}. See your credit.`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 14px',
        borderRadius: 14,
        background: 'rgba(245,127,32,0.08)',
        border: '1px solid rgba(245,127,32,0.22)',
        textDecoration: 'none',
        fontFamily: BODY,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Wallet size={15} strokeWidth={2.2} color={OG} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.35, color: OG_DEEP }}>
        <span style={{ fontWeight: 800, fontFeatureSettings: '"tnum"' }}>{amountText}</span>
        {' '}
        <span style={{ fontWeight: 600 }}>{restText}</span>
      </span>
      <ChevronRight size={15} strokeWidth={2.4} color={OG_DEEP} style={{ flexShrink: 0, opacity: 0.7 }} />
    </Link>
  )
}
