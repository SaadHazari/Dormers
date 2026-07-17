'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { EASE_STANDARD } from '@/ui-system/tokens/motion'
import type { Lever } from '../MealSourcingComparison.data'

interface LeverBarProps {
  lever: Lever
  /** Current alternative-mode score (0-100). The bar fills to this. */
  altScore: number
  /** Current mode label, for the aria description. */
  modeLabel: string
  /** Dormers' fixed benchmark score (0-100). The orange marker sits here. */
  benchmarkScore: number
  benchmarkLabel: string
  index: number
  isLight: boolean
}

/**
 * One lever row, ALWAYS horizontal (a fixed-width label + a flexible bar).
 * Keeping it a row at every breakpoint avoids the flex-column height collapse
 * that zeroed the bar on mobile. The alternative's score fills a neutral bar;
 * Dormers' benchmark is a fixed orange marker that always sits ahead.
 */
export function LeverBar({
  lever,
  altScore,
  modeLabel,
  benchmarkScore,
  benchmarkLabel,
  index,
  isLight,
}: LeverBarProps) {
  const reduce = useReducedMotion()

  const trackBg = isLight ? 'bg-[#1E3A4F]/10' : 'bg-white/10'
  // "Your option" fill: a clearly visible neutral bar (not orange; orange = Dormers).
  const fillBg = isLight ? 'bg-[#1E3A4F]/55' : 'bg-[#f5f0e8]/85'
  const labelText = isLight ? 'text-[#091825]' : 'text-[#f5f0e8]'

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(altScore)}
      aria-label={`${lever.label}: ${modeLabel} ${Math.round(altScore)} of 100. ${benchmarkLabel} ${benchmarkScore} of 100.`}
      title={lever.highMeans}
      className="flex flex-row items-center gap-3 sm:gap-4"
    >
      {/* Label */}
      <span
        className={`w-[76px] shrink-0 text-[13px] font-bold tracking-tight sm:w-[110px] ${labelText}`}
      >
        {lever.label}
      </span>

      {/* Track + (benefit only) Dormers reach zone + alt fill + Dormers marker.
          Benefit: your option (neutral) -> orange gap Dormers closes -> marker.
          Cost (money): the fill is spend, so no "reach" gap; the marker just
          shows where Dormers lands (mid). */}
      <div className="relative h-3 flex-1">
        <div className={`absolute inset-0 rounded-full ${trackBg}`} />

        {/* Dormers' reach (faint orange, 0 -> benchmark) — benefit levers only */}
        {lever.kind === 'benefit' && (
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full bg-[#f57f20]/20"
            style={{ width: `${benchmarkScore}%` }}
          />
        )}

        {/* Your option (neutral solid, 0 -> altScore) */}
        <motion.div
          className={`absolute inset-y-0 left-0 rounded-full ${fillBg}`}
          initial={false}
          animate={{ width: `${altScore}%` }}
          transition={{
            duration: reduce ? 0 : 0.6,
            ease: EASE_STANDARD,
            delay: reduce ? 0 : index * 0.06,
          }}
        />

        {/* Dormers benchmark marker, fixed, always ahead. Flares on every mode
            switch (keyed on modeLabel so it remounts) — the signature moment. */}
        <motion.div
          key={modeLabel}
          aria-hidden
          initial={reduce ? false : { scale: 1.7, boxShadow: '0 0 18px rgba(245,127,32,1)' }}
          animate={{ scale: 1, boxShadow: '0 0 8px rgba(245,127,32,0.85)' }}
          transition={
            reduce
              ? { duration: 0 }
              : { type: 'spring', stiffness: 480, damping: 14, delay: index * 0.06 }
          }
          className="absolute top-1/2 h-[18px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f57f20]"
          style={{ left: `${benchmarkScore}%` }}
        />
      </div>
    </div>
  )
}
