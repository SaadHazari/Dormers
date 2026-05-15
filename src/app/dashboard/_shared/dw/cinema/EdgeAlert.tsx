'use client'

import { useEffect, useState } from 'react'
import { OG, BODY, NV } from '../../tokens'
import { useReducedMotionGate } from '../utils/useReducedMotionGate'
import type { StingerKey } from '../audio/useStingers'

const SLIDE_IN_MS = 180
const HOLD_MS = 3000
const SLIDE_OUT_MS = 240
const EXPO_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'

export type EdgeAlertKind = 'rank-drop' | 'conversion' | 'drop-expired'

type EdgeAlertProps = {
  kind: EdgeAlertKind | null         // null = idle (hidden)
  message: string                    // "INCOMING — You dropped to #6"
  onDismissed?: () => void           // fired after slide-out
  playStinger?: (key: StingerKey, opts?: { panX?: number; gainDb?: number }) => Promise<void>
}

/**
 * INCOMING strip at top edge of viewport (below PulseTicker — z-index 8500 per UI-SPEC).
 * Slides in 180ms / holds 3000ms / slides out 240ms.
 * UI-SPEC: full width, 32px tall, OG background, "INCOMING — {message}" text in NV
 * (dark text on OG).
 *
 * On slide-in: plays 'warning' stinger pan=0 (UI-SPEC Audio).
 *
 * D-15 reduced-motion: appears + disappears instantly (no slide). Hold time unchanged.
 * Stinger still plays.
 */
export function EdgeAlert({ kind, message, onDismissed, playStinger }: EdgeAlertProps) {
  const reduced = useReducedMotionGate()
  const [phase, setPhase] = useState<'hidden' | 'in' | 'hold' | 'out'>('hidden')

  useEffect(() => {
    if (kind === null) return
    setPhase('in')
    if (playStinger) playStinger('warning', { panX: 0 })

    const inMs = reduced ? 0 : SLIDE_IN_MS
    const tIn  = setTimeout(() => setPhase('hold'), inMs)
    const tHold = setTimeout(() => setPhase('out'), inMs + HOLD_MS)
    const outMs = reduced ? 0 : SLIDE_OUT_MS
    const tOut = setTimeout(() => {
      setPhase('hidden')
      onDismissed?.()
    }, inMs + HOLD_MS + outMs)

    return () => {
      clearTimeout(tIn); clearTimeout(tHold); clearTimeout(tOut)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  if (phase === 'hidden') return null

  const visible = phase === 'in' || phase === 'hold'
  const translateY = visible ? '0' : '-100%'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 36,                                 // sits BELOW PulseTicker (36px tall, per Phase 5)
        left: 0,
        right: 0,
        height: 32,
        zIndex: 8500,
        backgroundColor: OG,
        color: NV,
        fontFamily: BODY,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.06em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
        transform: `translateY(${translateY})`,
        transition: reduced ? 'none' : `transform ${phase === 'in' ? SLIDE_IN_MS : SLIDE_OUT_MS}ms ${EXPO_OUT}`,
      }}
    >
      {message}
    </div>
  )
}
