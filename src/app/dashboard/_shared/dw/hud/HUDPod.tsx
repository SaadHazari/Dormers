'use client'

import { useEffect, useRef, useState } from 'react'
import { CallsignChip } from './CallsignChip'
import { RankChevron } from './RankChevron'
import { WalletReadout } from './WalletReadout'
import { StreakFlame } from './StreakFlame'
import { ScanlineOverlay } from './ScanlineOverlay'
import { HUDPill } from './HUDPill'

const MOBILE_BREAKPOINT = 720       // px — UI-SPEC Mobile
const AUTO_COLLAPSE_MS = 4000       // 4s no-interaction → collapse — UI-SPEC D-13

export type HUDPodProps = {
  callsign: string                  // user first name from customerCid
  rank: string                      // derived from referralData.converted
  aed: number                       // from referralData.creditBalance
  streakDays: number                // from existing streak.count
}

function useViewportWidth(): number {
  const [w, setW] = useState<number>(typeof window === 'undefined' ? 1024 : window.innerWidth)
  useEffect(() => {
    const onResize = () => setW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return w
}

/**
 * Top-level HUD container. Mounts only on /dashboard/dorm-wars per D-12 (DormWarsClient renders this).
 *
 * Desktop (>720px): full 4-row pod always visible.
 * Mobile (≤720px): collapsed pill by default; tap expands; auto-collapse after 4s no interaction.
 *
 * Position: fixed; top: 16px; right: 16px; z-index: 9000 (UI-SPEC Atmosphere Stack).
 */
export function HUDPod({ callsign, rank, aed, streakDays }: HUDPodProps) {
  const viewportW = useViewportWidth()
  const isMobile = viewportW <= MOBILE_BREAKPOINT

  // Mobile pill state — persisted via dw-hud-collapsed
  const [collapsed, setCollapsed] = useState(true)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('dw-hud-collapsed')
    // Mobile default: collapsed. Desktop default: not used (pod always expanded).
    setCollapsed(stored === null ? true : stored === '1')
  }, [])

  const setCollapsedPersisted = (next: boolean) => {
    setCollapsed(next)
    if (typeof window !== 'undefined') localStorage.setItem('dw-hud-collapsed', next ? '1' : '0')
  }

  // Auto-collapse timer (mobile only, when expanded)
  const collapseTimerRef = useRef<number | null>(null)
  const armAutoCollapse = () => {
    if (collapseTimerRef.current !== null) window.clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = window.setTimeout(() => setCollapsedPersisted(true), AUTO_COLLAPSE_MS)
  }
  const disarmAutoCollapse = () => {
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }
  useEffect(() => {
    if (isMobile && !collapsed) {
      armAutoCollapse()
      return () => disarmAutoCollapse()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, collapsed])

  // Click-outside on mobile → collapse immediately
  const podRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isMobile || collapsed) return
    const onDoc = (e: MouseEvent) => {
      if (podRef.current && !podRef.current.contains(e.target as Node)) {
        setCollapsedPersisted(true)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [isMobile, collapsed])

  // Mobile collapsed → render pill
  if (isMobile && collapsed) {
    return (
      <div style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 9000,
      }}>
        <HUDPill
          aed={aed}
          rank={rank}
          onTap={() => setCollapsedPersisted(false)}
        />
      </div>
    )
  }

  // Desktop OR mobile expanded → render full pod
  return (
    <div
      ref={podRef}
      onMouseMove={isMobile ? armAutoCollapse : undefined}
      onTouchStart={isMobile ? armAutoCollapse : undefined}
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9000,
        width: 240,
        padding: 12,
        backgroundColor: 'rgba(30,58,79,0.88)', // NV2 with alpha — UI-SPEC HUD Pod Desktop
        border: `1px solid rgba(237,232,218,0.18)`,
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        overflow: 'hidden',                     // contain ScanlineOverlay
        // Note: NV2 + OG glow combined would mix with backgroundImage. We use a translucent NV2 fill via backgroundColor literal.
      }}
    >
      <ScanlineOverlay />
      <CallsignChip name={callsign} />
      <RankChevron rank={rank} />
      <WalletReadout aed={aed} />
      <StreakFlame days={streakDays} />
    </div>
  )
}
