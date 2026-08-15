'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import Image, { type StaticImageData } from 'next/image'
import Link from 'next/link'
import { SkipForward, Eye, CalendarPlus, PauseCircle, Truck, Flame, ChevronRight, Gift, Info, Check, Play, CalendarClock, CornerDownRight } from 'lucide-react'
import { OG, OG3, OG_DEEP, NV, NV2, CR, BODY, S, cleanPlanName } from '../_shared/tokens'
import { MealTag } from '../_shared/MealTag'
import { PlanGlyph } from '../_shared/PlanGlyph'
import { formatSavedAmount } from '@/contexts/subscriptions/domain/savings'
import { groupPauseRanges, buildPauseLookup, type PauseRange } from '../_shared/pause-ranges'

export interface ResolvedDish {
  dateLabel: string
  name: string | null
  description: string
  image: string | StaticImageData | null
  tag: 'Veg' | 'Non Veg'
  heat: number
  heatLabel: string
}

/**
 * MobileHome — ground-up mobile My Dashboard (≤768). Desktop untouched.
 *
 * COLOR (one meaning per colour — refactoring-ui + interface-design):
 *   orange (gradient OG→OG3) → progress / delivered / "done so far": the fill
 *     bar, delivered chips, today ring. Carries the sense of momentum, exactly
 *     like the desktop calendar bar.
 *   navy  → primary data + text (the big Meals-left number), structure.
 *   green → live status only (ACTIVE, Veg).
 *   gray / hatched → upcoming (plain) / skipped (hatched, de-emphasised).
 */

const ORANGE_GRAD = `linear-gradient(180deg, ${OG} 0%, ${OG3} 100%)`

export interface MobileHomeData {
  customerName: string
  greeting: string
  savedAmount: number
  /** First-party delivery-day count (= delivered meals, or /2 for Monthly Max).
   *  Leads the value line — always true, never null, nothing to dispute. */
  evenings: number
  /** The customer's self-reported usual dinner spend when ordering instead of
   *  cooking (AED), or null if unset. Decides whether the line shows a saved
   *  figure or the capture invite. */
  benchmarkAed: number | null
  dishName: string
  dishDescription: string
  tag: 'Veg' | 'Non Veg'
  heat: number
  heatLabel: string
  arrivalText: string
  planName: string
  total: number
  delivered: number
  skipped: number
  skipsPlanned: boolean
  startLabel: string
  endLabel: string
  /** Queued next plan (a Scheduled renewal), or null. Rendered as the next beat
   *  of the plan-card timeline (Started → Ending → Up next). `tentative` when the
   *  start date can still shift (sub paused or has a planned pause). */
  queued: { planName: string; startLabel: string; tentative: boolean } | null
  // raw fields for the date-mapped, clickable calendar chips
  startIso: string
  endIso: string
  weekType: '5DAYS' | '6DAYS'
  skippedDates: string[]
  pausedDates: string[]
  todayIso: string
  maxSkips: number
  totalDeliveries: number
  /** AE hour ≥ 20 on a delivery day → today's meal has arrived; flips the
   *  today calendar chip to its delivered fill (re-evaluated on a minute tick). */
  todayDelivered: boolean
  isPaused: boolean
  startsInFuture: boolean
  /** First delivery day, before any meal has arrived — surfaces a gold "First
   *  dinner" celebration pill (mirrors desktop HeroToday's day-one badge). */
  isDayOne: boolean
  // ── action display-state (mirrors the desktop QuickActions / HeroToday state
  //    machines so every mobile button reflects its real end-state and explains
  //    itself inline — touch has no hover tooltip). The shared handlers + the
  //    backend still gate independently; this is the visible half of that. ──
  /** Hero status pill — was hard-coded "Active"; now reflects today's state. */
  heroStatus: { label: string; tone: 'active' | 'paused' | 'skipped' | 'scheduled' | 'off' | 'delivered' }
  /** When set, the hero shows closure copy (heading + subtitle) INSTEAD of the
   *  dish — for done/closed states (delivered, skipped, resumed-after-cutoff),
   *  mirroring desktop HeroToday's inactive-state teardown so the card never
   *  frames a delivered/skipped meal as "Tonight's dish". */
  heroClosure?: { heading: string; subtitle: string } | null
  /** No dish exists for today (weekly off-day like Sunday, or menu not set yet)
   *  → the "View dish" button is dropped: tapping it would just round-trip to the
   *  menu page's own "no delivery" rest card. Distinct from closure states that
   *  DO have a dish (delivered / skipped), where viewing it still makes sense. */
  noDishToday?: boolean
  /** Hero Skip gate — disabled + the reason (the no-hover equivalent of the desktop tooltip). */
  skip: { disabled: boolean; caption: string | null; done?: boolean }
  /** Pause/Resume button state machine: pause · resume · planned-cancel · disabled. */
  pause: { mode: 'pause' | 'resume' | 'planned' | 'disabled'; label: string; caption: string | null; disabled: boolean }
  /** Plan-a-skip gate — hidden for trial/one-time, disabled at 0 credits / paused / scheduled. */
  planSkip: { show: boolean; disabled: boolean; caption: string | null }
  /** ISO of a scheduled pause start (null if none) — guards future skip pills + marks the boundary cell. */
  plannedPauseStart: string | null
  /** AE wall-date a CURRENT pause took effect (null if not paused). Every cell
   *  on/after it (incl. today) freezes to "on hold" — no today ring, read-only —
   *  mirroring desktop's pause overlay. Distinct from plannedPauseStart (future). */
  pauseCutoffIso: string | null
  wrap?: { cycleLabel: string; daysLeft: number; reward: number; late: boolean } | null
}

interface Props {
  data: MobileHomeData
  /** Action-error toast — rendered just below the greeting (not above it). */
  errorBanner?: ReactNode
  /** Post-checkout order confirmation — persistent record of the just-bought
   *  plan (mobile had none; buyers only saw the 3s success flash). */
  orderBanner?: ReactNode
  /** End-of-cycle renew nudge — rendered between the hero and the plan card. */
  renewBanner?: ReactNode
  /** Plan-ending-during-a-pause nudge (spec §6.4) — rendered above the hero,
   *  alongside errorBanner/orderBanner. */
  planEndingBanner?: ReactNode
  onSkip?: () => void
  isNavPending?: boolean
  onViewDish?: () => void
  onPlanSkip?: () => void
  onPause?: () => void
  onWrap?: () => void
  /** Opens the dinner-spend editor (shared SavingsBenchmarkModal). */
  onSetBenchmark?: () => void
  /** Opens the plan manager (for the queued next plan). */
  onManageQueued?: () => void
  onPillSkip?: (iso: string) => void
  onPillUnskip?: (iso: string) => void
  /** Resolves the dish delivered on a date — powers the tap-a-delivered-chip sheet. */
  resolveDish?: (iso: string) => ResolvedDish | null
}

