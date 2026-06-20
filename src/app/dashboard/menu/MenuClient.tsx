'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image, { StaticImageData } from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Truck, Moon, Utensils, Check, Sparkles, Clock, Lock } from 'lucide-react'
import { MENU_DATA, getMenuWeek, type Dish } from '@/contexts/menu/domain/catalog-data'

import { OG, CR, BG, BODY, S, TIER1, TIER2, TIER3, TIER_POP, TIER_POP_TEXT } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'
import { MealTag } from '../_shared/MealTag'
import { vegDayNumbersFor } from '@/contexts/subscriptions/domain/veg-day'
import { HeatBar } from '../_shared/HeatBar'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { MobileMenu, type MobileMenuCell } from '../_mobile/MobileMenu'

// DISPLAY alias kept for readability — same font as BODY (single typeface).
const DISPLAY = BODY

// ── Data types ────────────────────────────────────────────────────────────────
interface Customer {
  id: string; cid?: string | null; name?: string | null; email?: string | null
  meal_preference_type?: string | null; dorm_name?: string | null; created_at: string
  week_type?: '5DAYS' | '6DAYS' | null
}

interface ActiveSubLike {
  week_type?: '5DAYS' | '6DAYS' | null
  veg_days?: string[] | null
  // Gates the hero's "Arriving in ~Nh" countdown — only Active subs are
  // actually being delivered today; Paused/Skipped/Scheduled/Ended/null swap
  // in a static status label so the hero never claims a delivery is en
  // route when nothing is being cooked for the user.
  status?: string | null
  // Set by resumeSubscription when a customer resumes after the 2 PM kitchen
  // cutoff on a delivery day. The menu page reads this to suppress the
  // TodaySpotlight and today's WeekDayCard active treatment — no meal was
  // prepped, so we must not imply one is arriving.
  resume_cutoff_date?: string | null
  // AE-wall-date ledger of every skip event (past + future). Drives the
  // per-day "skipped" treatment on WeekDayCard. Past skips display as
  // historical no-deliveries; future skips display as scheduled "off"
  // days. Matches the dashboard's calendar bar source-of-truth.
  skipped_dates?: string[] | null
  // AE wall date when a pre-scheduled pause should activate. Days from
  // this date onward render as "Paused" on the weekly grid. The start
  // day gets a "Pause begins" label so the customer can see exactly when
  // their planned pause kicks in.
  planned_pause_start?: string | null
  // ISO end_date of the active sub. Used together with the queuedSub flag
  // to dim out-of-plan future days as "Plan ends" when no renewal is queued.
  end_date?: string | null
}

export type WeekMeal = {
  day: string        // 'Monday' … 'Sunday'
  date: string       // 'Apr 28' — display string
  iso: string        // 'YYYY-MM-DD' — used for matching against skipped_dates / planned_pause_start
  dish: string
  sub: string
  tag: 'Veg' | 'Non Veg' | 'Off'
  heat: number
  cal: number
  protein: number
  image: string | StaticImageData | null
}

// Eyebrow / MealTag / HeatBar moved to _shared/ — imported above.

// ── Menu data helpers ─────────────────────────────────────────────────────────
const FULL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * Builds the customer's full menu for THIS week and NEXT week.
 *
 * `vegDayNumbers` is the per-day veg/non-veg map: for plain Veg/NonVeg it's
 * all-or-nothing; for religious-mix it reflects exactly the customer's
 * sub.veg_days choice. Days outside the working window (Sat for 5DAYS,
 * Sun for any) render as "Off".
 */
