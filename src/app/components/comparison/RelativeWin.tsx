'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { EASE_STANDARD } from '@/ui-system/tokens/motion'

interface RelativeWinProps {
  /** Keyed on mode id so the block animates on every switch. */
  modeId: string
  /** Descriptive "way" title ("Cooking daily", "Delivery apps"...). */
  title: string
  win: string
  /** Theme-aware text color class (this line sits on the page bg, not glass). */
  textClass: string
}

/**
 * The per-mode jab. A small orange title names the "way", then one line names
 * the catch. The chart proves the rest. Bigger on desktop where it anchors the
 * left column.
 */
export function RelativeWin({ modeId, title, win, textClass }: RelativeWinProps) {
  const reduce = useReducedMotion()

  return (
    <div className="relative min-h-[5rem] lg:min-h-[6rem]">
      <AnimatePresence mode="wait">
        <motion.div
          key={modeId}
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -10 }}
          transition={{ duration: reduce ? 0 : 0.35, ease: EASE_STANDARD }}
        >
          <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-[#f57f20]">
            {title}
          </p>
          <p className={`text-[16px] font-medium leading-snug lg:text-[22px] lg:leading-tight ${textClass}`}>
            {win}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