export const MOBILE_PAGE_BG =
  'radial-gradient(135% 55% at 50% 0%, rgba(245,127,32,0.06) 0%, rgba(245,127,32,0) 58%), linear-gradient(180deg, #efe8dc 0%, #e9e2d5 60%, #e7e0d2 100%)'

const CARD: CSSProperties = {
  background: '#fdfbf6',
  borderRadius: 22,
  boxShadow: '0 1px 2px rgba(9,24,37,0.04), 0 8px 24px -12px rgba(9,24,37,0.16)',
  border: '1px solid rgba(9,24,37,0.05)',
}

// Skipped fill — darker hatch so skips read as deliberate actions.
const HATCH_SKIP: CSSProperties = {
  backgroundColor: 'rgba(9,24,37,0.25)',
  backgroundImage: 'repeating-linear-gradient(135deg, rgba(253,251,246,0.65) 0px, rgba(253,251,246,0.65) 1.5px, transparent 1.5px, transparent 4px)',
}
const PAUSE_FILL: CSSProperties = {
  backgroundColor: 'rgba(9,24,37,0.12)',
  backgroundImage: 'repeating-linear-gradient(135deg, rgba(253,251,246,0.35) 0px, rgba(253,251,246,0.35) 1.5px, transparent 1.5px, transparent 4px)',
}

function fmtRangeDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
}

function isWorkingDay(d: Date, weekType: '5DAYS' | '6DAYS'): boolean {
  const isoDow = ((d.getDay() + 6) % 7) + 1
  if (weekType === '5DAYS') return isoDow !== 6 && isoDow !== 7
  return isoDow !== 7
}
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type PillState = 'delivered' | 'today' | 'skipped' | 'upcoming' | 'makeup' | 'paused'
interface Pill { iso: string; state: PillState; action: 'skip' | 'unskip' | 'info' | 'detail' | 'pause-info' | 'cell-info' | null; pauseRange?: PauseRange }

