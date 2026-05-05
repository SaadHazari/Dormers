'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Check,
  Pause as PauseIcon,
  SkipForward,
  CalendarDays,
  ChevronRight,
} from 'lucide-react'
import { OG, NV, BODY, S, TIER1 } from './_shared/tokens'
import { MealTag } from './_shared/MealTag'
import { HeatBar } from './_shared/HeatBar'
import type { MenuItem, LocalState } from './_shared/types'

/**
 * Tonight's dish card — span-8 on desktop. Shows the dish, its meal
 * tag + heat, and a footer with the live status badge + countdown.
 *
 * Owns its own per-30s tick for the countdown when the card is in
 * the active state. No buttons here — Skip / Pause / Resume live in
 * QuickActions alongside.
 *
 * Was 200+ inline LOC in ClientDashboard.tsx.
 */

// ── Live delivery countdown — Mon–Sat, 7-8 PM window ───────────────
// Deliberately imprecise. We round to the nearest hour and prefix with
// "~" so the number reads as a soft estimate, not a contract — minute-
// level precision was creating accountability the kitchen can't promise.
// Under 30 minutes we drop the timer entirely in favour of "Arriving soon".
type Countdown = { label: string; urgent: boolean; arriving: boolean }

function computeCountdown(now: Date): Countdown {
  const day = now.getDay()
  const hour = now.getHours()

  if (day !== 0 && hour === 19) {
    return { label: 'Arriving now', urgent: true, arriving: true }
  }
  if (day !== 0 && hour < 19) {
    const target = new Date(now)
    target.setHours(19, 0, 0, 0)
    const diff = target.getTime() - now.getTime()
    const totalMinutes = Math.floor(diff / 60000)
    if (totalMinutes <= 30) {
      return { label: 'Arriving soon', urgent: true, arriving: false }
    }
    const hours = Math.max(1, Math.round(diff / 3600000))
    const label = `Arriving in ~${hours} ${hours === 1 ? 'hour' : 'hours'}`
    return { label, urgent: false, arriving: false }
  }
  // Past the window today (or it's Sunday) → next non-Sunday day at 7 PM
  const next = new Date(now)
  next.setDate(now.getDate() + 1)
  if (next.getDay() === 0) next.setDate(next.getDate() + 1)
  next.setHours(19, 0, 0, 0)
  const SHORT_DAYS_BY_JS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayLabel = SHORT_DAYS_BY_JS[next.getDay()]
  const isTomorrow = next.getDate() === now.getDate() + 1
  return {
    label: isTomorrow ? 'Next delivery tomorrow at 7 PM' : `Next delivery ${dayLabel} at 7 PM`,
    urgent: false,
    arriving: false,
  }
}

function HeroStatusBadge({ status }: { status: 'Active' | 'Scheduled' | 'Skipped' | 'Paused' | 'Off' }) {
  const map: Record<string, { bg: string; fg: string; icon: React.ReactNode }> = {
    Active:    { bg: 'rgba(29,138,48,0.12)',   fg: '#1d8a30',            icon: <Check        size={12} strokeWidth={2.6} /> },
    // Scheduled — slate-blue, paired with a calendar glyph (timing not delivery)
    Scheduled: { bg: 'rgba(58,111,140,0.12)',  fg: '#3a6f8c',            icon: <CalendarDays size={11} strokeWidth={2.2} /> },
    Paused:    { bg: 'rgba(255,170,0,0.16)',   fg: '#a36900',            icon: <PauseIcon    size={11} strokeWidth={2.4} /> },
    Skipped:   { bg: 'rgba(9,24,37,0.08)',     fg: 'rgba(9,24,37,0.62)', icon: <SkipForward  size={11} strokeWidth={2.4} /> },
    Off:       { bg: 'rgba(9,24,37,0.06)',     fg: 'rgba(9,24,37,0.55)', icon: <CalendarDays size={11} strokeWidth={2.2} /> },
  }
  const c = map[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 11px 4px 9px', borderRadius: 'var(--radius-pill)',
      background: c.bg, color: c.fg,
      fontFamily: BODY, fontSize: 11, fontWeight: 800,
      letterSpacing: '0.10em', textTransform: 'uppercase', lineHeight: 1,
    }}>
      {c.icon}
      {status === 'Off' ? 'No delivery' : status}
    </span>
  )
}