function buildFullMenu(
  vegDayNumbers: Set<number>,
  weekType: '5DAYS' | '6DAYS',
  allDishes?: Dish[],
): { week: string; meals: WeekMeal[] }[] {
  // Anchor on the AE wall date (UTC+4), matching getMenuWeek + the skip/pause
  // ledger. The previous local-midnight math anchored the week on the browser's
  // timezone, so a non-Dubai user near midnight could see the wrong week.
  const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000)
  const todayMidnight = new Date(Date.UTC(aeNow.getUTCFullYear(), aeNow.getUTCMonth(), aeNow.getUTCDate()))
  const todayDay = todayMidnight.getUTCDay()

  const mondayOffset = todayDay === 0 ? 1 : 1 - todayDay
  const thisMonday = new Date(todayMidnight)
  thisMonday.setUTCDate(todayMidnight.getUTCDate() + mondayOffset)

  const nextMonday = new Date(thisMonday)
  nextMonday.setUTCDate(thisMonday.getUTCDate() + 7)

  const blocks = [
    { week: 'This Week', start: thisMonday },
    { week: 'Next Week', start: nextMonday },
  ]
  const W = weekType === '5DAYS' ? 5 : 6

  return blocks.map(block => {
    const weekKey = getMenuWeek(block.start)
    // Pull all dishes for this week (both isVeg variants) so per-day picks
    // can pull whichever the customer needs. Religious-mix users may need
    // veg on Mon and non-veg on Tue from the same week's catalogue.
    const dishes = (allDishes ?? MENU_DATA).filter(d => d.week === weekKey)
    const dishByDayAndVeg = new Map<string, typeof dishes[number]>()
    for (const d of dishes) dishByDayAndVeg.set(`${d.dayOfWeek}_${d.isVeg}`, d)

    const meals: WeekMeal[] = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(block.start); day.setDate(block.start.getDate() + i)
      // Off if outside the working window OR Sunday (always off).
      const isOff = i >= W || i === 6
      const wantVeg = !isOff && vegDayNumbers.has(i)
      const dish = isOff ? null : dishByDayAndVeg.get(`${i}_${wantVeg}`)
      const cal     = dish ? parseFloat(String(dish.nutrients.calories).replace(/[^\d.]/g, '')) || 0 : 0
      const protein = dish ? parseFloat(String(dish.nutrients.protein).replace(/[^\d.]/g, '')) || 0 : 0

      // YYYY-MM-DD using local components (matches AE wall date for the
      // Dubai-based customer base). Used downstream to match against the
      // sub's skipped_dates ledger + planned_pause_start.
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`

      meals.push({
        day:   FULL_DAYS[i],
        date:  day.toLocaleDateString('en-AE', { day: 'numeric', month: 'short' }),
        iso,
        dish:  isOff ? (i === 6 ? 'Sunday OFF' : 'Off') : dish?.name ?? 'Menu coming soon',
        sub:   isOff ? 'No delivery — rest day' : dish?.description ?? '',
        tag:   isOff ? 'Off' : (wantVeg ? 'Veg' : 'Non Veg'),
        heat:  isOff ? 0 : dish?.spiceLevel ?? 1,
        cal, protein,
        image: isOff ? null : dish?.image ?? null,
      })
    }
    return { week: block.week, meals }
  })
}

// Monday-first index for today: 0=Mon … 5=Sat … 6=Sun
function todayMonIdx(): number {
  // AE weekday (UTC+4) so the "today" highlight agrees with the AE skip/pause
  // ledger regardless of the browser's timezone.
  const d = new Date(Date.now() + 4 * 60 * 60 * 1000).getUTCDay()
  return d === 0 ? 6 : d - 1
}

// Next AE delivery day label — mirrors HeroToday's helper for the menu page.
// "tomorrow evening" in the common case; short date string when the next slot
// skips the weekend (Fri/Sat on 5DAYS, Sat on 6DAYS).
function nextDeliveryLabel(weekType: '5DAYS' | '6DAYS'): string {
  const aeShift = 4 * 60 * 60 * 1000
  for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
    const candidate = new Date(Date.now() + aeShift + daysAhead * 86_400_000)
    const isoDow = candidate.getUTCDay() === 0 ? 7 : candidate.getUTCDay()
    const isDelivery =
      weekType === '5DAYS' ? (isoDow !== 6 && isoDow !== 7) : isoDow !== 7
    if (!isDelivery) continue
    if (daysAhead === 1) return 'tomorrow evening'
    // candidate is already aeShifted to represent the Dubai calendar day —
    // pin timeZone:'UTC' so SSR (UTC) and browser (Asia/Dubai) format the
    // same string instead of re-shifting in the runtime's local timezone.
    return `${candidate.toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} evening`
  }
  return 'your next delivery day'
}

// ── Today's delivery countdown ────────────────────────────────────────────────
// Deliberately imprecise — see ClientDashboard.computeCountdown for rationale.
// Rounded to the nearest hour with a "~" prefix; under 30 minutes we swap to
// "Arriving soon" so the user doesn't latch onto a minute-accurate ETA.
//
// Status gate: only Active subs actually have a delivery en route today, so
// every other status (Paused / Skipped / Scheduled / Ended / null) short-
// circuits to a static status-appropriate label. Without this, the hero
// would claim "Arriving in ~5 hours" for a paused or ended customer who
// will receive nothing tonight.
function computeCountdown(now: Date, subStatus: string | null): { label: string; urgent: boolean } {
  if (subStatus !== SUBSCRIPTION_STATUS.ACTIVE) {
    if (subStatus === SUBSCRIPTION_STATUS.PAUSED)    return { label: 'Plan paused — no delivery today', urgent: false }
    if (subStatus === SUBSCRIPTION_STATUS.SKIPPED)   return { label: 'Skipped today — back tomorrow', urgent: false }
    if (subStatus === SUBSCRIPTION_STATUS.SCHEDULED) return { label: 'Plan starts soon', urgent: false }
    return { label: 'No active plan', urgent: false }
  }

  const day = now.getDay(); const hour = now.getHours()
  if (day === 0) return { label: 'No delivery today', urgent: false }
  if (hour === 19) return { label: 'Arriving now', urgent: true }
  if (hour < 19) {
    const target = new Date(now); target.setHours(19, 0, 0, 0)
    const diff = target.getTime() - now.getTime()
    const totalMinutes = Math.floor(diff / 60_000)
    if (totalMinutes <= 30) return { label: 'Arriving soon', urgent: true }
    const hours = Math.max(1, Math.round(diff / 3_600_000))
    return { label: `Arriving in ~${hours} ${hours === 1 ? 'hour' : 'hours'}`, urgent: false }
  }
  return { label: 'Delivered today', urgent: false }
}

// ── Today's spotlight — full-width horizontal hero section ───────────────────
// Two-column split: photo left, dish details right. Photo is the "menu item"
// surface (not a portrait sticky), so the page reads as a catalog with today
// promoted to the top spot. Dish-name typography + edge accent borrow from
// the dashboard's HeroToday for cross-page cohesion.
const SPICE_LABELS = ['', 'Mild', 'Medium', 'Hot']

function TodaySpotlight({ meal, dorm, subStatus, resumedAfterCutoff = false, weekType = '6DAYS' }: {
  meal: WeekMeal | null
  dorm: string | null
  subStatus: string | null
  resumedAfterCutoff?: boolean
  weekType?: '5DAYS' | '6DAYS'
}) {
  const [ct, setCt] = useState(() => computeCountdown(new Date(), subStatus))

  useEffect(() => {
    setCt(computeCountdown(new Date(), subStatus))
    const t = setInterval(() => setCt(computeCountdown(new Date(), subStatus)), 30_000)
    return () => clearInterval(t)
  }, [subStatus])

  // Sunday or out-of-range — TIER1, not TIER_POP. TIER_POP is earned by
  // having data worth anchoring; an empty rest-day slot has nothing to
  // surface, so the card steps back to T1 (anchors the slot without
  // overclaiming). Operational days (Mon–Sat) earn TIER_POP below.
  if (!meal) {
    return (
      <div style={{
        ...TIER1,
        background: '#faf2dd',
        borderRadius: 'var(--radius-md)', padding: '56px 24px',
        textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <Moon size={28} strokeWidth={1.6} color={S.fgMuted} />
        <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg, lineHeight: 1.2 }}>Sunday — no delivery</div>
        <div style={{ fontFamily: BODY, fontSize: 13, color: S.fgMuted, lineHeight: 1.65 }}>
          Rest up. Next delivery Monday at 7 PM.
        </div>
      </div>
    )
  }

  // Resumed after kitchen cutoff (2 PM AE) — no meal was prepped tonight.
  // Step back to TIER1 with orange edge-wash so the card still anchors the
  // section without falsely implying something is on its way.
  if (resumedAfterCutoff) {
    const nextDelivery = nextDeliveryLabel(weekType)
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        style={{
          ...TIER1,
          background: `
            linear-gradient(105deg, rgba(245,127,32,0.11) 0%, rgba(245,127,32,0.06) 22%, rgba(245,127,32,0.025) 55%, rgba(245,127,32,0.01) 100%),
            var(--ds-surface-tier1)
          `,
          borderRadius: 'var(--radius-md)',
          padding: 'clamp(32px, 3.2vw, 48px) clamp(24px, 2.8vw, 40px)',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        {/* Visual anchor — same treatment as the Sunday rest-day card */}
        <Moon size={28} strokeWidth={1.6} color="rgba(200,148,23,0.80)" />
        <div style={{
          fontFamily: BODY, fontSize: 'clamp(24px, 2.2vw, 32px)',
          fontWeight: 700, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.01em',
        }}>
          No delivery tonight<span style={{ color: OG }}>.</span>
        </div>
        <p style={{
          margin: 0, fontFamily: BODY, fontSize: 14,
          color: S.fgMuted, lineHeight: 1.6, maxWidth: '52ch',
        }}>
          You resumed after the 2 PM kitchen cutoff — your first delivery is <strong style={{ fontWeight: 700, color: S.fg }}>{nextDelivery}</strong>, 7–8 PM.
        </p>
        <p style={{
          margin: 0, fontFamily: BODY, fontSize: 12,
          color: S.fgMuted, opacity: 0.60, lineHeight: 1.5, maxWidth: '52ch',
        }}>
          {"Tonight's meal slot has been moved to the end of your plan — nothing is lost."}
        </p>
      </motion.div>
    )
  }

  return (
    <div className="today-spotlight" style={{
      ...TIER_POP,
      borderRadius: 'var(--radius-md)', overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)',
      minHeight: 320,
    }}>
      {/* ── Left: dish name + description + macros + countdown ── */}
      <div style={{
        padding: 'clamp(24px, 2.6vw, 32px)',
        display: 'flex', flexDirection: 'column', gap: 16,
        justifyContent: 'center',
      }}>
        {/* Dish name — OG eyebrow + cream heading, period accent in OG */}
        <div>
          <Eyebrow color={OG}>Tonight&rsquo;s dish</Eyebrow>
          <h2 style={{
            margin: '8px 0 0 0',
            fontFamily: DISPLAY,
            fontSize: 'clamp(24px, 2.4vw, 36px)',
            fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em',
            color: TIER_POP_TEXT.primary,
          }}>
            {meal.dish}<span style={{ color: OG }}>.</span>
          </h2>
        </div>

        {meal.sub && (
          <p style={{
            margin: 0,
            fontFamily: BODY, fontSize: 13, fontWeight: 400,
            color: TIER_POP_TEXT.muted, lineHeight: 1.65, maxWidth: '54ch',
          }}>
            {meal.sub}
          </p>
        )}

        {/* Macro strip — inset dark shelf on the navy card. Cream hairline
            border + faint top-highlight give it the same "pressed shelf"
            depth as the light version, but tuned for a dark surface. */}
        <div style={{
          display: 'flex',
          borderRadius: 'var(--radius-sm)', overflow: 'hidden',
          border: '1px solid rgba(245,240,232,0.14)',
          boxShadow: 'inset 0 1px 0 rgba(245,240,232,0.10), inset 0 -1px 0 rgba(9,24,37,0.12)',
        }}>
          <div style={{ flex: 1, padding: '10px 0', textAlign: 'center', background: 'rgba(245,240,232,0.06)' }}>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: TIER_POP_TEXT.faint }}>Calories</div>
            <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: TIER_POP_TEXT.primary, fontFeatureSettings: '"tnum"', lineHeight: 1.2, marginTop: 4 }}>
              {meal.cal.toFixed(0)}<span style={{ fontSize: 11, fontWeight: 500, color: TIER_POP_TEXT.muted }}> kcal</span>
            </div>
          </div>
          <div style={{ width: 1, background: 'rgba(245,240,232,0.12)' }} />
          <div style={{ flex: 1, padding: '10px 0', textAlign: 'center', background: 'rgba(245,240,232,0.06)' }}>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: TIER_POP_TEXT.faint }}>Protein</div>
            <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: TIER_POP_TEXT.primary, fontFeatureSettings: '"tnum"', lineHeight: 1.2, marginTop: 4 }}>
              {meal.protein.toFixed(0)}<span style={{ fontSize: 11, fontWeight: 500, color: TIER_POP_TEXT.muted }}> g</span>
            </div>
          </div>
          {meal.heat > 0 && (
            <>
              <div style={{ width: 1, background: 'rgba(245,240,232,0.12)' }} />
              <div style={{ flex: 1, padding: '10px 0', textAlign: 'center', background: 'rgba(245,240,232,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: TIER_POP_TEXT.faint }}>Spice</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <HeatBar level={meal.heat} onDark />
                  <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: TIER_POP_TEXT.muted, textTransform: 'uppercase', letterSpacing: '0.10em' }}>{SPICE_LABELS[meal.heat]}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Live delivery countdown — urgent state keeps OG orange for the
            urgency signal; non-urgent recedes to cream tones. */}
        <div style={{
          padding: '11px 14px', borderRadius: 'var(--radius-sm)',
          background: ct.urgent ? 'rgba(245,127,32,0.14)' : 'rgba(245,240,232,0.07)',
          border: `1px solid ${ct.urgent ? 'rgba(245,127,32,0.35)' : 'rgba(245,240,232,0.14)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          transition: 'background 400ms, border-color 400ms',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Truck size={14} strokeWidth={1.9} color={ct.urgent ? OG : TIER_POP_TEXT.muted} />
            <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 700, color: ct.urgent ? OG : TIER_POP_TEXT.muted }}>
              {ct.label}
            </span>
          </div>
          {dorm && (
            <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: TIER_POP_TEXT.muted, background: 'rgba(245,240,232,0.10)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
              {dorm}
            </span>
          )}
        </div>
      </div>

      {/* ── Right: framed dish photo (padded inside the card, no edge bleed) ── */}
      <div style={{
        padding: 'clamp(16px, 1.6vw, 20px)',
        paddingLeft: 0,
        display: 'flex', alignItems: 'stretch',
      }}>
        <div style={{
          position: 'relative',
          flex: 1,
          minHeight: 240,
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #3a2418, #1e3a4f)',
        }}>
          {meal.image && (
            <Image
              src={meal.image}
              alt={meal.dish}
              fill
              sizes="(max-width: 900px) 100vw, 480px"
              style={{ objectFit: 'cover' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── WeekDayCard — single calendar cell, used for both this-week and next-week ─
// One component, three visual states (past / today / future) and two variants
// (full / preview). Variant: 'full' = TIER2 surface, full body (this-week).
// Variant: 'preview' = TIER3 surface, compact body (next-week) — physically
// half the visual weight so the eye reads "preview, not primary."
export type WeekDayState = 'past' | 'today' | 'future'
type WeekDayVariant = 'full' | 'preview'
// Reasons a day card might show "no delivery" treatment. All visually
// collapse into the same dim-card-with-moon-icon pattern; only the chip
// label differs so the customer reads the cause at a glance. Same family
// across past skips, today skips, future scheduled skips, and planned-
// pause-affected days — Refactoring UI's constrained scale.
export type NoDeliveryReason =
  | 'today-skipped'    // status === 'Skipped' OR resumed-after-cutoff (today)
  | 'past-skipped'     // past day, date is in skipped_dates ledger
  | 'future-skipped'   // future day, scheduled via Plan a Skip
  | 'pause-start'      // future day, customer's planned_pause_start date
  | 'in-pause'         // future day after planned_pause_start (open-ended)
  | 'plan-ends'        // future day past active sub's end_date AND no queued renewal
function WeekDayCard({ meal, dayLabel, state, variant = 'full', noDeliveryReason = null, onClick }: {
  meal: WeekMeal
  dayLabel: string
  state: WeekDayState
  variant?: WeekDayVariant
  // When set, the card renders in its dim "no delivery" state with a
  // reason-specific label. Replaces the previous boolean `isSkippedTonight`
  // — same default treatment, more granular reasons. Null = normal day.
  noDeliveryReason?: NoDeliveryReason | null
  onClick: () => void
}) {
  const isOff     = meal.tag === 'Off'
  const isToday   = state === 'today'
  const isPast    = state === 'past'
  const isPreview = variant === 'preview'
  // Any no-delivery reason strips today's focal treatment (no orange
  // border / pulse / Sparkles chip). Past-day reasons override the
  // "Delivered" chip with the right reason label.
  const hasNoDelivery = noDeliveryReason !== null
  const effectiveIsToday = isToday && !hasNoDelivery
  // 'plan-ends' is a structurally different no-delivery state from
  // skip/pause — those are operational pauses inside an active plan, this
  // is "no plan is cooking this dish for you, full stop." Per Norman's
  // Gulf of Evaluation: the system state must be visible at a glance, not
  // hidden behind a tiny chip while the dish photo still says "this is
  // yours." Drives the grayscale image, dimmer surface, lock overlay, and
  // bespoke chip below — the card has to LOOK inactive, not just labeled
  // inactive.
  const isPlanEnds = noDeliveryReason === 'plan-ends'

  // Surface tier — preview cards sit on TIER3 (flat, near-flush with the
  // page) so they recede behind the TIER2 this-week cards. Today gets bumped
  // to TIER1 (matches HeroToday + TodaySpotlight) so it visibly lifts off the
  // grid and reads as the focal moment of the row.
  const baseTier = effectiveIsToday ? TIER1 : hasNoDelivery ? TIER2 : isPreview ? TIER3 : TIER2

  // Veg / non-veg "spine" — vertical 3px (2px in preview) edge stripe on the
  // card's left side that lets the eye pre-attentively segment the grid into
  // veg / non-veg without reading the footer chip. Edge-stripe geometry is
  // intentionally different from today's perimeter ring, so the two cues
  // coexist on different planes. Suppressed on today (focal moment owns the
  // ornament) and off-day cards (no category). Colors come from MealTag's
  // existing palette so the spine and the chip below it always agree:
  //   veg → #1d8a30 (the leaf green already used by MealTag.Veg)
  //   non-veg → #a35100 (MealTag's non-veg fg/ember; deliberately *not*
  //     the bright OG orange, which is reserved for today's ring + the
  //     period accent so the two oranges never compete on the same card)
  const isVeg = meal.tag === 'Veg'
  const showSpine = !effectiveIsToday && !hasNoDelivery && !isOff
  const spineColor = isVeg ? '#1d8a30' : 'rgba(165,81,0,0.85)'
  const spineWidth = isPreview ? 2 : 3
  // Whisper hairline traced inside the photo's rounded corners — registers
  // only when the eye lands on the food, halos it in its category color.
  const imageRingColor = isVeg ? 'rgba(29,138,48,0.14)' : 'rgba(165,81,0,0.16)'

  // Per-variant spacing + type. Preview keeps tighter spacing than full but
  // brings the footer chips back so the card has enough body content to
  // reach a proportional height (~1:1.4 aspect, near golden ratio).
  const padImage       = isPreview ? '8px 8px 0'       : '10px 14px 0'
  const padHeader      = isPreview ? '10px 10px 0'     : '12px 14px 0'
  const padBody        = isPreview ? '8px 10px 10px'   : '10px 14px 14px'
  const dishFontSize   = isPreview ? 12 : 13
  // Both variants allow dish names to wrap to a second line. Preview cards
  // gain a touch more height for long names like "Moroccan Chicken Tagine
  // w/ Couscous", which keeps the card proportional rather than truncating.
  const dishClampLines = 2
  const dayFontSize    = isPreview ? 10 : 11
  const dateFontSize   = isPreview ? 10 : 11
  // Image aspect — full = 16:10 (consistent with TodaySpotlight + modal).
  // Preview = 4:3, taller image, food-forward, helps the card reach a
  // natural portrait-leaning proportion at narrow widths.
  const imageAspect    = isPreview ? '4 / 3' : '16 / 10'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isOff}
      data-state={noDeliveryReason ?? state}
      data-variant={variant}
      className="week-day-card"
      style={{
        ...baseTier,
        // Body color: warm cream (#faf2dd) for all this-week (full) cards —
        // pure white was harsh against the cream page background, the warm
        // tone reads more pleasant. Off-day cards stay muted gray.
        //
        // Preview (next-week) cards get a top-down orange "spotlight" wash
        // overlaid on white. The wash is concentrated at the top edge (where
        // the day label + image header sit) and fades to clean by mid-card.
        // Reads as anticipatory light from above — same brand vocabulary as
        // the hero's edge wash, anchored top-down so it doesn't copy the
        // hero verbatim. Energy without competing for the focal slot.
        background: isOff
          ? 'var(--ds-skeleton-base)'
          : isPlanEnds
            // Cool, desaturated gray-tan that sits visibly BELOW active
            // cream cards in the elevation hierarchy. Active = warm cream,
            // plan-ends = grayed-out cream — same temperature family but
            // drained of life. Reads as "inactive" instantly.
            ? 'rgba(225,220,210,0.62)'
            : isPreview
              ? `
                  linear-gradient(180deg, rgba(245,127,32,0.13) 0%, rgba(245,127,32,0.055) 28%, rgba(245,127,32,0.018) 60%, rgba(245,127,32,0) 100%),
                  var(--ds-surface2)
                `
              : 'var(--ds-week-card-bg, #faf2dd)',
        border: effectiveIsToday
          ? `2px solid rgba(245,127,32,0.32)`
          : isOff
            ? `1px solid ${S.border}`
            : isPlanEnds
              ? '1px dashed rgba(9,24,37,0.18)'  // dashed → "incomplete", not a solid commitment
              : (baseTier.border as string),
        // Plan-ends cards are non-affordances inside the active grid.
        // Reduce opacity overall so the eye reads "dimmed" before parsing
        // any specific element. 0.78 keeps text legible while the card
        // clearly recedes.
        opacity: isPlanEnds ? 0.78 : 1,
        // Today shadow stack (4 layers, painted top-to-bottom):
        //   • orange glow halo (animated by .today-pulse below — opacity
        //     breathes 0.14 ↔ 0.22 over 4s; this inline value is the resting
        //     mid-point used when prefers-reduced-motion disables animation)
        //   • static orange ring (4px ambient focus ring)
        //   • TIER1 neutral lift
        boxShadow: isOff
          ? 'none'
          : effectiveIsToday
            ? `0 8px 28px rgba(245,127,32,0.18), 0 0 0 4px rgba(245,127,32,0.10), ${TIER1.boxShadow}`
            : baseTier.boxShadow,
        borderRadius: 'var(--radius-md)',
        padding: 0,
        textAlign: 'left',
        cursor: isOff ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'inherit', color: 'inherit',
        overflow: 'hidden', position: 'relative', width: '100%',
        transition: 'transform 220ms cubic-bezier(.22,1,.36,1), box-shadow 220ms, border-color 220ms',
      }}
    >
      {/* Category spine — see comment above showSpine for rationale. Sits
          inside the card's overflow:hidden + rounded corners so the stripe
          gets clipped to the card's border radius automatically. */}
      {showSpine && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0, top: 0, bottom: 0,
            width: spineWidth,
            background: spineColor,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ── Cell header — three slots: day (left) · state cue (center) · date (right).
            State is icon + label, colored by semantic family:
              past   → green Check        "Delivered"
              today  → orange Sparkles    "Today"
              future → blue Clock         "Upcoming"
            All low-saturation (0.65–0.75 opacity) so the cue reads as data,
            not decoration. Off-day cells skip the state cue entirely. */}
      <div style={{
        padding: padHeader,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
      }}>
        <div style={{
          fontFamily: BODY, fontSize: dayFontSize, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: effectiveIsToday ? OG : isPast ? S.fgFaint : S.fgMuted,
          flexShrink: 0,
        }}>
          {dayLabel}
        </div>

        {!isOff && (() => {
          // No-delivery reasons override the past/today/future chip with a
          // reason-specific label. All share the Moon icon family +
          // muted-tan color so they read as a coherent "no meal" zone.
          // Pause reasons use a slightly cooler tone to differentiate from
          // skip reasons — Refactoring UI's hierarchy via subtle color shift.
          const noDeliveryConfig: Record<NoDeliveryReason, { Icon: typeof Moon; label: string; color: string }> = {
            'today-skipped':  { Icon: Moon, label: 'Not tonight',      color: 'rgba(140,110,60,0.70)' },
            'past-skipped':   { Icon: Moon, label: 'Skipped',          color: 'rgba(140,110,60,0.70)' },
            'future-skipped': { Icon: Moon, label: 'Skipped',          color: 'rgba(140,110,60,0.70)' },
            'pause-start':    { Icon: Moon, label: 'Pause begins',     color: 'rgba(30,58,79,0.75)'   },
            'in-pause':       { Icon: Moon, label: 'Paused',           color: 'rgba(30,58,79,0.70)'   },
            // Lock icon + "Renew to unlock" — pairs with the lock overlay
            // on the dish image. The chip closes the Gulf of Execution
            // (tells the user the path forward) while the image grayscale
            // closes the Gulf of Evaluation (shows the current state).
            'plan-ends':      { Icon: Lock, label: 'Renew to unlock',  color: 'rgba(90,84,72,0.78)'   },
          }
          const stateConfig = noDeliveryReason
            ? noDeliveryConfig[noDeliveryReason]
            : isPast
              ? { Icon: Check,    label: 'Delivered', color: 'rgba(29,138,48,0.75)' }
              : effectiveIsToday
              ? { Icon: Sparkles, label: 'Today',     color: OG }
              : { Icon: Clock,    label: 'Upcoming',  color: 'rgba(29,95,163,0.65)' }
          const { Icon, label, color } = stateConfig
          const chipFont = isPreview ? 10 : 11
          const chipIcon = isPreview ? 10 : 11
          return (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color, fontFamily: BODY,
              fontSize: chipFont, fontWeight: 600,
              minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap',
            }}>
              <Icon size={chipIcon} strokeWidth={2.2} />
              {label}
            </div>
          )
        })()}

        <div style={{
          fontFamily: BODY, fontSize: dateFontSize, fontWeight: 500,
          color: S.fgFaint,
          flexShrink: 0,
        }}>
          {meal.date}
        </div>
      </div>

      {/* ── Image — full = 16:10, preview = 4:3 (taller, food-forward). The
            variant-specific aspect lets preview cards reach a proportional
            ~1:1.4 outer aspect without forcing min-heights. ── */}
      <div style={{ padding: padImage }}>
        <div
          className="week-day-thumb"
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: imageAspect,
            background: 'linear-gradient(135deg, #3a2418, #1e3a4f)',
            overflow: 'hidden',
            borderRadius: 'var(--radius-sm)',
            boxShadow: showSpine ? `inset 0 0 0 1px ${imageRingColor}` : 'none',
          }}
        >
          {meal.image && !isOff ? (
            <Image
              src={meal.image}
              alt={meal.dish}
              fill
              sizes="(max-width: 600px) 100vw, (max-width: 1024px) 50vw, 33vw"
              style={{
                objectFit: 'cover',
                transition: 'transform 320ms cubic-bezier(.22,1,.36,1)',
                // The single strongest "this isn't yours" signal: grayscale
                // strips the appetizing colour from the dish. The eye reads
                // "inactive food" before reading any chip. Brightness drop
                // pushes it further toward the page background so it doesn't
                // compete with the warm active cards above/around it.
                filter: isPlanEnds ? 'grayscale(1) brightness(0.92)' : undefined,
              }}
            />
          ) : (
            <div aria-hidden style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.55,
            }}>
              {isOff
                ? <Moon size={isPreview ? 18 : 22} strokeWidth={1.6} color={CR} />
                : <Utensils size={isPreview ? 18 : 22} strokeWidth={1.6} color={CR} />}
            </div>
          )}

          {/* Lock overlay — only when plan-ends. Sits centered on the
              grayscale photo with a soft dark backdrop. Pairs with the
              "Renew to unlock" chip below so the icon and the chip
              vocabulary reinforce each other (Norman: consistent signifiers
              build the same mental model from two angles). */}
          {isPlanEnds && meal.image && !isOff && (
            <div aria-hidden style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(9,24,37,0.30)',
              pointerEvents: 'none',
            }}>
              <span style={{
                width: isPreview ? 32 : 38, height: isPreview ? 32 : 38,
                borderRadius: '50%',
                background: 'rgba(245,240,232,0.92)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(9,24,37,0.30)',
              }}>
                <Lock size={isPreview ? 14 : 16} strokeWidth={2.2} color="#091825" />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Body — dish name + meal-tag + spice. Both variants show the
            footer chips; preview just uses tighter spacing around them. ── */}
      <div style={{ padding: padBody, display: 'flex', flexDirection: 'column', gap: isPreview ? 6 : 8, flex: 1 }}>
        <div style={{
          fontFamily: BODY, fontSize: dishFontSize, fontWeight: 700,
          lineHeight: 1.2, color: S.fg, opacity: isOff ? 0.55 : 1,
          display: '-webkit-box', WebkitLineClamp: dishClampLines, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        } as React.CSSProperties}>
          {/* Period accent only on today — same brand signature used by
              HeroToday and the page header (`My menu.`). Suppressed when
              resumed-after-cutoff so the muted state reads cleanly. */}
          {meal.dish}{effectiveIsToday && <span style={{ color: OG }}>.</span>}
        </div>

        {!isOff && (
          <div style={{
            marginTop: 'auto',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            fontFamily: BODY,
          }}>
            <MealTag kind={meal.tag} compact />
            {meal.heat > 0 && (
              <HeatBar level={meal.heat} />
            )}
          </div>
        )}
      </div>
    </button>
  )
}

