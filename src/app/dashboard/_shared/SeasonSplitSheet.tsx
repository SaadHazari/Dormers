'use client'

import { MobileSheet } from './MobileSheet'
import { BODY, OG, S } from './tokens'
import { resumeSplitCopy } from './season-break-copy'
import { SEASON_REFUNDS_LIVE } from '@/contexts/season/domain/season-release'
import type { ResumeSplit } from '@/contexts/season/domain/resume-split'
import type { RefundAmounts } from '@/contexts/season/domain/season-refund'

interface Props {
  open: boolean
  split: ResumeSplit | null
  /** What the held meals would return if the customer asks for a refund once the break starts (spec §10.3). */
  refund: RefundAmounts | null
  onResume: () => void
  onStay: () => void
}

/** Spec §7.4 (N7): what resuming now means, before the customer confirms. */
export function SeasonSplitSheet({ open, split, refund, onResume, onStay }: Props) {
  if (!split) return null
  const copy = resumeSplitCopy({ split, refundsLive: SEASON_REFUNDS_LIVE, refund })
  const button = { flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' } as const

  return (
    <MobileSheet
      open={open}
      onClose={onStay}
      maxWidth={420}
      ariaLabel={copy.headline}
      footer={
        <>
          <button id="season-split-stay" type="button" onClick={onStay} style={{ ...button, border: '1px solid var(--ds-border-strong)', background: 'var(--ds-surface2)', color: S.fg }}>
            Stay paused
          </button>
          <button id="season-split-resume" type="button" onClick={onResume} style={{ ...button, border: 'none', background: OG, color: '#fff', boxShadow: '0 0 16px rgba(245,127,32,0.45)' }}>
            Resume
          </button>
        </>
      }
    >
      <div data-testid="season-split-sheet">
        <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.01em', marginRight: 28 }}>
          {copy.headline}
        </div>
        {copy.lines.map((line) => (
          <div key={line} style={{ fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 12, lineHeight: 1.65 }}>{line}</div>
        ))}
      </div>
    </MobileSheet>
  )
}