export function HeroToday({ todayMeal, localState, subStartDate }: {
  todayMeal: MenuItem | null
  localState: LocalState
  // ISO date — when the user's plan is paid but hasn't begun yet, override the
  // "today's dish" view with a "starting soon" state. The countdown copy points
  // at this date instead of "tomorrow".
  subStartDate?: string
}) {
  const isStartingSoon = !!subStartDate && new Date(subStartDate).getTime() > Date.now()
  const isOff     = !isStartingSoon && todayMeal === null
  const isSkipped = !isStartingSoon && localState === 'skipped'
  const isPaused  = !isStartingSoon && localState === 'paused'
  const isActive  = !isStartingSoon && !isOff && !isSkipped && !isPaused

  // Live tick — countdown updates every 30s (active state only)
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    if (!isActive) return
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [isActive])
  const countdown = computeCountdown(now)

  const badgeStatus: 'Active' | 'Scheduled' | 'Skipped' | 'Paused' | 'Off' =
    isStartingSoon ? 'Scheduled'
    : isPaused ? 'Paused' : isSkipped ? 'Skipped' : isOff ? 'Off' : 'Active'

  const startDateLabel = subStartDate
    ? new Date(subStartDate + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
    : ''

  const footerCaption =
    isStartingSoon ? `First meal arrives ${startDateLabel} at 7 PM`
    : isActive  ? countdown.label
    : isSkipped ? "Credit safe — back tomorrow"
    : isPaused  ? "Resume when ready"
    : /* off */  "Mon–Sat, 7–8 PM"

  // Sub-headings only used in inactive states
  const stateHeading = isStartingSoon ? "You're all set."
    : isSkipped ? 'You skipped today.'
    : isPaused        ? 'Your plan is paused.'
    : isOff           ? 'No delivery today.'
    : ''
  const stateSubtitle = isStartingSoon ? `Your meals begin on ${startDateLabel}.`
    : isSkipped ? "Tomorrow's delivery is on track."
    : isPaused        ? "Tap resume when you're ready."
    : isOff           ? "We deliver Mon–Sat. See you tomorrow."
    : ''

  // Tiered dish-name sizing — keeps long names on a single line without
  // wrapping. Three steps map cleanly to the type scale (40 / 36 / 26 max).
  const dishLen = todayMeal?.dish.length ?? 0
  const dishFontSize =
    dishLen <= 26 ? 'clamp(28px, 2.6vw, 40px)' :
    dishLen <= 34 ? 'clamp(24px, 2.4vw, 36px)' :
                    'clamp(18px, 1.6vw, 26px)'

  return (
    <div className="hero-card" style={{
      ...TIER1,
      // Edge wash — orange enters strongest at top-left, attenuates across the
      // full width without hitting zero. Keeps a printed-edge feel while
      // avoiding a visible terminus mid-card. Base is the TIER1 warm white so
      // the right edge sits on the same systematic surface scale as every
      // other card on the page.
      background: `
        linear-gradient(105deg, rgba(245,127,32,0.14) 0%, rgba(245,127,32,0.08) 22%, rgba(245,127,32,0.035) 55%, rgba(245,127,32,0.018) 100%),
        #fcf8ee
      `,
      gridColumn: 'span 8',
      borderRadius: 'var(--radius-md)',
      padding: 'clamp(26px, 2.8vw, 36px)',
      position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Active state ────────────────────────────────────────────────────── */}
      {isActive && todayMeal && (
        <div className="hero-active" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: OG, lineHeight: 1.2 }}>
              Tonight&rsquo;s dish
            </div>
            <AnimatePresence mode="wait">
              <motion.h1
                key={todayMeal.dish}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
                style={{
                  margin: '8px 0 0 0',
                  fontFamily: BODY,
                  fontSize: dishFontSize,
                  fontWeight: 800,
                  // lineHeight 1.2 (not 1) so descenders like "g" in "Tagine"
                  // aren't clipped by the line-box / overflow-hidden combo.
                  lineHeight: 1.2, letterSpacing: '-0.02em',
                  color: NV,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {todayMeal.dish}<span style={{ color: OG }}>.</span>
              </motion.h1>
            </AnimatePresence>
          </div>

          {todayMeal.sub && (
            <p style={{
              margin: 0,
              fontFamily: BODY, fontSize: 13, fontWeight: 400,
              color: S.fgMuted, lineHeight: 1.5, maxWidth: '46ch',
            }}>
              {todayMeal.sub}
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
            <MealTag kind={todayMeal.tag} />
            {todayMeal.heat > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <HeatBar level={todayMeal.heat} />
                <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: S.fgMuted }}>
                  {['', 'Mild', 'Medium', 'Hot'][todayMeal.heat]}
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Inactive states (incl. starting-soon for paid+future-start subs) ── */}
      {!isActive && (
        <div className="hero-active" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 style={{
            margin: 0,
            fontFamily: BODY, fontSize: 'clamp(26px, 2.4vw, 36px)',
            fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em',
            color: NV,
          }}>
            {stateHeading}
          </h1>
          <p style={{
            margin: 0,
            fontFamily: BODY, fontSize: 13, fontWeight: 400,
            color: S.fgMuted, lineHeight: 1.5, maxWidth: '46ch',
          }}>
            {stateSubtitle}
          </p>
        </div>
      )}

      {/* ── Footer: status pill + caption + view menu ───────────────────────── */}
      <div style={{
        marginTop: 'clamp(16px, 2vw, 22px)',
        paddingTop: 14,
        borderTop: `1px solid ${S.border}`,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <HeroStatusBadge status={badgeStatus} />
        <span style={{ color: 'rgba(9,24,37,0.22)' }} aria-hidden>·</span>
        <span
          className={isActive && countdown.urgent ? 'countdown-urgent' : ''}
          style={{
            fontFamily: BODY, fontSize: 12, fontWeight: 600,
            color: isActive && countdown.urgent ? OG : S.fgMuted,
            letterSpacing: 0,
          }}
        >
          {footerCaption}
        </span>
        <Link
          href="/dashboard/menu"
          className="view-menu-btn"
          style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: BODY, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            color: S.fgMuted, textDecoration: 'none',
            transition: 'color 150ms',
          }}
        >
          View dish <ChevronRight size={11} strokeWidth={2.4} />
        </Link>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.hero-active) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
