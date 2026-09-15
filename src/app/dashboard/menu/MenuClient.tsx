'use client'

import { useEffect, useState, useTransition, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Image, { StaticImageData } from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Truck, Moon, Utensils, Check, Sparkles, Lock } from 'lucide-react'
import { MENU_DATA, getMenuWeek, dishObjectPosition, type Dish } from '@/contexts/menu/domain/catalog-data'

import { OG, OG_DEEP, CR, BG, BODY, S, TIER1, TIER2, TIER3, TIER_POP, TIER_POP_TEXT } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'
import { MealTag } from '../_shared/MealTag'
import { vegDayNumbersFor, preferenceKindFor, resolveVegDayNames } from '@/contexts/subscriptions/domain/veg-day'
import { HeatBar } from '../_shared/HeatBar'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { MobileMenu, type MobileMenuCell } from '../_mobile/MobileMenu'
import { COMPACT } from '../_shared/breakpoints'
import { spotlightFor, spotlightCopy, spotlightEyebrow, restDayCopy, type Spotlight } from '../_shared/menu-spotlight'
import {
  classifyMenuDay, dayPosition, lastDinnerIso, noDeliveryNote, planEndingNotice, deliveryDayLabel, renewGateFor,
  type MenuDayContext, type MenuPlan, type NoDeliveryReason, type RenewGate,
} from '../_shared/menu-day-status'
import { reasonChip, lastDinnerChip, GREY_CARD_BG, GREY_PHOTO_FILTER } from '../_shared/menu-reason-chip'

// DISPLAY alias kept for readability — same font as BODY (single typeface).
const DISPLAY = BODY

// ── Data types ────────────────────────────────────────────────────────────────
interface Customer {
  id: string; cid?: string | null; name?: string | null; email?: string | null
  meal_preference_type?: string | null; dorm_name?: string | null; created_at: string
  week_type?: '5DAYS' | '6DAYS' | null
  // Saved religious-mix veg days — the menu's only source before a first plan.
  veg_days?: string[] | null
}

interface ActiveSubLike {
  week_type?: '5DAYS' | '6DAYS' | null
  veg_days?: string[] | null
  // Gates the hero's "Arriving in ~Nh" countdown — only Active subs are
  // actually being delivered today; Paused/Skipped/Scheduled/Ended/null swap
  // in a static status label so the hero never claims a delivery is en
  // route when nothing is being cooked for the user.
  status?: string | null
  // First delivery day of a Scheduled sub. Every day before it is "pre-start"
  // in the week grid instead of the calendar default (which read "Delivered").
  start_date?: string | null
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
  // Skipped days paid back as wallet credit (season wind-down). Carried into
  // MenuPlan so the day notes stop promising a make-up day.
  credited_skip_dates?: string[] | null
  // AE wall date when a pre-scheduled pause should activate. Days from
  // this date onward render as "Paused" on the weekly grid. The start
  // day gets a "Pause begins" label so the customer can see exactly when
  // their planned pause kicks in.
  planned_pause_start?: string | null
  // ISO end_date of the active sub. Used together with the queuedSub flag
  // to dim out-of-plan future days as "Plan ends" when no renewal is queued.
  end_date?: string | null
  // AE wall dates the pause tick recorded (plus a late resume's own day).
  // Past paused days read "Paused", not "Delivered".
  paused_dates?: string[] | null
  plan_name?: string | null
  // The plan's own diet — wins over the customer's (veg-day.ts).
  meal_preference_type?: string | null
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
  /** Where the bowl sits in the photo — see Dish.frame. Positions every cropped box. */
  frame: [number, number] | null
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
        frame: isOff ? null : dish?.frame ?? null,
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

// The page's plan rows arrive loosely typed (select('*') and preview
// fixtures). The day rules need a start and an end date to say anything, so
// a row without them counts as no plan.
function toMenuPlan(sub: ActiveSubLike | null | undefined): MenuPlan | null {
  if (!sub?.start_date || !sub.end_date) return null
  return { ...sub, status: sub.status ?? null, start_date: sub.start_date, end_date: sub.end_date }
}

const RENEW_OPEN_GATE = { intakePaused: false, outOfZone: false, profileIncomplete: false }

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

