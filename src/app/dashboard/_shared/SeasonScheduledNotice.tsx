'use client'

import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CalendarClock } from 'lucide-react'
import { OG, BODY, TIER_POP_TEXT } from './tokens'
import { creditMechanicsLine } from './intake-join-outcome'
import { seasonNoticeCopy, seasonJoinLine } from './season-notice-copy'
import { useSaveSpot } from './use-save-spot'
import type { SeasonNoticeKind } from '@/contexts/season/domain/customer-season'

interface Props {
  kind: SeasonNoticeKind
  wrapUpDay: string
  lastDinner: string | null
  breakLive: boolean
  /** Prospective waitlist credit for this customer's meal preference. */
  creditAed: number
  alreadyJoined: boolean
  onDismiss: () => void
}

/**
 * The one-time full-screen notice when the season end is scheduled (spec N1, N3).
 * Same family as IntakePauseTakeover: navy gradient, cream copy, pill buttons,
 * and a decline beside every offer. ClientDashboard owns the once-only rule.
 */
export function SeasonScheduledNotice({ kind, wrapUpDay, lastDinner, breakLive, creditAed, alreadyJoined, onDismiss }: Props) {
  const reduceMotion = useReducedMotion()
  const { outcome, joining, join } = useSaveSpot()
  const copy = seasonNoticeCopy({ kind, wrapUpDay, lastDinner, breakLive })
  const joinLine = kind === 'paused' && !alreadyJoined && !outcome?.joined ? seasonJoinLine(creditAed) : null

  const pill = (primary: boolean): CSSProperties => primary ? {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 48, padding: '14px 32px', borderRadius: 'var(--radius-pill)', border: 0,
    background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase', cursor: joining ? 'default' : 'pointer',
    boxShadow: '0 8px 28px rgba(245,127,32,0.50)',
  } : {
    minHeight: 44, padding: '10px 24px', borderRadius: 'var(--radius-pill)',
    border: '1px solid rgba(245,240,232,0.28)', background: 'transparent', color: TIER_POP_TEXT.primary,
    fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    cursor: 'pointer',
  }
  const line: CSSProperties = { margin: '0 0 18px 0', fontSize: 14, lineHeight: '22px', color: TIER_POP_TEXT.primary, textAlign: 'center' }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="season-notice-headline"
      data-testid="season-scheduled-notice"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: `
          radial-gradient(ellipse 90% 60% at 92% -8%, rgba(245,127,32,0.13) 0%, transparent 55%),
          radial-gradient(ellipse 70% 50% at 8% 108%, rgba(255,170,0,0.07) 0%, transparent 55%),
          linear-gradient(135deg, #1c4255 0%, #0a1c2a 55%, #061421 100%)
        `,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px clamp(20px, 4vw, 48px)', fontFamily: BODY, color: TIER_POP_TEXT.primary, overflow: 'auto',
      }}
    >
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0.15 : 0.32 }}
        style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}
      >
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 72, height: 72, borderRadius: '50%', marginBottom: 28,
          background: `linear-gradient(135deg, ${OG} 0%, #ffaa00 100%)`, boxShadow: '0 12px 40px rgba(245,127,32,0.55)',
        }}>
          <CalendarClock size={34} strokeWidth={2.2} color="#fff" aria-hidden />
        </div>

        <h1 id="season-notice-headline" style={{ margin: '0 0 14px', fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#fdf8ef' }}>
          {copy.headline}
        </h1>
        <p style={{ margin: '0 auto 28px', maxWidth: 420, fontSize: 'clamp(14px, 1.5vw, 17px)', lineHeight: 1.55, color: 'rgba(245,238,222,0.78)' }}>
          {copy.body}
        </p>

        {joinLine && <p style={line}>{joinLine}</p>}
        {outcome?.message && <p style={line}>{outcome.message}</p>}
        {outcome?.joined && creditMechanicsLine(outcome.creditAed ?? 0) && (
          <p style={{ ...line, color: TIER_POP_TEXT.muted }}>{creditMechanicsLine(outcome.creditAed ?? 0)}</p>
        )}
        {outcome?.error && <p style={{ ...line, color: '#ffb4a2' }}>{outcome.error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {joinLine && (
            <button id="season-notice-join" type="button" onClick={join} disabled={joining} style={pill(true)}>
              {joining ? 'Saving your spot' : 'Save my spot'}
            </button>
          )}
          <button id="season-notice-dismiss" type="button" onClick={onDismiss} disabled={joining} style={pill(!joinLine)}>
            {joinLine ? 'Not now' : 'Got it'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
