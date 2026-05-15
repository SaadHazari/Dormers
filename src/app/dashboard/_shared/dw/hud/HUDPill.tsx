'use client'

import { ChevronUp } from 'lucide-react'  // Wave 5: stencil
import { OG, NV2, BODY } from '../../tokens'
import { NumberRoll } from './NumberRoll'

type HUDPillProps = {
  aed: number
  rank: string
  onTap: () => void
}

/**
 * Mobile collapsed HUD variant (≤720px viewport).
 * Single row: AED number + rank chevron icon.
 * Height 32px, NV2 fill, OG 1px border, 16px border-radius.
 * Tap → onTap (DormWarsClient expands the pod).
 */
export function HUDPill({ aed, rank, onTap }: HUDPillProps) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`HUD collapsed: AED ${aed}, rank ${rank}. Tap to expand.`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 32,
        padding: '4px 12px',
        fontFamily: BODY,
        color: OG,
        backgroundColor: NV2,
        border: `1px solid ${OG}`,
        borderRadius: 16,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.04em',
      }}
    >
      <span style={{ fontFeatureSettings: '"tnum"' }}>
        <NumberRoll value={aed} />
      </span>
      <ChevronUp size={14} strokeWidth={1.5} />
      <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(237,232,218,0.65)', textTransform: 'uppercase' }}>
        {rank.slice(0, 3)}
      </span>
    </button>
  )
}
