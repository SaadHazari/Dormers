'use client'

import { MobileSheet } from './MobileSheet'
import { BODY, OG, S } from './tokens'
import { breakResumeCopy } from './season-break-copy'
import { useSaveSpot } from './use-save-spot'

interface Props {
  open: boolean
  alreadyJoined: boolean
  /** Prospective waitlist credit for this customer's meal preference. */
  creditAed: number
  onClose: () => void
}

/** Spec §7.5 (N11): Resume during the break is refused, with Save my spot. */
export function BreakResumeSheet({ open, alreadyJoined, creditAed, onClose }: Props) {
  const { outcome, joining, join } = useSaveSpot()
  const copy = breakResumeCopy({ alreadyJoined: alreadyJoined || !!outcome?.joined, creditAed })

  const button = { flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', fontFamily: BODY, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' } as const
  const text = { fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 12, lineHeight: 1.65 } as const

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      maxWidth={420}
      ariaLabel={copy.headline}
      footer={
        <>
          <button
            id="break-resume-close"
            type="button"
            onClick={onClose}
            style={{ ...button, cursor: 'pointer', border: '1px solid var(--ds-border-strong)', background: copy.joinLine ? 'var(--ds-surface2)' : OG, color: copy.joinLine ? S.fg : '#fff' }}
          >
            Got it
          </button>
          {copy.joinLine && (
            <button
              id="break-resume-join"
              type="button"
              onClick={join}
              disabled={joining}
              style={{ ...button, cursor: joining ? 'default' : 'pointer', border: 'none', background: OG, color: '#fff', boxShadow: '0 0 16px rgba(245,127,32,0.45)' }}
            >
              {joining ? 'Saving your spot' : 'Save my spot'}
            </button>
          )}
        </>
      }
    >
      <div data-testid="break-resume-sheet">
        <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.01em', marginRight: 28 }}>
          {copy.headline}
        </div>
        {copy.lines.map((line) => <div key={line} style={text}>{line}</div>)}
        {copy.joinLine && <div style={text}>{copy.joinLine}</div>}
        {outcome?.message && <div style={text}>{outcome.message}</div>}
        {outcome?.error && <div style={{ ...text, color: '#b3261e' }}>{outcome.error}</div>}
      </div>
    </MobileSheet>
  )
}
