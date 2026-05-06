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

// ── Live delivery phase — drives both the label and the badge ────────
// Asia/Dubai timeline of a delivery day:
//   • before 18:30 → countdown ("Arriving in ~Nh" or "Arriving soon" <30m)
//   • 18:30 – 19:00 → "Arriving soon" (urgent, pulsing)
//   • 19:00 – 20:00 → "Arriving now"  (urgent, pulsing)
//   • 20:00 onward → "Delivered" (success badge)
// Non-delivery day for this week_type → "No delivery today".
//
// All time math in Asia/Dubai (UTC+4, no DST). Pure visual layer — the
// authoritative delivered_meals count is incremented by the cron at 20:00 AE.

type WeekType = '5DAYS' | '6DAYS' | '7DAYS'
type Phase = 'pre' | 'soon' | 'now' | 'delivered' | 'next-day' | 'no-delivery'
type PhaseInfo = { phase: Phase; label: string; urgent: boolean; badge: 'Active' | 'Delivered' | 'Off' }

function aeNow(now: Date): { hour: number; minute: number; isoDow: number } {
  // Asia/Dubai is UTC+4 year-round
  const ae = new Date(now.getTime() + 4 * 60 * 60 * 1000)
  const jsDow = ae.getUTCDay() // 0=Sun..6=Sat
  return {
    hour: ae.getUTCHours(),
    minute: ae.getUTCMinutes(),
    isoDow: jsDow === 0 ? 7 : jsDow, // 1=Mon..7=Sun
  }
}

function isDeliveryDow(isoDow: number, weekType: WeekType): boolean {
  if (weekType === '7DAYS') return true
  if (weekType === '6DAYS') return isoDow !== 7
  return isoDow !== 6 && isoDow !== 7
}

function computePhase(now: Date, weekType: WeekType): PhaseInfo {
  const { hour, minute, isoDow } = aeNow(now)

  // Non-delivery day → "No delivery today" + Off badge
  if (!isDeliveryDow(isoDow, weekType)) {
    return { phase: 'no-delivery', label: 'No delivery today', urgent: false, badge: 'Off' }
  }

  // After 8 PM AE → today's window is done, cron has incremented (or will at 20:00)
  if (hour >= 20) {
    return { phase: 'delivered', label: 'Delivered', urgent: false, badge: 'Delivered' }
  }

  // 19:00 – 19:59 AE → arriving now
  if (hour === 19) {
    return { phase: 'now', label: 'Arriving now', urgent: true, badge: 'Active' }
  }

  // 18:30 – 18:59 AE → arriving soon
  if (hour === 18 && minute >= 30) {
    return { phase: 'soon', label: 'Arriving soon', urgent: true, badge: 'Active' }
  }

  // Pre-18:30 → "Arriving in ~N hours"
  // Target = 19:00 AE today, diff in AE-aware milliseconds.
  // Computed via UTC math so DST/offset noise can't shift the count.
  const targetUtc = new Date(now.getTime())
  // Round now down to AE midnight, then add 19h to get AE 19:00 in UTC ms.
  const aeOffsetMs = 4 * 60 * 60 * 1000
  const aeMidnightUtc = Math.floor((now.getTime() + aeOffsetMs) / 86400000) * 86400000 - aeOffsetMs
  targetUtc.setTime(aeMidnightUtc + 19 * 60 * 60 * 1000)
  const diffMs = targetUtc.getTime() - now.getTime()
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000))
  if (totalMinutes <= 30) {
    return { phase: 'soon', label: 'Arriving soon', urgent: true, badge: 'Active' }
  }
  const hours = Math.max(1, Math.round(diffMs / 3600000))
  return {
    phase: 'pre',
    label: `Arriving in ~${hours} ${hours === 1 ? 'hour' : 'hours'}`,
    urgent: false,
    badge: 'Active',
  }
}

type BadgeStatus = 'Active' | 'Scheduled' | 'Skipped' | 'Paused' | 'Off' | 'Delivered'