  // Asia/Dubai is UTC+4 year-round. Derive the AE wall day/hour/minute from
  // the epoch via getUTC* — never now.getHours()/getDay(), which read the
  // runtime's local zone. The local read both misreported the Dubai delivery
  // clock for customers in other timezones AND diverged between the server
  // (UTC) and the browser, breaking SSR hydration on this countdown text.
  const ae = new Date(now.getTime() + 4 * 60 * 60 * 1000)
  const day = ae.getUTCDay(); const hour = ae.getUTCHours(); const minute = ae.getUTCMinutes()
  if (day === 0) return { label: 'No delivery today', urgent: false }
  if (hour === 19) return { label: 'Arriving now', urgent: true }
  if (hour < 19) {
    const minutesToTarget = (19 - hour) * 60 - minute
    if (minutesToTarget <= 30) return { label: 'Arriving soon', urgent: true }
    const hours = Math.max(1, Math.round(minutesToTarget / 60))
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

// Shared shell for the "nothing arrives tonight" spotlight family (resumed
// after cutoff, paused, scheduled, no plan). TIER1 with the orange edge-wash
// so the card still anchors the section without implying a delivery.
const NOTICE_BODY: CSSProperties = { margin: 0, fontFamily: BODY, fontSize: 14, color: S.fgMuted, lineHeight: 1.6, maxWidth: '52ch' }
const NOTICE_FOOT: CSSProperties = { margin: 0, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5, maxWidth: '60ch' }
const NOTICE_LINK: CSSProperties = { appearance: 'none', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: BODY, fontSize: 12, fontWeight: 700, color: OG, letterSpacing: '0.04em' }
const NOTICE_CTA: CSSProperties = { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '10px 18px', borderRadius: 999, background: OG, color: '#fff', textDecoration: 'none', fontFamily: BODY, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }

function SpotlightNotice({ headline, children }: { headline: string; children: ReactNode }) {
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
        {headline}<span style={{ color: OG }}>.</span>
      </div>
      {children}
    </motion.div>
  )
}

const ENDING_LINE: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 16px', marginBottom: 20, borderRadius: 'var(--radius-sm)', background: 'rgba(245,127,32,0.07)', border: '1px solid rgba(245,127,32,0.22)' }

// Renew, the way the dashboard's plan card does it: open → the same plan,
// preselected; blocked → a grey pill with the reason; season → a note.
function RenewControl({ renew, label = 'Renew →', onDark = false }: { renew: RenewGate; label?: string; onDark?: boolean }) {
  if (renew.kind === 'season') {
    return <span style={{ fontFamily: BODY, fontSize: 12.5, lineHeight: 1.5, color: onDark ? TIER_POP_TEXT.muted : S.fgMuted, maxWidth: '48ch' }}>{renew.note}</span>
  }
  if (renew.kind === 'blocked') {
    return (
      <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span title={renew.reason} aria-disabled="true" style={{ ...NOTICE_CTA, marginTop: 0, background: 'var(--ds-fg-tint)', color: 'rgba(255,255,255,0.85)', cursor: 'not-allowed' }}>{label}</span>
        <span style={{ fontFamily: BODY, fontSize: 12, color: onDark ? TIER_POP_TEXT.muted : S.fgMuted }}>{renew.reason}</span>
      </span>
    )
  }
  return <Link href={renew.href} style={{ ...NOTICE_CTA, marginTop: 0 }}>{label}</Link>
}

function TodaySpotlight({ meal, dorm, spotlight, ctx, planName, renew, onOpenDish }: {
  meal: WeekMeal | null
  dorm: string | null
  /** Which card tonight gets — decided in _shared/menu-spotlight.ts. */
  spotlight: Spotlight
  ctx: MenuDayContext
  planName: string | null
  renew: RenewGate
  /** Opens the dish modal from the status card's footnote. */
  onOpenDish?: () => void
}) {
  // Only the dinner ticket counts down; every other card is static.
  const [ct, setCt] = useState(() => computeCountdown(new Date(), SUBSCRIPTION_STATUS.ACTIVE))

  useEffect(() => {
    setCt(computeCountdown(new Date(), SUBSCRIPTION_STATUS.ACTIVE))
    const t = setInterval(() => setCt(computeCountdown(new Date(), SUBSCRIPTION_STATUS.ACTIVE)), 30_000)
    return () => clearInterval(t)
  }, [])

  // Rest day (Sunday, or Saturday on a 5-day plan) — TIER1, not TIER_POP: an
  // empty slot has nothing to anchor. The next delivery it names is the real
  // one, with skips, closures and pauses stepped over — or none at all.
  if (spotlight.kind === 'rest' || !meal) {
    const copy = restDayCopy(ctx)
    return (
      <div style={{
        ...TIER1,
        background: '#faf2dd',
        borderRadius: 'var(--radius-md)', padding: '56px 24px',
        textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <Moon size={28} strokeWidth={1.6} color={S.fgMuted} />
        <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg, lineHeight: 1.2 }}>{copy.headline}</div>
        <div style={{ fontFamily: BODY, fontSize: 13, color: S.fgMuted, lineHeight: 1.65 }}>{copy.body}</div>
      </div>
    )
  }

  // Nothing arrives tonight — kitchen closed, resumed late, skipped, paused,
  // not started, ended or no plan. The dinner ticket (TONIGHT eyebrow, macros,
  // countdown) would claim the opposite of the grey card below it, so the dish
  // drops to a footnote.
  if (spotlight.kind !== 'dinner') {
    const copy = spotlightCopy(spotlight, ctx)
    const showDish = spotlight.kind !== 'closure' && spotlight.kind !== 'resumed-late'
    return (
      <SpotlightNotice headline={copy.headline}>
        <p style={NOTICE_BODY}>{copy.body}</p>
        {showDish && (
          <p style={{ ...NOTICE_FOOT, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>On the menu tonight: <strong style={{ fontWeight: 700, color: S.fg }}>{meal.dish}</strong></span>
            {onOpenDish && <button type="button" onClick={onOpenDish} style={NOTICE_LINK}>View dish →</button>}
          </p>
        )}
        {spotlight.kind === 'none' && <Link href="/dashboard/explore-plans" style={NOTICE_CTA}>Explore plans →</Link>}
        {spotlight.kind === 'ended' && <RenewControl renew={renew} label="Renew plan →" />}
        {spotlight.kind === 'paused' && ctx.plan?.status === SUBSCRIPTION_STATUS.PAUSED && (
          <Link href="/dashboard" style={NOTICE_CTA}>Resume plan →</Link>
        )}
      </SpotlightNotice>
    )
  }

  const lastDinner = spotlight.lastDinner

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
            {/* Live countdown — value is intentionally time-dependent, so the
                ~1s gap between SSR and hydration can legitimately produce a
                different minute/hour label. suppressHydrationWarning is React's
                sanctioned escape hatch for exactly this. */}
            <span suppressHydrationWarning style={{ fontFamily: BODY, fontSize: 12, fontWeight: 700, color: ct.urgent ? OG : TIER_POP_TEXT.muted }}>
              {ct.label}
            </span>
          </div>
          {dorm && (
            <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: TIER_POP_TEXT.muted, background: 'rgba(245,240,232,0.10)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
              {dorm}
            </span>
          )}
        </div>

        {/* Last dinner of the plan with nothing queued — the week below locks after tonight. */}
        {lastDinner && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: BODY, fontSize: 13, color: TIER_POP_TEXT.primary, lineHeight: 1.5 }}>
              Last dinner of your <strong style={{ color: OG, fontWeight: 700 }}>{planName ?? 'plan'}</strong>.
            </span>
            <RenewControl renew={renew} onDark />
          </div>
        )}
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
              style={{ objectFit: 'cover', objectPosition: dishObjectPosition(meal.frame, 1.6) }}
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
// Why a day's dinner won't reach the customer: _shared/menu-day-status.ts.
function WeekDayCard({ meal, dayLabel, state, variant = 'full', noDeliveryReason = null, noPlan = false, renewKind = 'open', isLastDinner = false, onClick }: {
  meal: WeekMeal
  dayLabel: string
  /** No subscription at all: the calendar pills (Delivered / Tonight) would
   *  claim meals a plan-less customer never received, so the card shows the
   *  dish and the date only. */
  noPlan?: boolean
  /** Whether renewing unlocks the days after the plan — 'season' makes them "Semester break", no lock. */
  renewKind?: RenewGate['kind']
  /** The plan's end date: the one card that says "Last dinner". */
  isLastDinner?: boolean
  state: WeekDayState
  variant?: WeekDayVariant
  // When set, the card renders in its dim "no delivery" state with a
  // reason-specific label. Null = normal day.
  noDeliveryReason?: NoDeliveryReason | null
  onClick: () => void
}) {
  const isOff     = meal.tag === 'Off'
  const isToday   = state === 'today'
  const isPast    = state === 'past'
  const isPreview = variant === 'preview'
  const isVeg     = meal.tag === 'Veg'
  // Any no-delivery reason strips tonight's focal treatment (no orange ring
  // or pulse, no Tonight pill). Past-day reasons replace "Delivered".
  const hasNoDelivery = noDeliveryReason !== null
  // No plan at all: nothing is arriving tonight, so today gets no focal ring.
  const effectiveIsToday = isToday && !hasNoDelivery && !noPlan
  // Every day whose dinner won't reach the customer goes grey — photo
  // drained, surface dropped — so a paused or skipped week reads as inactive
  // at a glance. The lock stays for the one grey a renewal undoes: days after
  // the plan — except over the semester break, when new plans are closed.
  const isGrey = hasNoDelivery
  const isPlanEnds = noDeliveryReason === 'plan-ends' && renewKind !== 'season'

  // Surface tier — preview cards sit on TIER3 (flat, near-flush with the
  // page) so they recede behind the TIER2 this-week cards. Tonight is bumped
  // to TIER1 (matches TodaySpotlight) so it lifts off the grid.
  const baseTier = effectiveIsToday ? TIER1 : hasNoDelivery ? TIER2 : isPreview ? TIER3 : TIER2

  // The card is built photo first: the photo runs edge to edge and is clipped
  // by the card's own corners, so there is no mat to keep concentric. On the
  // photo sit two pills — the day-and-date stamp (the same frosted pill the
  // mobile hero wears) and, only when it says something, the status. Below
  // it, two lines: the dish as the headline and one meta line in words.
  // Radius is card-local: this-week cards are twice the width of next-week
  // cards, and one shared value read round on the small ones and square on
  // the big ones.
  const cardRadius     = isPreview ? 18 : 24
  const imageAspect    = isPreview ? '4 / 3' : '16 / 10'
  const boxAspect      = isPreview ? 4 / 3 : 1.6
  const pillInset      = isPreview ? 8 : 12
  const pillFont       = isPreview ? 9.5 : 10.5
  const pillPad        = isPreview ? '4px 8px' : '5px 10px'
  const padBody        = isPreview ? '10px 12px 12px' : '14px 16px 16px'
  const dishFontSize   = isPreview ? 12.5 : 16
  const metaFontSize   = isPreview ? 11 : 12
  const dishClampLines = 2
  // Next-week pills are narrow: the stamp keeps the day and the number only.
  const dayNumber = Number(meal.iso.slice(8, 10))

  // Status — only when it tells the customer something: Delivered, Tonight,
  // Last dinner, or why a dinner won't come. A plain card with a full-colour
  // photo is a dinner that is coming; a row of "Upcoming" said nothing.
  // No plan: no pill, since Delivered / Tonight would claim meals a plan-less
  // customer never received. Label table shared with the mobile cards
  // (_shared/menu-reason-chip.ts).
  const status = (() => {
    if (isOff || noPlan) return null
    if (noDeliveryReason) return reasonChip(noDeliveryReason, renewKind)
    if (isLastDinner) return lastDinnerChip(state)
    if (isPast) return { Icon: Check, label: 'Delivered', color: 'rgba(29,138,48,0.80)' }
    if (effectiveIsToday) return { Icon: Sparkles, label: 'Tonight', color: OG }
    return null
  })()
  // Tonight is the one status that fills in brand orange; every other pill
  // is cream with the status's own colour, so reasons stay in their families.
  const statusFilled = status?.label === 'Tonight'

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
        background: isOff
          ? 'var(--ds-skeleton-base)'
          : isGrey
            // Cool, desaturated gray-tan that sits visibly BELOW active
            // cream cards in the elevation hierarchy — same temperature
            // family, drained of life.
            ? GREY_CARD_BG
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
        opacity: isPlanEnds ? 0.78 : 1,
        // Tonight's shadow stack: orange glow halo (breathes via .today-pulse
        // below), static orange ring, TIER1 neutral lift.
        boxShadow: isOff
          ? 'none'
          : effectiveIsToday
            ? `0 8px 28px rgba(245,127,32,0.18), 0 0 0 4px rgba(245,127,32,0.10), ${TIER1.boxShadow}`
            : baseTier.boxShadow,
        borderRadius: cardRadius,
        padding: 0,
        textAlign: 'left',
        cursor: isOff ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'inherit', color: 'inherit',
        overflow: 'hidden', position: 'relative', width: '100%',
        // Safari lets the hover zoom poke square corners out of a rounded
        // overflow clip unless the card is its own stacking context.
        isolation: 'isolate',
        transition: 'transform 220ms cubic-bezier(.22,1,.36,1), box-shadow 220ms, border-color 220ms',
      }}
    >
      {/* ── Photo, edge to edge — full = 16:10, preview = 4:3 (taller,
            food-forward, so the narrow cards keep a portrait proportion).
            The bowl is positioned from the dish's measured frame so its rim
            stays clear of the top edge on every photo. ── */}
      <div
        className="week-day-thumb"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: imageAspect,
          background: 'linear-gradient(135deg, #3a2418, #1e3a4f)',
          overflow: 'hidden',
          flexShrink: 0,
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
              objectPosition: dishObjectPosition(meal.frame, boxAspect),
              transition: 'transform 320ms cubic-bezier(.22,1,.36,1)',
              // The single strongest "this isn't yours" signal: grayscale
              // strips the appetizing colour from the dish.
              filter: isGrey ? GREY_PHOTO_FILTER : undefined,
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

        {/* Lock overlay — only when plan-ends. Pairs with the "Renew to
            unlock" pill so the icon and the label reinforce each other. */}
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

        {/* Day-and-date stamp — one fact, one pill. */}
        <span style={{
          position: 'absolute', top: pillInset, left: pillInset,
          display: 'inline-flex', alignItems: 'baseline', gap: 6,
          padding: pillPad, borderRadius: 'var(--radius-pill)',
          background: 'rgba(9,24,37,0.55)', color: '#fff',
          fontFamily: BODY, fontSize: pillFont, fontWeight: 700,
          letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1.2,
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          pointerEvents: 'none',
        }}>
          {dayLabel}
          <span style={{ fontWeight: 500, opacity: 0.8, letterSpacing: '0.08em' }}>
            {isPreview ? dayNumber : meal.date}
          </span>
        </span>

        {status && (
          <span style={{
            position: 'absolute', top: pillInset, right: pillInset,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: pillPad, borderRadius: 'var(--radius-pill)',
            background: statusFilled ? OG : 'rgba(252,248,238,0.92)',
            color: statusFilled ? '#fff' : status.color,
            boxShadow: statusFilled ? 'none' : '0 1px 2px rgba(9,24,37,0.12)',
            fontFamily: BODY, fontSize: pillFont, fontWeight: 700,
            letterSpacing: '0.06em', lineHeight: 1.2, whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            <status.Icon size={pillFont} strokeWidth={2.2} />
            {status.label}
          </span>
        )}
      </div>

      {/* ── Body — the dish is the headline; below it one line says the diet
            and the spice in words, with the diet's mark so a mixed week still
            segments at a glance. ── */}
      <div style={{ padding: padBody, display: 'flex', flexDirection: 'column', gap: isPreview ? 6 : 8, flex: 1 }}>
        <div style={{
          fontFamily: BODY, fontSize: dishFontSize, fontWeight: 700,
          lineHeight: 1.25, letterSpacing: isPreview ? undefined : '-0.01em',
          color: S.fg, opacity: isOff ? 0.55 : 1,
          display: '-webkit-box', WebkitLineClamp: dishClampLines, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        } as React.CSSProperties}>
          {meal.dish}
        </div>

        {!isOff && (
          <div style={{
            marginTop: 'auto', minWidth: 0,
            display: 'flex', alignItems: 'center', gap: isPreview ? 6 : 8,
            fontFamily: BODY, fontSize: metaFontSize, fontWeight: 600, color: S.fgSub,
            whiteSpace: 'nowrap',
          }}>
            {/* Diet word in its family colour (OG_DEEP for small orange text — OG
                itself is under AA on cream) with MealTag's mark. */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: isVeg ? 'var(--ds-success-fg)' : OG_DEEP }}>
              <span aria-hidden style={{
                width: 7, height: 7, borderRadius: 2, flexShrink: 0,
                background: isVeg ? 'transparent' : OG,
                boxShadow: isVeg ? 'inset 0 0 0 1.5px var(--ds-success-fg)' : 'none',
              }} />
              {isVeg ? 'Veg' : 'Non-veg'}
            </span>
            {meal.heat > 0 && (
              <>
                <span aria-hidden style={{ color: 'var(--ds-fg-tint)' }}>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                  {SPICE_LABELS[meal.heat]}
                  <HeatBar level={meal.heat} />
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

// ── Dish detail modal ─────────────────────────────────────────────────────────
function DishDetailModal({ meal, note = null, onClose }: { meal: WeekMeal; note?: string | null; onClose: () => void }) {
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
        {/* Why this dinner won't come — first thing read, before the photo sells it. */}
        {note && (
          <div role="note" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-surface2)', border: `1px solid ${S.border}`, fontFamily: BODY, fontSize: 13, color: S.fgSub, lineHeight: 1.5 }}>
            <Moon size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
            <span>{note}</span>
          </div>
        )}
        {meal.image && (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 18, background: 'var(--ds-skeleton-base)' }}>
            <Image src={meal.image} alt={meal.dish} fill sizes="540px" style={{ objectFit: 'cover', objectPosition: dishObjectPosition(meal.frame, 1.6) }} />
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
              {SPICE_LABELS[meal.heat]} <HeatBar level={meal.heat} />
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
  closureDates = [],
  endedPlan = null,
  renewGate = RENEW_OPEN_GATE,
}: {
  customer: Customer | null
  activeSubscription?: ActiveSubLike | null
  userEmail?: string
  hasQueuedRenewal?: boolean
  menuData?: Dish[]
  /** Company closure dates (YYYY-MM-DD) — the kitchen is shut, no dish is
   *  promised, and the day card says so. */
  closureDates?: string[]
  /** The most recent ended plan, when there is no live one (returning customer). */
  endedPlan?: ActiveSubLike | null
  /** Why renewing might be closed right now — the dashboard plan card's gates. */
  renewGate?: { intakePaused: boolean; outOfZone: boolean; profileIncomplete: boolean }
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

  // Today's AE wall date — every day on the page is past / today / future
  // against it, the same clock the skip and pause ledgers are written in.
  const todayAEIso = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // The plan the page reads days against. A returning customer whose last
  // plan has ended keeps seeing the week the way they saw it the day before —
  // days after the last dinner locked — rather than the plain browsing view a
  // brand-new signup gets (Saad's call, 2026-09-14).
  const plan = toMenuPlan(activeSubscription) ?? toMenuPlan(endedPlan)
  const noPlan = !plan
  const dayCtx: MenuDayContext = { plan, todayIso: todayAEIso, weekType, closureDates, hasQueuedRenewal }
  const renew = renewGateFor({ planName: plan?.plan_name, ...renewGate })
  const ending = planEndingNotice(dayCtx)
  const lastDinner = lastDinnerIso(dayCtx)

  // Off days (Sundays, Saturday on a 5-day plan) have no dinner to explain.
  const reasonFor = (meal: WeekMeal): NoDeliveryReason | null =>
    meal.tag === 'Off' ? null : classifyMenuDay(meal.iso, dayCtx)
  const noteFor = (meal: WeekMeal): string | null => {
    const reason = reasonFor(meal)
    return reason ? noDeliveryNote(reason, meal.iso, dayCtx, renew) : null
  }

  // Whole rows, not sub.veg_days: a religious signup with no plan yet still
  // has their saved veg days on the customer, and a running plan's own diet
  // and days win over a renewal that already rewrote the customer's. The
  // ended plan is not passed: a returning customer's locked week shows what
  // they would get if they renewed today.
  const vegSources = { customer, subscription: activeSubscription }
  const vegDayNumbers = vegDayNumbersFor(vegSources, weekType)

  // Top-of-page meta tag — for religious mix, "Mix" plus the veg days, which
  // were nowhere on the page. For pure prefs, the simple label.
  const prefKind = preferenceKindFor(vegSources)
  const prefTag: 'Veg' | 'Non Veg' | 'Mix' = prefKind === 'religious' ? 'Mix' : prefKind === 'veg' ? 'Veg' : 'Non Veg'
  const vegNames = resolveVegDayNames(vegSources).map(d => d.toLowerCase())
  const vegDaysLabel = prefKind === 'religious'
    ? FULL_DAYS.slice(0, weekType === '5DAYS' ? 5 : 6).filter(d => vegNames.includes(d.toLowerCase())).map(d => d.slice(0, 3)).join(', ') || null
    : null
  const FULL_MENU = buildFullMenu(vegDayNumbers, weekType, menuData)
  const thisWeek  = FULL_MENU[0]
  const nextWeek  = FULL_MENU[1]

  // todayMonIdx() returns 6 on Sunday — no card in the 0-5 range gets highlighted,
  // and todayMeal is null so TodaySpotlight shows the rest-day state.
  const thisTodayIdx = todayMonIdx()
  const todayMeal    = thisTodayIdx < 6 ? thisWeek.meals[thisTodayIdx] : null
  const spotlight = spotlightFor(dayCtx, { todayIsOff: !todayMeal || todayMeal.tag === 'Off' })

  const [openMeal, setOpenMeal] = useState<WeekMeal | null>(null)
  const router = useRouter()
  const [, startNavTransition] = useTransition()
  const navTo = (href: string) => startNavTransition(() => router.push(href))

  // Per-card click router. Days after the plan, while renewing is open, route
  // straight to renew — the lock and "Renew to unlock" already promise that.
  // Every other card opens the dish, with a line saying why it won't come.
  const renewHref = renew.kind === 'open' ? renew.href : null
  function clickFor(meal: WeekMeal, reason: NoDeliveryReason | null) {
    if (reason === 'plan-ends' && renewHref) return () => navTo(renewHref)
    return () => setOpenMeal(meal)
  }

  const DAY_ABBREVS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  // ── Mobile cell data — same classification the desktop grid uses, flattened
  //    to plain props for the presentational MobileMenu (≤768). ──
  const toCell = (meal: WeekMeal, i: number, state: WeekDayState): MobileMenuCell => {
    const reason = reasonFor(meal)
    return { meal, dayLabel: DAY_ABBREVS[i], state, reason, noPlan, lastDinner: reason === null && meal.iso === lastDinner, note: noteFor(meal) }
  }
  const thisWeekCells: MobileMenuCell[] = thisWeek.meals.slice(0, 6).map((meal, i) =>
    toCell(meal, i, dayPosition(meal.iso, todayAEIso)))
  const nextWeekCells: MobileMenuCell[] = nextWeek.meals.slice(0, 6).map((meal, i) => toCell(meal, i, 'future'))

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
            {vegDaysLabel && <span style={{ color: S.fgSub, fontWeight: 600 }}>veg {vegDaysLabel}</span>}
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
            <Eyebrow>{spotlightEyebrow(spotlight)}</Eyebrow>
            <div style={{ flex: 1, height: 1, background: S.border }} />
          </div>
          <TodaySpotlight
            meal={todayMeal}
            dorm={customer?.dorm_name ?? null}
            spotlight={spotlight}
            ctx={dayCtx}
            planName={plan?.plan_name ?? null}
            renew={renew}
            onOpenDish={todayMeal ? () => setOpenMeal(todayMeal) : undefined}
          />
        </section>

        {/* ── Last-dinner line: the week below locks after it ── */}
        {ending && (
          <div className="menu-ending-line" style={ENDING_LINE}>
            <span style={{ fontFamily: BODY, fontSize: 13.5, color: S.fg, lineHeight: 1.5 }}>
              Your last dinner is <strong style={{ fontWeight: 700 }}>{deliveryDayLabel(ending.lastDinnerIso, todayAEIso)}</strong>.
            </span>
            <RenewControl renew={renew} />
          </div>
        )}

        {/* ── Section 2: This week (6-cell grid) ── */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eyebrow>This week</Eyebrow>
            <div style={{ flex: 1, height: 1, background: S.border }} />
          </div>
          <div className="this-week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {thisWeek.meals.slice(0, 6).map((meal, i) => {
              // By date, not by column: on a Sunday "This week" is the week
              // ahead, and counting columns marked all six dinners "Delivered".
              const state: WeekDayState = dayPosition(meal.iso, todayAEIso)
              const noDeliveryReason = reasonFor(meal)
              return (
                <WeekDayCard
                  key={i}
                  meal={meal}
                  dayLabel={DAY_ABBREVS[i]}
                  state={state}
                  noDeliveryReason={noDeliveryReason}
                  noPlan={noPlan}
                  renewKind={renew.kind}
                  isLastDinner={noDeliveryReason === null && meal.iso === lastDinner}
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
              const noDeliveryReason = reasonFor(meal)
              return (
                <WeekDayCard
                  key={i}
                  meal={meal}
                  dayLabel={DAY_ABBREVS[i]}
                  state="future"
                  variant="preview"
                  noDeliveryReason={noDeliveryReason}
                  noPlan={noPlan}
                  renewKind={renew.kind}
                  isLastDinner={noDeliveryReason === null && meal.iso === lastDinner}
                  onClick={clickFor(meal, noDeliveryReason)}
                />
              )
            })}
          </div>
        </section>

        {/* ── Dish detail modal ── */}
        <AnimatePresence>
          {openMeal && <DishDetailModal meal={openMeal} note={noteFor(openMeal)} onClose={() => setOpenMeal(null)} />}
        </AnimatePresence>

      </div>
    </div>{/* /.menu-desktop */}

      {/* ── Mobile (≤768) — the redesigned single-screen /menu. ── */}
      <div className="menu-mobile">
        <MobileMenu
          prefTag={prefTag}
          vegDaysLabel={vegDaysLabel}
          todayMeal={todayMeal}
          todayNote={todayMeal ? noteFor(todayMeal) : null}
          dorm={customer?.dorm_name ?? null}
          spotlight={spotlight}
          notice={spotlight.kind === 'dinner' || spotlight.kind === 'rest' ? null : spotlightCopy(spotlight, dayCtx)}
          restCopy={restDayCopy(dayCtx)}
          planName={plan?.plan_name ?? null}
          canResume={plan?.status === SUBSCRIPTION_STATUS.PAUSED}
          endingLabel={ending ? deliveryDayLabel(ending.lastDinnerIso, todayAEIso) : null}
          renew={renew}
          thisWeekCells={thisWeekCells}
          nextWeekCells={nextWeekCells}
          onNavigate={navTo}
        />
      </div>

      <style>{`
        /* Mobile (≤768) swaps the desktop /menu tree for MobileMenu. Pure CSS
           toggle — no flash, desktop intact. */
        .menu-mobile { display: none; }
        @media ${COMPACT} {
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
