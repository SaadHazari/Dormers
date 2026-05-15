'use client'

import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'  // Wave 5: stencil rank icon per rank tier
import { OG, NV2, CR, BODY } from '../../tokens'
import { useReducedMotionGate } from '../utils/useReducedMotionGate'
import { triggerScreenShake } from '../utils/triggerScreenShake'
import type { StingerKey } from '../audio/useStingers'

const STEP_1_LETTERBOX_IN  = 240   // ms — bars slide in
const STEP_2_DIM_IN        = 200   // ms — world dims (parallel to step 1)
const STEP_3_CARD_LAND     = 600   // ms — PROMOTED card overshoot
const STEP_5_SHAKE_MS      = 120   // ms — 1.5px microshake
const STEP_6_HOLD_MS       = 600   // ms — hold
const STEP_7_FADE_OUT_MS   = 320   // ms — card fade + letterbox out + dim lift (simultaneous)

const LETTERBOX_HEIGHT     = 64    // px — UI-SPEC spacing scale, locked
const EXPO_OUT             = 'cubic-bezier(0.16, 1, 0.3, 1)'
const BACK_OUT             = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

export type RankUpCutsceneProps = {
  visible: boolean                                  // controlled by DormWarsClient on threshold crossing
  rank: string                                      // "Sergeant" / "Commander" etc.
  rankSlug: string                                  // "sergeant" / "commander" etc. — used for localStorage key
  cycleStartISO: string                             // for the once-per-cycle gate key
  shakeTarget: HTMLElement | null                   // page root element to shake
  playStinger?: (key: StingerKey, opts?: { panX?: number; gainDb?: number }) => Promise<void>
  onDismiss: () => void
}

type Phase = 'hidden' | 'letterbox-in' | 'card-land' | 'hold' | 'fade-out'

/**
 * 8-step rank-up cinematic per UI-SPEC. Fires once per cycle per rank tier — the
 * effect itself checks localStorage key `dw-rankup-played-${cycleStartISO}-${rankSlug}`
 * before running and writes it on completion (caller's preflight check is a courtesy
 * to avoid a flash of state, not a correctness gate).
 *
 * Letterbox via scaleY transform (NOT height) per RESEARCH Pattern 8 + Anti-Patterns.
 * D-15 reduced-motion: static stamped card appears instantly; no letterbox slide,
 * no overshoot, no shake; stinger still plays; hold + fade still occur but jump-set.
 */
export function RankUpCutscene({ visible, rank, rankSlug, cycleStartISO, shakeTarget, playStinger, onDismiss }: RankUpCutsceneProps) {
  const reduced = useReducedMotionGate()
  const [phase, setPhase] = useState<Phase>('hidden')

  useEffect(() => {
    if (!visible || !cycleStartISO) return

    // Once-per-cycle-per-rank gate
    const key = `dw-rankup-played-${cycleStartISO}-${rankSlug}`
    if (typeof window !== 'undefined' && localStorage.getItem(key) === '1') {
      onDismiss()
      return
    }

    // Reduced-motion: jump straight to "hold" (card visible, no animations)
    if (reduced) {
      setPhase('hold')
      if (playStinger) playStinger('rank-up', { panX: 0 })
      const t = setTimeout(() => {
        setPhase('hidden')
        if (key && typeof window !== 'undefined') localStorage.setItem(key, '1')
        onDismiss()
      }, STEP_6_HOLD_MS + STEP_7_FADE_OUT_MS)
      return () => clearTimeout(t)
    }

    // Full sequence
    setPhase('letterbox-in')

    // Step 4: stinger fires at letterbox-in completion (parallel to card-land start)
    const t1 = setTimeout(() => {
      setPhase('card-land')
      if (playStinger) playStinger('rank-up', { panX: 0 })
      // Step 5: shake the page root for 120ms (1.5px microshake)
      triggerScreenShake(shakeTarget, STEP_5_SHAKE_MS, 1.5)
    }, STEP_1_LETTERBOX_IN)

    // Step 6: hold begins after card-land completes
    const t2 = setTimeout(() => setPhase('hold'), STEP_1_LETTERBOX_IN + STEP_3_CARD_LAND)

    // Step 7: fade-out begins after hold
    const t3 = setTimeout(() => setPhase('fade-out'),
      STEP_1_LETTERBOX_IN + STEP_3_CARD_LAND + STEP_6_HOLD_MS)

    // Step 8: cleanup — persist localStorage gate, hide, notify caller
    const t4 = setTimeout(() => {
      setPhase('hidden')
      if (key && typeof window !== 'undefined') localStorage.setItem(key, '1')
      onDismiss()
    }, STEP_1_LETTERBOX_IN + STEP_3_CARD_LAND + STEP_6_HOLD_MS + STEP_7_FADE_OUT_MS)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, cycleStartISO, rankSlug])

  if (phase === 'hidden') return null

  const letterboxVisible = phase !== 'fade-out'
  const cardVisible      = phase === 'card-land' || phase === 'hold'
  const dimOpacity       = phase === 'fade-out' ? 0 : 0.30

  return (
    <>
      {/* World dim — under letterbox + card */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          backgroundColor: `rgba(0,0,0,${dimOpacity})`,
          transition: reduced ? 'none' : `background-color ${STEP_2_DIM_IN}ms linear`,
          pointerEvents: cardVisible ? 'auto' : 'none',
        }}
      />

      {/* Letterbox top bar — scaleY transform (NOT height) per RESEARCH Anti-Pattern */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: LETTERBOX_HEIGHT,
          zIndex: 10001,
          backgroundColor: '#000',
          transform: letterboxVisible ? 'scaleY(1)' : 'scaleY(0)',
          transformOrigin: 'top',
          transition: reduced ? 'none' : `transform ${phase === 'fade-out' ? STEP_7_FADE_OUT_MS : STEP_1_LETTERBOX_IN}ms ${EXPO_OUT}`,
        }}
      />

      {/* Letterbox bottom bar — scaleY transform (NOT height) */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: LETTERBOX_HEIGHT,
          zIndex: 10001,
          backgroundColor: '#000',
          transform: letterboxVisible ? 'scaleY(1)' : 'scaleY(0)',
          transformOrigin: 'bottom',
          transition: reduced ? 'none' : `transform ${phase === 'fade-out' ? STEP_7_FADE_OUT_MS : STEP_1_LETTERBOX_IN}ms ${EXPO_OUT}`,
        }}
      />

      {/* PROMOTED card */}
      <div
        role="dialog"
        aria-label={`Promoted to ${rank}`}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${cardVisible ? 1 : 0.9})`,
          zIndex: 10002,
          width: 320,
          height: 200,
          backgroundColor: NV2,
          border: `2px solid ${OG}`,
          borderRadius: 8,
          boxShadow: '0 0 40px rgba(245,127,32,0.40)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          opacity: cardVisible ? 1 : 0,
          transition: reduced
            ? 'none'
            : `transform ${STEP_3_CARD_LAND}ms ${BACK_OUT}, opacity ${phase === 'fade-out' ? STEP_7_FADE_OUT_MS : STEP_3_CARD_LAND}ms ease`,
        }}
      >
        <Trophy size={48} strokeWidth={1.5} color={OG} />
        <div style={{
          fontFamily: BODY,            // Wave 5 → var(--font-dw-stencil)
          fontSize: 56,
          fontWeight: 400,
          color: OG,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}>PROMOTED</div>
        <div style={{
          fontFamily: BODY,            // Wave 5 → var(--font-dw-stencil)
          fontSize: 24,
          fontWeight: 400,
          color: CR,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}>{rank}</div>
      </div>
    </>
  )
}
