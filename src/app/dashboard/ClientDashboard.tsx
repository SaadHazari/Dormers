'use client'

import { useState, useTransition, useEffect, useRef, useMemo, CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { pauseSubscription, resumeSubscription, skipMeal } from './actions'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { StaticImageData } from 'next/image'
import { ChevronRight, SkipForward, Pause as PauseIcon, Play, Check, Truck, CalendarDays, X } from 'lucide-react'
import { MENU_DATA, getMenuWeek } from '@/lib/menuData'
import { OG, OG3, NV, NV2, CR, BG, BODY, S, TIER1, TIER2, cleanPlanName } from './_shared/tokens'
import { PlanGlyph } from './_shared/PlanGlyph'
import { Eyebrow } from './_shared/Eyebrow'
import { MealTag } from './_shared/MealTag'
import { HeatBar } from './_shared/HeatBar'
import { fmt } from './_shared/format'

// True if `iso` falls on the same calendar day as `ref` (default: now). Used to
// derive whether today's delivery has already been skipped — the canonical
// source of truth, since skipMeal doesn't flip subscription.status.
function isSameDay(iso: string | null | undefined, ref: Date = new Date()): boolean {
  if (!iso) return false
  const d = new Date(iso)
  return d.getFullYear() === ref.getFullYear()
    && d.getMonth() === ref.getMonth()
    && d.getDate() === ref.getDate()
}

// ── Tonight's dish illustration — flat 2-D SVG, brand colours ────────────────
// ── Menu shape ────────────────────────────────────────────────────────────────
type MealState = 'past' | 'today' | 'future'
type MenuItem = {
  day: string                  // 'Mon', 'Tue', … 'Sat'
  date: string                 // 'Apr 1'
  dish: string
  sub: string
  tag: 'Veg' | 'Non Veg'
  heat: number
  image?: string | StaticImageData | null
  state: MealState
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Build Mon–Sat of the CURRENT week (or NEXT week if today is Sunday).
// Each item is tagged with its delivery state — past / today / future.
// If this week has no dishes, fall back to last week's so the variable-reward
// engine never goes flat (returns weekStatus so consumers can rephrase the header).
type WeekStatus = 'live' | 'fallback' | 'empty'
function buildCurrentWeekMenu(prefIsVeg: boolean, now: Date = new Date()): { menu: MenuItem[]; weekStatus: WeekStatus } {
  const todayMidnight = new Date(now); todayMidnight.setHours(0, 0, 0, 0)
  const todayDay = todayMidnight.getDay() // 0=Sun, 1=Mon, ..., 6=Sat

  // Find Monday of THIS week (or NEXT Monday if today is Sunday)
  const mondayOffset = todayDay === 0 ? 1 : 1 - todayDay
  const monday = new Date(todayMidnight)
  monday.setDate(todayMidnight.getDate() + mondayOffset)

  const weekKey = getMenuWeek(monday)
  let dishes = MENU_DATA.filter(d => d.week === weekKey && d.isVeg === prefIsVeg)
  let usedFallback = false
  if (dishes.length === 0) {
    const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7)
    const lastKey = getMenuWeek(lastMonday)
    const lastDishes = MENU_DATA.filter(d => d.week === lastKey && d.isVeg === prefIsVeg)
    if (lastDishes.length > 0) {
      dishes = lastDishes
      usedFallback = true
    }
  }
  const dishByDay = new Map(dishes.map(d => [d.dayOfWeek, d]))

  const out: MenuItem[] = []
  for (let i = 0; i < 6; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const dish = dishByDay.get(i) ?? null

    let state: MealState
    if (date.getTime() < todayMidnight.getTime())     state = 'past'
    else if (date.getTime() === todayMidnight.getTime()) state = 'today'
    else                                               state = 'future'

    out.push({
      day:   DAY_LABELS[i],
      date:  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dish:  dish?.name ?? '—',
      sub:   dish?.description ?? '',
      tag:   prefIsVeg ? 'Veg' : 'Non Veg',
      heat:  dish?.spiceLevel ?? 0,
      image: dish?.image ?? null,
      state,
    })
  }

  const weekStatus: WeekStatus = dishes.length === 0 ? 'empty' : usedFallback ? 'fallback' : 'live'
  return { menu: out, weekStatus }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Customer {
  id: string; cid?: string | null; name?: string | null; whatsapp_number?: string | null
  dorm_name?: string | null; meal_preference_type?: string | null; allergens?: string | null
  spice_level_preference?: string | null; email?: string | null; created_at: string
}
interface Subscription {
  id: string; plan_name: string; status: string; start_date: string; end_date: string
  total_meals: number; delivered_meals: number; skipped_meals_count: number
  has_paused_before: boolean; pause_date?: string | null; last_skipped_date?: string | null
  paused_days?: number; created_at: string
}
interface Props {
  customer: Customer | null
  activeSubscription: Subscription | null
  allSubscriptions: Subscription[]
  userEmail: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Live delivery countdown — Mon–Sat, 7-8 PM window
// Deliberately imprecise. We round to the nearest hour and prefix with "~"
// so the number reads as a soft estimate, not a contract — minute-level
// precision was creating accountability the kitchen can't promise. Under
// 30 minutes we drop the timer entirely in favour of "Arriving soon".
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
  return { label: isTomorrow ? 'Next delivery tomorrow at 7 PM' : `Next delivery ${dayLabel} at 7 PM`, urgent: false, arriving: false }
}

// ── Inline spinner ────────────────────────────────────────────────────────────
function BtnSpinner() {
  return (
    <span style={{
      display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
      border: '1.5px solid currentColor', borderTopColor: 'transparent',
      animation: 'spin 0.8s linear infinite', flexShrink: 0,
    }} />
  )
}

// ── Button styles (3 variants + a tight primary used inside cards) ───────────
type BtnVariant = 'primary' | 'secondary' | 'outline' | 'primary-tight'
function btnStyle(v: BtnVariant): CSSProperties {
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '12px 18px', borderRadius: 'var(--radius-pill)',
    fontFamily: BODY, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
    textTransform: 'uppercase', border: 0, cursor: 'pointer',
    transition: 'opacity 150ms, transform 150ms, box-shadow 150ms, background 150ms, border-color 150ms',
    textDecoration: 'none',
  }
  switch (v) {
    case 'primary':
      return { ...base, background: OG, color: '#fff', boxShadow: '0 4px 16px rgba(245,127,32,0.40)' }
    case 'secondary':
      return { ...base, background: 'rgba(255,255,255,0.6)', color: NV, border: `1px solid ${S.border2}` }
    case 'outline':
      return { ...base, background: 'transparent', color: NV, border: `1px solid ${S.border2}`, padding: '12px 14px' }
    case 'primary-tight':
      return { ...base, background: OG, color: '#fff', padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(245,127,32,0.35)' }
    default:
      return base
  }
}

// Eyebrow / MealTag / HeatBar moved to _shared/ — imported above.

// ── HeroToday ────────────────────────────────────────────────────────────────
// Span-7 dish card. Only "TONIGHT'S DISH" eyebrow above the dish; status +
// countdown live in a quiet footer below the content. No buttons here — Skip /
// Pause / Resume all live in the QuickActions card alongside.
function HeroStatusBadge({ status }: { status: 'Active' | 'Skipped' | 'Paused' | 'Off' }) {
  const map: Record<string, { bg: string; fg: string; icon: React.ReactNode }> = {
    Active:  { bg: 'rgba(29,138,48,0.12)',  fg: '#1d8a30',           icon: <Check       size={12} strokeWidth={2.6} /> },
    Paused:  { bg: 'rgba(255,170,0,0.16)',  fg: '#a36900',           icon: <PauseIcon   size={11} strokeWidth={2.4} /> },
    Skipped: { bg: 'rgba(9,24,37,0.08)',    fg: 'rgba(9,24,37,0.62)',icon: <SkipForward size={11} strokeWidth={2.4} /> },
    Off:     { bg: 'rgba(9,24,37,0.06)',    fg: 'rgba(9,24,37,0.55)',icon: <CalendarDays size={11} strokeWidth={2.2} /> },
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

function HeroToday({ todayMeal, localState }: {
  todayMeal: MenuItem | null
  localState: 'active' | 'skipped' | 'paused'
}) {
  const isOff     = todayMeal === null
  const isSkipped = localState === 'skipped'
  const isPaused  = localState === 'paused'
  const isActive  = !isOff && !isSkipped && !isPaused

  // Live tick — countdown updates every 30s (active state only)
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    if (!isActive) return
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [isActive])
  const countdown = computeCountdown(now)

  const badgeStatus: 'Active' | 'Skipped' | 'Paused' | 'Off' =
    isPaused ? 'Paused' : isSkipped ? 'Skipped' : isOff ? 'Off' : 'Active'

  const footerCaption =
    isActive  ? countdown.label
    : isSkipped ? "Credit safe — back tomorrow"
    : isPaused  ? "Resume when ready"
    : /* off */  "Mon–Sat, 7–8 PM"

  // Sub-headings only used in inactive states
  const stateHeading = isSkipped ? 'You skipped today.'
    : isPaused        ? 'Your plan is paused.'
    : isOff           ? 'No delivery today.'
    : ''
  const stateSubtitle = isSkipped ? "Tomorrow's delivery is on track."
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

      {/* ── Inactive states ─────────────────────────────────────────────────── */}
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

// ── PlanProgress ─────────────────────────────────────────────────────────────
// Shows: plan eyebrow + meals-left big number + linear progress bar (delivered
// vs. skipped legend) + start→end timeline + days-left + renew CTA.
function PlanProgress({ sub }: { sub: Subscription }) {
  const isMax = sub.plan_name.includes('Monthly Max')
  const mealsPerDelivery = isMax ? 2 : 1
  const total = sub.total_meals
  const totalDeliveries = Math.max(1, Math.ceil(total / mealsPerDelivery))
  const deliveriesDone = Math.floor(sub.delivered_meals / mealsPerDelivery)
  const skippedDeliveries = Math.floor(sub.skipped_meals_count / mealsPerDelivery)
  const left = Math.max(0, totalDeliveries - deliveriesDone - skippedDeliveries)
  const mealsLeft = left * mealsPerDelivery

  const daysLeft = Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
  const startsInFuture = new Date(sub.start_date).getTime() > Date.now()
  const renewEligible = !startsInFuture && daysLeft <= 7
  const daysUntilRenewUnlock = Math.max(0, daysLeft - 7)

  return (
    <div style={{
      ...TIER2,
      gridColumn: 'span 12',
      padding: 28, borderRadius: 'var(--radius-md)',
      display: 'flex', flexDirection: 'column', gap: 0,
    }} className="plan-progress-card">

      {/* 1 — Plan identity (neutral glyph; orange reserved for hero/CTAs) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <PlanGlyph planName={sub.plan_name} size={14} color={S.fg} />
        <Eyebrow>{cleanPlanName(sub.plan_name)}</Eyebrow>
      </div>

      {/* 2 — Meals remaining (section metric, not page hero) */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
        <span style={{ fontFamily: BODY, fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1, color: NV, fontFeatureSettings: '"tnum"' }}>
          {mealsLeft}
        </span>
        <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 500, color: S.fgMuted, lineHeight: 1.5 }}>
          of {total} meals remaining
        </span>
      </div>

      {/* 3 — Segmented progress bar — one cell per meal in the cycle.
            Delivered meals fill from the left in orange; skipped meals follow
            in hatched gray; remaining meals stay neutral. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={sub.delivered_meals}
        aria-label={`${sub.delivered_meals} of ${total} meals delivered`}
        style={{ display: 'flex', gap: 3, height: 10 }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const isDelivered = i < sub.delivered_meals
          const isSkipped   = !isDelivered && i < sub.delivered_meals + sub.skipped_meals_count
          // Always use the backgroundColor + backgroundImage longhand pair —
          // never mix with the `background` shorthand. React converts
          // `backgroundImage: undefined` to '' which clears any image set via
          // the shorthand, silently making delivered cells invisible.
          const backgroundColor = isDelivered
            ? OG
            : isSkipped
            ? 'rgba(9,24,37,0.40)'
            : 'rgba(9,24,37,0.08)'
          const backgroundImage = isDelivered
            ? `linear-gradient(180deg, ${OG} 0%, ${OG3} 100%)`
            : isSkipped
            ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 2px, transparent 2px, transparent 5px)'
            : 'none'
          return (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 3,
                borderRadius: 'var(--radius-pill)',
                backgroundColor,
                backgroundImage,
                transition: 'background-color 200ms, background-image 200ms',
              }}
            />
          )
        })}
      </div>
      <div style={{ marginTop: 8, fontFamily: BODY, fontSize: 12, color: S.fgMuted, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: OG, display: 'inline-block' }} />
          <strong style={{ color: NV, fontFeatureSettings: '"tnum"' }}>{sub.delivered_meals}</strong> delivered
        </span>
        {sub.skipped_meals_count > 0 && (
          <>
            <span style={{ color: S.fgFaint }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: 'rgba(9,24,37,0.40)', display: 'inline-block' }} />
              <strong style={{ color: NV, fontFeatureSettings: '"tnum"' }}>{sub.skipped_meals_count}</strong> skipped
            </span>
          </>
        )}
      </div>

      {/* 4 — Timeline */}
      <div style={{ marginTop: 'auto', paddingTop: 18, borderTop: `1px solid ${S.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub, lineHeight: 1.2 }}>
              Started
            </div>
            <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: NV, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
              {fmt(sub.start_date)}
            </div>
          </div>
          <span style={{ color: S.fgFaint, fontSize: 14 }} aria-hidden>→</span>
          <div>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub, lineHeight: 1.2 }}>
              Ending
            </div>
            <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: NV, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
              {fmt(sub.end_date)}
            </div>
          </div>
          {!startsInFuture && (
            <div style={{ marginLeft: 'auto' }}>
              <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub, lineHeight: 1.2 }}>
                Days left
              </div>
              <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 900, color: NV, marginTop: 4, fontFeatureSettings: '"tnum"', lineHeight: 1 }}>
                {daysLeft}
              </div>
            </div>
          )}
        </div>

        {/* 5 — Action */}
        {mealsLeft === 0 ? (
          <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)', background: 'rgba(245,127,32,0.08)', border: '1px solid rgba(245,127,32,0.20)' }}>
            <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: NV }}>Plan ended</div>
            <div style={{ fontFamily: BODY, fontSize: 12, color: S.fgMuted, marginTop: 4, lineHeight: 1.5 }}>Renew to keep meals coming.</div>
            <Link href="/dashboard/plan" className="btn-primary" style={{ ...btnStyle('primary-tight'), marginTop: 12, width: '100%' }}>
              Renew plan →
            </Link>
          </div>
        ) : renewEligible ? (
          <Link href="/dashboard/plan" className="btn-primary" style={{ ...btnStyle('primary-tight'), width: '100%' }}>
            Renew plan →
          </Link>
        ) : (
          <div style={{
            padding: '12px 14px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(9,24,37,0.04)', border: `1px solid ${S.border}`,
            fontFamily: BODY, fontSize: 12, color: S.fgMuted, lineHeight: 1.5,
          }}>
            {startsInFuture
              ? <>Plan begins on <strong style={{ color: NV }}>{fmt(sub.start_date)}</strong>.</>
              : <>Renewal opens in <strong style={{ color: NV }}>{daysUntilRenewUnlock} day{daysUntilRenewUnlock === 1 ? '' : 's'}</strong>.</>}
          </div>
        )}
      </div>
    </div>
  )
}


// ── StatRow — 2 decision-relevant stat tiles ─────────────────────────────────
// Deliveries left = the orange spotlight (most decision-relevant number).
// Days left = urgency signal (turns red within 3 days). Other metrics
// (Meals delivered, Skips used) intentionally live in PlanProgress's legend
// to avoid duplication.
function StatRow({ sub }: { sub: Subscription }) {
  const isMax = sub.plan_name.includes('Monthly Max')
  const mealsPerDelivery = isMax ? 2 : 1
  const total = sub.total_meals
  const totalDeliveries = Math.max(1, Math.ceil(total / mealsPerDelivery))
  const deliveriesDone = Math.floor(sub.delivered_meals / mealsPerDelivery)
  const skippedDeliveries = Math.floor(sub.skipped_meals_count / mealsPerDelivery)
  const deliveriesLeft = Math.max(0, totalDeliveries - deliveriesDone - skippedDeliveries)

  const startsInFuture = new Date(sub.start_date).getTime() > Date.now()
  const daysLeft = Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
  const endLabel = new Date(sub.end_date).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
  const startLabel = new Date(sub.start_date).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })

  const daysColor: TileColor = daysLeft <= 3 ? 'red' : 'default'

  return (
    <div style={{
      gridColumn: 'span 12',
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 16,
    }} className="stat-row">
      {/* 1 — Deliveries left (the page's most decision-relevant number) */}
      <StatTile
        color="orange"
        glyph={
          <div style={{
            width: 44, height: 44, borderRadius: 16,
            background: 'rgba(245,127,32,0.10)',
            border: '1.5px solid rgba(245,127,32,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Truck size={20} strokeWidth={1.7} color={OG} />
          </div>
        }
        label="Deliveries left"
        value={deliveriesLeft}
        sub={`of ${totalDeliveries} total`}
      />

      {/* 2 — Days left (urgency: red < 4 days, neutral otherwise) */}
      <StatTile
        color={daysColor}
        glyph={
          <div style={{
            width: 44, height: 44, borderRadius: 16,
            background: daysLeft <= 3 ? 'rgba(239,68,68,0.09)' : 'rgba(9,24,37,0.04)',
            border: daysLeft <= 3 ? '1.5px solid rgba(239,68,68,0.20)' : '1.5px solid rgba(9,24,37,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CalendarDays size={20} strokeWidth={1.9} color={daysLeft <= 3 ? '#b91c1c' : NV} />
          </div>
        }
        label="Days left"
        value={daysLeft}
        sub={startsInFuture ? `starts ${startLabel}` : `ends ${endLabel}`}
      />

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.stat-row) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

type TileColor = 'orange' | 'green' | 'yellow' | 'red' | 'blue' | 'default'

const TILE_SURFACES: Record<TileColor, CSSProperties> = {
  orange:  { background: '#f8f3e6', border: '1px solid rgba(245,127,32,0.18)',  boxShadow: '0 1px 3px rgba(9,24,37,0.035)' },
  green:   { background: '#f8f3e6', border: '1px solid rgba(29,138,48,0.15)',   boxShadow: '0 1px 3px rgba(9,24,37,0.035)' },
  yellow:  { background: '#f8f3e6', border: '1px solid rgba(255,170,0,0.22)',   boxShadow: '0 1px 3px rgba(9,24,37,0.035)' },
  red:     { background: '#f8f3e6', border: '1px solid rgba(239,68,68,0.18)',   boxShadow: '0 1px 3px rgba(9,24,37,0.035)' },
  blue:    { background: '#f8f3e6', border: '1px solid rgba(29,95,163,0.15)',   boxShadow: '0 1px 3px rgba(9,24,37,0.035)' },
  default: { background: '#f8f3e6', border: '1px solid rgba(9,24,37,0.07)',     boxShadow: '0 1px 3px rgba(9,24,37,0.035)' },
}
const TILE_VALUE_COLORS: Record<TileColor, string> = {
  orange: NV, green: NV, yellow: NV, red: NV, blue: NV, default: NV,
}

function StatTile({ glyph, label, value, sub, color = 'default' }: {
  glyph: React.ReactNode
  label: string
  value: string | number
  sub: string
  color?: TileColor
}) {
  const surface = TILE_SURFACES[color]
  const valueColor = TILE_VALUE_COLORS[color]
  return (
    <div style={{
      ...surface,
      padding: 20, borderRadius: 'var(--radius-md)',
      display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
    }}>
      <div style={{ flexShrink: 0 }}>{glyph}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgFaint, marginBottom: 6 }}>
          {label}
        </div>
        <div style={{
          fontFamily: BODY, fontSize: 28, fontWeight: 900,
          lineHeight: 1, letterSpacing: '-0.02em',
          color: valueColor,
          fontFeatureSettings: '"tnum"',
        }}>
          {value}
        </div>
        <div style={{ fontFamily: BODY, fontSize: 12, color: S.fgMuted, marginTop: 6, lineHeight: 1.5 }}>
          {sub}
        </div>
      </div>
    </div>
  )
}

// ── QuickActions — sits next to PlanProgress, parallels design's actions card ─
function QuickActions({
  canPause, localState, onPause, onSkipRequest, isPending, pendingAction, successAction, skipQuota,
}: {
  canPause: boolean
  localState: LocalState
  onPause: () => void; onSkipRequest: () => void
  isPending: boolean
  pendingAction: 'skip' | 'pause' | 'resume' | null
  successAction: 'skip' | 'pause' | 'resume' | null
  skipQuota: { total: number; left: number }
}) {
  const isPaused  = localState === 'paused'
  const isSkipped = localState === 'skipped'

  // Caption that lives in a small chip on the right of the skip button.
  // Surfaces the cycle remainder so the user can plan ahead — and the
  // "Last one" / "None left" wording leans into loss-aversion when the
  // pool is running low, nudging the user to think before they tap.
  const skipCaption =
    skipQuota.total === 0  ? 'No skips' :
    skipQuota.left  === 0  ? 'None left' :
    skipQuota.left  === 1  ? 'Last one' :
                             `${skipQuota.left} left`
  return (
    <div style={{
      ...TIER1,
      gridColumn: 'span 4',
      padding: 'clamp(26px, 2.8vw, 36px)', borderRadius: 'var(--radius-md)',
      display: 'flex', flexDirection: 'column', gap: 18,
    }} className="quick-actions-card">
      <Eyebrow>Quick actions</Eyebrow>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Skip — filled primary when active; outlined / disabled otherwise.
            When the plan is paused, skip is irrelevant so we hide it entirely. */}
        {!isPaused && (() => {
          const skipIsPrimary = !isSkipped
          const baseStyle: CSSProperties = skipIsPrimary
            ? { background: OG, color: '#fff', border: '1px solid transparent', boxShadow: '0 4px 16px rgba(245,127,32,0.30)' }
            : { background: 'transparent', color: NV, border: `1px solid ${S.border2}` }
          return (
            <button
              onClick={onSkipRequest}
              disabled={isPending || isSkipped}
              className={skipIsPrimary ? 'qa-row qa-row-primary' : 'qa-row qa-row-outline'}
              aria-label="Skip today's meal"
              style={{
                ...baseStyle,
                display: 'inline-flex', alignItems: 'center', gap: 10,
                justifyContent: 'flex-start',
                padding: '14px 18px', width: '100%',
                borderRadius: 'var(--radius-pill)',
                fontFamily: BODY, fontSize: 13, fontWeight: 700,
                cursor: isSkipped ? 'not-allowed' : 'pointer',
                opacity: isPending || isSkipped ? (isSkipped ? 0.6 : 0.75) : 1,
                transition: 'opacity 150ms, transform 150ms, box-shadow 150ms, background 150ms, border-color 150ms',
              }}
            >
              {pendingAction === 'skip' ? (
                <><BtnSpinner /> <span>Skipping…</span></>
              ) : successAction === 'skip' ? (
                <><Check size={16} strokeWidth={2.4} /> <span>Skipped today</span></>
              ) : (
                <><SkipForward size={16} strokeWidth={2.2} /> <span>{isSkipped ? 'Skipped today' : "Skip tonight's meal"}</span></>
              )}
              <span style={{
                marginLeft: 'auto',
                fontFamily: BODY,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                padding: '4px 9px',
                borderRadius: 999,
                background: skipIsPrimary ? 'rgba(255,255,255,0.20)' : 'rgba(9,24,37,0.07)',
                color: 'inherit',
                whiteSpace: 'nowrap',
                fontFeatureSettings: '"tnum"',
              }}>
                {skipCaption}
              </span>
            </button>
          )
        })()}

        {/* Pause / Resume — Resume becomes the filled primary when paused;
            Pause is a secondary outline when active. Hidden if not pausable. */}
        {(canPause || isPaused) && (() => {
          const pauseIsPrimary = isPaused  // resume is the call to action
          const baseStyle: CSSProperties = pauseIsPrimary
            ? { background: OG, color: '#fff', border: '1px solid transparent', boxShadow: '0 4px 16px rgba(245,127,32,0.30)' }
            : { background: 'transparent', color: NV, border: `1px solid ${S.border2}` }
          return (
            <button
              onClick={onPause}
              disabled={isPending}
              className={pauseIsPrimary ? 'qa-row qa-row-primary' : 'qa-row qa-row-outline'}
              aria-label={isPaused ? 'Resume plan' : 'Pause plan'}
              style={{
                ...baseStyle,
                display: 'inline-flex', alignItems: 'center', gap: 10,
                justifyContent: 'flex-start',
                padding: '14px 18px', width: '100%',
                borderRadius: 'var(--radius-pill)',
                fontFamily: BODY, fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                opacity: isPending ? 0.75 : 1,
                transition: 'opacity 150ms, transform 150ms, box-shadow 150ms, background 150ms, border-color 150ms',
              }}
            >
              {pendingAction === 'pause' || pendingAction === 'resume' ? (
                <><BtnSpinner /> <span>{isPaused ? 'Resuming…' : 'Pausing…'}</span></>
              ) : isPaused ? (
                <><Play size={16} strokeWidth={2.2} fill="currentColor" /> <span>Resume plan</span></>
              ) : (
                <><PauseIcon size={16} strokeWidth={2.2} /> <span>Pause my plan</span></>
              )}
            </button>
          )
        })()}
      </div>
    </div>
  )
}

// ── NoPlanView ────────────────────────────────────────────────────────────────
// Confident plan-picker invitation — no faded skeleton apology.
function NoPlanView() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        padding: 'clamp(36px, 5vw, 56px)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid rgba(245,127,32,0.25)',
        background: NV2,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column', gap: 22, alignItems: 'flex-start',
        position: 'relative', overflow: 'hidden',
        color: CR,
      }}
    >
      {/* Brand DNA: dashed grid pattern */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18, pointerEvents: 'none' }} aria-hidden>
        <defs>
          <pattern id="noplan-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(245,127,32,0.35)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#noplan-grid)" />
      </svg>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Eyebrow color={OG3}>Get started</Eyebrow>
        <div style={{
          marginTop: 12,
          fontFamily: BODY, fontSize: 'clamp(34px, 4.5vw, 52px)',
          fontWeight: 900, color: OG,
          lineHeight: 1, letterSpacing: '-0.02em',
        }}>
          Pick your plan.
        </div>
        <div style={{ marginTop: 12, fontFamily: BODY, fontSize: 16, color: 'rgba(237,232,218,0.78)', lineHeight: 1.65, maxWidth: 520 }}>
          Daily meals delivered to your dorm, 7–8 PM. Choose what fits your week.
        </div>
      </div>

      <Link href="/dashboard/plan" className="btn-primary" style={{ ...btnStyle('primary'), position: 'relative', zIndex: 1 }}>
        Pick a plan <ChevronRight size={16} strokeWidth={2.5} />
      </Link>
    </motion.div>
  )
}

// ── ActiveDashboard ───────────────────────────────────────────────────────────
type LocalState = 'active' | 'skipped' | 'paused'

function ActiveDashboard({ sub, customer, userEmail, allSubscriptions }: {
  sub: Subscription; customer: Customer | null; userEmail: string; allSubscriptions: Subscription[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError]     = useState<string | null>(null)
  // Initial localState derived from server data:
  //   • Paused        → if subscription.status is 'Paused' (DB-persisted)
  //   • Skipped       → if last_skipped_date matches today (DB-persisted, since
  //                     skipMeal doesn't flip status, only stamps the date)
  //   • Active        → otherwise
  const initialLocalState: LocalState =
    sub.status === 'Paused' ? 'paused'
    : isSameDay(sub.last_skipped_date) ? 'skipped'
    : 'active'
  const [localState, setLocalState]       = useState<LocalState>(initialLocalState)
  const [pendingAction, setPendingAction]   = useState<'skip' | 'pause' | 'resume' | null>(null)
  const [successAction, setSuccessAction]   = useState<'skip' | 'pause' | 'resume' | null>(null)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [showPauseConfirm, setShowPauseConfirm] = useState(false)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalState(
      sub.status === 'Paused' ? 'paused'
      : isSameDay(sub.last_skipped_date) ? 'skipped'
      : 'active'
    )
  }, [sub.status, sub.last_skipped_date])

  useEffect(() => () => { if (successTimer.current) clearTimeout(successTimer.current) }, [])

  useEffect(() => {
    if (!showSkipConfirm && !showPauseConfirm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowSkipConfirm(false); setShowPauseConfirm(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSkipConfirm, showPauseConfirm])

  const isWeekly       = sub.plan_name.includes('Weekly Flex')
  const isOneTime      = sub.plan_name.includes('One-Time')
  const isPausableTier = sub.plan_name.includes('Monthly Premium') || sub.plan_name.includes('Monthly Max')
  const canPause       = isPausableTier && !sub.has_paused_before && !isWeekly && !isOneTime && sub.status !== 'Ended'
  const endedPlans      = allSubscriptions.filter(s => s.status === 'Ended')
  const totalDelivered  = allSubscriptions.reduce((acc, x) => acc + (x.delivered_meals ?? 0), 0)
  const memberSinceText = customer?.created_at
    ? new Date(customer.created_at).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })
    : null

  const act = (fn: () => Promise<{ error?: string } | { success: boolean }>, optimisticState: LocalState, actionKey: 'skip' | 'pause' | 'resume') => {
    setActionError(null)
    setPendingAction(actionKey)
    const prev = localState
    setLocalState(optimisticState)
    startTransition(async () => {
      let result: { error?: string } | { success: boolean } | null = null
      let threw: Error | null = null
      try {
        result = await fn()
      } catch (e) {
        threw = e as Error
      }
      setPendingAction(null)
      if (threw || (result && 'error' in result && result.error)) {
        setLocalState(prev)
        setActionError(threw ? `Server error: ${threw.message}` : (result as { error: string }).error)
        return
      }
      if (successTimer.current) clearTimeout(successTimer.current)
      setSuccessAction(actionKey)
      successTimer.current = setTimeout(() => setSuccessAction(null), 1400)
      router.refresh()
    })
  }

  const handleSkipRequest  = () => { if (localState !== 'active' || isPending) return; setShowSkipConfirm(true) }
  const handleSkipConfirm  = () => { setShowSkipConfirm(false); act(() => skipMeal(sub.id), 'skipped', 'skip') }
  const handlePauseRequest = () => {
    if (isPending) return
    if (localState === 'paused')                      act(() => resumeSubscription(sub.id), 'active',  'resume')
    else if (canPause && localState === 'active')     setShowPauseConfirm(true)
  }
  const handlePauseConfirm = () => {
    setShowPauseConfirm(false)
    act(() => pauseSubscription(sub.id), 'paused', 'pause')
  }

  // When the user just clicked Skip, the optimistic localState flips to 'skipped'
  // before router.refresh() lands. During that window the server count is still
  // stale — bump it locally so StatRow's "Skips used" tile and the PlanProgress
  // bar move in lockstep with the status change instead of a beat behind.
  const optimisticSkipPending =
    localState === 'skipped' && !isSameDay(sub.last_skipped_date)
  const effectiveSub: Subscription = {
    ...sub,
    status: localState === 'paused' ? 'Paused' : localState === 'skipped' ? 'Skipped' : sub.status,
    skipped_meals_count: optimisticSkipPending ? sub.skipped_meals_count + 1 : sub.skipped_meals_count,
    last_skipped_date:   optimisticSkipPending ? new Date().toISOString()    : sub.last_skipped_date,
  }

  // Skip allowance per plan tier — `total: 0` means the plan doesn't include
  // skips at all (Trial). Used by QuickActions to render a count chip on the
  // skip button so the user always knows how much wiggle room they have left
  // for the cycle. Includes the optimistic just-skipped count.
  const skipTotal =
    effectiveSub.plan_name.includes('Monthly Max')     ? 3 :
    effectiveSub.plan_name.includes('Monthly Premium') ? 3 :
    effectiveSub.plan_name.includes('Weekly Flex')     ? 1 : 0
  const skipQuota = {
    total: skipTotal,
    left:  Math.max(0, skipTotal - effectiveSub.skipped_meals_count),
  }
  const rawName   = customer?.name ?? userEmail.split('@')[0]
  const firstName = rawName?.split(' ')[0] ?? 'there'

  const prefIsVeg = !!customer?.meal_preference_type?.toLowerCase().includes('plant')
  const { menu: weekMenu } = useMemo(() => buildCurrentWeekMenu(prefIsVeg), [prefIsVeg])
  const todayMeal = weekMenu.find(m => m.state === 'today') ?? null

  // Stagger entrance only on first visit per session — avoids 700ms hold-up on every navigation
  const [skipStagger, setSkipStagger] = useState(false)
  useEffect(() => {
    try {
      if (sessionStorage.getItem('dash-stagger-seen')) {
        setSkipStagger(true)
      } else {
        sessionStorage.setItem('dash-stagger-seen', '1')
      }
    } catch {}
  }, [])

  return (
    <div className="dash-root" style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: NV }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* Greeting ribbon — name + accumulated equity (loyalty as endowed progress, not guilt) */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 500, color: S.fgMuted, letterSpacing: 0 }}>
              {getGreeting()}, <strong style={{ color: NV, fontWeight: 700 }}>{firstName}</strong>.
            </div>
            {totalDelivered >= 5 && (
              <div style={{ fontFamily: BODY, fontSize: 12, color: S.fgSub, letterSpacing: 0, lineHeight: 1.5 }}>
                <strong style={{ color: NV, fontWeight: 700 }}>{totalDelivered}</strong> dinners with us
                {memberSinceText && <> · since {memberSinceText}</>}
                {endedPlans.length > 0 && (
                  <> · <Link
                          href="/dashboard/history"
                          style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: 'rgba(9,24,37,0.20)', textUnderlineOffset: 3 }}
                        >
                          {endedPlans.length} past plan{endedPlans.length === 1 ? '' : 's'}
                        </Link></>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Error toast */}
        <AnimatePresence>
          {actionError && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)', color: '#b91c1c', fontFamily: BODY, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{actionError}</span>
              <button onClick={() => setActionError(null)} className="btn-toast-close" aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px 6px', borderRadius: 4, transition: 'transform 100ms' }}><X size={14} strokeWidth={2.5} aria-hidden /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 12-column grid — order:
            (1) Stats row (Deliveries/Delivered/Skips/Days)
            (2) Tonight's dish + Quick actions
            (3) Plan progress                                                   */}
        <div className={`dash-grid${skipStagger ? ' dash-grid-no-stagger' : ''}`}>
          <StatRow sub={effectiveSub} />
          <HeroToday
            todayMeal={todayMeal}
            localState={localState}
          />
          <QuickActions
            canPause={canPause}
            localState={localState}
            onPause={handlePauseRequest}
            onSkipRequest={handleSkipRequest}
            isPending={isPending}
            pendingAction={pendingAction}
            successAction={successAction}
            skipQuota={skipQuota}
          />
          <PlanProgress sub={effectiveSub} />
        </div>

        {/* Skip confirmation modal — sharpened for irreversibility */}
        <AnimatePresence>
          {showSkipConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(9,24,37,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}
              onClick={() => setShowSkipConfirm(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                onClick={e => e.stopPropagation()}
                style={{ background: BG, borderRadius: 'var(--radius-md)', padding: 32, maxWidth: 420, width: '100%', border: '1px solid rgba(245,127,32,0.20)', boxShadow: 'var(--shadow-lg)' }}
              >
                <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: NV, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                  Skip tonight&rsquo;s meal?
                </div>
                <div style={{ fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 12, lineHeight: 1.65 }}>
                  Your credit returns automatically and your subscription resumes tomorrow.
                </div>
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', color: '#9a2828', fontFamily: BODY, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
                  Once you confirm, this can&rsquo;t be undone — the kitchen will be informed.
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                  <button
                    onClick={() => setShowSkipConfirm(false)}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(9,24,37,0.15)', background: '#ffffff', color: NV, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSkipConfirm}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: 'none', background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 0 16px rgba(245,127,32,0.45)' }}
                  >
                    Yes, skip today
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pause confirmation modal */}
        <AnimatePresence>
          {showPauseConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(9,24,37,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}
              onClick={() => setShowPauseConfirm(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                onClick={e => e.stopPropagation()}
                style={{ background: BG, borderRadius: 'var(--radius-md)', padding: 32, maxWidth: 420, width: '100%', border: '1px solid rgba(245,127,32,0.20)', boxShadow: 'var(--shadow-lg)' }}
              >
                <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: NV, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                  Pause your plan?
                </div>
                <div style={{ fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 12, lineHeight: 1.65 }}>
                  This uses your <strong style={{ color: NV }}>1 free pause</strong> for the cycle. Your end date extends by the days you stay paused. Resume any time after tomorrow.
                </div>
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(245,127,32,0.08)', border: '1px solid rgba(245,127,32,0.18)', fontFamily: BODY, fontSize: 12, color: '#a35100', lineHeight: 1.5 }}>
                  Pauses available: <strong>1 of 1</strong>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                  <button
                    onClick={() => setShowPauseConfirm(false)}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(9,24,37,0.15)', background: '#ffffff', color: NV, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePauseConfirm}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: 'none', background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 0 16px rgba(245,127,32,0.45)' }}
                  >
                    Yes, pause
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      <style jsx global>{`
        .dash-root { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

        .dash-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 20px;
        }
        @media (max-width: 1024px) {
          .dash-grid > * { grid-column: span 12 !important; }
        }

        /* Quick actions row hover lift */
        .qa-row { transition: transform 150ms, box-shadow 150ms, background 150ms, border-color 150ms; }
        .qa-row:hover:not(:disabled) { transform: translateY(-1px); }

        /* First-visit stagger only — gated by sessionStorage flag */
        .dash-grid > *:nth-child(1) { animation: fadeUp 0.35s ease-out 0.00s both; }
        .dash-grid > *:nth-child(2) { animation: fadeUp 0.35s ease-out 0.07s both; }
        .dash-grid > *:nth-child(3) { animation: fadeUp 0.35s ease-out 0.14s both; }
        .dash-grid > *:nth-child(4) { animation: fadeUp 0.35s ease-out 0.21s both; }
        .dash-grid-no-stagger > * { animation: none !important; }
        @media (prefers-reduced-motion: reduce) {
          .dash-grid > * { animation: none !important; }
        }

        /* Button hover states */
        .btn-primary:not(:disabled):hover {
          opacity: 0.92;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(245,127,32,0.55) !important;
        }
        .btn-primary:not(:disabled):active { transform: translateY(0); }
        .btn-secondary:not(:disabled):hover { background: rgba(237,232,218,0.22) !important; border-color: rgba(237,232,218,0.45) !important; }
        .btn-ghost:not(:disabled):hover { background: rgba(237,232,218,0.10) !important; }

        /* Upcoming menu card hover */
        .upcoming-card { will-change: transform, box-shadow; }
        .upcoming-card:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 10px 28px rgba(9,24,37,0.12) !important;
          border-color: rgba(245,127,32,0.30) !important;
        }
        .upcoming-card:hover:not(:disabled) .upcoming-thumb img { transform: scale(1.06); }

        .btn-toast-close:active { transform: scale(0.85); }

        /* Countdown urgent pulse — within 2 hours of delivery */
        .countdown-urgent { animation: urgentPulse 1.5s ease-in-out infinite; }

        @keyframes codeBounce {
          0%   { transform: scale(1); }
          40%  { transform: scale(0.97); }
          100% { transform: scale(1); }
        }
        .dormwars-voucher { will-change: transform, background, border-color; }
        .dormwars-voucher:hover:not(:disabled) { background: rgba(245,127,32,0.08) !important; border-color: rgba(245,127,32,0.55) !important; }
        .dormwars-voucher:active:not(:disabled) { animation: codeBounce 220ms ease-out; }
        .dormwars-share-btn:hover { transform: translateY(-1px); background: rgba(37,211,102,0.16) !important; border-color: rgba(37,211,102,0.65) !important; }
        .dormwars-share-btn:active { transform: translateY(0); }

        .view-menu-btn:hover { color: rgba(9,24,37,0.90) !important; }
        .view-menu-btn:active { opacity: 0.7; }
      `}</style>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function ClientDashboard({ customer, activeSubscription, allSubscriptions, userEmail }: Props) {
  const router           = useRouter()
  const searchParams     = useSearchParams()
  const checkoutSuccess  = searchParams.get('checkout_success')  === 'true'
  const checkoutCanceled = searchParams.get('checkout_canceled') === 'true'

  useEffect(() => {
    if (!checkoutSuccess) return
    if (activeSubscription) { router.replace('/dashboard'); return }
    const t = setTimeout(() => router.refresh(), 2000)
    return () => clearTimeout(t)
  }, [checkoutSuccess, activeSubscription, router])

  // Renewal-flow cancel: user already has an active plan and bailed out of
  // Stripe. Strip the param so they see their existing dashboard, not the
  // no-plan picker (which would hide their live subscription).
  useEffect(() => {
    if (checkoutCanceled && activeSubscription) router.replace('/dashboard')
  }, [checkoutCanceled, activeSubscription, router])

  // Order received → setting up
  if (checkoutSuccess && !activeSubscription) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, fontFamily: BODY, color: NV, padding: 32 }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid rgba(245,127,32,0.30)`, borderTopColor: OG }} />
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: NV }}>Order received!</div>
          <div style={{ fontSize: 14, color: S.fgMuted, marginTop: 8, lineHeight: 1.65 }}>Setting up your meal plan…</div>
        </div>
      </div>
    )
  }

  // No active plan (with optional cancel banner) → confident plan-picker.
  // Renewal cancels (active sub + canceled param) fall through to ActiveDashboard
  // — the effect above strips the param.
  if (!activeSubscription) {
    return (
      <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: NV }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          {checkoutCanceled && (
            <div style={{ marginBottom: 22, padding: '12px 18px', borderRadius: 'var(--radius-sm)', background: 'rgba(9,24,37,0.04)', border: `1px solid ${S.border}`, color: S.fgMuted, fontSize: 13, fontFamily: BODY, lineHeight: 1.5 }}>
              Checkout was cancelled — no charge was made. Pick a plan when you&rsquo;re ready.
            </div>
          )}
          <NoPlanView />
        </div>
      </div>
    )
  }

  return (
    <ActiveDashboard
      sub={activeSubscription}
      customer={customer}
      userEmail={userEmail}
      allSubscriptions={allSubscriptions}
    />
  )
}
