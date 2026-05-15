'use client'

import { useEffect, useState } from 'react'
import { ChevronUp } from 'lucide-react'  // Wave 5: swap to stencil rank icon
import { OG, BODY } from '../../tokens'

type RankChevronProps = {
  rank: string                       // e.g., "Sergeant"
}

/**
 * HUD row 2: rank icon + rank label in OG-bordered pill.
 * UI-SPEC: 16px/400 stencil face (Wave 5 — Inter fallback this wave per D-03 architecture-first).
 * On rank-change (prop value differs from previous render), briefly applies a 200ms OG glow burst
 * via local class toggle (ImpactFlash module lands in Wave 4 — this wave does an inline burst).
 *
 * Reduced-motion: glow appears at full intensity instantly, no animation (no transform, no shake).
 */
export function RankChevron({ rank }: RankChevronProps) {
  const [flash, setFlash] = useState(false)
  const [lastRank, setLastRank] = useState(rank)

  useEffect(() => {
    if (rank !== lastRank) {
      setFlash(true)
      setLastRank(rank)
      const id = setTimeout(() => setFlash(false), 200)
      return () => clearTimeout(id)
    }
  }, [rank, lastRank])

  return (
    <>
      <div
        className={flash ? 'dw-rank-flash' : ''}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          fontFamily: BODY,                                    // Wave 5: var(--font-dw-stencil)
          fontSize: 16,
          fontWeight: 400,
          color: OG,
          backgroundColor: 'transparent',
          border: `1px solid ${OG}`,
          borderRadius: 4,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <ChevronUp size={14} strokeWidth={1.5} />
        <span>{rank}</span>
      </div>
      <style>{`
        @keyframes dw-rank-flash {
          0%   { box-shadow: 0 0 0 0   rgba(245,127,32,0.0); }
          30%  { box-shadow: 0 0 24px 4px rgba(245,127,32,0.45); }
          100% { box-shadow: 0 0 0 0   rgba(245,127,32,0.0); }
        }
        .dw-rank-flash { animation: dw-rank-flash 200ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .dw-rank-flash { animation: none; }
        }
      `}</style>
    </>
  )
}