function HeroStatusBadge({ status }: { status: BadgeStatus }) {
  // Bright variant for `Scheduled` — until the plan starts, this tag is the
  // only signal the user has that something's coming, so it gets a saturated
  // slate fill + soft glow (not the muted variants the others use). The other
  // states stay calm because they live on cards that *already* communicate
  // status visually (today's dish, paused/skipped headlines, etc).
  const map: Record<BadgeStatus, { bg: string; fg: string; border?: string; shadow?: string; icon: React.ReactNode }> = {
    Active:    { bg: 'rgba(29,138,48,0.12)',   fg: '#1d8a30',            icon: <Check        size={12} strokeWidth={2.6} /> },
    Delivered: { bg: 'rgba(29,138,48,0.16)',   fg: '#176626',            icon: <Check        size={12} strokeWidth={2.8} /> },
    Scheduled: {
      // Saturated gradient + heavier glow so the "starts on …" signal pops
      // off the cream surface. Inner highlight gives depth so it doesn't
      // read as a flat fill.
      bg: 'linear-gradient(135deg, #4585aa 0%, #2a5470 100%)',
      fg: '#ffffff',
      border: '1px solid #2a5470',
      shadow: '0 0 0 5px rgba(58,111,140,0.16), 0 6px 18px rgba(58,111,140,0.42), inset 0 1px 0 rgba(255,255,255,0.18)',
      icon: <CalendarDays size={11} strokeWidth={2.6} color="#ffffff" />,
    },
    Paused:    { bg: 'rgba(255,170,0,0.16)',   fg: '#a36900',            icon: <PauseIcon    size={11} strokeWidth={2.4} /> },
    Skipped:   { bg: 'rgba(9,24,37,0.08)',     fg: 'rgba(9,24,37,0.62)', icon: <SkipForward  size={11} strokeWidth={2.4} /> },
    Off:       { bg: 'rgba(9,24,37,0.06)',     fg: 'rgba(9,24,37,0.55)', icon: <CalendarDays size={11} strokeWidth={2.2} /> },
  }
  const c = map[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: status === 'Scheduled' ? '5px 12px 5px 10px' : '4px 11px 4px 9px',
      borderRadius: 'var(--radius-pill)',
      background: c.bg, color: c.fg,
      border: c.border,
      boxShadow: c.shadow,
      fontFamily: BODY, fontSize: 11, fontWeight: 800,
      letterSpacing: '0.10em', textTransform: 'uppercase', lineHeight: 1,
    }}>
      {c.icon}
      {status === 'Off' ? 'No delivery' : status}
    </span>
  )
}

