'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { SourcingMode } from '../MealSourcingComparison.data'

interface ModeSelectorProps {
  modes: SourcingMode[]
  activeIndex: number
  onSelect: (index: number) => void
  /** Glass inactive-text classes from glassTokens. */
  inactiveText: string
  /** Glass panel classes from glassTokens (for the pill container). */
  panel: string
}

/**
 * Segmented control / chip row. The primary control (recognition + random
 * access). WAI-ARIA tablist with roving tabindex + arrow-key nav. On mobile it
 * scrolls horizontally and auto-centers the active chip. Single mounted tree,
 * so the `layoutId` bubble has no cross-breakpoint collision.
 */
export function ModeSelector({
  modes,
  activeIndex,
  onSelect,
  inactiveText,
  panel,
}: ModeSelectorProps) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Keep the active chip centered (matters on the mobile scroller).
  useEffect(() => {
    btnRefs.current[activeIndex]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [activeIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const last = modes.length - 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = activeIndex === last ? 0 : activeIndex + 1
      onSelect(next)
      btnRefs.current[next]?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = activeIndex === 0 ? last : activeIndex - 1
      onSelect(prev)
      btnRefs.current[prev]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      onSelect(0)
      btnRefs.current[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      onSelect(last)
      btnRefs.current[last]?.focus()
    }
  }

  return (
    <div
      role="tablist"
      aria-label="How you eat now"
      onKeyDown={handleKeyDown}
      className={`msc-noscroll flex gap-1 overflow-x-auto rounded-full p-1.5 backdrop-blur-md sm:overflow-visible ${panel}`}
    >
      {modes.map((mode, i) => {
        const active = i === activeIndex
        return (
          <button
            key={mode.id}
            ref={(el) => {
              btnRefs.current[i] = el
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(i)}
            className={`relative z-10 flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 py-2 text-[12px] font-bold outline-none transition duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-[#f57f20] focus-visible:ring-offset-0 sm:min-w-0 sm:flex-1 sm:px-4 sm:text-[12px] ${
              active ? 'text-white' : `${inactiveText} hover:bg-[#f57f20]/10`
            }`}
          >
            {active && (
              <motion.div
                layoutId="compareModeBubble"
                className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-[#f57f20] to-[#ffaa00] shadow-md shadow-[#f57f20]/30"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="hidden sm:inline">{mode.label}</span>
            <span className="sm:hidden">{mode.shortLabel}</span>
          </button>
        )
      })}
    </div>
  )
}