export function MobileHome({ data, errorBanner, orderBanner, renewBanner, planEndingBanner, onSkip, isNavPending, onViewDish, onPlanSkip, onPause, onWrap, onSetBenchmark, onManageQueued, onPillSkip, onPillUnskip, resolveDish }: Props) {
  // Delivery-rounded (Monthly Max ships 2 meals/delivery) so "meals left" can
  // never show an un-deliverable odd number — mirrors desktop PlanProgress.
  const perDelivery = data.planName.includes('Monthly Max') ? 2 : 1
  const deliveriesDone = Math.floor(data.delivered / perDelivery)
  const mealsLeft = Math.max(0, (data.totalDeliveries - deliveriesDone) * perDelivery)
  const pct = data.totalDeliveries > 0 ? Math.min(100, Math.round((deliveriesDone / data.totalDeliveries) * 100)) : 0
  // Legacy subs can have skipped_meals_count > skipped_dates.length (skips made
  // before the dates column) — count and hatched chips would silently disagree.
  const untracedSkips = Math.max(0, data.skipped - data.skippedDates.length)
  const skipWord = data.skipsPlanned ? `skip${data.skipped === 1 ? '' : 's'} planned` : 'skipped'
  const [clickedNav, setClickedNav] = useState<string | null>(null)
  const navClick = (key: string, cb?: () => void) => { setClickedNav(key); cb?.() }
  const [makeupInfo, setMakeupInfo] = useState(false)
  const [dishSheet, setDishSheet] = useState<string | null>(null)
  const [pauseRangeInfo, setPauseRangeInfo] = useState<PauseRange | null>(null)
  const [cellInfo, setCellInfo] = useState<Pill | null>(null)

  // Date-mapped calendar chips (desktop-faithful: delivered/today/skipped/
  // upcoming, with future cells clickable to skip / future skips to un-skip).
  const skipSet = new Set(data.skippedDates)
  const pausedSet = new Set(data.pausedDates)
  const mobilePauseRanges = groupPauseRanges(data.pausedDates, data.weekType, skipSet)
  const mobilePauseLookup = buildPauseLookup(mobilePauseRanges)
  const hasCredits = data.maxSkips - data.skipped > 0
  const pills: Pill[] = []
  {
    const cursor = new Date(data.startIso + 'T00:00:00')
    const end = new Date(data.endIso + 'T00:00:00')
    let position = 0
    while (cursor.getTime() <= end.getTime()) {
      if (isWorkingDay(cursor, data.weekType)) {
        position++
        const iso = isoOf(cursor)
        const isFuture = iso > data.todayIso
        // Beyond the original delivery count = a make-up day earned by an
        // earlier skip. Make-up days can't themselves be skipped.
        const isMakeup = position > data.totalDeliveries
        let state: PillState
        let action: Pill['action'] = null
        // Days from a scheduled pause-start onward have no delivery, so they
        // can't be skipped (mirrors desktop isInsidePlannedPauseWindow).
        const inPlannedPause = !!data.plannedPauseStart && iso >= data.plannedPauseStart
        // A currently-paused sub freezes every cell from the pause date forward
        // (incl. today): plain "on hold" gray, no today ring, read-only — past
        // delivered/skipped cells keep their colour. Checked FIRST so it overrides
        // today/skip/makeup, mirroring desktop's pause overlay (PlanProgress).
        const isPausedCell = data.isPaused && !!data.pauseCutoffIso && iso >= data.pauseCutoffIso && iso >= data.todayIso
        const pillRange = mobilePauseLookup.get(iso)
        const isCollapsedRange = pillRange != null && pillRange.count >= 2
        if (isCollapsedRange && iso !== pillRange.startIso) {
          cursor.setDate(cursor.getDate() + 1)
          continue
        }
        if (isPausedCell) {
          state = 'paused'
        } else if (skipSet.has(iso)) {
          state = 'skipped'
          if (isFuture && !data.isPaused && !data.startsInFuture && onPillUnskip) action = 'unskip'
        } else if (isCollapsedRange) {
          state = 'paused'
          action = 'pause-info'
        } else if (pausedSet.has(iso)) {
          state = 'paused'
        } else if (iso === data.todayIso) {
          // Today is classified before make-up so the orange "today" ring always
          // shows, even when today lands on a make-up day (mirrors desktop order).
          // After 20:00 AE today's meal has arrived → fill it like a delivered
          // day (and let it open the dish sheet), matching desktop's today-flip.
          state = data.todayDelivered ? 'delivered' : 'today'
          if (data.todayDelivered && resolveDish) action = 'detail'
        } else if (iso < data.todayIso) {
          // Past cells are delivered — checked BEFORE make-up so a make-up day
          // that has already arrived fills orange like any other delivered meal
          // (and opens its dish), instead of staying gray "pending". Only FUTURE
          // make-up days fall through to the gray 'makeup' pill. Mirrors desktop,
          // which checks isPast before isMakeup.
          state = 'delivered'
          if (resolveDish) action = 'detail' // tap a delivered day to see what was served
        } else if (isMakeup) {
          state = 'makeup'
          if (isFuture) action = 'info' // tap explains why it can't be skipped
        } else {
          state = 'upcoming'
          if (isFuture && hasCredits && !data.isPaused && !data.startsInFuture && !inPlannedPause && onPillSkip) action = 'skip'
        }
        if (!action) action = 'cell-info'
        pills.push({ iso, state, action, ...(isCollapsedRange ? { pauseRange: pillRange } : {}) })
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  // Max 12 cells per row; overflow (make-up days) wraps to a new row.
  const perRow = Math.min(12, Math.max(1, pills.length))

  // Closure states (delivered / skipped / resumed) flip the hero from the dark
  // dinner-ticket to a LIGHT cream + orange-edge-wash card — mirroring desktop
  // HeroToday, where the whole surface (not just the copy) changes once the
  // night's job is done. Active stays dark (the one spotlight).
  const heroLight = !!data.heroClosure

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: BODY, paddingBottom: 32 }}>

      {/* ── Top greeting — sits in the hamburger row (left padding clears the
          burger; right padding is light since the bug icon is gone on mobile,
          which also gives the value line room to stay on one line). ── */}
      <div style={{ paddingLeft: 64, paddingRight: 16, minHeight: 34, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: S.fg, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {/* Mirror the desktop hero: when no name is on file the helper
              falls back to 'there' — drop the suffix rather than greeting
              the customer with "Good evening, there". */}
          {data.greeting}{data.customerName !== 'there' ? `, ${data.customerName}` : ''}
        </div>
        {/* Value line — secondary, glance-zone. Two plain facts: the first-party
            delivery count (always true) and the saved figure. Both numbers sit in
            NAVY, not orange — this is metadata under the greeting, and orange is
            reserved for the real accents below (hero / progress / CTAs). The
            "how is this figured + adjust it" detail lives one tap away behind the
            info affordance, NOT inline, so the greeting stays skimmable. */}
        {(() => {
          const hasSaved = data.benchmarkAed != null && data.savedAmount > 0
          const dot = <span style={{ color: S.fgFaint, margin: '0 6px' }}>·</span>
          // Dotted-underline benchmark-capture / adjust link (reused below).
          const captureLink = (
            <span
              role="button"
              tabIndex={0}
              onClick={onSetBenchmark}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSetBenchmark?.() } }}
              style={{
                cursor: 'pointer', color: S.fgMuted, fontWeight: 600, touchAction: 'manipulation',
                textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: S.border2, textUnderlineOffset: 2,
                padding: '4px 2px', margin: '-4px -2px',
              }}
            >
              {data.benchmarkAed != null ? 'Adjust your usual dinner spend' : 'Add your usual dinner spend'}
            </span>
          )
          // Pre-first-delivery (delivered === 0): no "N sorted" yet, but still
          // surface the benchmark-capture link so a brand-new subscriber has a
          // home-screen path to set their dinner spend (desktop always shows it).
          if (data.delivered === 0) {
            return data.benchmarkAed != null
              ? null
              : <div style={{ fontSize: 12.5, color: S.fgMuted, lineHeight: 1.35, marginTop: 2 }}>{captureLink}</div>
          }
          return (
            <div style={{ fontSize: 12.5, color: S.fgMuted, lineHeight: 1.35, marginTop: 2 }}>
              <strong style={{ color: S.fg, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{data.evenings}</strong>{' '}
              dinner{data.evenings === 1 ? '' : 's'} sorted
              {hasSaved ? (
                // nowrap so the figure + its info icon never split across lines —
                // the icon is ALWAYS beside "saved", on the same (second) line.
                <span style={{ whiteSpace: 'nowrap' }}>
                  {dot}
                  {/* bucketed to "1,000+" past AED 1000 — keeps the claim credible
                      (mirrors desktop's formatSavedAmount). */}
                  <strong style={{ color: S.fg, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>AED {formatSavedAmount(data.savedAmount)}</strong> saved
                  <button
                    type="button"
                    onClick={onSetBenchmark}
                    aria-label="How your savings are worked out"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: '-2px',
                      padding: 6, margin: '-6px -2px -6px 2px',
                      // Muted navy (not brand orange) so the icon stays visible
                      // on the orange home canopy — matches the savings-line tone.
                      background: 'transparent', border: 'none', color: S.fgMuted, cursor: 'pointer', touchAction: 'manipulation',
                    }}
                  >
                    <Info size={13} strokeWidth={2.2} aria-hidden />
                  </button>
                </span>
              ) : (
                <>{dot}{captureLink}</>
              )}
            </div>
          )
        })()}
      </div>

      {errorBanner}
      {orderBanner}
      {planEndingBanner}

      {/* ── Dinner-ticket hero (dark = active; light = closure) ──────────── */}
      <section style={{
        position: 'relative',
        borderRadius: 24, padding: 22, overflow: 'hidden',
        ...(heroLight
          ? {
              background: 'linear-gradient(105deg, rgba(245,127,32,0.14) 0%, rgba(245,127,32,0.07) 30%, rgba(245,127,32,0.02) 70%, rgba(245,127,32,0) 100%), #fdfbf6',
              border: '1px solid rgba(9,24,37,0.06)',
              boxShadow: '0 1px 2px rgba(9,24,37,0.04), 0 8px 24px -12px rgba(9,24,37,0.16)',
            }
          : {
              background: 'linear-gradient(150deg, #1f4456 0%, #0c1f2e 62%, #091825 100%)',
              boxShadow: '0 10px 34px -12px rgba(9,24,37,0.55), 0 2px 6px rgba(9,24,37,0.18)',
            }),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: OG }}>
            {/* Paused and scheduled keep their own kicker even though they now
                wear closure copy (light card + teardown): the eyebrow names the
                state, the heading reassures. Other closure states (skipped /
                off / delivered) wear a neutral "Tonight" so the eyebrow doesn't
                echo the pill's status word. */}
            {data.heroStatus.tone === 'paused' ? 'Plan paused'
              : data.heroStatus.tone === 'scheduled' ? 'Starting soon'
              : data.heroClosure ? 'Tonight'
              : data.heroStatus.tone === 'off' ? 'Tonight'
              : 'Tonight’s dish'}
          </span>
          {(() => {
            // Day-one celebration — a gold "First dinner" pill supersedes the
            // ACTIVE chip on the very first delivery night, before any meal has
            // landed (mirrors desktop HeroToday's floating gold day-one badge).
            if (data.isDayOne && data.heroStatus.tone === 'active') {
              return (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, whiteSpace: 'nowrap',
                  background: 'linear-gradient(135deg, #FFC42B 0%, #F0A810 100%)', border: '1px solid #C99000',
                  fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#3a2200',
                  boxShadow: '0 0 0 4px rgba(255,196,43,0.18), 0 5px 16px rgba(212,160,23,0.45)',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: '#fff8e1', boxShadow: '0 0 8px rgba(255,255,255,0.9)' }} />
                  First dinner
                </span>
              )
            }
            // Green is reserved for the live ACTIVE state; every other state
            // wears a quiet cream chip so the pill can never lie green again.
            const active = data.heroStatus.tone === 'active'
            const t = active
              ? { bg: 'rgba(29,138,48,0.16)', bd: 'rgba(29,138,48,0.4)', fg: '#7ee29a', dot: '#37d167' }
              : heroLight
                // Light card: delivered → green "done" chip; skipped/resumed → quiet navy chip.
                ? (data.heroStatus.tone === 'delivered'
                    ? { bg: 'var(--ds-success-wash)', bd: 'rgba(29,138,48,0.30)', fg: 'var(--ds-success-fg)', dot: '#1d8a30' }
                    : { bg: 'rgba(9,24,37,0.05)', bd: 'rgba(9,24,37,0.12)', fg: S.fgMuted, dot: S.fgFaint })
                : { bg: 'rgba(245,240,232,0.10)', bd: 'rgba(245,240,232,0.30)', fg: 'rgba(245,240,232,0.82)', dot: 'rgba(245,240,232,0.6)' }
            return (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999,
                background: t.bg, border: `1px solid ${t.bd}`,
                fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.fg,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: t.dot, boxShadow: active ? '0 0 8px rgba(55,209,103,0.8)' : 'none' }} />
                {data.heroStatus.label}
              </span>
            )
          })()}
        </div>

        <h1 style={{
          margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1.18, letterSpacing: '-0.02em',
          // Dark card → warm top-lit cream gradient; light closure card → navy ink.
          ...(heroLight
            ? { color: S.fg }
            : {
                backgroundImage: 'linear-gradient(180deg, #fbf6ec 0%, #f0e6cf 60%, #dccdac 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                WebkitTextFillColor: 'transparent', color: 'transparent',
              }),
        }}>
          {/* Closure copy (delivered / skipped / resumed) replaces the dish name
              so the hero never presents a done meal as "Tonight's dish". */}
          {data.heroClosure ? data.heroClosure.heading : (data.dishName || 'Tonight’s dinner')}<span style={{ color: OG, ...(heroLight ? {} : { WebkitTextFillColor: OG, backgroundImage: 'none' }) }}>.</span>
        </h1>
        {(data.heroClosure ? data.heroClosure.subtitle : data.dishDescription) && (
          <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.5, color: heroLight ? S.fgMuted : 'rgba(245,240,232,0.72)', maxWidth: '52ch' }}>
            {data.heroClosure ? data.heroClosure.subtitle : data.dishDescription}
          </p>
        )}

        {/* Dish meta (tag · heat · arrival) — only when an actual dish is shown;
            hidden on closure states where there's no live dish to describe. */}
        {!data.heroClosure && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <MealTag kind={data.tag} onDark oneLine />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {/* navy-aware heat bars — empty bars are faint cream, not invisible */}
              <span style={{ display: 'inline-flex', gap: 3 }} aria-label={`Spice: ${data.heatLabel}`}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ width: 5, height: 9, borderRadius: 1.5, background: i < data.heat ? OG : 'rgba(245,240,232,0.28)' }} />
                ))}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(245,240,232,0.78)' }}>{data.heatLabel}</span>
            </span>
          </span>
          {data.arrivalText && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'rgba(245,240,232,0.88)', whiteSpace: 'nowrap' }}>
              <Truck size={14} strokeWidth={2} color="rgba(245,240,232,0.78)" />
              {data.arrivalText}
            </span>
          )}
        </div>
        )}

        {/* Footer actions — collapse entirely on a no-dish off-day so the card
            ends on its closure copy instead of a lone, dead "View dish" button
            (and an empty 18px gap). Whenever a dish exists the row stays. */}
        {(!data.heroClosure || !data.noDishToday) && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {/* Skip is only an action on a LIVE night. Once the night is closed
                (skipped / delivered / resumed) there's nothing left to skip, so
                the button is dropped — its label + caption were just echoing the
                hero's own status word. "View dish" stretches to fill. */}
            {!data.heroClosure && (
            <button
              type="button"
              onClick={data.skip.disabled ? undefined : onSkip}
              disabled={data.skip.disabled}
              aria-disabled={data.skip.disabled}
              style={heroBtn('ghost', data.skip.disabled, heroLight)}
            >
              {data.skip.done
                ? <><Check size={16} strokeWidth={2.6} /> Skipped tonight</>
                : <><SkipForward size={16} strokeWidth={2.4} /> Skip</>}
            </button>
            )}
            {/* View dish is dropped on a no-dish day — tapping it would just
                round-trip to the menu page's own "no delivery" rest card. */}
            {!data.noDishToday && (
            <button type="button" onClick={() => navClick('dish', onViewDish)} disabled={isNavPending} style={{ ...heroBtn('ghost', false, heroLight), opacity: isNavPending && clickedNav === 'dish' ? 0.7 : 1, transition: 'opacity 150ms' }}>
              {isNavPending && clickedNav === 'dish' ? <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '1.5px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} /> : <Eye size={16} strokeWidth={2.2} />} View dish
            </button>
            )}
          </div>
          {/* Inline reason — the touch substitute for desktop's hover tooltip.
              When enabled it shows the remaining-skips count; when blocked it
              explains why (past 2 PM / no delivery / none left / etc.). Hidden in
              closure states where the Skip button itself is gone. */}
          {!data.heroClosure && data.skip.caption && (
            <div style={{
              marginTop: 9, fontSize: 11.5, fontWeight: 600, lineHeight: 1.3,
              color: heroLight ? (data.skip.disabled ? S.fgFaint : S.fgMuted) : (data.skip.disabled ? 'rgba(245,240,232,0.5)' : 'rgba(245,240,232,0.6)'),
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              {data.skip.disabled && !data.skip.done && <Info size={12} strokeWidth={2.2} aria-hidden />}
              {data.skip.caption}
            </div>
          )}
        </div>
        )}
      </section>

      {renewBanner}

      {/* ── Plan progress (sunset-frosted card) ──────────────────────────── */}
      <section style={{
        ...CARD,
        // white → faint-orange "sunset" at the bottom edge for warmth
        background: 'linear-gradient(180deg, #fdfbf6 0%, #fdfbf6 58%, #fdf1e3 100%)',
        padding: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <PlanGlyph planName={data.planName} size={15} color={S.fg} />
          <span style={{ ...eyebrow, color: S.fgSub }}>{cleanPlanName(data.planName)}</span>
        </div>

        {/* Meals exhausted, no follow-up queued → in-card closure + renew path.
            Gated on meals (not the date-based renew banner), so it surfaces even
            when deliveries finish ahead of the calendar end date. */}
        {mealsLeft === 0 && !data.queued && (
          <Link href="/dashboard/plan" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: 'var(--ds-og-wash-strong)', border: '1px solid var(--ds-og-border)', textDecoration: 'none' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: S.fg }}>Plan ended</span>
              <span style={{ display: 'block', fontSize: 11.5, color: S.fgMuted, marginTop: 1 }}>Renew to keep meals coming.</span>
            </span>
            <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: OG_DEEP }}>Renew <ChevronRight size={14} strokeWidth={2.6} /></span>
          </Link>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={eyebrow}>Meals left</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 44, fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.03em', color: S.fg, fontFeatureSettings: '"tnum"' }}>{mealsLeft}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: S.fgMuted }}>of {data.total}</span>
            </div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
            <span style={statLine}>
              <span style={{ ...swatch, background: ORANGE_GRAD }} />
              <strong style={statNum}>{data.delivered}</strong> delivered
            </span>
            <span style={statLine}>
              <span style={{ ...swatch, ...HATCH_SKIP }} />
              <strong style={statNum}>{data.skipped}</strong> {skipWord}
            </span>
          </div>
        </div>

        {/* progress fill — orange gradient, matches delivered chips */}
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(9,24,37,0.08)', marginTop: 16, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: ORANGE_GRAD }} />
        </div>

        {/* square day chips — two rows; future cells are tappable. Whole grid
            dims while paused (deliveries frozen), mirroring desktop's bar dim. */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${perRow}, 1fr)`, gap: 5, marginTop: 12, opacity: data.isPaused ? 0.5 : 1 }}>
          {pills.map((p, i) => {
            const fill: CSSProperties =
              p.state === 'delivered' ? { background: ORANGE_GRAD }
              : p.state === 'skipped' ? HATCH_SKIP
              : p.state === 'paused' ? PAUSE_FILL
              : p.state === 'today' ? { background: 'rgba(245,127,32,0.10)' }
              : p.state === 'makeup' ? { background: 'rgba(9,24,37,0.07)' }
              : { background: 'rgba(9,24,37,0.07)' } // upcoming
            // Orange border is reserved for TODAY only. Tappable skip/unskip
            // cells get a faint navy ring so the affordance reads without
            // stealing the orange accent.
            const border =
              p.state === 'today' ? `1.5px solid ${OG}`
              : p.state === 'paused' ? '1px solid transparent'
              : p.state === 'makeup' ? '1px solid rgba(9,24,37,0.20)'
              : (p.action === 'skip' || p.action === 'unskip') ? '1px solid rgba(9,24,37,0.30)'
              : '1px solid transparent'
            // Navy left-edge marker on the cell where a scheduled pause begins
            // (the same boundary cue desktop's PlanProgress draws).
            const isPauseBoundary = !!data.plannedPauseStart && p.iso === data.plannedPauseStart
            const isPauseRangeStart = mobilePauseRanges.some(r => p.iso === r.startIso)
            const isPauseRangeEnd = mobilePauseRanges.some(r => p.iso === r.endIso)
            const showLeftMarker = isPauseBoundary || isPauseRangeStart
            const showRightMarker = isPauseRangeEnd
            const shadows = [
              ...(showLeftMarker ? [`inset 2.5px 0 0 ${NV}`] : []),
              ...(showRightMarker ? [`inset -2.5px 0 0 ${NV}`] : []),
            ]
            const markerShadow = shadows.length > 0 ? shadows.join(', ') : undefined
            const isRange = !!p.pauseRange
            const base: CSSProperties = {
              aspectRatio: isRange ? 'auto' : '1 / 1',
              borderRadius: 5, padding: 0, border, ...fill,
              ...(isRange ? { gridColumn: 'span 2', height: '100%' } : {}),
              ...(markerShadow ? { boxShadow: markerShadow } : {}),
            }
            const onClick =
              p.action === 'skip' ? () => onPillSkip?.(p.iso)
              : p.action === 'unskip' ? () => onPillUnskip?.(p.iso)
              : p.action === 'info' ? () => setMakeupInfo(true)
              : p.action === 'detail' ? () => setDishSheet(p.iso)
              : p.action === 'pause-info' ? () => setPauseRangeInfo(p.pauseRange!)
              : p.action === 'cell-info' ? () => setCellInfo(p)
              : null
            return onClick ? (
              <button
                key={i}
                type="button"
                aria-label={`${p.state} ${p.iso}`}
                onClick={onClick}
                style={{ ...base, cursor: 'pointer', appearance: 'none' }}
              />
            ) : (
              <span key={i} aria-hidden style={base} />
            )
          })}
        </div>

        {untracedSkips > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: S.fgFaint, lineHeight: 1.4 }}>
            +{untracedSkips} earlier skip{untracedSkips === 1 ? '' : 's'} not date-traced
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(9,24,37,0.07)' }}>
          <div>
            <div style={eyebrowSm}>Started</div>
            <div style={dateVal}>{data.startLabel}</div>
          </div>
          <ChevronRight size={16} color="rgba(9,24,37,0.3)" style={{ marginTop: 12 }} />
          <div>
            <div style={eyebrowSm}>{data.isPaused ? 'Est. ending' : 'Ending'}</div>
            <div style={{ ...dateVal, ...(data.isPaused ? { color: S.fgMuted } : {}) }}>{data.endLabel}</div>
            {data.isPaused && <div style={{ fontSize: 10, color: S.fgFaint, lineHeight: 1.3, marginTop: 2, maxWidth: 132 }}>Extends ~1 day per paused delivery day.</div>}
          </div>
          {mobilePauseRanges.length > 0 && !data.isPaused && (() => {
            const r = mobilePauseRanges[mobilePauseRanges.length - 1]
            const label = r.count === 1 ? fmtRangeDate(r.startIso) : `${fmtRangeDate(r.startIso)}–${fmtRangeDate(r.endIso)}`
            return (
              <div style={{ marginLeft: 'auto', fontSize: 10, color: S.fgFaint, textAlign: 'right', lineHeight: 1.3 }}>
                Paused {label}
              </div>
            )
          })()}
        </div>

        {/* Timeline continuation — the queued next plan is the next beat after
            "Ending", so it lives right under the dates and reads as one story:
            Started → Ending → then this. Quiet NAVY (settled), never orange —
            orange in this card is reserved for live progress. */}
        {data.queued && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed rgba(9,24,37,0.12)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <CornerDownRight size={15} strokeWidth={2} color="rgba(9,24,37,0.3)" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={eyebrowSm}>Up next</div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: S.fg, marginTop: 3, lineHeight: 1.3 }}>
                {/* Tier glyph leads the name — same cue the active plan card's
                    header uses, so the queued plan reads as a plan, not a date. */}
                <span style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 7 }} aria-hidden>
                  <PlanGlyph planName={data.queued.planName} size={14} color={S.fg} />
                </span>
                {data.queued.planName}
                <span style={{ color: S.fgFaint, margin: '0 6px', fontWeight: 600 }}>·</span>
                <span style={{ color: NV2, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{data.queued.tentative ? 'est. ' : ''}{data.queued.startLabel}</span>
                {data.queued.tentative && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 6, padding: '2px 6px', borderRadius: 999, background: 'rgba(30,58,79,0.08)', border: '1px solid rgba(30,58,79,0.22)', fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: NV2, verticalAlign: '1px' }}>Tentative</span>
                )}
              </div>
              {data.queued.tentative && (
                <div style={{ fontSize: 11, color: S.fgFaint, lineHeight: 1.4, marginTop: 3 }}>Shifts forward while you&rsquo;re paused — locks in when you resume.</div>
              )}
            </div>
            {onManageQueued && (
              <button
                type="button"
                onClick={() => navClick('manage', onManageQueued)}
                disabled={isNavPending}
                style={{ flexShrink: 0, background: 'transparent', border: 'none', padding: '6px 2px', margin: '-6px -2px', fontFamily: BODY, fontSize: 11.5, fontWeight: 700, color: S.fgMuted, cursor: isNavPending ? 'default' : 'pointer', touchAction: 'manipulation', display: 'inline-flex', alignItems: 'center', gap: 2, opacity: isNavPending && clickedNav === 'manage' ? 0.7 : 1, transition: 'opacity 150ms' }}
              >
                {isNavPending && clickedNav === 'manage' ? <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} /> : <>Manage <ChevronRight size={13} strokeWidth={2.4} /></>}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Quick actions — Plan a skip (primary, hidden for trial) · Pause ──
          Each action stacks its button over an inline caption so a blocked
          state always says WHY (no hover on touch). Pause is a 4-way machine:
          pause · resume · cancel-planned-pause · disabled. */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {data.planSkip.show && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <button
              type="button"
              onClick={data.planSkip.disabled ? undefined : onPlanSkip}
              disabled={data.planSkip.disabled}
              aria-disabled={data.planSkip.disabled}
              style={planBtn(data.planSkip.disabled)}
            >
              <CalendarPlus size={17} strokeWidth={2.2} color={data.planSkip.disabled ? S.fgFaint : OG} />
              <span>Plan a skip</span>
            </button>
            {data.planSkip.caption && <div style={actionCaption}>{data.planSkip.caption}</div>}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            type="button"
            onClick={data.pause.disabled ? undefined : onPause}
            disabled={data.pause.disabled}
            aria-disabled={data.pause.disabled}
            style={pauseBtn(data.pause)}
          >
            {data.pause.mode === 'resume'
              ? <Play size={15} strokeWidth={2.4} color={data.pause.disabled ? S.fgFaint : '#fff'} fill={data.pause.disabled ? S.fgFaint : '#fff'} />
              : data.pause.mode === 'planned'
                ? <CalendarClock size={16} strokeWidth={2} color={data.pause.disabled ? S.fgFaint : OG} />
                : <PauseCircle size={16} strokeWidth={2} color={data.pause.disabled ? S.fgFaint : NV} />}
            <span>{data.pause.label}</span>
          </button>
          {data.pause.caption && <div style={{ ...actionCaption, ...(data.pause.mode === 'planned' ? { color: OG, fontWeight: 700 } : {}) }}>{data.pause.caption}</div>}
        </div>
      </div>

      {/* ── Monthly wrap nudge (rewarded) ────────────────────────────────────
          A RECESSED tile, not a raised card. The two quick-action buttons above
          own the CARD material (white + lift); this is optional + rewarded, so
          it sits a tier DOWN — a faint navy-tinted fill that darkens against the
          warm page (reads as a depression), a hairline border, and a soft inner
          shadow instead of an outer one. No outer shadow = no "primary button"
          read. The orange flame badge + reward chip stay as the small accents
          that keep it tempting (mirrors desktop's subordinate MonthlyWrapStrip). */}
      {data.wrap && (
        <button
          type="button"
          onClick={onWrap}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', borderRadius: 16, textAlign: 'left', cursor: 'pointer',
            fontFamily: BODY, appearance: 'none',
            backgroundColor: 'rgba(9,24,37,0.045)',
            border: '1px solid rgba(9,24,37,0.08)',
            boxShadow: 'inset 0 1px 2px rgba(9,24,37,0.05)',
          }}
        >
          <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: 'var(--ds-og-wash-strong)', border: '1px solid var(--ds-og-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: OG }}>
            <Flame size={16} strokeWidth={2} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: S.fg }}>Rate your {data.wrap.cycleLabel}</div>
            <div style={{ fontSize: 12, color: S.fgMuted, marginTop: 1 }}>2 mins · {data.wrap.late ? `${data.wrap.daysLeft}d late` : `${data.wrap.daysLeft}d left to earn`}</div>
          </div>
          <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 999, background: 'rgba(245,127,32,0.12)', border: '1px solid rgba(245,127,32,0.32)', color: OG_DEEP, fontSize: 12, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>
            <Gift size={13} strokeWidth={2.4} /> +AED {data.wrap.reward}
          </span>
        </button>
      )}

      {/* Make-up day info — a short bottom-sheet instead of an off-screen
          banner. Make-up days are earned by earlier skips and can't be skipped. */}
      {makeupInfo && (
        <div
          role="dialog" aria-modal="true"
          onClick={() => setMakeupInfo(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--ds-overlay-strong)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ ...CARD, width: '100%', maxWidth: 480, borderRadius: '22px 22px 0 0', padding: '22px 20px', paddingBottom: 'max(env(safe-area-inset-bottom), 22px)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--ds-og-wash-strong)', border: '1px solid var(--ds-og-border)', color: OG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Info size={17} strokeWidth={2.2} />
              </span>
              <strong style={{ fontSize: 15, color: S.fg }}>Make-up day</strong>
            </div>
            <p style={{ fontSize: 13.5, color: S.fgMuted, lineHeight: 1.55, margin: '0 0 16px' }}>
              This is a make-up day — a bonus meal earned by an earlier skip. Make-up days can&apos;t be skipped.
            </p>
            <button type="button" onClick={() => setMakeupInfo(false)} style={{ width: '100%', padding: '13px', borderRadius: 999, background: NV, color: '#fff', border: 'none', fontFamily: BODY, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {pauseRangeInfo && (
        <div
          role="dialog" aria-modal="true"
          onClick={() => setPauseRangeInfo(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--ds-overlay-strong)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ ...CARD, width: '100%', maxWidth: 480, borderRadius: '22px 22px 0 0', padding: '22px 20px', paddingBottom: 'max(env(safe-area-inset-bottom), 22px)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(9,24,37,0.06)', border: '1px solid rgba(9,24,37,0.12)', color: S.fgMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <PauseCircle size={17} strokeWidth={2.2} />
              </span>
              <strong style={{ fontSize: 15, color: S.fg }}>Deliveries paused</strong>
            </div>
            <p style={{ fontSize: 13.5, color: S.fgMuted, lineHeight: 1.55, margin: '0 0 4px' }}>
              {fmtRangeDate(pauseRangeInfo.startIso)} – {fmtRangeDate(pauseRangeInfo.endIso)}
            </p>
            <p style={{ fontSize: 12, color: S.fgFaint, lineHeight: 1.5, margin: '0 0 16px' }}>
              {pauseRangeInfo.count} delivery day{pauseRangeInfo.count > 1 ? 's' : ''} paused — your end date extended by the same amount.
            </p>
            <button type="button" onClick={() => setPauseRangeInfo(null)} style={{ width: '100%', padding: '13px', borderRadius: 999, background: NV, color: '#fff', border: 'none', fontFamily: BODY, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {cellInfo && (() => {
        const d = new Date(cellInfo.iso + 'T00:00:00')
        const dateStr = d.toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
        // A scheduled pause suspends every delivery day from its start onward
        // (the skip action is already blocked for these — see inPlannedPause).
        // Without this the sheet fell through to the "Upcoming" default and
        // promised a 7–8 PM delivery on a day the user has paused. Mirrors
        // desktop PlanProgress's "Pause begins" tooltip override.
        const inPlannedPause = cellInfo.state === 'upcoming' && !!data.plannedPauseStart && cellInfo.iso >= data.plannedPauseStart
        const isPlannedPauseStart = inPlannedPause && cellInfo.iso === data.plannedPauseStart
        const plannedPauseLabel = data.plannedPauseStart
          ? new Date(data.plannedPauseStart + 'T00:00:00').toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
          : ''
        // Today always reads "Today" — even once it's been skipped or delivered
        // — matching desktop PlanProgress's today-pre / today-delivered /
        // today-skipped grouping (mobile previously mislabelled a skipped-today
        // cell as plain "Skipped"). Excludes a frozen paused-today cell, which
        // keeps its paused copy rather than promising a delivery tonight.
        const isToday = cellInfo.iso === data.todayIso && cellInfo.state !== 'paused'
        const stateLabel =
          isToday ? 'Today'
          : cellInfo.state === 'delivered' ? 'Delivered'
          : cellInfo.state === 'skipped' ? 'Skipped'
          : cellInfo.state === 'paused' ? 'Paused'
          : cellInfo.state === 'makeup' ? 'Make-up day'
          : isPlannedPauseStart ? 'Pause begins'
          : inPlannedPause ? 'Pause planned'
          : 'Upcoming'
        const stateDetail =
          isToday && cellInfo.state === 'skipped' ? 'Tonight’s dinner is skipped — 1 day added to your cycle.'
          : isToday && cellInfo.state === 'delivered' ? 'Tonight’s dinner was delivered by 7–8 PM.'
          : isToday ? 'Dinner arrives tonight between 7–8 PM.'
          : cellInfo.state === 'skipped' ? 'This meal was skipped — your end date extended by 1 day.'
          : cellInfo.state === 'paused' ? 'No delivery — plan was paused on this day.'
          : cellInfo.state === 'delivered' ? 'Dinner was delivered by 7–8 PM.'
          : cellInfo.state === 'makeup' ? 'A bonus day earned from an earlier skip. Cannot be skipped.'
          : isPlannedPauseStart ? 'Your planned pause starts here — no deliveries from this day until you resume.'
          : inPlannedPause ? `Covered by your planned pause from ${plannedPauseLabel} — no delivery until you resume.`
          : 'Dinner will be delivered between 7–8 PM.'
        return (
          <div
            role="dialog" aria-modal="true"
            onClick={() => setCellInfo(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--ds-overlay-strong)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ ...CARD, width: '100%', maxWidth: 480, borderRadius: '22px 22px 0 0', padding: '22px 20px', paddingBottom: 'max(env(safe-area-inset-bottom), 22px)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...(cellInfo.state === 'delivered' ? { background: 'var(--ds-og-wash-strong)', border: '1px solid var(--ds-og-border)', color: OG } : { background: 'rgba(9,24,37,0.06)', border: '1px solid rgba(9,24,37,0.12)', color: S.fgMuted }),
                }}>
                  {cellInfo.state === 'delivered' ? <Check size={17} strokeWidth={2.2} /> : <Info size={17} strokeWidth={2.2} />}
                </span>
                <div>
                  <strong style={{ fontSize: 15, color: S.fg }}>{stateLabel}</strong>
                  <div style={{ fontSize: 12, color: S.fgMuted, marginTop: 1 }}>{dateStr}</div>
                </div>
              </div>
              <p style={{ fontSize: 13.5, color: S.fgMuted, lineHeight: 1.55, margin: '0 0 16px' }}>
                {stateDetail}
              </p>
              <button type="button" onClick={() => setCellInfo(null)} style={{ width: '100%', padding: '13px', borderRadius: 999, background: NV, color: '#fff', border: 'none', fontFamily: BODY, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                Got it
              </button>
            </div>
          </div>
        )
      })()}

      {/* Delivered-day dish sheet — what was served that date (derived from the
          catalog rotation, no history storage). The sheet IS the dish view. */}
      {dishSheet && resolveDish && (() => {
        const dd = resolveDish(dishSheet)
        if (!dd) return null
        return (
          <div role="dialog" aria-modal="true" onClick={() => setDishSheet(null)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--ds-overlay-strong)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ ...CARD, width: '100%', maxWidth: 480, borderRadius: '22px 22px 0 0', overflow: 'hidden', padding: 0 }}>
              {/* Full-bleed appetizing food hero — 4:3 so the dish isn't cropped
                  to a strip. Delivered + date chips overlay the photo (dark
                  scrim on the date for readability — refactoring-ui hero-image). */}
              {dd.name && dd.image && (
                <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', backgroundColor: 'rgba(9,24,37,0.06)' }}>
                  <Image src={dd.image} alt={dd.name} fill sizes="(max-width: 768px) 100vw, 480px" style={{ objectFit: 'cover' }} />
                  <span style={{ position: 'absolute', top: 14, left: 14, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, background: OG, color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', boxShadow: '0 2px 8px rgba(9,24,37,0.35)' }}>Delivered</span>
                  <span style={{ position: 'absolute', top: 14, right: 14, padding: '5px 11px', borderRadius: 999, background: 'rgba(9,24,37,0.7)', color: '#f5f0e8', fontSize: 11.5, fontWeight: 700, fontFeatureSettings: '"tnum"', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>{dd.dateLabel}</span>
                </div>
              )}
              <div style={{ padding: '18px 20px', paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}>
                {/* No-image fallback keeps the Delivered + date row in the body. */}
                {(!dd.name || !dd.image) && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ padding: '4px 9px', borderRadius: 999, background: 'var(--ds-og-wash-strong)', border: '1px solid var(--ds-og-border)', color: OG_DEEP, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Delivered</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: S.fgMuted, fontFeatureSettings: '"tnum"' }}>{dd.dateLabel}</span>
                  </div>
                )}
                {dd.name ? (
                  <>
                    <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.02em', color: S.fg }}>{dd.name}<span style={{ color: OG }}>.</span></h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                      <MealTag kind={dd.tag} />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }} aria-label={`Spice: ${dd.heatLabel}`}>
                        <span style={{ display: 'inline-flex', gap: 3 }}>{[0, 1, 2].map(i => (<span key={i} style={{ width: 5, height: 9, borderRadius: 1.5, background: i < dd.heat ? OG : 'rgba(9,24,37,0.14)' }} />))}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: S.fgMuted }}>{dd.heatLabel}</span>
                      </span>
                    </div>
                    {dd.description && <p style={{ fontSize: 13.5, color: S.fgMuted, lineHeight: 1.55, margin: '10px 0 0' }}>{dd.description}</p>}
                  </>
                ) : (
                  <p style={{ fontSize: 14, color: S.fgMuted, lineHeight: 1.55, margin: '6px 0 0' }}>Dish details aren&apos;t available for this date.</p>
                )}
                <button type="button" onClick={() => setDishSheet(null)} style={{ width: '100%', marginTop: 18, padding: '13px', borderRadius: 999, background: NV, color: '#fff', border: 'none', fontFamily: BODY, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                  Got it
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── style atoms ─────────────────────────────────────────────────────────────
const eyebrow: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: S.fgFaint }
const eyebrowSm: CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgSub }
const dateVal: CSSProperties = { fontSize: 14, fontWeight: 800, color: S.fg, marginTop: 4, fontFeatureSettings: '"tnum"' }
const statLine: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: S.fgMuted }
const statNum: CSSProperties = { color: S.fg, fontWeight: 800, fontFeatureSettings: '"tnum"' }
const swatch: CSSProperties = { width: 9, height: 9, borderRadius: 2, flexShrink: 0 }

// Caption under a quick-action button — the inline "why" line. Centered to sit
// under its button. Stays a calm muted gray; planned-pause overrides to orange.
const actionCaption: CSSProperties = {
  marginTop: 7, fontSize: 11, fontWeight: 600, lineHeight: 1.3, color: S.fgMuted, textAlign: 'center',
}

function heroBtn(kind: 'ghost' | 'outline', disabled = false, light = false): CSSProperties {
  const base: CSSProperties = {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '13px 16px', borderRadius: 999, fontFamily: BODY, fontSize: 14, fontWeight: 700,
    letterSpacing: '0.02em', cursor: 'pointer', transition: 'background 150ms, border-color 150ms',
  }
  // Light closure card → navy-ink buttons on cream (the dark-surface cream-ink
  // variant below would be invisible there).
  if (light) {
    if (disabled) return { ...base, background: '#f6f3ec', color: S.fgFaint, border: '1px dashed rgba(9,24,37,0.18)', cursor: 'default' }
    return { ...base, background: 'var(--ds-surface2)', color: NV, border: '1px solid rgba(9,24,37,0.15)' }
  }
  // Disabled on a dark surface = dashed faint outline (the anti-affordance that
  // reads as "not available" without a tooltip — see feedback memory on dark
  // pages). Inline caption alongside carries the reason.
  if (disabled) return { ...base, background: 'rgba(237,232,218,0.04)', color: 'rgba(245,240,232,0.4)', border: '1px dashed rgba(237,232,218,0.26)', cursor: 'default' }
  // refactoring-ui: two secondary buttons should read as a PAIR — same full
  // cream ink + visible border so neither looks disabled (muted text was the
  // earlier mistake). Only the fill differs: View dish a touch more present.
  return kind === 'outline'
    ? { ...base, background: 'rgba(237,232,218,0.14)', color: CR, border: '1px solid rgba(237,232,218,0.42)' }
    : { ...base, background: 'rgba(237,232,218,0.06)', color: CR, border: '1px solid rgba(237,232,218,0.34)' }
}

// Plan a skip = primary: raised card, orange icon. Disabled → dashed, no lift.
function planBtn(disabled = false): CSSProperties {
  const base: CSSProperties = {
    ...CARD, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    padding: '15px 14px', fontFamily: BODY, fontSize: 13.5, fontWeight: 800, color: NV, cursor: 'pointer',
    // Half-width slot: labels stay on ONE line. A too-long label overflows
    // visibly (caught in review) rather than ballooning the button to 3 lines.
    whiteSpace: 'nowrap',
  }
  if (disabled) return { ...base, color: S.fgFaint, cursor: 'default', boxShadow: 'none', border: '1px dashed rgba(9,24,37,0.18)', background: '#f6f3ec' }
  return base
}

// Pause = a small state machine, mirroring the desktop QuickActions slot:
//   pause    → cream surface, navy ink (clearly pressable)
//   resume   → filled orange (the inverse action gets the inverse look)
//   planned  → orange-wash chip ("Pause set · …", tap to cancel)
//   disabled → dashed faint (Monthly-only / used / unavailable)
function pauseBtn(p: MobileHomeData['pause']): CSSProperties {
  const base: CSSProperties = {
    width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '15px 14px', borderRadius: 22, fontFamily: BODY, fontSize: 13.5, fontWeight: 800,
    cursor: p.disabled ? 'default' : 'pointer',
    // One line only — keeps the pair the same height (see planBtn note).
    whiteSpace: 'nowrap',
  }
  // Disabled trumps mode. A locked "Resume" must never wear the live orange
  // fill — a bright button that does nothing on tap reads as active. The dashed
  // faint surface is the no-hover "not yet" cue; the caption beneath says why
  // (e.g. "You can resume from tomorrow"). Also covers mode: 'disabled'.
  if (p.disabled) return { ...base, color: S.fgFaint, background: '#f6f3ec', border: '1px dashed rgba(9,24,37,0.18)', boxShadow: 'none' }
  if (p.mode === 'resume') return { ...base, color: '#fff', background: ORANGE_GRAD, border: '1px solid transparent', boxShadow: '0 4px 14px -6px rgba(245,127,32,0.6)' }
  if (p.mode === 'planned') return { ...base, color: OG, background: 'var(--ds-og-wash-strong)', border: '1px solid var(--ds-og-border)' }
  return { ...base, color: NV, background: '#fdfbf6', border: '1px solid rgba(9,24,37,0.12)', boxShadow: '0 1px 2px rgba(9,24,37,0.04), 0 4px 12px -8px rgba(9,24,37,0.25)' }
}
