'use client'

import { useEffect, useState } from 'react'
import { OG, NV2, CR, BODY } from '../../tokens'
import { useReducedMotionGate } from '../utils/useReducedMotionGate'
import type { StingerKey } from '../audio/useStingers'

const TYPE_INTERVAL_MS = 40       // UI-SPEC ~40ms per character
const POST_NAME_PAUSE  = 300      // UI-SPEC: 300ms after name complete → stamp lands
const STAMP_DURATION   = 320      // UI-SPEC: 320ms EXPO_OUT
const BUTTON_DELAY     = 200      // UI-SPEC: 200ms after stamp → ENTER button appears
const EXPO_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'

type TitleScreenProps = {
  show: boolean
  customerCid: string
  onDismiss: () => void
  playStinger?: (key: StingerKey, opts?: { panX?: number; gainDb?: number }) => Promise<void>
}

/**
 * Phase 6 Wave 4 upgrade of Phase 5's interstitial. Preserves once-per-cycle gating
 * (caller manages dw-titlescreen-${cycleStartISO} as before — DormWarsClient still owns
 * the show/dismiss lifecycle; this component is purely presentational + behavior).
 *
 * 7 sequence steps per UI-SPEC:
 *   1. Modal appears with dim backdrop (parent renders this when show=true)
 *   2. Typed callsign — first name char-by-char at 40ms/char with blinking cursor
 *   3. Per-char copy-tick stinger at -12dB, pan 0
 *   4. After name complete + 300ms — "ENTER WAR ROOM" stamp lands with ink-bleed (feMorphology)
 *   5. Stamp complete → title-intro stinger
 *   6. Stamp + 200ms → ENTER button appears
 *   7. User taps ENTER → modal dismisses
 *
 * D-15 reduced-motion:
 *   - Callsign appears instantly (no per-char typing)
 *   - Cursor still blinks (no motion impact — it's a single property)
 *   - Stamp appears at scale 1.0 instantly (no scale animation)
 *   - Stinger plays (audio not gated by reduced-motion)
 */
export function TitleScreenInterstitial({ show, customerCid, onDismiss, playStinger }: TitleScreenProps) {
  const reduced = useReducedMotionGate()
  const fullName = (customerCid || 'AGENT').split(/[\s-]+/)[0].toUpperCase().slice(0, 12)

  const [typedChars, setTypedChars] = useState(0)
  const [stampVisible, setStampVisible] = useState(false)
  const [buttonVisible, setButtonVisible] = useState(false)

  // Reset on show / re-run sequence
  useEffect(() => {
    if (!show) {
      setTypedChars(0); setStampVisible(false); setButtonVisible(false)
      return
    }
    if (reduced) {
      setTypedChars(fullName.length)
      setStampVisible(true)
      if (playStinger) playStinger('title-intro', { panX: 0 })
      const tBtn = setTimeout(() => setButtonVisible(true), BUTTON_DELAY)
      return () => clearTimeout(tBtn)
    }

    // Animated path — per-char typing
    let charIndex = 0
    const typeId = setInterval(() => {
      charIndex += 1
      setTypedChars(charIndex)
      if (playStinger) playStinger('copy-tick', { gainDb: -12, panX: 0 })
      if (charIndex >= fullName.length) {
        clearInterval(typeId)
      }
    }, TYPE_INTERVAL_MS)

    const totalTypeMs = fullName.length * TYPE_INTERVAL_MS
    const tStamp = setTimeout(() => setStampVisible(true), totalTypeMs + POST_NAME_PAUSE)
    const tStinger = setTimeout(() => {
      if (playStinger) playStinger('title-intro', { panX: 0 })
    }, totalTypeMs + POST_NAME_PAUSE + STAMP_DURATION)
    const tBtn = setTimeout(() => setButtonVisible(true),
      totalTypeMs + POST_NAME_PAUSE + STAMP_DURATION + BUTTON_DELAY)

    return () => {
      clearInterval(typeId)
      clearTimeout(tStamp); clearTimeout(tStinger); clearTimeout(tBtn)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, fullName])

  if (!show) return null

  return (
    <>
      {/* SVG filter defs for ink-bleed on the stamp */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <filter id="dw-ink-bleed">
            <feMorphology operator="dilate" radius="0.5" />
          </filter>
        </defs>
      </svg>

      {/* Modal backdrop */}
      <div
        role="dialog"
        aria-label="Title screen"
        onClick={(e) => {
          // Click outside (on the backdrop itself) → dismiss (per UI-SPEC skippable)
          if (e.target === e.currentTarget) onDismiss()
        }}
        onKeyDown={(e) => { if (e.key === 'Escape') onDismiss() }}
        tabIndex={-1}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10100,
          backgroundColor: 'rgba(9,24,37,0.92)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
        }}
      >
        {/* Typed callsign */}
        <div style={{
          fontFamily: BODY,        // Wave 5 → var(--font-dw-stencil)
          fontSize: 32,
          fontWeight: 400,
          color: CR,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          {fullName.slice(0, typedChars)}
          <span className="dw-cursor-blink">{typedChars < fullName.length || !stampVisible ? '|' : ''}</span>
        </div>

        {/* ENTER WAR ROOM stamp */}
        <div style={{
          fontFamily: BODY,        // Wave 5 → var(--font-dw-stencil)
          fontSize: 48,
          fontWeight: 400,
          color: OG,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          transform: stampVisible ? 'scale(1)' : 'scale(0.95)',
          opacity: stampVisible ? 1 : 0,
          filter: 'url(#dw-ink-bleed)',
          transition: reduced ? 'none' : `transform ${STAMP_DURATION}ms ${EXPO_OUT}, opacity ${STAMP_DURATION}ms ${EXPO_OUT}`,
        }}>
          ENTER WAR ROOM
        </div>

        {/* ENTER button */}
        {buttonVisible && (
          <button
            type="button"
            onClick={onDismiss}
            style={{
              fontFamily: BODY,      // Wave 5 → var(--font-dw-stencil)
              fontSize: 20,
              fontWeight: 400,
              color: CR,
              backgroundColor: NV2,
              border: `1px solid ${OG}`,
              padding: '14px 48px',
              height: 56,
              cursor: 'pointer',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              borderRadius: 4,
            }}
          >
            ENTER
          </button>
        )}
      </div>

      <style>{`
        @keyframes dw-cursor-blink {
          0%, 49%   { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .dw-cursor-blink {
          display: inline-block;
          animation: dw-cursor-blink 1000ms steps(2) infinite;
          margin-left: 4px;
        }
      `}</style>
    </>
  )
}
