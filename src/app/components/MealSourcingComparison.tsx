'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useIsLight } from '@/ui-system/hooks/useIsLight'
import { glassTokens } from '@/ui-system/tokens/glass'
import { EASE_STANDARD } from '@/ui-system/tokens/motion'
import { ModeSelector } from './comparison/ModeSelector'
import { LeverBar } from './comparison/LeverBar'
import { RelativeWin } from './comparison/RelativeWin'
import {
  MODES,
  LEVERS,
  DORMERS_BENCHMARK,
  COPY,
  SIGNUP_HREF,
} from './MealSourcingComparison.data'

/**
 * Marketing "meal-sourcing comparison" (#compare).
 *
 * Hidden by default behind an expand trigger (a hunt, not a USP we push). Once
 * open it is a two-column band: the feeling on the left (heading, the live jab,
 * the CTA) and the interactive chart on the right. On mobile it stacks as
 * heading -> jab -> chart -> CTA (emotion before proof, action after).
 */
export default function MealSourcingComparison() {
  const [modeIndex, setModeIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const isLight = useIsLight()
  const reduce = useReducedMotion()
  const router = useRouter()
  const [, startNavTransition] = useTransition()

  const tokens = glassTokens(isLight, 'desktop')
  const { panel, inactiveText } = tokens

  const current = MODES[modeIndex]

  const goSignup = () => startNavTransition(() => router.push(SIGNUP_HREF))

  const stepMode = (dir: 1 | -1) => {
    setModeIndex((i) => {
      const last = MODES.length - 1
      if (dir === 1) return i === last ? 0 : i + 1
      return i === 0 ? last : i - 1
    })
  }

  // Theme-aware text (never sharp #fff on navy → cream #f5f0e8).
  const strongText = isLight ? 'text-[#091825]' : 'text-[#f5f0e8]'
  const mutedText = isLight ? 'text-[#1E3A4F]/60' : 'text-[#f5f0e8]/60'
  const faintText = isLight ? 'text-[#1E3A4F]/55' : 'text-[#f5f0e8]/45'
  const trigger = isLight
    ? 'border-[#1E3A4F]/15 bg-[#1E3A4F]/[0.04] text-[#091825] hover:border-[#f57f20]/45 hover:bg-[#f57f20]/[0.06]'
    : 'border-white/15 bg-white/[0.04] text-[#f5f0e8] hover:border-[#f57f20]/45 hover:bg-[#f57f20]/[0.08]'

  const announcement = `${current.title}. Money spent ${current.scores.money}, time spent ${current.scores.time}, health ${current.scores.health}, taste ${current.scores.taste} out of 100.`

  return (
    <section
      id="compare"
      aria-labelledby="compare-heading"
      className="w-full px-4 pb-14 pt-2 font-montserrat sm:pb-16 sm:pt-4"
    >
      <div className="mx-auto max-w-5xl">
        {/* Expand trigger — collapsed by default (let them hunt it) */}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="compare-panel"
          onClick={() => setExpanded((v) => !v)}
          className={`mx-auto flex items-center gap-2 rounded-full border px-5 py-3 text-[14px] font-semibold outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-[#f57f20] ${trigger}`}
        >
          <span>{COPY.trigger}</span>
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 text-[#f57f20] transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Panel */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              id="compare-panel"
              key="panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.4, ease: EASE_STANDARD }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 gap-5 pt-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-x-12 lg:gap-y-4 lg:pt-12">
                {/* Heading — lighter weight, hand-drawn circle around "catch" */}
                <h2
                  id="compare-heading"
                  className={`max-w-md text-[30px] font-bold leading-[1.15] tracking-tight sm:text-[38px] lg:col-start-1 lg:row-start-1 lg:self-end ${strongText}`}
                >
                  Every way to eat has a{' '}
                  <span className="relative inline-block">
                    catch
                    <svg
                      aria-hidden
                      viewBox="0 0 120 60"
                      fill="none"
                      preserveAspectRatio="none"
                      className="pointer-events-none absolute left-1/2 top-1/2 h-[128%] w-[116%] -translate-x-1/2 -translate-y-1/2"
                    >
                      <path
                        d="M 22 14 C 8 18 5 42 20 51 C 40 62 96 58 108 44 C 117 33 112 13 90 8 C 64 2 30 5 16 16 C 9 21 9 28 14 33"
                        stroke="#f57f20"
                        strokeWidth="3"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  </span>
                  .
                </h2>

                {/* Jab — above the chart on mobile (emotion first), left column on desktop */}
                <div className="lg:col-start-1 lg:row-start-2 lg:self-center">
                  <RelativeWin
                    modeId={current.id}
                    title={current.title}
                    win={current.win}
                    textClass={strongText}
                  />
                </div>

                {/* Chart card */}
                <div
                  className={`min-w-0 rounded-[24px] p-5 backdrop-blur-md sm:p-7 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:self-center ${panel}`}
                >
                  <ModeSelector
                    modes={MODES}
                    activeIndex={modeIndex}
                    onSelect={setModeIndex}
                    inactiveText={inactiveText}
                    panel={panel}
                  />

                  {/* Minimal inline key: the orange marker is Dormers. */}
                  <div className={`mt-4 flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${mutedText}`}>
                    <span
                      aria-hidden
                      className="h-3 w-[3px] rounded-full bg-[#f57f20] shadow-[0_0_6px_rgba(245,127,32,0.85)]"
                    />
                    {COPY.benchmarkLabel}
                  </div>

                  {/* Lever bars — swipe (secondary) advances modes */}
                  <motion.div
                    role="tabpanel"
                    aria-label={`${current.title} compared to Dormers`}
                    className="mt-3 flex select-none flex-col gap-4"
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.15}
                    onDragEnd={(_e, info) => {
                      if (info.offset.x < -50) stepMode(1)
                      else if (info.offset.x > 50) stepMode(-1)
                    }}
                  >
                    {LEVERS.map((lever, i) => (
                      <LeverBar
                        key={lever.key}
                        lever={lever}
                        altScore={current.scores[lever.key]}
                        modeLabel={current.title}
                        benchmarkScore={DORMERS_BENCHMARK[lever.key]}
                        benchmarkLabel={COPY.benchmarkLabel}
                        index={i}
                        isLight={isLight}
                      />
                    ))}
                  </motion.div>

                  <p className={`mt-5 text-[10px] leading-relaxed ${faintText}`}>{COPY.methodology}</p>
                </div>

                {/* CTA — after the chart on mobile, bottom of left column on desktop */}
                <div className="lg:col-start-1 lg:row-start-3 lg:self-start">
                  <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <button
                      type="button"
                      onClick={goSignup}
                      className="w-full whitespace-nowrap rounded-full bg-gradient-to-r from-[#f57f20] to-[#ffaa00] px-7 py-3 text-[14px] font-bold text-white shadow-md shadow-[#f57f20]/30 outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-[#f57f20] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent active:scale-100 sm:w-auto"
                    >
                      {COPY.ctaLabel}
                    </button>
                    <p className={`text-[12px] ${mutedText}`}>{COPY.ctaMicrocopy}</p>
                  </div>
                </div>
              </div>

              {/* Screen-reader announcement on mode change */}
              <div className="sr-only" aria-live="polite">
                {announcement}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style jsx global>{`
        .msc-noscroll {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .msc-noscroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  )
}