// ── Dish detail modal ─────────────────────────────────────────────────────────
function DishDetailModal({ meal, onClose }: { meal: WeekMeal; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'var(--ds-overlay-strong)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        style={{ background: BG, borderRadius: 'var(--radius-md)', padding: 32, maxWidth: 560, width: '100%', border: '1px solid var(--ds-og-border)', boxShadow: 'var(--ds-shadow-modal)', maxHeight: '90vh', overflow: 'auto' }}
      >
        {meal.image && (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 18, background: 'var(--ds-skeleton-base)' }}>
            <Image src={meal.image} alt={meal.dish} fill sizes="540px" style={{ objectFit: 'cover' }} />
          </div>
        )}
        <Eyebrow>{meal.day} · {meal.date}</Eyebrow>
        <div style={{ marginTop: 8, fontFamily: DISPLAY, fontSize: 28, fontWeight: 700, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.01em' }}>{meal.dish}</div>
        <div style={{ marginTop: 10, fontFamily: BODY, fontSize: 14, color: S.fgMuted, lineHeight: 1.65 }}>{meal.sub}</div>
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-surface2)', border: `1px solid ${S.border}` }}>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgMuted }}>Calories</div>
            <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 28, fontWeight: 700, color: S.fg, fontFeatureSettings: '"tnum"', lineHeight: 1, letterSpacing: '-0.02em' }}>{meal.cal.toFixed(0)}<span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 500, color: S.fgMuted, letterSpacing: 0 }}> kcal</span></div>
          </div>
          <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-surface2)', border: `1px solid ${S.border}` }}>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgMuted }}>Protein</div>
            <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 28, fontWeight: 700, color: S.fg, fontFeatureSettings: '"tnum"', lineHeight: 1, letterSpacing: '-0.02em' }}>{meal.protein.toFixed(0)}<span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 500, color: S.fgMuted, letterSpacing: 0 }}> g</span></div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <MealTag kind={meal.tag} />
          {meal.heat > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: BODY, fontSize: 11, color: S.fgMuted }}>
              Spice level <HeatBar level={meal.heat} />
            </span>
          )}
        </div>
        <button
          type="button" onClick={onClose}
          style={{ marginTop: 22, width: '100%', padding: '12px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ds-border-strong)', background: 'var(--ds-surface2)', color: S.fg, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
        >
          Close
        </button>
      </motion.div>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MenuClient({
  customer,
  activeSubscription,
  hasQueuedRenewal = false,
  menuData,
}: {
  customer: Customer | null
  activeSubscription?: ActiveSubLike | null
  userEmail?: string
  hasQueuedRenewal?: boolean
  menuData?: Dish[]
}) {
  // week_type: prefer the active sub's snapshot (canonical for this cycle).
  // Fall back to the customer's preference (relevant for users browsing
  // before their first checkout). Default 6DAYS as last resort.
  const weekType: '5DAYS' | '6DAYS' =
    (activeSubscription?.week_type === '5DAYS' || activeSubscription?.week_type === '6DAYS')
      ? activeSubscription.week_type
      : (customer?.week_type === '5DAYS' || customer?.week_type === '6DAYS')
        ? customer.week_type
        : '6DAYS'

  // Today's AE wall date — used both for the resume-after-cutoff check
  // and for classifying each WeekDayCard's "today / past / future" state
  // when comparing against ISO dates from skipped_dates / planned_pause_start.
  const todayAEIso = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // True when the customer resumed after the 2 PM kitchen cutoff today. The DB
  // column `resume_cutoff_date` is set by resumeSubscription and stale by
  // tomorrow — compare against today's AE date (UTC+4) for correctness.
  const resumedAfterCutoff = activeSubscription?.resume_cutoff_date === todayAEIso

  // Set-based lookup for the skip ledger so per-day classification is O(1).
  const skippedDateSet = new Set(activeSubscription?.skipped_dates ?? [])
  const plannedPauseStart = activeSubscription?.planned_pause_start ?? null
  const subIsCurrentlyPaused = activeSubscription?.status === SUBSCRIPTION_STATUS.PAUSED
  const subIsSkippedToday    = activeSubscription?.status === SUBSCRIPTION_STATUS.SKIPPED

  // Per-meal "no delivery" classifier — returns one of the five reasons
  // (today-skipped / past-skipped / future-skipped / pause-start / in-pause)
  // or null when the day is operationally normal. Precedence:
  //   1. Currently paused → every future day (incl. today) is "in-pause"
  //   2. Planned pause: start day vs in-range
  //   3. Skipped (today vs past vs future based on the day's relative state)
  // Off-days (Sunday / non-working) are caller-handled (already rendered as
  // 'Off' tag); this function isn't asked about those.
  function classifyNoDelivery(meal: WeekMeal, dayState: WeekDayState): NoDeliveryReason | null {
    if (meal.tag === 'Off') return null

    // Plan ends, no queued renewal — future days past the active sub's
    // end_date have nothing cooking for them. Show "Plan ends" instead of
    // teasing dishes the customer won't actually receive. Takes precedence
    // over the regular future/upcoming path; pause/skip checks below still
    // can't reach here because they're operational reasons that only apply
    // inside the active cycle (and pauses extend end_date, so they never
    // overlap with this case in practice).
    if (
      dayState === 'future'
      && !hasQueuedRenewal
      && activeSubscription?.end_date
      && meal.iso > activeSubscription.end_date
    ) {
      return 'plan-ends'
    }

    // Currently-paused sub: paint everything from today onward as "in-pause"
    // so the customer sees a clear paused zone on the menu page.
    if (subIsCurrentlyPaused && dayState !== 'past') {
      return 'in-pause'
    }

    // Planned pause (open-ended). The cron flips status to Paused on the
    // start date — but in the brief window before that, classification by
    // date still gives the correct picture.
    if (plannedPauseStart && meal.iso >= plannedPauseStart && dayState !== 'past') {
      return meal.iso === plannedPauseStart ? 'pause-start' : 'in-pause'
    }

    // Skip ledger membership. Past skips show as "Skipped" (overriding the
    // default "Delivered" chip), today's skip shows as "Not tonight" (or
    // sub.status === Skipped which mirrors the same kitchen-ops state).
    const inSkipLedger = skippedDateSet.has(meal.iso)
    if (dayState === 'today') {
      if (subIsSkippedToday || resumedAfterCutoff || inSkipLedger) return 'today-skipped'
      return null
    }
    if (dayState === 'past' && inSkipLedger) return 'past-skipped'
    if (dayState === 'future' && inSkipLedger) return 'future-skipped'
    return null
  }

  const vegDayNumbers = vegDayNumbersFor(
    customer?.meal_preference_type,
    activeSubscription?.veg_days,
    weekType,
  )

  // Top-of-page meta tag — for religious mix, "Mix" beats either Veg / Non Veg
  // because some days are veg, others aren't. For pure prefs, use the simple label.
  const mpt = customer?.meal_preference_type?.toLowerCase() ?? ''
  const isReligious = mpt.includes('religious')
  const isVegPref   = mpt.includes('plant') || (mpt.includes('veg') && !mpt.includes('non'))
  const prefTag: 'Veg' | 'Non Veg' | 'Mix' = isReligious ? 'Mix' : (isVegPref ? 'Veg' : 'Non Veg')
  const FULL_MENU = buildFullMenu(vegDayNumbers, weekType, menuData)
  const thisWeek  = FULL_MENU[0]
  const nextWeek  = FULL_MENU[1]

  // todayMonIdx() returns 6 on Sunday — no card in the 0-5 range gets highlighted,
  // and todayMeal is null so TodaySpotlight shows the rest-day state.
  const thisTodayIdx = todayMonIdx()
  const todayMeal    = thisTodayIdx < 6 ? thisWeek.meals[thisTodayIdx] : null

  const [openMeal, setOpenMeal] = useState<WeekMeal | null>(null)
  const router = useRouter()
  const [, startNavTransition] = useTransition()
  const navTo = (href: string) => startNavTransition(() => router.push(href))

  // Per-card click router. Plan-ends cards short-circuit the dish detail
  // modal and route straight to the renew flow — the card's visual signals
  // (grayscale image, lock overlay, "Renew to unlock" chip) already promise
  // this destination, so the click pays off the promise. Subtle = the
  // affordance is already there; we just rewire what it does.
  function clickFor(meal: WeekMeal, reason: NoDeliveryReason | null) {
    if (reason === 'plan-ends') return () => navTo('/dashboard/explore-plans')
    return () => setOpenMeal(meal)
  }

  const DAY_ABBREVS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  // ── Mobile cell data — same classification the desktop grid uses, flattened
  //    to plain props for the presentational MobileMenu (≤768). ──
  const thisWeekCells: MobileMenuCell[] = thisWeek.meals.slice(0, 6).map((meal, i) => {
    const state: WeekDayState = i < thisTodayIdx ? 'past' : i === thisTodayIdx ? 'today' : 'future'
    return { meal, dayLabel: DAY_ABBREVS[i], state, reason: classifyNoDelivery(meal, state) }
  })
  const nextWeekCells: MobileMenuCell[] = nextWeek.meals.slice(0, 6).map((meal, i) => ({
    meal, dayLabel: DAY_ABBREVS[i], state: 'future' as WeekDayState, reason: classifyNoDelivery(meal, 'future'),
  }))

  return (
    <>
      <div className="menu-desktop" style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: S.fg }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: S.fg }}>
            My menu<span style={{ color: OG }}>.</span>
          </div>
          <div style={{ marginTop: 10, fontFamily: BODY, fontSize: 14, color: S.fgMuted, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Your preference:</span>
            <MealTag kind={prefTag} />
            {/* Change link routes the customer to Profile, where the
                Edit-Preferences modal queues changes for the next plan
                while the current cycle keeps cooking as before. No mid-
                cycle "locked" copy here — the modal already explains
                the timing. */}
            <Link href="/dashboard/profile" style={{ color: S.fgSub, fontSize: 12, fontWeight: 600, textDecoration: 'underline', textDecorationColor: 'var(--ds-fg-tint)', textUnderlineOffset: 3 }}>
              Change
            </Link>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Delivered 7–8 PM · Sunday off</span>
          </div>
        </div>

        {/* ── Section 1: Today (full-width hero) ── */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eyebrow>{resumedAfterCutoff ? 'Tonight' : "Today's delivery"}</Eyebrow>
            <div style={{ flex: 1, height: 1, background: S.border }} />
          </div>
          <TodaySpotlight
            meal={todayMeal}
            dorm={customer?.dorm_name ?? null}
            subStatus={activeSubscription?.status ?? null}
            resumedAfterCutoff={resumedAfterCutoff}
            weekType={weekType}
          />
        </section>

        {/* ── Section 2: This week (6-cell grid) ── */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eyebrow>This week</Eyebrow>
            <div style={{ flex: 1, height: 1, background: S.border }} />
          </div>
          <div className="this-week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {thisWeek.meals.slice(0, 6).map((meal, i) => {
              const state: WeekDayState =
                i < thisTodayIdx  ? 'past'
                : i === thisTodayIdx ? 'today'
                : 'future'
              const noDeliveryReason = classifyNoDelivery(meal, state)
              return (
                <WeekDayCard
                  key={i}
                  meal={meal}
                  dayLabel={DAY_ABBREVS[i]}
                  state={state}
                  noDeliveryReason={noDeliveryReason}
                  onClick={clickFor(meal, noDeliveryReason)}
                />
              )
            })}
          </div>
        </section>

        {/* ── Section 3: Next week (open by default — no accordion) ── */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eyebrow>Next week</Eyebrow>
            <div style={{ flex: 1, height: 1, background: S.border }} />
          </div>
          {/* 6-cell preview strip — same component as this-week, but variant
              "preview" → TIER3 surface, compact body, no footer chips. The
              6-column density (vs this-week's 3-col) does most of the
              hierarchy work; the surface + size changes finish it. */}
          <div className="menu-week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
            {nextWeek.meals.slice(0, 6).map((meal, i) => {
              const noDeliveryReason = classifyNoDelivery(meal, 'future')
              return (
                <WeekDayCard
                  key={i}
                  meal={meal}
                  dayLabel={DAY_ABBREVS[i]}
                  state="future"
                  variant="preview"
                  noDeliveryReason={noDeliveryReason}
                  onClick={clickFor(meal, noDeliveryReason)}
                />
              )
            })}
          </div>
        </section>

        {/* ── Dish detail modal ── */}
        <AnimatePresence>
          {openMeal && <DishDetailModal meal={openMeal} onClose={() => setOpenMeal(null)} />}
        </AnimatePresence>

      </div>
    </div>{/* /.menu-desktop */}

      {/* ── Mobile (≤768) — the redesigned single-screen /menu. ── */}
      <div className="menu-mobile">
        <MobileMenu
          prefTag={prefTag}
          todayMeal={todayMeal}
          dorm={customer?.dorm_name ?? null}
          subStatus={activeSubscription?.status ?? null}
          resumedAfterCutoff={resumedAfterCutoff}
          nextDeliveryLabel={nextDeliveryLabel(weekType)}
          thisWeekCells={thisWeekCells}
          nextWeekCells={nextWeekCells}
          onRenew={() => navTo('/dashboard/explore-plans')}
        />
      </div>

      <style>{`
        /* Mobile (≤768) swaps the desktop /menu tree for MobileMenu. Pure CSS
           toggle — no flash, desktop intact. */
        .menu-mobile { display: none; }
        @media (max-width: 768px) {
          .menu-desktop { display: none; }
          .menu-mobile { display: block; }
        }
        .mobile-menu-peek::-webkit-scrollbar { display: none; }
        .mobile-menu-peek { scrollbar-width: none; }

        /* Today spotlight stacks vertical on narrow viewports.
           Image (now :last-child) goes BELOW the text and gains side padding so
           it sits framed inside the card — same treatment as desktop. */
        @media (max-width: 768px) {
          .today-spotlight { grid-template-columns: 1fr !important; }
          .today-spotlight > div:last-child {
            padding-left: clamp(16px, 1.6vw, 20px) !important;
            padding-top: 0 !important;
          }
          .today-spotlight > div:last-child > div { aspect-ratio: 16 / 10; min-height: 0 !important; }
        }
        /* This-week (full cards) — 3-col → 2-col → 1-col */
        @media (max-width: 640px) {
          .this-week-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 420px) {
          .this-week-grid { grid-template-columns: 1fr !important; }
        }
        /* Next-week (preview strip) — 6-col → 4-col → 3-col → 2-col.
           Stays denser than this-week at every breakpoint to preserve the
           visual hierarchy the variant is supposed to communicate. */
        @media (max-width: 1024px) {
          .menu-week-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .menu-week-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 420px) {
          .menu-week-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }

        /* Card hover lift — same vocabulary across all WeekDayCards.
           Past cards still lift on hover (positive past, fully interactive). */
        .week-day-card:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: var(--ds-shadow-elev) !important;
          border-color: var(--ds-og-border) !important;
        }
        .week-day-card[data-state="today"]:not(:disabled):hover {
          box-shadow: 0 10px 26px rgba(245,127,32,0.20), 0 0 0 4px rgba(245,127,32,0.12) !important;
          animation-play-state: paused;
        }
        .week-day-card:not(:disabled):hover .week-day-thumb img { transform: scale(1.04); }

        /* Today's "alive" state — orange glow halo gently breathes (4s cycle,
           ease-in-out) layered with the static ambient ring + tier-1 lift.
           Brand-orange shadow stays the same in both themes; the underlying
           depth shadow swaps to the theme's tier-1 shadow variable so the
           cell sits properly against either palette. Disabled for users who
           prefer reduced motion. */
        @keyframes today-pulse {
          0%, 100% {
            box-shadow:
              0 8px 28px rgba(245,127,32,0.14),
              0 0 0 4px rgba(245,127,32,0.10),
              var(--ds-shadow-tier1);
          }
          50% {
            box-shadow:
              0 10px 32px rgba(245,127,32,0.24),
              0 0 0 4px rgba(245,127,32,0.10),
              var(--ds-shadow-tier1);
          }
        }
        .week-day-card[data-state="today"]:not(:disabled) {
          animation: today-pulse 4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .week-day-card[data-state="today"]:not(:disabled) {
            animation: none;
          }
        }
      `}</style>
    </>
  )
}