export function HeroToday({ todayMeal, localState, subStartDate, weekType = '6DAYS', isDayOne = false, isLastDayNoQueue = false }: {
  todayMeal: MenuItem | null
  localState: LocalState
  // ISO date — when the user's plan is paid but hasn't begun yet, override the
  // "today's dish" view with a "starting soon" state. The countdown copy points
  // at this date instead of "tomorrow".
  subStartDate?: string
  // Customer's delivery cadence — drives is_delivery_day check + footer caption.
  // Defaults to 6DAYS for legacy callers.
  weekType?: WeekType
  // True iff today is start_date AND no meals have been delivered yet —
  // the one-time "first dinner is being made" signature moment. Top-design
  // bookend that protects the most vulnerable part of the customer journey.
  isDayOne?: boolean
  // True iff today IS the final delivery day AND no renewal is queued. Lets
  // the post-delivery subhead switch from "Same time, same place tomorrow"
  // (which is a lie when there's no tomorrow on the plan) to a warmer
  // retention-leaning line that nudges the customer toward renewing.
  isLastDayNoQueue?: boolean
}) {
  const isStartingSoon = !!subStartDate && new Date(subStartDate).getTime() > Date.now()
  const isSkipped = !isStartingSoon && localState === 'skipped'
  const isPaused  = !isStartingSoon && localState === 'paused'

  // Live tick — phase updates every 30s. Runs in all non-frozen states so the
  // pre→soon→now→delivered transitions land without a refresh.
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    if (isStartingSoon || isSkipped || isPaused) return
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [isStartingSoon, isSkipped, isPaused])
  const phase = computePhase(now, weekType)

  // No-delivery day for this week_type (e.g. Sunday on 6DAYS) overrides
  // the "Active + meal" rendering — even with a populated todayMeal, we
  // suppress the dish view because nothing is being delivered.
  const isOff = !isStartingSoon && !isSkipped && !isPaused && (
    phase.phase === 'no-delivery' || todayMeal === null
  )
  // Active rendering = a delivery day with a known meal AND a phase that's
  // not yet "delivered". Once delivered, switch to the same calm closure
  // language as off/skipped (no need to keep showing "tonight's dish").
  const isActive = !isStartingSoon && !isOff && !isSkipped && !isPaused
    && phase.phase !== 'delivered'
  const isDelivered = !isStartingSoon && !isOff && !isSkipped && !isPaused
    && phase.phase === 'delivered'

  const badgeStatus: BadgeStatus =
    isStartingSoon ? 'Scheduled'
    : isPaused ? 'Paused'
    : isSkipped ? 'Skipped'
    : isOff ? 'Off'
    : isDelivered ? 'Delivered'
    : 'Active'

  const startDateLabel = subStartDate
    ? new Date(subStartDate + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
    : ''

  const footerCaption =
    isStartingSoon ? `First meal arrives ${startDateLabel} at 7 PM`
    : isActive  ? phase.label
    : isDelivered ? "Tonight's meal delivered"
    : isSkipped ? "Credit safe — back tomorrow"
    : isPaused  ? "Resume when ready"
    : phase.phase === 'no-delivery' ? "Mon–Sat, 7–8 PM"
    : /* off (no menu) */  "Menu being finalised"

  // Sub-headings only used in inactive states
  const stateHeading = isStartingSoon ? "You're all set."
    : isSkipped ? 'You skipped today.'
    : isPaused ? 'Your plan is paused.'
    : isDelivered ? "Tonight's meal is delivered."
    : isOff && phase.phase === 'no-delivery' ? 'No delivery today.'
    : isOff ? 'No menu set yet.'
    : ''
  const offWeekCopy = weekType === '5DAYS' ? 'We deliver Mon–Fri.' : 'We deliver Mon–Sat.'
  const stateSubtitle = isStartingSoon ? `Your meals begin on ${startDateLabel}.`
    : isSkipped ? "Tomorrow's delivery is on track."
    : isPaused ? "Tap resume when you're ready."
    : isDelivered ? (isLastDayNoQueue ? "We'd love to keep serving you more." : "Same time, same place tomorrow.")
    : isOff && phase.phase === 'no-delivery' ? `${offWeekCopy} See you tomorrow.`
    : isOff ? "Check back shortly."
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
      {/* ── Day-1 badge — only renders on the first day before any delivery.
            Floats top-right of the card; saturated gold pill to read as
            celebration, not muted status. Solid fill + glowing ring + pulse
            so it's the first thing the user notices. ── */}
      {isDayOne && isActive && (
        <span style={{
          position: 'absolute', top: 14, right: 14,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px 8px 13px',
          borderRadius: 'var(--radius-pill)',
          // Brighter gold gradient + heavier outer glow + subtle inner
          // highlight. Reads as "celebration moment" at a glance.
          background: 'linear-gradient(135deg, #FFC42B 0%, #F0A810 100%)',
          border: '1px solid #C99000',
          color: '#3a2200',
          fontFamily: BODY, fontSize: 11.5, fontWeight: 900,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          lineHeight: 1,
          boxShadow: '0 0 0 5px rgba(255,196,43,0.22), 0 10px 28px rgba(212,160,23,0.55), inset 0 1px 0 rgba(255,255,255,0.45)',
        }} className="dayone-badge">
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#fff8e1',
            boxShadow: '0 0 0 2px rgba(255,255,255,0.65), 0 0 10px rgba(255,255,255,0.95)',
          }} />
          Your first dinner
        </span>
      )}

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
          className={isActive && phase.urgent ? 'countdown-urgent' : ''}
          style={{
            fontFamily: BODY, fontSize: 12, fontWeight: 600,
            color: isActive && phase.urgent ? OG : S.fgMuted,
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
        .dayone-badge { animation: dayone-pulse 2.4s ease-in-out infinite; }
        @keyframes dayone-pulse {
          0%, 100% {
            box-shadow:
              0 0 0 4px rgba(212,160,23,0.20),
              0 6px 18px rgba(212,160,23,0.40);
          }
          50%      {
            box-shadow:
              0 0 0 9px rgba(212,160,23,0.18),
              0 8px 24px rgba(212,160,23,0.55);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .dayone-badge { animation: none; }
        }
      `}</style>
    </div>
  )
}
