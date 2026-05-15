'use client'

import { OG, BODY } from '../../tokens'
import { NumberRoll } from './NumberRoll'

/**
 * HUD row 3: AED label + animated tabular AED value.
 * UI-SPEC: "AED" label 12px/600 cream-muted + number 24px/700 OG tabular-numerals via NumberRoll.
 * Right-aligned within row.
 */
export function WalletReadout({ aed }: { aed: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'flex-end',
      gap: 8,
    }}>
      <span style={{
        fontFamily: BODY,
        fontSize: 12,
        fontWeight: 600,
        color: 'rgba(237,232,218,0.65)',
        letterSpacing: '0.08em',
      }}>AED</span>
      <span style={{
        fontFamily: BODY,
        fontSize: 24,
        fontWeight: 700,
        color: OG,
        lineHeight: 1,
      }}>
        <NumberRoll value={aed} />
      </span>
    </div>
  )
}
