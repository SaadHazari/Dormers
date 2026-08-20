'use client'

import { useState, useTransition, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, PartyPopper, ChevronRight, ChevronDown, PauseCircle, Truck, Moon, Check } from 'lucide-react'
import { cancelPlannedPause, pauseSubscription, planPause, resumeSubscription, skipFutureDate, skipMeal, unskipFutureDate } from '@/contexts/subscriptions/usecases/subscription-mutations'
import { setTakeoutBenchmark } from '@/contexts/subscriptions/usecases/savings-actions'
import { FutureSkipModal, type FutureSkipMode } from './_shared/FutureSkipModal'
import { PlanPauseModal } from './_shared/PlanPauseModal'
import { SavingsBenchmarkModal } from './_shared/SavingsBenchmarkModal'
import { MobileSheet } from './_shared/MobileSheet'
import { MENU_DATA, getMenuWeek, type Dish } from '@/contexts/menu/domain/catalog-data'
import { cleanPlanName, OG, OG_DEEP, BODY, S, NV2 } from './_shared/tokens'
import { fmtWithDay } from './_shared/format'
import { ProfileBanner } from './_shared/ProfileBanner'
import { OutOfZoneBanner } from './_shared/OutOfZoneBanner'
import { PlanEndingPausedBanner } from './_shared/PlanEndingPausedBanner'
import { vegDayNumbersFor, type WeekType } from '@/contexts/subscriptions/domain/veg-day'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { resolvePlan } from '@/contexts/subscriptions/domain/plans'
import { HeroToday } from './HeroToday'
import { PlanProgress } from './PlanProgress'
import { StatRow } from './StatRow'
import { QuickActions } from './QuickActions'
import { MonthlyWrapStrip } from './_shared/MonthlyWrapStrip'
import { MobileHome, type MobileHomeData } from './_mobile/MobileHome'
import { MobileCreditChip } from './_mobile/MobileCreditChip'
import type { CreditRow } from './_shared/credit-outlook'
import { computeArrivalLabel, type DeliveryWeekType } from './_shared/delivery-phase'
import { COMPACT, EXPANDED } from './_shared/breakpoints'
import { MONTHLY_REWARD_AED, MONTHLY_LATE_REWARD_AED } from '@/contexts/subscriptions/domain/monthly-review'
import type { Customer, Subscription, MenuItem, MealState, WeekStatus, LocalState, IntakeGateState } from './_shared/types'
import { INTAKE_NOT_PAUSED } from './_shared/types'
import type { MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'
import { cycleSavings as computeCycleSavings, lifetimeSavings as computeLifetimeSavings, perMealCost as computePerMealCost, formatSavedAmount } from '@/contexts/subscriptions/domain/savings'

const EMPTY_MONTHLY_WINDOW: MonthlyReviewWindow = {
  eligible: false, locked: false, submitted: false,
  daysLeftForFullReward: 0, daysSinceCycleEnd: 0,
  expired: false, preCron: false, cycleLabel: null, planTier: 'monthly',
}

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

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Build the working-week menu (Mon–Sat for 6DAYS, Mon–Fri for 5DAYS) starting
// from the CURRENT week (or NEXT week if today is Sunday). Each item is
// tagged with its delivery state — past / today / future.
//
// `vegDayNumbers` is the per-day veg/non-veg map produced by
// vegDayNumbersFor() — for plain Veg/NonVeg customers it's all-or-nothing;
// for religious-mix it reflects exactly which weekdays the customer chose
// at checkout.
//
// Fallback: if the current week has no dishes at all (across both isVeg
// variants), use last week — keeps the variable-reward engine alive when
// the kitchen hasn't published the new week yet.
function buildCurrentWeekMenu(
  vegDayNumbers: Set<number>,
  weekType: WeekType,
  now: Date = new Date(),
  allDishes?: Dish[],
): { menu: MenuItem[]; weekStatus: WeekStatus } {
  const todayMidnight = new Date(now); todayMidnight.setHours(0, 0, 0, 0)
  const todayDay = todayMidnight.getDay() // 0=Sun, 1=Mon, ..., 6=Sat

  // Find Monday of THIS week (or NEXT Monday if today is Sunday)
  const mondayOffset = todayDay === 0 ? 1 : 1 - todayDay
  const monday = new Date(todayMidnight)
  monday.setDate(todayMidnight.getDate() + mondayOffset)

  const weekKey = getMenuWeek(monday)
  // Fetch ALL dishes for this week (both isVeg variants) so per-day picks
  // can choose whichever the customer needs. Falls back to last week if the
  // current week is empty — same heuristic as before.
  const _allDishes = allDishes ?? MENU_DATA
  let dishes = _allDishes.filter(d => d.week === weekKey)
  let usedFallback = false
  if (dishes.length === 0) {
    const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7)
    const lastKey = getMenuWeek(lastMonday)
    const lastDishes = _allDishes.filter(d => d.week === lastKey)
    if (lastDishes.length > 0) {
      dishes = lastDishes
      usedFallback = true
    }
  }
  // Key by `dayOfWeek_isVeg` so each per-day lookup is one Map.get() call.
  const dishByDayAndVeg = new Map<string, typeof dishes[number]>()
  for (const d of dishes) dishByDayAndVeg.set(`${d.dayOfWeek}_${d.isVeg}`, d)

  const W = weekType === '5DAYS' ? 5 : 6
  const out: MenuItem[] = []
  for (let i = 0; i < W; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const wantVeg = vegDayNumbers.has(i)
    const dish = dishByDayAndVeg.get(`${i}_${wantVeg}`) ?? null

    let state: MealState
    if (date.getTime() < todayMidnight.getTime())     state = 'past'
    else if (date.getTime() === todayMidnight.getTime()) state = 'today'
    else                                               state = 'future'

    out.push({
      day:   DAY_LABELS[i],
      date:  date.toLocaleDateString('en-AE', { day: 'numeric', month: 'short' }),
      dish:  dish?.name ?? '—',
      sub:   dish?.description ?? '',
      tag:   wantVeg ? 'Veg' : 'Non Veg',
      heat:  dish?.spiceLevel ?? 0,
      image: dish?.image ?? null,
      state,
    })
  }

  const weekStatus: WeekStatus = dishes.length === 0 ? 'empty' : usedFallback ? 'fallback' : 'live'
  return { menu: out, weekStatus }
}

function getGreeting() {
  // Pin to Asia/Dubai so SSR (Netlify, UTC) and the browser (Dubai, UTC+4)
  // agree on which side of noon/5pm we're on. `new Date().getHours()`
  // returns hours in the *runtime's* timezone — a guaranteed hydration
  // mismatch when the two clocks straddle a boundary.
  const h = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai', hour: 'numeric', hour12: false,
  }).format(new Date()))
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Next AE delivery day — "tomorrow evening" or a short date string if the
// next slot skips the weekend. Mirrors HeroToday's helper.
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
    // pin timeZone:'UTC' so the formatter reads its UTC fields verbatim
    // instead of re-shifting in the runtime's local timezone (UTC on the
    // server, Asia/Dubai in the browser → otherwise a hydration mismatch).
    return `${candidate.toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} evening`
  }
  return 'your next delivery day'
}

// Full-screen overlay fired after a successful resume — now ONLY the celebratory
// before-cutoff path (meal arriving tonight). The 'cutoff' result is retained for
// completeness but is no longer triggered: resuming past the cutoff is now gated
// by an explicit pre-resume warning (showResumeCutoffWarning), so replaying a
// "checking if your meal can make it tonight…" beat afterwards would contradict
// the news the customer just acknowledged.
// Phase 1 'checking': spinning ring + "Checking if your meal can make it
//   tonight..." — makes the server-side cutoff check feel personal, not instant.
// Phase 2 'delivery': confetti + Truck medallion — meal IS coming tonight.
// Phase 2 'cutoff':  no confetti + Moon medallion (warm amber) — honest but warm.
// The outer backdrop stays mounted across phase 1→2; AnimatePresence mode="wait"
// sequences the inner content exit→enter without re-mounting the backdrop.
type ResumePhase = 'checking' | 'delivery' | 'cutoff'
function ResumeWelcomeOverlay({ phase, firstName, prefersReducedMotion, nextDelivery }: {
  phase: ResumePhase
  firstName: string
  prefersReducedMotion: boolean | null
  nextDelivery: string
}) {
  return (
    <motion.div
      key="resume-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.15 : 0.28 }}
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        // Dark base first so white text is always readable — the radial glow
        // sits on top as a warm accent, not as the only colour layer. The
        // previous version started near-transparent at center, making white
        // text invisible against the cream dashboard background.
        background: phase === 'cutoff'
          ? 'radial-gradient(ellipse 55% 45% at center, rgba(200,148,23,0.32) 0%, transparent 70%), rgba(9,24,37,0.90)'
          : 'radial-gradient(ellipse 55% 45% at center, rgba(245,127,32,0.30) 0%, transparent 70%), rgba(9,24,37,0.90)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Confetti — delivery result only; cutoff is warm but not a party */}
      {phase === 'delivery' && !prefersReducedMotion && Array.from({ length: 20 }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / 20 + (i % 2 === 0 ? 0 : 0.16)
        const distance = 180 + ((i * 41) % 100)
        const x = Math.cos(angle) * distance
        const y = Math.sin(angle) * distance
        const palette = [OG, '#ffaa00', '#1ea34d', '#ede8da', '#fff']
        const colour = palette[i % palette.length]
        const isSquare = i % 3 === 0
        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.8, rotate: 0 }}
            animate={{ x, y, opacity: 0, scale: 0.3, rotate: i % 2 === 0 ? 300 : -260 }}
            transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
            style={{
              position: 'absolute',
              width: isSquare ? 8 : 7, height: isSquare ? 8 : 7,
              borderRadius: isSquare ? 2 : '50%',
              background: colour,
              boxShadow: `0 0 10px ${colour}55`,
            }}
          />
        )
      })}

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <AnimatePresence mode="wait" initial={false}>
          {phase === 'checking' ? (
            <motion.div
              key="checking"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}
            >
              {/* Spinning ring — language-neutral "checking" signal */}
              <motion.div
                animate={prefersReducedMotion ? {} : { rotate: 360 }}
                transition={{ duration: 1.1, ease: 'linear', repeat: Infinity }}
                style={{
                  width: 88, height: 88, borderRadius: '50%',
                  border: '3px solid rgba(245,127,32,0.28)',
                  borderTopColor: OG,
                  flexShrink: 0,
                }}
              />
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: 0.14 }}
                style={{ textAlign: 'center', maxWidth: 300 }}
              >
                <div style={{
                  fontFamily: BODY, fontSize: 20, fontWeight: 700,
                  color: '#fff', lineHeight: 1.5,
                  textShadow: '0 2px 16px rgba(9,24,37,0.40)',
                }}>
                  Checking if your meal<br />can make it tonight…
                </div>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.86, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93 }}
              transition={{
                duration: prefersReducedMotion ? 0.2 : 0.42,
                ease: [0.34, 1.56, 0.64, 1],
              }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}
            >
              {/* Medallion — OG orange for delivery; warm amber for cutoff */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0.2 }
                    : { type: 'spring', stiffness: 240, damping: 16, delay: 0.04 }
                }
                style={{
                  width: 96, height: 96, borderRadius: '50%',
                  background: phase === 'delivery' ? OG : '#c89417',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: phase === 'delivery'
                    ? '0 20px 50px rgba(245,127,32,0.45), 0 0 0 8px rgba(245,127,32,0.18)'
                    : '0 20px 50px rgba(200,148,23,0.38), 0 0 0 8px rgba(200,148,23,0.15)',
                }}
              >
                {phase === 'delivery'
                  ? <Truck size={40} strokeWidth={1.8} color="#fff" />
                  : <Moon  size={38} strokeWidth={1.8} color="#fff" />}
              </motion.div>

              {/* Text — delayed until the medallion spring settles */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0.2, delay: 0.08 }
                    : { duration: 0.46, ease: [0.16, 1, 0.3, 1], delay: 0.50 }
                }
                style={{ textAlign: 'center', maxWidth: 340, padding: '0 24px' }}
              >
                <div style={{
                  fontFamily: BODY, fontSize: 'clamp(26px, 4vw, 34px)',
                  fontWeight: 800, color: '#fff',
                  letterSpacing: '-0.02em', lineHeight: 1.1,
                  textShadow: '0 2px 16px rgba(9,24,37,0.25)',
                }}>
                  Welcome back{firstName !== 'there' ? `, ${firstName}` : ''}
                  <span style={{ color: phase === 'delivery' ? '#ffaa00' : '#ffe09a' }}>.</span>
                </div>
                <div style={{
                  marginTop: 10,
                  fontFamily: BODY, fontSize: 14, fontWeight: 500,
                  color: 'rgba(255,255,255,0.82)',
                  lineHeight: 1.55,
                  textShadow: '0 1px 8px rgba(9,24,37,0.30)',
                }}>
                  {phase === 'delivery'
                    ? "Dinner's arriving tonight — same time, same place."
                    : `The 2 PM kitchen cutoff has passed — first delivery ${nextDelivery}, 7–8 PM.`}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/**
 * State-owning dashboard for customers with an active subscription.
 * Composes HeroToday / PlanProgress / StatRow / QuickActions, owns the
 * skip / pause / resume optimistic state machine + confirm modals, and
 * derives the effective subscription used to drive the visible tiles.
 *
 * Was 363 inline LOC in ClientDashboard.tsx.
 */
export function ActiveDashboard({ sub, customer, userEmail, allSubscriptions, queuedSub = null, profileGate = [], outOfZone = false, justCheckedOut = false, monthlyWindow = EMPTY_MONTHLY_WINDOW, previewState, menuData, closureDates = [], intakePause = INTAKE_NOT_PAUSED, creditRows = [] }: {
  sub: Subscription; customer: Customer | null; userEmail: string; allSubscriptions: Subscription[]
  queuedSub?: Subscription | null
  profileGate?: string[]
  outOfZone?: boolean
  justCheckedOut?: boolean
  monthlyWindow?: MonthlyReviewWindow
  previewState?: string
  menuData?: Dish[]
  /** Company closure dates (YYYY-MM-DD) — both progress grids render these
   *  as "kitchen closed" instead of falsely painting them delivered. */
  closureDates?: string[]
  /** Seasonal intake pause — feeds PlanEndingPausedBanner (spec §6.4). */
  intakePause?: IntakeGateState
  /** Approved credit rows — the mobile home credit chip (sidebar chip's
   *  phone twin; desktop needs nothing here, the rail chip is always on). */
  creditRows?: CreditRow[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isNavPending, startNavTransition] = useTransition()
  const navTo = (href: string) => startNavTransition(() => router.push(href))
  const [actionError, setActionError]     = useState<string | null>(null)

  // Stable home-canvas marker. The home page's orange root-canvas colour is set via
  // `html:has(.home-mobile)` (layout.tsx), but iOS WebKit drops a :has() match when the
  // DOM mutates (the mobile drawer opening) — the orange canvas is lost and the navy
  // <body> bleeds into the top/bottom safe-area chrome and STAYS until a repaint. A
  // plain class can't be invalidated that way, so we mirror DashboardShell's `dash`
  // twin: mark <html> with `dash-home` while this view is mounted; `html.dash-home`
  // (layout.tsx) holds the orange canvas regardless of :has() state. Cleaned up on leave.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('dash-home')
    return () => root.classList.remove('dash-home')
  }, [])
  // Initial localState derived from server data:
  //   • Paused   → status is 'Paused'
  //   • Skipped  → status is 'Skipped' (DB-promoted) OR last_skipped_date
  //               matches today (legacy rows that pre-date the promotion)
  //   • Active   → otherwise
  const initialLocalState: LocalState =
    sub.status === SUBSCRIPTION_STATUS.PAUSED ? 'paused'
    : sub.status === SUBSCRIPTION_STATUS.SKIPPED ? 'skipped'
    : isSameDay(sub.last_skipped_date) ? 'skipped'
    : 'active'
  const [localState, setLocalState]       = useState<LocalState>(initialLocalState)
  // ActionKey expanded for the new planning verbs. Each pending → success
  // microinteraction runs on its OWN key so QuickActions can render the
  // correct feedback per button. The original three keys (skip/pause/resume)
  // are the same-day actions that also flip localState optimistically;
  // the four new keys (plan-skip/unskip/plan-pause/cancel-plan-pause) are
  // future-facing — no localState change, just visual lifecycle.
  type ActionKey = 'skip' | 'pause' | 'resume' | 'plan-skip' | 'unskip' | 'plan-pause' | 'cancel-plan-pause'
  const [pendingAction, setPendingAction]   = useState<ActionKey | null>(null)
  const [successAction, setSuccessAction]   = useState<ActionKey | null>(null)
  // Confirmation toast — every successful action (skip/unskip/pause/resume/
  // plan-skip/plan-pause/cancel) raises a brief "done" pull-up so the user
  // always gets acknowledgement. Independent of successAction's 1.4s inline
  // choreography so it can linger long enough to read.
  const [confirmMsg, setConfirmMsg]         = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [showPauseConfirm, setShowPauseConfirm] = useState(false)
  const [showResumeCutoffWarning, setShowResumeCutoffWarning] = useState(false)
  const [showQueuedPauseWarning, setShowQueuedPauseWarning] = useState(false)
  // Future-skip / un-skip modal state. mode keys what UI variant renders;
  // date pre-fills for confirm modes (pill click), absent for picker mode
  // (QuickActions "Plan a skip" button).
  const [futureSkipModal, setFutureSkipModal] = useState<{ mode: FutureSkipMode; date?: string } | null>(null)
  // Plan-a-pause picker modal (open-ended, Variant B).
  const [planPauseModalOpen, setPlanPauseModalOpen] = useState(false)
  // Cancel-planned-pause confirmation modal — when sub has planned_pause_start
  // and customer taps the (now-transformed) Pause button.
  const [showCancelPlannedPause, setShowCancelPlannedPause] = useState(false)
  // Savings benchmark capture — opens when the customer taps the empty-state
  // StatRow tile, or when the customer wants to edit their existing benchmark.
  // `benchmarkSaving` gates the modal CTA + the StatTile while the server
  // action is in flight.
  const [benchmarkModalOpen, setBenchmarkModalOpen] = useState(false)
  const [benchmarkSaving, setBenchmarkSaving] = useState(false)
  // Optimistic state for the four future-facing operations. The bar reads
  // through this so it reflects the change the instant the customer confirms,
  // before router.refresh delivers canonical data. Key insight: the button's
  // success state must NOT lead the bar's visual change — that creates the
  // unsettling lag where the button says "scheduled" but the bar hasn't moved
  // yet. With optimisticOp set immediately on confirm, the bar updates first;
  // the button's success state lands ~200ms later when the server confirms.
  // Cleared on error (rollback) or by the convergence useEffect below when
  // canonical data catches up.
  type OptimisticFutureOp =
    | { kind: 'plan-skip'; date: string }
    | { kind: 'unskip'; date: string }
    | { kind: 'plan-pause'; date: string }
    | { kind: 'cancel-plan-pause' }
  const [optimisticOp, setOptimisticOp] = useState<OptimisticFutureOp | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [resumeOverlayPhase, setResumeOverlayPhase] = useState<ResumePhase | null>(null)
  const resumeOverlayTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    setLocalState(
      sub.status === SUBSCRIPTION_STATUS.PAUSED ? 'paused'
      : sub.status === SUBSCRIPTION_STATUS.SKIPPED ? 'skipped'
      : isSameDay(sub.last_skipped_date) ? 'skipped'
      : 'active'
    )
  }, [sub.status, sub.last_skipped_date])

  useEffect(() => () => {
    if (successTimer.current) clearTimeout(successTimer.current)
    resumeOverlayTimers.current.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (!showSkipConfirm && !showPauseConfirm && !showResumeCutoffWarning && !showQueuedPauseWarning && !showCancelPlannedPause) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSkipConfirm(false)
        setShowPauseConfirm(false)
        setShowResumeCutoffWarning(false)
        setShowQueuedPauseWarning(false)
        setShowCancelPlannedPause(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSkipConfirm, showPauseConfirm, showResumeCutoffWarning, showQueuedPauseWarning, showCancelPlannedPause])

  const isWeekly       = sub.plan_name.includes('Weekly Flex')
  const isOneTime      = sub.plan_name.includes('One-Time')
  const isPausableTier = sub.plan_name.includes('Monthly Premium') || sub.plan_name.includes('Monthly Max')
  const isScheduled    = sub.status === SUBSCRIPTION_STATUS.SCHEDULED || new Date(sub.start_date).getTime() > Date.now()
  const canPause       = isPausableTier && !sub.has_paused_before && !isWeekly && !isOneTime && sub.status !== SUBSCRIPTION_STATUS.ENDED && !isScheduled
  // True when the 1-pause-per-cycle credit has been spent on a still-live,
  // pausable sub. Drives the "Pause used · resets next cycle" chip in
  // QuickActions so the slot doesn't vanish silently after resume — the
  // user reads what happened and when the affordance returns.
  const pauseCreditUsed = isPausableTier && !!sub.has_paused_before && sub.status !== SUBSCRIPTION_STATUS.ENDED && !isScheduled

  // Seasonal intake pause — plan-ending-during-a-pause banner (spec §6.4).
  // The 7-day window and "not starting in the future" gate deliberately
  // mirror PlanClient's renewEligible (PlanClient.tsx, ~line 235) computed
  // independently here from the raw sub, exactly as renewEligible reads it —
  // so the banner appears precisely when the renew affordance would
  // otherwise have been offered.
  const planEndDaysRemaining = Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
  const planStartsInFuture = new Date(sub.start_date).getTime() > Date.now()
  const showPlanEndingPausedBanner = intakePause.paused && !planStartsInFuture && planEndDaysRemaining <= 7

  const endedPlans      = allSubscriptions.filter(s => s.status === SUBSCRIPTION_STATUS.ENDED)
  const totalDelivered  = allSubscriptions.reduce((acc, x) => acc + (x.delivered_meals ?? 0), 0)
  const memberSinceText = customer?.created_at
    ? new Date(customer.created_at).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })
    : null

  const CONFIRM_MESSAGES: Record<ActionKey, string> = {
    skip: 'Tonight’s meal skipped',
    pause: 'Plan paused',
    resume: 'Plan resumed',
    'plan-skip': 'Skip scheduled',
    unskip: 'Skip removed',
    'plan-pause': 'Pause scheduled',
    'cancel-plan-pause': 'Planned pause cancelled',
  }
  const notifyDone = (key: ActionKey) => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmMsg(CONFIRM_MESSAGES[key])
    confirmTimer.current = setTimeout(() => setConfirmMsg(null), 4800)
  }
  const dismissConfirm = () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmMsg(null)
  }

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
      notifyDone(actionKey)
      if (actionKey === 'resume') {
        const isAfterCutoff = skipPastCutoff && !skipNoDelivery
        if (isAfterCutoff) {
          // The pre-resume warning already told them tonight's meal is gone, so
          // persist the hero's resumed-after-cutoff state but SKIP the welcome
          // overlay — its "checking if your meal can make it tonight…" beat would
          // contradict the warning the customer just acknowledged.
          try {
            const todayAE = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
            sessionStorage.setItem('dorm-resumed-after-cutoff', todayAE)
          } catch {}
          setResumedAfterCutoff(true)
        } else if (!skipNoDelivery) {
          // Delivery day, before the cutoff → tonight's dinner IS coming. Play the
          // welcome-back celebration (checking spinner → confetti + truck).
          resumeOverlayTimers.current.forEach(clearTimeout)
          resumeOverlayTimers.current = []
          setResumeOverlayPhase('checking')
          const t1 = setTimeout(() => {
            setResumeOverlayPhase('delivery')
            const t2 = setTimeout(() => setResumeOverlayPhase(null), 3400)
            resumeOverlayTimers.current.push(t2)
          }, 1800)
          resumeOverlayTimers.current.push(t1)
        }
        // else: non-delivery day (e.g. Sunday) → nothing arrives tonight, so no
        // "arriving tonight" celebration; the hero's own "No delivery today"
        // state carries the message.
      }
      router.refresh()
    })
  }

  const handleSkipRequest  = () => {
    // Guard every state skipMeal would reject, so the confirm modal never opens
    // on a doomed action. Mirrors the disabled-button gating but also protects
    // desktop from a stale 60s cutoff tick between render and tap.
    if (localState !== 'active' || isPending || isScheduled) return
    if (isOneTime || skipPastCutoff || skipNoDelivery || skipIsMakeupDay || skipQuota.left <= 0) return
    setShowSkipConfirm(true)
  }
  const handleSkipConfirm  = () => { setShowSkipConfirm(false); act(() => skipMeal(sub.id), 'skipped', 'skip') }
  const handlePauseRequest = () => {
    if (isPending || isScheduled) return
    // Already-scheduled planned pause: tapping the button opens the cancel
    // confirmation. This is the third state of the merged button (next to
    // "Pause now" and "Resume plan"). Reachable on an active OR a just-skipped
    // day — a skip shouldn't hide a pause the customer has already scheduled.
    if (sub.planned_pause_start && (localState === 'active' || localState === 'skipped')) {
      setShowCancelPlannedPause(true)
      return
    }
    if (localState === 'paused') {
      // Same-day lock: kitchen needs a committed no-prep window. UI button is
      // already disabled, but guard here too so a double-tap can't sneak through.
      if (resumeLockedSameDay) return
      // Past the 2 PM kitchen cutoff on a delivery day, resuming brings the plan
      // back but NOT tonight's meal. Surface a full-screen warning first so the
      // no-show is a choice, not a surprise — confirm routes to the real resume.
      if (skipPastCutoff && !skipNoDelivery) { setShowResumeCutoffWarning(true); return }
      act(() => resumeSubscription(sub.id), 'active', 'resume')
    }
    else if (pausePastFinalDay) return
    // Already skipped today → an immediate pause would double-count tonight, so
    // that path stays closed. But scheduling a FUTURE pause is still perfectly
    // valid — route straight to the date picker (it only offers tomorrow onward,
    // so "today" is impossible by construction). Fixes the bug where a skip
    // wrongly locked the customer out of planning any future pause.
    else if (localState === 'skipped' && canPause) {
      openPlanPausePicker()
    }
    else if (canPause && localState === 'active') {
      // If the user has a queued plan, surface a warning that its start date
      // will shift forward with each delivery day they stay paused. The DB
      // trigger (trg_subscriptions_shift_queued_scheduled) handles the actual
      // cascade — this modal just makes the consequence visible before the tap.
      if (queuedSub) {
        setShowQueuedPauseWarning(true)
      } else {
        setShowPauseConfirm(true)
      }
    }
  }
  const handlePauseConfirm = () => {
    setShowPauseConfirm(false)
    act(() => pauseSubscription(sub.id), 'paused', 'pause')
  }
  const handleResumeConfirm = () => {
    setShowResumeCutoffWarning(false)
    act(() => resumeSubscription(sub.id), 'active', 'resume')
  }
  const handleQueuedPauseConfirm = () => {
    setShowQueuedPauseWarning(false)
    act(() => pauseSubscription(sub.id), 'paused', 'pause')
  }

  // Future-skip handlers. Differ from `act()` for skip/pause because
  // future-skip doesn't change `localState` (today's UI stays as-is —
  // we're scheduling a skip for a different day, not flipping current
  // status). On confirmation we close the modal, fire the server action,
  // and refresh so the calendar bar picks up the new skipped_dates entry.
  const openFutureSkipModal   = (date: string) => setFutureSkipModal({ mode: 'confirm-skip', date })
  const openFutureUnskipModal = (date: string) => setFutureSkipModal({ mode: 'confirm-unskip', date })
  const openPlanSkipPicker    = () => setFutureSkipModal({ mode: 'pick-then-skip' })
  const closeFutureSkipModal  = () => setFutureSkipModal(null)

  // Shared microinteraction runner for future-facing actions. Mirrors the
  // pending → success → steady choreography of `act()` without the
  // optimistic localState flip (these actions don't affect today's status).
  //
  // CRITICAL ORDERING: optimisticOp is set BEFORE pendingAction in the same
  // render. React batches these so the next paint shows the bar already
  // updated AND the spinner showing — visually they appear in lockstep. The
  // success state is only reached AFTER the server confirms, so the customer
  // never sees a "scheduled" button before the bar has moved.
  //
  // The success state auto-clears after 1.4s — long enough to read, short
  // enough to feel snappy. Pending and success are keyed so QuickActions
  // can render the correct microinteraction on the correct button.
  const runFutureAction = (
    fn: () => Promise<{ error?: string } | { success: boolean }>,
    actionKey: ActionKey,
    optimistic: OptimisticFutureOp,
  ) => {
    setActionError(null)
    setOptimisticOp(optimistic)
    setPendingAction(actionKey)
    startTransition(async () => {
      let result: { error?: string } | { success: boolean } | null = null
      let threw: Error | null = null
      try { result = await fn() }
      catch (e) { threw = e as Error }
      setPendingAction(null)
      if (threw || (result && 'error' in result && result.error)) {
        // Rollback: clear optimistic state so the bar reverts to canonical.
        setOptimisticOp(null)
        setActionError(threw ? `Server error: ${threw.message}` : (result as { error: string }).error)
        return
      }
      if (successTimer.current) clearTimeout(successTimer.current)
      setSuccessAction(actionKey)
      successTimer.current = setTimeout(() => setSuccessAction(null), 1400)
      notifyDone(actionKey)
      router.refresh()
      // Note: optimisticOp stays set until canonical data catches up. The
      // convergence effect below detects the match and clears it then.
    })
  }
  const handleConfirmFutureSkip = (date: string) => {
    setFutureSkipModal(null)
    runFutureAction(() => skipFutureDate(sub.id, date), 'plan-skip', { kind: 'plan-skip', date })
  }
  const handleConfirmFutureUnskip = (date: string) => {
    setFutureSkipModal(null)
    runFutureAction(() => unskipFutureDate(sub.id, date), 'unskip', { kind: 'unskip', date })
  }

  // Plan-a-pause handlers. Follow the same shape as future-skip — picker
  // modal commits via server action, no localState flip (status stays
  // Active until the cron activates the pause on the scheduled date).
  const openPlanPausePicker = () => setPlanPauseModalOpen(true)
  const closePlanPauseModal  = () => setPlanPauseModalOpen(false)
  const handleConfirmPlanPause = (startDateIso: string) => {
    setPlanPauseModalOpen(false)
    runFutureAction(() => planPause(sub.id, startDateIso), 'plan-pause', { kind: 'plan-pause', date: startDateIso })
  }
  const handleCancelPlannedPause = () => {
    setShowCancelPlannedPause(false)
    runFutureAction(() => cancelPlannedPause(sub.id), 'cancel-plan-pause', { kind: 'cancel-plan-pause' })
  }

  // Convergence detector — clears optimisticOp once the canonical sub prop
  // reflects the customer's change. Runs after router.refresh propagates new
  // server data through the layout. While optimisticOp is set, the bar reads
  // through it (so canonical+optimistic produces the same effective state as
  // canonical alone once they agree). Without this, optimisticOp would linger
  // indefinitely and conflict with subsequent operations.
  useEffect(() => {
    if (!optimisticOp) return
    const canonicalSkipped = sub.skipped_dates ?? []
    let caughtUp = false
    switch (optimisticOp.kind) {
      case 'plan-skip':
        caughtUp = canonicalSkipped.includes(optimisticOp.date)
        break
      case 'unskip':
        caughtUp = !canonicalSkipped.includes(optimisticOp.date)
        break
      case 'plan-pause':
        caughtUp = sub.planned_pause_start === optimisticOp.date
        break
      case 'cancel-plan-pause':
        caughtUp = !sub.planned_pause_start
        break
    }
    if (caughtUp) setOptimisticOp(null)
  }, [sub.skipped_dates, sub.planned_pause_start, optimisticOp])

  // When the user just clicked Skip, the optimistic localState flips to 'skipped'
  // before router.refresh() lands. During that window the server count is still
  // stale — bump it locally so StatRow's "Skips used" tile and the PlanProgress
  // bar move in lockstep with the status change instead of a beat behind.
  const optimisticSkipPending =
    localState === 'skipped' && !isSameDay(sub.last_skipped_date)
  // Today's AE wall date — appended to skipped_dates optimistically so the
  // calendar bar paints today's pill as hatched the instant the customer
  // clicks Skip, before the server round-trip completes.
  const todayAEIso = (() => {
    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
    return `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`
  })()
  // Compose the optimistic + canonical view of skipped_dates, planned_pause,
  // and the related counters. Two layers stack:
  //   1. Same-day skip (existing optimisticSkipPending)
  //   2. Future-facing op (new optimisticOp)
  // Each layer is dedup-safe — if canonical data already reflects the change
  // (router.refresh landed before the convergence effect ran), the effective
  // values stay correct.
  let effSkippedDates: string[] = sub.skipped_dates ?? []
  let effSkippedCount = sub.skipped_meals_count
  let effPlannedPauseStart: string | null = sub.planned_pause_start ?? null
  let effHasPausedBefore = sub.has_paused_before
  if (optimisticSkipPending && !effSkippedDates.includes(todayAEIso)) {
    effSkippedDates = [...effSkippedDates, todayAEIso]
    effSkippedCount += 1
  }
  if (optimisticOp?.kind === 'plan-skip' && !effSkippedDates.includes(optimisticOp.date)) {
    effSkippedDates = [...effSkippedDates, optimisticOp.date]
    effSkippedCount += 1
  } else if (optimisticOp?.kind === 'unskip' && effSkippedDates.includes(optimisticOp.date)) {
    effSkippedDates = effSkippedDates.filter(d => d !== optimisticOp.date)
    effSkippedCount = Math.max(0, effSkippedCount - 1)
  } else if (optimisticOp?.kind === 'plan-pause') {
    effPlannedPauseStart = optimisticOp.date
    effHasPausedBefore = true
  } else if (optimisticOp?.kind === 'cancel-plan-pause') {
    effPlannedPauseStart = null
    effHasPausedBefore = false
  }
  effSkippedDates = effSkippedDates.slice().sort()

  const effectiveSub: Subscription = {
    ...sub,
    status: localState === 'paused' ? SUBSCRIPTION_STATUS.PAUSED : localState === 'skipped' ? SUBSCRIPTION_STATUS.SKIPPED : sub.status,
    skipped_meals_count: effSkippedCount,
    last_skipped_date:   optimisticSkipPending ? new Date().toISOString() : sub.last_skipped_date,
    skipped_dates: effSkippedDates,
    planned_pause_start: effPlannedPauseStart,
    has_paused_before: effHasPausedBefore,
  }

  // Skip allowance per plan tier — `total: 0` means the plan doesn't include
  // skips at all (Trial, Welcome Meal). Used by QuickActions to render a count
  // chip on the skip button so the user always knows how much wiggle room they
  // have left for the cycle. Includes the optimistic just-skipped count.
  //
  // Read from the plan domain, NOT an inline name match. The old three-way
  // `.includes()` chain silently returned 0 for every plan outside it — Staff
  // Monthly (which the domain grants 3 skips, "interns have exams too") lost
  // its skips entirely, and because the exhausted-guard below required
  // `total > 0`, the skip button stayed bright-orange and clickable while
  // doing nothing at all. resolvePlan covers every current and future plan.
  const skipTotal = resolvePlan(effectiveSub.plan_name)?.maxSkips ?? 0
  const skipQuota = {
    total: skipTotal,
    left:  Math.max(0, skipTotal - effectiveSub.skipped_meals_count),
  }
  const rawName   = customer?.name ?? userEmail.split('@')[0]
  const firstName = rawName?.split(' ')[0] ?? 'there'

  // Savings — third StatTile (cycle-scoped) + greeting ribbon (lifetime).
  // Returns null when the customer hasn't supplied a takeout benchmark yet;
  // StatRow renders the capture CTA in that case. perMealDormers is computed
  // independently so the SavingsBenchmarkModal can show its live preview even
  // before the benchmark is set. Plain calls (not useMemo) because effectiveSub
  // is reconstructed every render — memoising on it would just defeat the
  // purpose, and the underlying math is a handful of arithmetic ops.
  const cycleSavingsValue = computeCycleSavings(effectiveSub, customer)
  const lifetimeSavingsValue = computeLifetimeSavings(allSubscriptions, customer)
  const perMealDormers = computePerMealCost(effectiveSub, customer ?? {})

  // Server-action wrapper for the benchmark save. Uses isPending-style state
  // (not the act() helper) because this isn't a subscription mutation — it
  // doesn't need optimistic-state flips and shouldn't share microinteraction
  // state with skip/pause/resume.
  const handleConfirmBenchmark = (aed: number) => {
    if (benchmarkSaving) return
    setActionError(null)
    setBenchmarkSaving(true)
    startTransition(async () => {
      let result: { ok?: true; error?: string } | null = null
      try {
        result = await setTakeoutBenchmark(aed)
      } catch (e) {
        result = { error: (e as Error).message }
      }
      setBenchmarkSaving(false)
      if (result && 'error' in result && result.error) {
        setActionError(result.error)
        return
      }
      setBenchmarkModalOpen(false)
      router.refresh()
    })
  }

  // Per-day veg/non-veg map. For Veg/NonVeg pref it's all-or-nothing; for
  // religious-mix it's the customer's checkout-chosen day set, snapshotted on
  // the active sub. Stale day names (e.g. 'Saturday' on a now-5DAYS plan)
  // are silently dropped by vegDayNumbersFor.
  const subWeekType: WeekType = (sub.week_type === '5DAYS' || sub.week_type === '6DAYS') ? sub.week_type : '6DAYS'
  const vegDayNumbers = useMemo(
    () => vegDayNumbersFor(customer?.meal_preference_type, sub.veg_days, subWeekType),
    [customer?.meal_preference_type, sub.veg_days, subWeekType]
  )
  const { menu: weekMenu } = useMemo(
    () => buildCurrentWeekMenu(vegDayNumbers, subWeekType, new Date(), menuData),
    [vegDayNumbers, subWeekType, menuData]
  )
  const todayMeal = weekMenu.find(m => m.state === 'today') ?? null

  // 2 PM Asia/Dubai skip cutoff — recalculate on a 60s tick so the button
  // locks itself the moment the clock crosses 14:00 AE without a refresh.
  const [skipPastCutoff, setSkipPastCutoff] = useState(() => {
    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
    return ae.getUTCHours() >= 14
  })
  useEffect(() => {
    const tick = () => {
      const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
      setSkipPastCutoff(ae.getUTCHours() >= 14)
    }
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [])

  // Today (AE) is a non-delivery day for this week_type → skip is meaningless
  // (no meal scheduled). Mirrors the server-side check in skipMeal().
  // ISO dow: 1=Mon … 7=Sun. subWeekType is narrowed above to 5DAYS|6DAYS.
  const skipNoDelivery = useMemo(() => {
    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const isoDow = ((ae.getUTCDay() + 6) % 7) + 1
    if (subWeekType === '6DAYS') return isoDow === 7
    return isoDow === 6 || isoDow === 7  // 5DAYS
  }, [subWeekType])

  // Today is a make-up day (position > totalDeliveries). Make-up days can't be
  // skipped — they're extra days earned by earlier skips. Mirrors server guard.
  const skipIsMakeupDay = useMemo(() => {
    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const todayIso = `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`
    const mealsPerDel = sub.plan_name.includes('Monthly Max') ? 2 : 1
    const totalDel = Math.max(1, Math.ceil(sub.total_meals / mealsPerDel))
    const startD = new Date(sub.start_date + 'T00:00:00')
    const targetD = new Date(todayIso + 'T00:00:00')
    if (targetD < startD) return false
    let pos = 0
    const d = new Date(startD)
    const wt = sub.week_type === '5DAYS' ? '5DAYS' : '6DAYS'
    while (d <= targetD) {
      const isoDow = ((d.getDay() + 6) % 7) + 1
      const isWork = wt === '6DAYS' ? isoDow !== 7 : isoDow !== 6 && isoDow !== 7
      if (isWork) pos++
      if (d.getFullYear() === targetD.getFullYear() && d.getMonth() === targetD.getMonth() && d.getDate() === targetD.getDate()) break
      d.setDate(d.getDate() + 1)
    }
    return pos > totalDel
  }, [sub.start_date, sub.total_meals, sub.plan_name, sub.week_type])

  // The user resumed after the 2 PM kitchen cutoff on a delivery day. Persisted
  // through router.refresh() via sessionStorage (keyed to today's AE date) so
  // the hero doesn't revert to a false "Arriving in ~Nh" or "Delivered" state
  // after the server responds. Cleared automatically on the next calendar day.
  const [resumedAfterCutoff, setResumedAfterCutoff] = useState(() => {
    try {
      const stored = sessionStorage.getItem('dorm-resumed-after-cutoff')
      if (!stored) return false
      const todayAE = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
      if (stored !== todayAE) { sessionStorage.removeItem('dorm-resumed-after-cutoff'); return false }
      return true
    } catch { return false }
  })

  // Same-day resume lock: if the sub was paused today (AE calendar) the resume
  // button stays locked. The kitchen needs at least one committed no-prep window
  // before the customer can flip back — same-day reversal creates operational
  // ambiguity. Falls back to today's date during the optimistic window when
  // sub.pause_date hasn't refreshed yet (localState flipped but server not back).
  const resumeLockedSameDay = useMemo(() => {
    const pd = sub.pause_date ?? (localState === 'paused' ? new Date().toISOString() : null)
    if (!pd) return false
    const shift = 4 * 60 * 60 * 1000
    const todayAE = new Date(Date.now()             + shift).toISOString().slice(0, 10)
    const pauseAE = new Date(new Date(pd).getTime() + shift).toISOString().slice(0, 10)
    return todayAE === pauseAE
  }, [sub.pause_date, localState])

  // Final-day pause lock — ANY time on the literal end_date. Pausing on the
  // last delivery day doesn't protect a future meal (cycle ends after that
  // day), is operationally meaningless, AND is a potential abuse vector
  // (pause-on-last-day → never resume → paused_days drags end_date forever).
  // Stricter than the previous 14:00 AE gate — now blocks the full day.
  // Whether end_date is a natural last day or a make-up day, that specific
  // day is off-limits. Customer can still Resume from a paused state.
  const pausePastFinalDay = useMemo(() => {
    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const aeIso = `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`
    return aeIso >= sub.end_date
  }, [sub.end_date])

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

  // Order-confirmation banner — captured on first render via lazy-init useState
  // so the value survives the URL strip + re-renders that follow. Stays visible
  // until manually dismissed (no auto-timeout) so the user always has a record
  // of what they just bought sitting in the notification slot.
  //
  // For renewals the active sub is the OLD one (getActiveSubscription orders
  // by start_date asc), so we surface the NEWEST sub from allSubscriptions
  // (ordered by created_at desc) — that's the one the user just paid for.
  const [showOrderBanner, setShowOrderBanner] = useState(justCheckedOut)
  const justBoughtSub = allSubscriptions[0] ?? sub

  // 3-second celebration overlay — fires once on the first render after a
  // successful checkout. Emotional release / "feeling of accomplishment"
  // companion to the informational banner. Honours prefers-reduced-motion.
  const prefersReducedMotion = useReducedMotion()

  // End-of-cycle renew banner starts collapsed (owner call, 2026-08-19):
  // headline + Renew CTA carry the message; the subline sits behind a
  // chevron. One state for both the desktop and mobile renders of the same
  // window, so the choice survives a breakpoint change mid-session.
  const [renewExpanded, setRenewExpanded] = useState(false)
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(justCheckedOut)
  useEffect(() => {
    if (!showSuccessOverlay) return
    const t = setTimeout(() => setShowSuccessOverlay(false), 3000)
    return () => clearTimeout(t)
  }, [showSuccessOverlay])

  // ── Mobile home (≤768) — repacks the desktop data/handlers into the
  //    redesigned single-screen view. Desktop tree below is untouched.
  // MobileHome takes its hero + today-cell state as static props (no internal
  // clock), so re-render once a minute to flip them at 20:00 AE without a
  // refresh — the mobile equivalent of HeroToday/PlanProgress's own ticks.
  const [, setMobileMinute] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setMobileMinute(n => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  const mobileWeekType: DeliveryWeekType = effectiveSub.week_type === '5DAYS' ? '5DAYS' : '6DAYS'
  const aeTodayIso = new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10)
  const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
  const heatWords = ['', 'Mild', 'Medium', 'Hot']

  // ── Mobile action display-state — the visible half of the same gating the
  //    desktop QuickActions/HeroToday express and the backend enforces. Every
  //    button reflects its real end-state and carries an inline reason (touch
  //    has no hover). The shared handlers + skipMeal/pauseSubscription still
  //    gate independently; nothing here can write a blocked action. ──
  // Optimistic planned-pause start (effPlannedPauseStart), NOT raw sub — so the
  // mobile calendar's boundary marker + "can't skip inside the pause window"
  // gating flip the instant a future pause is scheduled/cancelled, matching the
  // desktop PlanProgress bar (which reads effectiveSub) instead of lagging the
  // server round-trip.
  const mPlannedPause = effectiveSub.planned_pause_start ?? null
  // AE wall-date the pause took effect — every cell on/after it (incl. today)
  // freezes to "on hold" in the mobile calendar, mirroring desktop's pause
  // overlay (PlanProgress aeDateOfTimestamp). Falls back to today during the
  // optimistic window before sub.pause_date refreshes, so the freeze shows
  // immediately on tap rather than lagging the server round-trip.
  const mPauseCutoffIso: string | null = (() => {
    const ts = sub.pause_date ?? (localState === 'paused' ? new Date().toISOString() : null)
    if (!ts) return null
    const ae = new Date(new Date(ts).getTime() + 4 * 60 * 60 * 1000)
    return `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`
  })()
  const mSkipsLeft = skipQuota.left
  const mSkipsTotal = skipQuota.total
  // Hero closure states — mirror desktop HeroToday so the mobile hero stops
  // framing a delivered / skipped / just-resumed meal as "Tonight's dish".
  const aeHourNow = new Date(Date.now() + 4 * 3600000).getUTCHours()
  // previewState (dev harness only) forces delivered/resumed without the clock.
  const mResumedCutoff = (resumedAfterCutoff || previewState === 'resumed') && localState !== 'paused' && !isScheduled && localState !== 'skipped' && !skipNoDelivery
  const mDelivered = !mResumedCutoff && localState !== 'paused' && !isScheduled && localState !== 'skipped' && !skipNoDelivery && (aeHourNow >= 20 || previewState === 'delivered')
  const mLastDayNoQueue = !isScheduled && !queuedSub && new Date(sub.end_date + 'T00:00:00').toDateString() === new Date().toDateString()
  const mNextDelivery = (): string => {
    for (let d = 1; d <= 7; d++) {
      const cand = new Date(Date.now() + 4 * 3600000 + d * 86400000)
      const isoDow = cand.getUTCDay() === 0 ? 7 : cand.getUTCDay()
      const isDel = mobileWeekType === '5DAYS' ? (isoDow !== 6 && isoDow !== 7) : isoDow !== 7
      if (isDel) return d === 1 ? 'tomorrow evening' : `${cand.toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} evening`
    }
    return 'your next delivery day'
  }
  const mHeroStatus: MobileHomeData['heroStatus'] =
    localState === 'paused' ? { label: 'Paused', tone: 'paused' }
    : isScheduled            ? { label: 'Scheduled', tone: 'scheduled' }
    : localState === 'skipped' ? { label: 'Skipped', tone: 'skipped' }
    : skipNoDelivery         ? { label: 'No delivery today', tone: 'off' }
    : todayMeal == null      ? { label: 'No menu yet', tone: 'off' }
    : mResumedCutoff         ? { label: `Back ${mNextDelivery().replace(' evening', '')}`, tone: 'off' }
    : mDelivered             ? { label: 'Delivered', tone: 'delivered' }
    : { label: 'Active', tone: 'active' }
  // Closure mirrors the desktop HeroToday teardown precedence: scheduled and
  // both "off" variants (no-delivery weekday, menu-not-yet-set) flip the hero to
  // the light card with their own copy INSTEAD of framing a dish — without these
  // the dark active-dish card leaked through (a no-menu weekday even showed a
  // green "Active" pill + phantom arrival countdown). Order matches mHeroStatus.
  const mHeroClosure: MobileHomeData['heroClosure'] =
    localState === 'paused' ? { heading: 'Your plan is paused', subtitle: resumeLockedSameDay ? 'You can resume from tomorrow onwards.' : 'Tap resume when you’re ready — deliveries pick right back up.' }
    : isScheduled ? { heading: 'You’re all set', subtitle: `Your meals begin on ${fmtShort(effectiveSub.start_date)}.` }
    : localState === 'skipped' ? { heading: 'You skipped tonight', subtitle: 'Tomorrow’s delivery is on track.' }
    : skipNoDelivery ? { heading: 'No delivery today', subtitle: `${mobileWeekType === '5DAYS' ? 'We deliver Mon–Fri.' : 'We deliver Mon–Sat.'} See you tomorrow.` }
    : todayMeal == null ? { heading: 'No menu set yet', subtitle: 'Check back shortly.' }
    : mResumedCutoff ? { heading: 'You’re back', subtitle: `The 2 PM cutoff passed — first delivery ${mNextDelivery()}.` }
    : mDelivered ? { heading: 'Tonight’s dinner is delivered', subtitle: mLastDayNoQueue ? 'We’d love to keep serving you more.' : 'Same time, same place tomorrow.' }
    : null
  const mSkip: MobileHomeData['skip'] =
    localState === 'paused'  ? { disabled: true, caption: 'Plan paused' }
    : isScheduled            ? { disabled: true, caption: `Starts ${fmtShort(effectiveSub.start_date)}` }
    : localState === 'skipped' ? { disabled: true, caption: 'Tonight’s meal is skipped', done: true }
    : isOneTime              ? { disabled: true, caption: 'Skipping isn’t part of a trial' }
    : skipNoDelivery         ? { disabled: true, caption: 'No delivery today — nothing to skip' }
    : skipIsMakeupDay       ? { disabled: true, caption: "Make-up days can’t be skipped" }
    : skipPastCutoff         ? { disabled: true, caption: 'Past the 2 PM cutoff — skip tomorrow instead' }
    // Two distinct zero states, both disabled. `total === 0` is a plan that
    // never included skips (Welcome Meal); `left === 0` is an allowance spent.
    // Guarding only the second one left the first rendering as an enabled
    // button that did nothing when tapped.
    : mSkipsTotal === 0      ? { disabled: true, caption: 'Skips aren’t part of this plan' }
    : mSkipsLeft === 0       ? { disabled: true, caption: 'No skips left this cycle' }
    : { disabled: false, caption: `${mSkipsLeft} of ${mSkipsTotal} skips left this cycle` }
  const mPause: MobileHomeData['pause'] =
    localState === 'paused'
      ? { mode: 'resume', label: 'Resume plan', caption: resumeLockedSameDay ? 'You can resume from tomorrow' : null, disabled: resumeLockedSameDay }
    : mPlannedPause
      ? { mode: 'planned', label: `Pause set · ${fmtShort(mPlannedPause)}`, caption: 'Tap to cancel', disabled: isPending }
    : (localState === 'skipped' && canPause && !pausePastFinalDay)
      // Skipped tonight → immediate pause is off the table (it'd double-count
      // tonight), but a FUTURE pause is still valid. Stay enabled and route to
      // the date picker (tomorrow-onward only). NOT disabled — that was the bug.
      // Skipped-but-ineligible cases (final day / credit used / non-monthly tier)
      // fall through to the specific disabled branches below for the real reason.
      ? { mode: 'pause', label: 'Plan a pause', caption: 'Skipped tonight — pick a future day', disabled: false }
    : !isPausableTier
      ? { mode: 'disabled', label: 'Pause', caption: 'Available on monthly plans', disabled: true }
    : pauseCreditUsed
      ? { mode: 'disabled', label: 'Pause', caption: 'Used this cycle · resets next cycle', disabled: true }
    : isScheduled
      ? { mode: 'disabled', label: 'Pause', caption: `Starts ${fmtShort(effectiveSub.start_date)}`, disabled: true }
    : pausePastFinalDay
      ? { mode: 'disabled', label: 'Pause', caption: 'Unavailable on your final day', disabled: true }
    : { mode: 'pause', label: 'Pause', caption: null, disabled: false }
  const mPlanSkip: MobileHomeData['planSkip'] =
    (mSkipsTotal > 0 && !isOneTime)
      ? {
          show: true,
          disabled: localState === 'paused' || isScheduled || mSkipsLeft === 0,
          caption:
            localState === 'paused' ? 'Resume to schedule a skip'
            : isScheduled ? `Starts ${fmtShort(effectiveSub.start_date)}`
            : mSkipsLeft === 0 ? 'No skips left this cycle'
            : null,
        }
      : { show: false, disabled: true, caption: null }

  const mobileData: MobileHomeData = {
    customerName: firstName,
    greeting: getGreeting(),
    savedAmount: cycleSavingsValue?.saved ?? 0,
    // First-party delivery-day count — benchmark-INDEPENDENT (matches the domain
    // deliveryDays()), so the value line leads with a true number even when no
    // benchmark is set and cycleSavings is null.
    evenings: effectiveSub.plan_name.includes('Monthly Max')
      ? Math.floor(effectiveSub.delivered_meals / 2)
      : effectiveSub.delivered_meals,
    benchmarkAed: customer?.takeout_benchmark_aed ?? null,
    dishName: todayMeal?.dish ?? '',
    dishDescription: todayMeal?.sub ?? '',
    tag: todayMeal?.tag === 'Non Veg' ? 'Non Veg' : 'Veg',
    heat: todayMeal?.heat ?? 0,
    heatLabel: heatWords[todayMeal?.heat ?? 0] ?? '',
    // Arrival is only truthful on a live delivery day. Paused / scheduled /
    // already-skipped / no-delivery states show nothing rather than contradict
    // the status pill with a phantom "Arriving in ~8h".
    arrivalText: (localState === 'paused' || isScheduled || localState === 'skipped' || skipNoDelivery || mResumedCutoff || mDelivered || todayMeal == null)
      ? ''
      : computeArrivalLabel(new Date(), mobileWeekType),
    planName: effectiveSub.plan_name,
    total: effectiveSub.total_meals,
    delivered: effectiveSub.delivered_meals,
    skipped: effectiveSub.skipped_meals_count,
    skipsPlanned: (effectiveSub.skipped_dates ?? []).some(d => d >= aeTodayIso),
    startLabel: fmtShort(effectiveSub.start_date),
    endLabel: fmtShort(effectiveSub.end_date),
    // Queued next plan as the timeline's next beat. Date format matches the
    // Started/Ending labels (fmtShort) so the three read as one timeline.
    // Tentative when the start can still shift (paused or a planned pause).
    queued: queuedSub ? {
      planName: cleanPlanName(queuedSub.plan_name),
      startLabel: fmtShort(queuedSub.start_date),
      tentative: localState === 'paused' || !!sub.planned_pause_start,
    } : null,
    startIso: effectiveSub.start_date,
    endIso: effectiveSub.end_date,
    weekType: effectiveSub.week_type === '5DAYS' ? '5DAYS' : '6DAYS',
    skippedDates: effectiveSub.skipped_dates ?? [],
    pausedDates: effectiveSub.paused_dates ?? [],
    closureDates,
    todayIso: aeTodayIso,
    maxSkips: skipTotal,
    totalDeliveries: Math.max(1, Math.ceil(effectiveSub.total_meals / (effectiveSub.plan_name.includes('Monthly Max') ? 2 : 1))),
    todayDelivered: aeHourNow >= 20 || previewState === 'delivered',
    isPaused: localState === 'paused',
    startsInFuture: isScheduled,
    isDayOne: !isScheduled
      && effectiveSub.delivered_meals === 0
      && new Date(effectiveSub.start_date + 'T00:00:00').toDateString() === new Date().toDateString(),
    heroStatus: mHeroStatus,
    heroClosure: mHeroClosure,
    // Weekly non-serviceable day ONLY (Sun for 6-day, Sat+Sun for 5-day) — NOT
    // "no menu yet" or resumed-after-cutoff, which share the 'off' hero tone.
    // Drives the dusk-navy sun canopy: sun down = kitchen resting tonight.
    sunDown: skipNoDelivery,
    // Weekly off-day (Sun for 6-day, Sat+Sun for 5-day) or no menu yet → nothing
    // to view; drop the "View dish" button rather than round-trip to the menu's
    // own "no delivery" card. Delivered/skipped keep it — the dish still exists.
    noDishToday: skipNoDelivery || todayMeal == null,
    skip: mSkip,
    pause: mPause,
    planSkip: mPlanSkip,
    plannedPauseStart: mPlannedPause,
    pauseCutoffIso: mPauseCutoffIso,
    wrap: (monthlyWindow.eligible || monthlyWindow.locked) && !monthlyWindow.submitted && !monthlyWindow.expired
      ? (() => {
          // Late wraps (>7 days past cycle end) pay the fixed AED 2, not the full
          // AED 5 — mirror MonthlyWrapStrip so the tile doesn't over-promise.
          const late = monthlyWindow.daysSinceCycleEnd > 7
          return {
            cycleLabel: monthlyWindow.cycleLabel ?? 'cycle',
            daysLeft: late ? monthlyWindow.daysSinceCycleEnd : Math.max(0, monthlyWindow.daysLeftForFullReward),
            reward: late ? MONTHLY_LATE_REWARD_AED : MONTHLY_REWARD_AED,
            late,
            // Locked = the weekly preview state (day 4 up to the 5th delivered
            // meal). The tile renders greyed out and swallows the tap rather
            // than routing to a form that would reject the submission anyway.
            locked: monthlyWindow.locked,
          }
        })()
      : null,
  }

  // Resolve the dish delivered on a given date from the 4-week catalog rotation
  // — no history storage; the same derivation the hero + weekly-review use.
  // Per-day veg/non-veg via vegDayNumbers; heat is the dish's intrinsic spice.
  // (Reflects the catalog as it is now, not a literal historical snapshot —
  // matches the weekly-review page; revisit once a menu CMS lands.)
  const _resolveDishes = menuData ?? MENU_DATA
  const resolveDish = (iso: string) => {
    const d = new Date(iso + 'T12:00:00Z')
    if (d.getUTCDay() === 0) return null
    const wantVeg = vegDayNumbers.has(d.getUTCDay() - 1)
    const dayOfWeek = d.getUTCDay() - 1
    const week = getMenuWeek(d)
    const dish = _resolveDishes.find(dd => dd.week === week && dd.dayOfWeek === dayOfWeek && dd.isVeg === wantVeg) ?? null
    return {
      dateLabel: d.toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' }),
      name: dish?.name ?? null,
      description: dish?.description ?? '',
      image: dish?.image ?? null,
      tag: (wantVeg ? 'Veg' : 'Non Veg') as 'Veg' | 'Non Veg',
      heat: dish?.spiceLevel ?? 0,
      heatLabel: heatWords[dish?.spiceLevel ?? 0] ?? '',
    }
  }

  return (
    <div className="dash-root" style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: S.fg }}>

      {/* ── Resume welcome overlay — 3-phase emotional moment on plan resume.
            Phase 1 'checking': spinning ring + "Checking if your meal can make
              it tonight…" — converts the server round-trip into a narrative beat.
            Phase 2 'delivery': confetti + Truck medallion — meal coming tonight.
            Phase 2 'cutoff':  Moon medallion (warm amber) — honest but warm.
            pointer-events: none throughout — dashboard stays interactive. ── */}
      <AnimatePresence>
        {resumeOverlayPhase && (
          <ResumeWelcomeOverlay
            phase={resumeOverlayPhase}
            firstName={firstName}
            prefersReducedMotion={prefersReducedMotion}
            nextDelivery={nextDeliveryLabel(subWeekType)}
          />
        )}
      </AnimatePresence>

      {/* ── Success overlay — 2s emotional flourish after successful checkout.
            Animated checkmark + radial confetti burst over a softly blurred
            backdrop. Pointer-events: none — the dashboard stays interactive
            underneath. Reduced-motion users get a quiet fade with a static
            checkmark, no confetti. ── */}
      <AnimatePresence>
        {showSuccessOverlay && (
          <motion.div
            key="success-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.2 : 0.3 }}
            aria-hidden
            style={{
              position: 'fixed', inset: 0, zIndex: 300,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
              background: 'radial-gradient(circle at center, rgba(245,127,32,0.18) 0%, var(--ds-overlay-strong) 70%)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          >
            {/* Confetti burst — 24 particles, evenly distributed angles, varied
                distance + colour. Skipped in reduced-motion mode. */}
            {!prefersReducedMotion && Array.from({ length: 24 }).map((_, i) => {
              const angle = (Math.PI * 2 * i) / 24 + (i % 2 === 0 ? 0 : 0.13)
              const distance = 200 + ((i * 37) % 120)
              const x = Math.cos(angle) * distance
              const y = Math.sin(angle) * distance
              const palette = [OG, '#ffaa00', '#1ea34d', '#ede8da']
              const colour = palette[i % palette.length]
              const isSquare = i % 3 === 0
              return (
                <motion.div
                  key={i}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0.8, rotate: 0 }}
                  animate={{
                    x, y,
                    opacity: 0,
                    scale: 0.4,
                    rotate: i % 2 === 0 ? 320 : -280,
                  }}
                  transition={{
                    duration: 1.4,
                    ease: [0.16, 1, 0.3, 1],
                    delay: 0.18,
                  }}
                  style={{
                    position: 'absolute',
                    width: isSquare ? 9 : 8,
                    height: isSquare ? 9 : 8,
                    borderRadius: isSquare ? 2 : '50%',
                    background: colour,
                    boxShadow: `0 0 12px ${colour}66`,
                  }}
                />
              )
            })}

            {/* Centred stack: medallion + headline + sub-line. The text gives
                the user something to read during the 3s pause and reinforces
                the "you're in" emotional moment that the checkmark anchors. */}
            <div style={{
              position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
            }}>
              {/* Checkmark medallion — orange disc with a stroke-drawn tick.
                  Spring scale on entry, stroke draws after the disc settles. */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0.2 }
                    : { type: 'spring', stiffness: 220, damping: 16, delay: 0.08 }
                }
                style={{
                  width: 104, height: 104, borderRadius: '50%',
                  background: OG,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 20px 50px rgba(245,127,32,0.45), 0 0 0 8px rgba(245,127,32,0.18)',
                }}
              >
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <motion.path
                    d="M5 12 L10 17 L19 8"
                    initial={{ pathLength: prefersReducedMotion ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.42 }
                    }
                  />
                </svg>
              </motion.div>

              {/* Text — fades up after the checkmark settles. Two lines:
                  big punchy lead, supporting line with the plan name. */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0.2, delay: 0.1 }
                    : { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.7 }
                }
                style={{ textAlign: 'center', maxWidth: 360, padding: '0 24px' }}
              >
                <div style={{
                  fontFamily: BODY, fontSize: 'clamp(28px, 4vw, 36px)',
                  fontWeight: 800, color: '#fff',
                  letterSpacing: '-0.02em', lineHeight: 1.1,
                  textShadow: '0 2px 16px rgba(9,24,37,0.25)',
                }}>
                  You&rsquo;re in{firstName !== 'there' ? <>, {firstName}</> : ''}
                  <span style={{ color: '#ffaa00' }}>!</span>
                </div>
                <div style={{
                  marginTop: 10,
                  fontFamily: BODY, fontSize: 14, fontWeight: 500,
                  color: 'rgba(255,255,255,0.85)',
                  lineHeight: 1.5,
                  textShadow: '0 1px 8px rgba(9,24,37,0.30)',
                }}>
                  <strong style={{ color: '#fff', fontWeight: 700 }}>{cleanPlanName(justBoughtSub.plan_name)}</strong> is locked in. We&rsquo;re cooking.
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        <div className="home-desktop">

        {/* Order confirmation banner — one-time, post-checkout. Closes the loop
            on the most expensive interaction by echoing back what was bought and
            when the first meal arrives. Dismissable + auto-fades after 12s. */}
        <AnimatePresence>
          {showOrderBanner && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              style={{
                marginBottom: 16,
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--ds-og-wash-strong) 0%, var(--ds-og-wash) 100%)',
                border: '1px solid var(--ds-og-border-strong)',
                display: 'flex', alignItems: 'center', gap: 14,
              }}
            >
              <div style={{
                width: 40, height: 40, flexShrink: 0, borderRadius: '50%',
                background: 'var(--ds-og-wash-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: OG,
              }}>
                <PartyPopper size={20} strokeWidth={2} aria-hidden />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
                  Your <strong style={{ color: OG }}>{cleanPlanName(justBoughtSub.plan_name)}</strong> is {new Date(justBoughtSub.start_date) > new Date() ? 'scheduled' : 'active'}.
                </div>
                <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>
                  First meal arrives <strong style={{ color: S.fg }}>{fmtWithDay(justBoughtSub.start_date)}</strong>. Receipt sent to your inbox.
                </div>
              </div>
              <button
                onClick={() => setShowOrderBanner(false)}
                aria-label="Dismiss"
                style={{
                  background: 'none', border: 'none', color: S.fgMuted,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: '4px 6px', borderRadius: 4, flexShrink: 0,
                }}
              >
                <X size={14} strokeWidth={2.5} aria-hidden />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Greeting ribbon — name + accumulated equity (loyalty as endowed
            progress, not guilt). Queued-renewal pill moved out of this
            row to below the plan-progress section — see the
            {queuedSub && (...)} block after the dash-grid closes. */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="home-greeting"
          style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 500, color: S.fgMuted, letterSpacing: 0 }}>
            {getGreeting()}, <strong style={{ color: S.fg, fontWeight: 700 }}>{firstName}</strong>.
          </div>
          {totalDelivered >= 5 && (
            <div className="home-equity" style={{ fontFamily: BODY, fontSize: 12, color: S.fgSub, letterSpacing: 0, lineHeight: 1.5 }}>
              <strong style={{ color: S.fg, fontWeight: 700 }}>{totalDelivered}</strong> dinners with us
              {memberSinceText && <> · since {memberSinceText}</>}
              {lifetimeSavingsValue && lifetimeSavingsValue.saved > 0 && (
                <> · <strong style={{ color: S.fg, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>AED {formatSavedAmount(lifetimeSavingsValue.saved)}</strong> saved vs ordering in</>
              )}
              {endedPlans.length > 0 && (
                <> · <Link
                        href="/dashboard/history"
                        style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: 'var(--ds-fg-tint)', textUnderlineOffset: 3 }}
                      >
                        {endedPlans.length} past plan{endedPlans.length === 1 ? '' : 's'}
                      </Link></>
              )}
            </div>
          )}
        </motion.div>

        {/* Error toast */}
        <AnimatePresence>
          {actionError && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-danger-wash)', border: '1px solid var(--ds-danger-border)', color: 'var(--ds-danger-fg)', fontFamily: BODY, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{actionError}</span>
              <button onClick={() => setActionError(null)} className="btn-toast-close" aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px 6px', borderRadius: 4, transition: 'transform 100ms' }}><X size={14} strokeWidth={2.5} aria-hidden /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Out-of-zone gate — non-dismissable, blocks renewal. Customer-service
            clears it via Supabase admin once delivery is confirmed. */}
        <OutOfZoneBanner show={outOfZone} />
        {/* Profile-completion gate — non-dismissable, blocks plan purchase. */}
        <ProfileBanner missing={profileGate} deprioritized={outOfZone} />

        {/* Plan-ending-during-a-pause — spec §6.4. Sits above the hero so a
            loyal customer whose plan is about to lapse learns about the pause
            here, not by reaching a shut checkout. */}
        {showPlanEndingPausedBanner && (
          <PlanEndingPausedBanner
            daysRemaining={planEndDaysRemaining}
            creditAed={intakePause.creditAed}
            alreadyJoined={intakePause.alreadyJoined}
            waitlistCreditAed={intakePause.waitlistCreditAed}
          />
        )}

        {/* End-of-cycle renew banner — visibility window scales with plan
            length so longer plans get a longer lead-time:
              · Monthly   → last 4 days  (4-day heads-up on a ~30-day cycle)
              · Weekly    → last 2 days  (28% of a 7-day cycle)
              · Trial/etc → last day only (high-urgency final-meal nudge)
            Hidden if a queued sub already exists (customer's already
            committed to a follow-up) or the primary is Scheduled (no live
            cycle to end). Always sits above the queued-banner slot so the
            retention bookend gets the dominant position.
            Also hidden while intake is paused — every one of these windows
            (4/2/1 days) sits inside PlanEndingPausedBanner's 7-day window, so
            a paused customer would otherwise see "Renew now" stacked under
            "new plans are paused" with a live CTA into a gated checkout. The
            plan-ending banner above is the only affordance during a pause. */}
        {!queuedSub && !isScheduled && !intakePause.paused && (() => {
          const renewWindow = sub.plan_name.includes('Monthly') ? 4
            : sub.plan_name.includes('Weekly') ? 2
            : 1
          const todayMidnight = new Date(new Date().toDateString()).getTime()
          const endMidnight = new Date(sub.end_date + 'T00:00:00').getTime()
          const daysToEnd = Math.round((endMidnight - todayMidnight) / 86400000)
          if (daysToEnd < 0 || daysToEnd > renewWindow - 1) return null

          // Copy adapts to where in the window we are. Today=end preserves
          // the high-conversion "Last meal tonight" punch; further out
          // softens to a heads-up while keeping the same CTA.
          const headline = daysToEnd === 0
            ? <>Last meal of your <strong style={{ color: OG }}>{cleanPlanName(sub.plan_name)}</strong> tonight.</>
            : daysToEnd === 1
              ? <>Final day of your <strong style={{ color: OG }}>{cleanPlanName(sub.plan_name)}</strong> tomorrow.</>
              : <>Your <strong style={{ color: OG }}>{cleanPlanName(sub.plan_name)}</strong> ends in {daysToEnd} days.</>
          const subline = daysToEnd === 0
            ? 'Renew now to keep dinner showing up — your next plan can start tomorrow.'
            : 'Renew now to keep dinner showing up — pick when your next plan starts.'

          return (
            <div style={{
              marginBottom: 18,
              padding: '14px 18px',
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, var(--ds-og-wash-strong) 0%, var(--ds-og-wash) 100%)',
              border: '1px solid var(--ds-og-border-strong)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0, borderRadius: '50%',
                background: 'var(--ds-og-wash-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: OG, fontFamily: BODY, fontSize: 18, fontWeight: 800,
              }}>!</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
                  {headline}
                </div>
                <AnimatePresence initial={false}>
                  {renewExpanded && (
                    <motion.div
                      key="renew-subline"
                      initial={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      animate={prefersReducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: prefersReducedMotion ? 0.12 : 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>
                        {subline}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {profileGate.length > 0 || outOfZone ? (
                <span
                  title={outOfZone ? 'Outside delivery radius — message us on WhatsApp' : 'Complete your profile first'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '10px 16px',
                    background: 'var(--ds-fg-tint)', color: 'rgba(255,255,255,0.85)',
                    borderRadius: 'var(--radius-pill)',
                    fontFamily: BODY, fontSize: 12, fontWeight: 700,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    cursor: 'not-allowed', flexShrink: 0,
                  }}
                >
                  Renew now <ChevronRight size={14} strokeWidth={2.6} />
                </span>
              ) : (
                <Link
                  href={`/dashboard/explore-plans?plan=${encodeURIComponent(sub.plan_name)}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '10px 16px',
                    background: OG, color: '#fff',
                    borderRadius: 'var(--radius-pill)',
                    fontFamily: BODY, fontSize: 12, fontWeight: 700,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    textDecoration: 'none',
                    boxShadow: '0 4px 12px rgba(245,127,32,0.40)',
                    flexShrink: 0,
                  }}
                >
                  Renew now <ChevronRight size={14} strokeWidth={2.6} />
                </Link>
              )}
              <button
                type="button"
                onClick={() => setRenewExpanded(v => !v)}
                aria-expanded={renewExpanded}
                aria-label={renewExpanded ? 'Hide renewal details' : 'Show renewal details'}
                style={{
                  background: 'none', border: 'none', color: S.fgMuted,
                  cursor: 'pointer', flexShrink: 0, padding: 8, margin: -4,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ChevronDown
                  size={16}
                  strokeWidth={2.4}
                  aria-hidden
                  style={{
                    transition: prefersReducedMotion ? undefined : 'transform 200ms',
                    transform: renewExpanded ? 'rotate(180deg)' : 'none',
                  }}
                />
              </button>
            </div>
          )
        })()}

        {/* Queued-renewal pill moved into the greeting ribbon above — see
            the {queuedSub && (...)} block inside the motion.div there. */}

        {/* Monthly wrap strip — slim 1-line reminder ABOVE the hero when
            the previous cycle's wrap is still open. Visually subordinate
            to HeroToday so the new cycle's focal slot stays clean. Self-
            renders nothing when not eligible. See project_now_tray_
            architecture memory for the layering rationale. */}
        <MonthlyWrapStrip monthlyWindow={monthlyWindow} />

        {/* 12-column grid — order:
            (1) Stats row (Deliveries/Delivered/Skips/Days)
            (2) Tonight's dish + Quick actions
            (3) Plan progress                                                   */}
        <div className={`dash-grid${skipStagger ? ' dash-grid-no-stagger' : ''}`}>
          <StatRow
            sub={effectiveSub}
            isPaused={localState === 'paused'}
            cycleSavings={cycleSavingsValue}
            benchmarkAed={customer?.takeout_benchmark_aed ?? null}
            hasQueuedRenewal={!!queuedSub}
            onSetBenchmark={() => setBenchmarkModalOpen(true)}
          />
          <HeroToday
            todayMeal={todayMeal}
            localState={localState}
            subStartDate={isScheduled ? sub.start_date : undefined}
            weekType={(sub.week_type === '5DAYS' || sub.week_type === '6DAYS') ? sub.week_type : '6DAYS'}
            isDayOne={
              !isScheduled
              && sub.delivered_meals === 0
              && new Date(sub.start_date + 'T00:00:00').toDateString() === new Date().toDateString()
            }
            isLastDayNoQueue={
              !isScheduled
              && !queuedSub
              && new Date(sub.end_date + 'T00:00:00').toDateString() === new Date().toDateString()
            }
            resumeLockedSameDay={resumeLockedSameDay}
            resumedAfterCutoff={resumedAfterCutoff}
          />
          <QuickActions
            canPause={canPause}
            localState={localState}
            onPause={handlePauseRequest}
            onSkipRequest={handleSkipRequest}
            onPlanSkip={openPlanSkipPicker}
            isPending={isPending}
            pendingAction={pendingAction}
            successAction={successAction}
            skipQuota={skipQuota}
            skipIsMakeupDay={skipIsMakeupDay}
            disabledReason={isScheduled
              ? `Available once your plan starts on ${new Date(sub.start_date).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}.`
              : undefined}
            skipPastCutoff={!isScheduled && skipPastCutoff}
            skipNoDelivery={!isScheduled && skipNoDelivery}
            pausePastFinalDay={!isScheduled && pausePastFinalDay}
            resumeLockedSameDay={resumeLockedSameDay}
            isPausableTier={isPausableTier}
            isTrialPlan={isOneTime}
            plannedPauseDate={sub.planned_pause_start ?? null}
            pauseCreditUsed={pauseCreditUsed}
          />
          {/* PlanProgress takes the full row width on the main dashboard.
              The Past plans card has moved to /dashboard/plan (beside the
              Common questions block) so the live progress can breathe and
              the historical view lives in one obvious place. */}
          <PlanProgress
            sub={effectiveSub}
            isPaused={localState === 'paused'}
            maxSkips={skipTotal}
            hasQueuedRenewal={!!queuedSub}
            closureDates={closureDates}
            onPillSkip={openFutureSkipModal}
            onPillUnskip={openFutureUnskipModal}
            onCancelPlannedPause={() => setShowCancelPlannedPause(true)}
          />
        </div>

        {/* Queued-renewal coda — chromeless. Per Nielsen H8 "aesthetic and
            minimalist design": every element earns its place. The pill
            container (border + fill) didn't earn its place at footer-level
            so it's gone — the yellow chip + plan info + Manage link float
            inline on the cream page, right-aligned. White space is now the
            framing. The chip is the only visual anchor; nothing competes
            with it for volume. */}
        {queuedSub && (
          <div style={{
            marginTop: 28,
            display: 'flex',
            justifyContent: 'flex-end',
          }}>
            <div style={{
              color: S.fg,
              fontFamily: BODY,
              fontSize: 12.5,
              lineHeight: 1.4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              maxWidth: '100%',
            }}>
              {/* Left-edge marker — typographic "begins here" anchor. A
                  1.5px hairline bar at low opacity (no chrome, no box) so
                  the right-aligned coda has a visual starting point
                  without re-introducing container weight. */}
              <span aria-hidden style={{
                width: 1.5, height: 14, borderRadius: 1,
                background: 'rgba(9,24,37,0.25)',
                flexShrink: 0,
              }} />

              {/* Up next chip — flipped from filled to outlined. The gold
                  is now the 1.5px ring (via inset boxShadow so the chip
                  keeps its exact dimensions); the interior is a 10%
                  yellow wash that composites with the cream page for a
                  barely-there warm tint. Same brand-yellow vocabulary,
                  significantly less visual volume — outlined badges feel
                  like quiet labels, filled badges feel like alerts. */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: 999,
                background: 'rgba(245,184,46,0.10)',
                color: '#3a2200',
                boxShadow: 'inset 0 0 0 1.5px #F5B82E',
                flexShrink: 0,
              }}>
                <span aria-hidden style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: '#3a2200',
                }} />
                Up next
              </span>

              <span style={{
                color: S.fg,
                minWidth: 0,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                <strong style={{ fontWeight: 800, color: S.fg }}>{cleanPlanName(queuedSub.plan_name)}</strong>
                <span style={{ color: S.fgFaint, margin: '0 7px' }}>·</span>
                <span style={{ color: NV2, fontWeight: 700 }}>
                  {(localState === 'paused' || sub.planned_pause_start) ? 'Est. starts ' : 'Starts '}
                  {new Date(queuedSub.start_date).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                {(localState === 'paused' || sub.planned_pause_start) && (
                  <span
                    title="Shifts forward as you stay paused. Confirmed once you resume."
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      marginLeft: 6,
                      padding: '2px 6px',
                      borderRadius: 999,
                      background: 'rgba(30,58,79,0.08)',
                      border: '1px solid rgba(30,58,79,0.22)',
                      fontFamily: BODY,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: NV2,
                      cursor: 'help',
                    }}
                  >
                    Tentative
                  </span>
                )}
              </span>

              {/* Manage link — demoted to a quiet gray hover-link. The
                  orange + arrow combo was a second warm anchor competing
                  with the yellow chip; here in a coda, the chip is the
                  only visual signal and the link just needs to be
                  scannable as a click target on hover. */}
              <Link
                href="/dashboard/plan"
                className="queued-manage-link"
                style={{
                  flexShrink: 0,
                  fontFamily: BODY,
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
              >
                Manage
              </Link>
            </div>
          </div>
        )}

        </div>{/* ── /home-desktop ── */}

        {/* ── Mobile home (≤768) — the redesigned single-screen view. Same
            data + handlers + modals as desktop, just a different surface. ── */}
        <div className="home-mobile">
          <OutOfZoneBanner show={outOfZone} />
          <ProfileBanner missing={profileGate} deprioritized={outOfZone} />
          <MobileHome
            data={mobileData}
            creditChip={<MobileCreditChip rows={creditRows} />}
            planEndingBanner={showPlanEndingPausedBanner ? (
              <PlanEndingPausedBanner
                daysRemaining={planEndDaysRemaining}
                creditAed={intakePause.creditAed}
                alreadyJoined={intakePause.alreadyJoined}
                waitlistCreditAed={intakePause.waitlistCreditAed}
                onSun
              />
            ) : null}
            errorBanner={actionError ? (
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--ds-danger-wash)', border: '1px solid var(--ds-danger-border)', color: 'var(--ds-danger-fg)', fontFamily: BODY, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span>{actionError}</span>
                <button onClick={() => setActionError(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', flexShrink: 0 }}><X size={14} strokeWidth={2.5} /></button>
              </div>
            ) : null}
            orderBanner={showOrderBanner ? (
              // Persistent post-checkout confirmation — mobile buyers previously
              // got only the 3s success flash. Same plan/scheduled-vs-active/
              // first-meal/receipt copy as the desktop order banner.
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 18, background: 'linear-gradient(135deg, var(--ds-og-wash-strong) 0%, var(--ds-og-wash) 100%)', border: '1px solid var(--ds-og-border-strong)' }}>
                <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: '50%', background: 'var(--ds-og-wash-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: OG }}><PartyPopper size={16} strokeWidth={2} aria-hidden /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: BODY, fontSize: 13.5, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>Your <strong style={{ color: OG }}>{cleanPlanName(justBoughtSub.plan_name)}</strong> is {new Date(justBoughtSub.start_date) > new Date() ? 'scheduled' : 'active'}.</div>
                  <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12, color: S.fgMuted, lineHeight: 1.45 }}>First meal arrives <strong style={{ color: S.fg }}>{fmtWithDay(justBoughtSub.start_date)}</strong>. Receipt sent to your inbox.</div>
                </div>
                <button onClick={() => setShowOrderBanner(false)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: S.fgMuted, cursor: 'pointer', flexShrink: 0, padding: 2 }}><X size={14} strokeWidth={2.5} aria-hidden /></button>
              </div>
            ) : null}
            renewBanner={(!queuedSub && !isScheduled && !intakePause.paused) ? (() => {
              // Same end-of-cycle window + copy + gating as the desktop renew
              // banner (ActiveDashboard renew block) — mobile had none, so
              // phone customers got zero renew CTA at cycle end. Also hidden
              // while intake is paused (see the desktop block's comment) —
              // planEndingBanner above is the only affordance during a pause.
              const renewWindow = sub.plan_name.includes('Monthly') ? 4 : sub.plan_name.includes('Weekly') ? 2 : 1
              const todayMidnight = new Date(new Date().toDateString()).getTime()
              const endMidnight = new Date(sub.end_date + 'T00:00:00').getTime()
              const daysToEnd = Math.round((endMidnight - todayMidnight) / 86400000)
              if (daysToEnd < 0 || daysToEnd > renewWindow - 1) return null
              const headline = daysToEnd === 0
                ? <>Last meal of your <strong style={{ color: OG }}>{cleanPlanName(sub.plan_name)}</strong> tonight.</>
                : daysToEnd === 1
                  ? <>Final day of your <strong style={{ color: OG }}>{cleanPlanName(sub.plan_name)}</strong> tomorrow.</>
                  : <>Your <strong style={{ color: OG }}>{cleanPlanName(sub.plan_name)}</strong> ends in {daysToEnd} days.</>
              const blocked = profileGate.length > 0 || outOfZone
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 18, background: 'linear-gradient(135deg, var(--ds-og-wash-strong) 0%, var(--ds-og-wash) 100%)', border: '1px solid var(--ds-og-border-strong)' }}>
                  <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: '50%', background: 'var(--ds-og-wash-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: OG, fontFamily: BODY, fontSize: 17, fontWeight: 800 }}>!</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: BODY, fontSize: 13.5, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>{headline}</div>
                    <AnimatePresence initial={false}>
                      {renewExpanded && (
                        <motion.div
                          key="renew-subline"
                          initial={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                          animate={prefersReducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                          exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                          transition={{ duration: prefersReducedMotion ? 0.12 : 0.2 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12, color: S.fgMuted, lineHeight: 1.45 }}>Renew to keep dinner coming — pick when your next plan starts.</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {blocked ? (
                    <span title={outOfZone ? 'Outside delivery radius — message us on WhatsApp' : 'Complete your profile first'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '9px 13px', background: 'var(--ds-fg-tint)', color: 'rgba(255,255,255,0.85)', borderRadius: 999, fontFamily: BODY, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', cursor: 'not-allowed', flexShrink: 0 }}>Renew <ChevronRight size={13} strokeWidth={2.6} /></span>
                  ) : (
                    <button type="button" onClick={() => navTo(`/dashboard/explore-plans?plan=${encodeURIComponent(sub.plan_name)}`)} disabled={isNavPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '9px 13px', background: OG, color: '#fff', borderRadius: 999, fontFamily: BODY, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', border: 'none', cursor: isNavPending ? 'default' : 'pointer', boxShadow: '0 4px 12px rgba(245,127,32,0.40)', flexShrink: 0, opacity: isNavPending ? 0.85 : 1, transition: 'opacity 150ms' }}>{isNavPending ? <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #fff', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} /> : <>Renew <ChevronRight size={13} strokeWidth={2.6} /></>}</button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRenewExpanded(v => !v)}
                    aria-expanded={renewExpanded}
                    aria-label={renewExpanded ? 'Hide renewal details' : 'Show renewal details'}
                    style={{ background: 'none', border: 'none', color: S.fgMuted, cursor: 'pointer', flexShrink: 0, padding: 8, margin: -4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <ChevronDown size={16} strokeWidth={2.4} aria-hidden style={{ transition: prefersReducedMotion ? undefined : 'transform 200ms', transform: renewExpanded ? 'rotate(180deg)' : 'none' }} />
                  </button>
                </div>
              )
            })() : null}
            onSkip={handleSkipRequest}
            isNavPending={isNavPending}
            onViewDish={() => navTo('/dashboard/menu')}
            onPlanSkip={openPlanSkipPicker}
            onPause={handlePauseRequest}
            onWrap={() => navTo('/dashboard/menu/review/monthly')}
            onSetBenchmark={() => setBenchmarkModalOpen(true)}
            onManageQueued={() => navTo('/dashboard/plan')}
            onPillSkip={openFutureSkipModal}
            onPillUnskip={openFutureUnskipModal}
            resolveDish={resolveDish}
          />
        </div>

        {/* Skip confirmation modal — sharpened for irreversibility. Routed
            through MobileSheet: bottom sheet <768 (scrollable body + pinned
            CTA band), centered dialog ≥768 (unchanged). */}
        <MobileSheet
          open={showSkipConfirm}
          onClose={() => setShowSkipConfirm(false)}
          maxWidth={440}
          ariaLabel="Skip tonight's meal"
          footer={
            <>
              <button
                onClick={() => setShowSkipConfirm(false)}
                style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ds-border-strong)', background: 'var(--ds-surface2)', color: S.fg, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSkipConfirm}
                style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: 'none', background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 0 16px rgba(245,127,32,0.45)' }}
              >
                Skip tonight
              </button>
            </>
          }
        >
          {/* Hierarchy — three tiers, no redundancy:
                H1 (large, navy): the question
                Body (mid, muted): plain-English explanation of the
                    ONE thing the customer needs to know — they don't
                    lose the meal
                Data row (smaller, tabular): the after-state — skips
                    left and the +1 day shift, side by side. Numbers
                    first so the eye grabs them before the labels. */}
          <h2 style={{ margin: 0, fontFamily: BODY, fontSize: 24, fontWeight: 800, color: S.fg, lineHeight: 1.15, letterSpacing: '-0.015em' }}>
            Skip tonight&rsquo;s meal?
          </h2>
          <p style={{ marginTop: 10, marginBottom: 0, fontFamily: BODY, fontSize: 14, color: S.fgMuted, lineHeight: 1.6 }}>
            You won&rsquo;t lose this meal — we&rsquo;ll add a make-up day at the end of your plan, so your end date just moves out by one delivery day.
          </p>

          <div style={{
              marginTop: 20,
              padding: '14px 16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--ds-og-wash)',
              border: '1px solid var(--ds-og-border)',
              display: 'grid',
              gridTemplateColumns: skipQuota.total > 0 ? '1fr 1fr' : '1fr',
              gap: 14,
          }}>
            <div>
              <div style={{ fontFamily: BODY, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgSub }}>
                End date
              </div>
              <div style={{ marginTop: 4, fontFamily: BODY, fontSize: 16, fontWeight: 800, color: S.fg, fontFeatureSettings: '"tnum"' }}>
                <span style={{ color: OG }}>+1 day</span>
              </div>
            </div>
            {skipQuota.total > 0 && (
              <div style={{ borderLeft: '1px solid var(--ds-og-border)', paddingLeft: 14 }}>
                <div style={{ fontFamily: BODY, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgSub }}>
                  Skips left
                </div>
                <div style={{ marginTop: 4, fontFamily: BODY, fontSize: 16, fontWeight: 800, color: S.fg, fontFeatureSettings: '"tnum"' }}>
                  {Math.max(0, skipQuota.left - 1)}<span style={{ color: S.fgSub, fontWeight: 600 }}> / {skipQuota.total}</span>
                </div>
              </div>
            )}
          </div>

          {/* Inline irreversibility note — sits right above the CTAs,
              smaller and subdued so the modal isn't shouty, but
              coloured so the eye still snags on it before clicking. */}
          <p style={{
              margin: '14px 0 0 0',
              fontFamily: BODY, fontSize: 11.5, fontWeight: 700,
              color: 'var(--ds-danger-fg)',
              letterSpacing: '0.04em', textTransform: 'uppercase',
              lineHeight: 1.4,
              textAlign: 'center',
          }}>
            This can&rsquo;t be undone after confirm
          </p>
        </MobileSheet>

        {/* Resume-after-cutoff warning — fires when the customer taps Resume past
            the 2 PM kitchen cutoff on a delivery day. Resuming is allowed, but
            tonight's meal can't be prepped, so we make the no-show a conscious
            choice instead of a surprise. Confirm routes to the real resume (which
            then skips the welcome overlay, since this sheet already broke the news). */}
        <MobileSheet
          open={showResumeCutoffWarning}
          onClose={() => setShowResumeCutoffWarning(false)}
          maxWidth={440}
          ariaLabel="Resume after the kitchen cutoff"
          footer={
            <>
              <button
                onClick={() => setShowResumeCutoffWarning(false)}
                style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ds-border-strong)', background: 'var(--ds-surface2)', color: S.fg, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
              >
                Not now
              </button>
              <button
                onClick={handleResumeConfirm}
                style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: 'none', background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 0 16px rgba(245,127,32,0.45)' }}
              >
                Resume anyway
              </button>
            </>
          }
        >
          {/* Warm amber medallion ties this to the cutoff overlay's "Moon" tone —
              honest (no party) but not alarming. */}
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,170,0,0.16)', border: '1px solid rgba(200,148,23,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c89417', marginBottom: 16 }}>
            <Moon size={24} strokeWidth={2} />
          </div>
          <h2 style={{ margin: 0, fontFamily: BODY, fontSize: 22, fontWeight: 800, color: S.fg, lineHeight: 1.18, letterSpacing: '-0.015em' }}>
            No delivery tonight
          </h2>
          <p style={{ marginTop: 10, marginBottom: 0, fontFamily: BODY, fontSize: 14, color: S.fgMuted, lineHeight: 1.6 }}>
            It&rsquo;s past our <strong style={{ color: S.fg }}>2 PM kitchen cutoff</strong>, so resuming now won&rsquo;t bring tonight&rsquo;s dinner back — the kitchen has already committed today&rsquo;s prep. Your plan goes live again right away.
          </p>
          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-og-wash)', border: '1px solid var(--ds-og-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Truck size={16} strokeWidth={2} color={OG} />
            <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: S.fg, lineHeight: 1.4 }}>
              First delivery {nextDeliveryLabel(subWeekType)}, 7&ndash;8&nbsp;PM
            </span>
          </div>
        </MobileSheet>

        {/* Pause confirmation modal — routed through MobileSheet. */}
        <MobileSheet
          open={showPauseConfirm}
          onClose={() => setShowPauseConfirm(false)}
          maxWidth={420}
          ariaLabel="Pause your plan"
          footer={
            <>
              <button
                onClick={() => setShowPauseConfirm(false)}
                style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ds-border-strong)', background: 'var(--ds-surface2)', color: S.fg, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
              >
                Cancel
              </button>
              <button
                onClick={handlePauseConfirm}
                style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: 'none', background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 0 16px rgba(245,127,32,0.45)' }}
              >
                Yes, pause
              </button>
            </>
          }
        >
          <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.01em', marginRight: 28 }}>
            Pause your plan?
          </div>
          <div style={{ fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 12, lineHeight: 1.65 }}>
            This uses your <strong style={{ color: S.fg }}>1 free pause</strong> for the cycle. Your end date extends by the days you stay paused. Resume any time after tomorrow.
          </div>
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-og-wash)', border: '1px solid var(--ds-og-border)', fontFamily: BODY, fontSize: 12, color: OG_DEEP, lineHeight: 1.5 }}>
            Pauses available: <strong>1 of 1</strong>
          </div>
          {/* Pause-later affordance — opens the PlanPauseModal so customers
              can schedule the pause for a future date instead of pausing
              immediately. Same credit, just a different start moment. */}
          <button
            type="button"
            onClick={() => { setShowPauseConfirm(false); openPlanPausePicker() }}
            style={{
              marginTop: 12,
              background: 'transparent', border: 'none', padding: 0,
              fontFamily: BODY, fontSize: 12.5, fontWeight: 600,
              color: S.fgMuted, cursor: 'pointer',
              textDecoration: 'underline', textUnderlineOffset: '2px',
              textDecorationThickness: '1px',
            }}
          >
            Pause from a future date instead →
          </button>
        </MobileSheet>

        {/* Queued-plan pause warning modal — shown instead of the standard
            pause-confirm when the user has a Scheduled next plan. Explains
            that the queued plan's start date shifts with each delivery day
            they stay paused (handled automatically by the DB trigger). The
            user acknowledges and taps "Pause anyway" to proceed directly,
            or cancels. Single confirmation — no secondary "Are you sure?" */}
        <MobileSheet
          open={showQueuedPauseWarning && !!queuedSub}
          onClose={() => setShowQueuedPauseWarning(false)}
          maxWidth={460}
          ariaLabel="Your next plan will start later"
          footer={
            <>
              <button
                onClick={() => setShowQueuedPauseWarning(false)}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ds-border-strong)', background: 'var(--ds-surface2)', color: S.fg, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}
              >
                Cancel
              </button>
              <button
                onClick={handleQueuedPauseConfirm}
                style={{ flex: 1.4, padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 0 16px rgba(245,127,32,0.45)', whiteSpace: 'nowrap' }}
              >
                Pause anyway
              </button>
            </>
          }
        >
          {queuedSub && (
            <>
              {/* Icon medallion */}
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'var(--ds-og-wash)',
                border: '1.5px solid var(--ds-og-border-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 18, color: OG,
              }}>
                <PauseCircle size={22} strokeWidth={2} />
              </div>

              <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 800, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.02em', marginRight: 28 }}>
                Your next plan will start later
              </div>
              <div style={{ fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 10, lineHeight: 1.65 }}>
                You have a <strong style={{ color: S.fg }}>{cleanPlanName(queuedSub.plan_name)}</strong> queued to start{' '}
                <strong style={{ color: S.fg }}>
                  {new Date(queuedSub.start_date).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}
                </strong>.
                While paused, that start date shifts forward by one delivery day for each day you stay paused.
              </div>

              {/* Two-column impact summary */}
              <div style={{
                marginTop: 18,
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              }}>
                <div style={{
                  padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--ds-og-wash)',
                  border: '1px solid var(--ds-og-border)',
                }}>
                  <div style={{ fontFamily: BODY, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgSub }}>
                    This plan
                  </div>
                  <div style={{ marginTop: 5, fontFamily: BODY, fontSize: 13, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
                    End date extends
                  </div>
                  <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, lineHeight: 1.4 }}>
                    +1 delivery day while paused
                  </div>
                </div>
                <div style={{
                  padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                  background: 'rgba(58,111,140,0.08)',
                  border: '1px solid rgba(58,111,140,0.25)',
                }}>
                  <div style={{ fontFamily: BODY, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(42,84,112,0.6)' }}>
                    Next plan
                  </div>
                  <div style={{ marginTop: 5, fontFamily: BODY, fontSize: 13, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
                    Start date shifts too
                  </div>
                  <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, lineHeight: 1.4 }}>
                    Auto-updated on resume
                  </div>
                </div>
              </div>

              <div style={{
                marginTop: 14,
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--ds-skeleton-base)',
                border: '1px solid var(--ds-border-soft)',
                fontFamily: BODY, fontSize: 12, color: S.fgMuted, lineHeight: 1.5,
              }}>
                This uses your <strong style={{ color: S.fg }}>1 free pause</strong> for the cycle. Resume any time after tomorrow — your next plan&apos;s confirmed start date will be shown on the dashboard.
              </div>

              <button
                type="button"
                onClick={() => { setShowQueuedPauseWarning(false); openPlanPausePicker() }}
                style={{
                  marginTop: 12,
                  background: 'transparent', border: 'none', padding: 0,
                  fontFamily: BODY, fontSize: 12.5, fontWeight: 600,
                  color: S.fgMuted, cursor: 'pointer',
                  textDecoration: 'underline', textUnderlineOffset: '2px',
                  textDecorationThickness: '1px',
                }}
              >
                Pause from a future date instead →
              </button>
            </>
          )}
        </MobileSheet>

      </div>

      <style jsx global>{`
        .dash-root { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

        /* COMPACT swaps the desktop home tree for the redesigned single-screen
           MobileHome. Pure CSS toggle — no flash, desktop intact. Keyed on the
           shared contract (see _shared/breakpoints.ts), so every portrait tablet
           gets the touch-native tree instead of desktop cards in a drawer. */
        .home-mobile { display: none; }
        @media ${COMPACT} {
          .home-desktop { display: none; }
          .home-mobile { display: block; }
          .dash-root { padding: 0 !important; }
        }

        /* Queued-renewal pill — gradient ring around a TRUE translucent
           interior. The interior's rgba(30,58,79,0.10) composites with the
           cream page beneath, so the pill reads as a barely-there navy hue
           (not a solid block). The dual-gradient + background-clip trick
           can't do this because the outer-clip gradient paints opaque
           navy across the whole box first, so the inner translucent
           gradient ends up layered over opaque navy — back to a dark
           pill. Putting the gradient ring on a masked pseudo-element
           leaves the container's real background to composite with the
           page properly. */
        /* Queued-coda Manage link — quiet gray default, darkens on hover.
           Replaces the brand-orange + arrow treatment; here the link sits
           in a chromeless coda where the yellow chip is the only visual
           anchor, so the link should be scannable on hover, not always
           shouting. */
        .queued-manage-link {
          color: rgba(9,24,37,0.48);
          text-decoration: underline;
          text-underline-offset: 3px;
          text-decoration-thickness: 1px;
          transition: color 150ms;
        }
        .queued-manage-link:hover { color: rgba(9,24,37,0.85); }

        /* ── Two-up header row (every expanded-tree width) ────────────────
           The greeting carries no action and the wrap strip is one line, so
           stacking them spends ~60px of height on two half-empty rows — and
           the cost lands exactly when a waitlist / plan-ending banner is
           already stacking the header and pushing the hero toward the fold.
           Width is the surplus resource up here: the strip moves into the
           dead space right of the greeting.

           Height is not the only win. Full-width, the strip's marginLeft:auto
           pushed "+AED 5" to the far edge — ~1400px from its own label on a
           wide monitor, too far to read as one offer. The grid cell
           shrink-wraps the strip, so label · chip · reward sit as a single
           cluster again at every width.

           Explicit grid placement, NOT a DOM move. Six conditional siblings
           (order banner, error toast, out-of-zone gate, profile gate,
           plan-ending, renew banner) sit between the greeting and the strip,
           so any flex/adjacency approach breaks the moment one of them
           renders — which is exactly how the portrait two-up broke. Grid
           placement is order-independent: both claim row 1 by name,
           everything else auto-flows from row 2 no matter how many banners
           appear or in what order.

           Born capped at 1279 while the layout awaited judgement on a real
           tablet; owner extended it to all desktop widths 2026-08-19, which
           makes the query exactly the EXPANDED contract — the two-up is now
           simply how the expanded home header renders. The wrap trigger
           keeps ONE stable home (top-right) in every state; do not make the
           placement conditional on which banners happen to be present. */
        @media ${EXPANDED} {
          .home-desktop {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            column-gap: 20px;
            /* row-gap owns EVERY vertical gap in this column, matching
               .dash-grid's own 20px so the whole page keeps one rhythm.
               Do not reintroduce per-child margins here: the children carry
               their own (greeting 20, each banner 18) and they do not agree,
               so mixing the two produced a 0px gap above the banner and 36px
               below it — the header row's margin was zeroed to align it with
               the strip, and the compensation landed on .dash-grid, which sits
               AFTER the banner rather than after the header. One owner. */
            row-gap: 20px;
          }
          /* Default every child to the full row and strip its own bottom
             margin; only the two header items are placed by hand. Anything
             added later stays full-bleed and on-rhythm by default rather than
             silently landing in half a column with its own spacing. */
          .home-desktop > * { grid-column: 1 / -1; margin-bottom: 0 !important; }
          .home-desktop > .home-greeting { grid-column: 1; grid-row: 1; align-self: center; }
          /* No border/padding overrides here anymore: the strip renders in
             this cell at every width it exists at, so MonthlyWrapStrip.tsx
             owns its final styling directly (ghost pill when open, naked
             row when locked) instead of shipping stacked-row styles for
             this block to undo. */
          .home-desktop > .monthly-wrap-strip {
            grid-column: 2; grid-row: 1;
            align-self: center;
            justify-self: end;
          }
        }

        /* Rebalance the hero/actions pair — LANDSCAPE-TABLET ONLY, deliberately
           not part of the EXPANDED block above. The 8/4 split is tuned for a
           laptop's 1348px content; at 932px it leaves Quick Actions 268px,
           which wraps "Skip tonight's meal" onto three lines with its chip
           stranded alongside. 7/5 gives the action column ~345px so each
           button reads as one decision. !important because both spans are
           inline styles on the components themselves. */
        @media (min-width: 1024px) and (max-width: 1279px) and (orientation: landscape) {
          .dash-grid > .hero-card { grid-column: span 7 !important; }
          .dash-grid > .quick-actions-card { grid-column: span 5 !important; }
        }

        .dash-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 20px;
        }
        /* Stack the 12-col grid only in COMPACT. Keyed on the contract, not a
           raw 1024, because a landscape iPad mini is exactly 1024 wide and
           keeps its rail — under the old rule it kept the rail but stacked
           every card, giving 1355px of page inside a 768px viewport. */
        @media ${COMPACT} {
          .dash-grid > * { grid-column: span 12 !important; }
        }
        /* Mobile (≤768): natural DOM order is the right scan order now that
           StatRow renders as a slim metric strip — a compact stats ribbon on
           top, then tonight's hero, then thumb-reach actions, then progress.
           No order overrides needed. Tighter gap for density.
           See .interface-design/mobile-redesign-spec.md. */
        @media (max-width: 768px) {
          .dash-grid { gap: 14px; }
          /* Greeting compresses: tighter margin, drop the verbose equity ledger
             (recall-only context; the cycle-savings number lives in the strip). */
          .home-greeting { margin-bottom: 12px !important; }
          .home-equity { display: none !important; }
          /* Renew banner subline density is now handled by the collapse
             state (starts collapsed) — a display:none override here would
             make the expand chevron a no-op at this width. */
        }

        /* Quick actions row hover lift */
        .qa-row { transition: transform 150ms, box-shadow 150ms, background 150ms, border-color 150ms; }
        .qa-row:hover:not(:disabled) { transform: translateY(-1px); }

        /* First-visit stagger only — gated by sessionStorage flag */
        .dash-grid > *:nth-child(1) { animation: fadeUp 0.35s ease-out 0.00s both; }
        .dash-grid > *:nth-child(2) { animation: fadeUp 0.35s ease-out 0.07s both; }
        .dash-grid > *:nth-child(3) { animation: fadeUp 0.35s ease-out 0.14s both; }
        .dash-grid > *:nth-child(4) { animation: fadeUp 0.35s ease-out 0.21s both; }
        .dash-grid > *:nth-child(5) { animation: fadeUp 0.35s ease-out 0.28s both; }
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

        /* Resume-success pop — one-shot spring scale when the plan resumes */
        @keyframes resumeSuccessPop {
          0%   { transform: scale(1); box-shadow: 0 4px 16px rgba(245,127,32,0.30); }
          40%  { transform: scale(1.032); box-shadow: 0 10px 32px rgba(245,127,32,0.58); }
          100% { transform: scale(1); box-shadow: 0 4px 16px rgba(245,127,32,0.30); }
        }
        .qa-resume-success {
          animation: resumeSuccessPop 0.40s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .qa-resume-success { animation: none !important; }
        }

        /* Upcoming menu card hover */
        .upcoming-card { will-change: transform, box-shadow; }
        .upcoming-card:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: var(--ds-shadow-elev) !important;
          border-color: var(--ds-og-border) !important;
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

        .view-menu-btn:hover { color: var(--ds-fg) !important; }
        /* Dark-hero context (active subscription): the hero sits on TIER_POP
           navy, so hovering to var(--ds-fg) — also dark navy — made the link
           invisible. Override with cream so the contrast goes UP on hover
           instead of disappearing. */
        .view-menu-btn--on-dark:hover { color: #f5f0e8 !important; }
        .view-menu-btn:active { opacity: 0.7; }
      `}</style>

      {/* Future-skip / un-skip modal — opens from PlanProgress pill clicks
          (confirm-skip / confirm-unskip) or from QuickActions "Plan a skip"
          (pick-then-skip). Owns its own AnimatePresence + escape handling.
          When a renewal is queued, the modal shows a warning banner so the
          customer knows the queued start date will shift forward. */}
      <FutureSkipModal
        open={!!futureSkipModal}
        onClose={closeFutureSkipModal}
        mode={futureSkipModal?.mode ?? 'pick-then-skip'}
        initialDate={futureSkipModal?.date}
        sub={effectiveSub}
        maxSkips={skipTotal}
        queuedSub={queuedSub}
        isPending={isPending}
        onConfirmSkip={handleConfirmFutureSkip}
        onConfirmUnskip={handleConfirmFutureUnskip}
      />

      {/* Plan-a-pause picker modal — opened from the existing Pause confirm
          modal's "Pause from a future date instead →" link. */}
      <PlanPauseModal
        open={planPauseModalOpen}
        onClose={closePlanPauseModal}
        sub={effectiveSub}
        queuedSub={queuedSub}
        isPending={isPending}
        onConfirm={handleConfirmPlanPause}
      />

      {/* Savings benchmark capture — opens from the StatRow empty-state tile.
          One-time slider question (AED 15-50, default 25). Confirming writes
          customers.takeout_benchmark_aed and refreshes the route so the
          StatTile flips to its proper rendering. */}
      <SavingsBenchmarkModal
        open={benchmarkModalOpen}
        onClose={() => { if (!benchmarkSaving) setBenchmarkModalOpen(false) }}
        isPending={benchmarkSaving}
        perMealDormers={perMealDormers}
        initialValue={customer?.takeout_benchmark_aed ?? null}
        onConfirm={handleConfirmBenchmark}
      />

      {/* Cancel-planned-pause confirmation. Opens when the customer taps
          the "Pause planned · [date]" state of the Pause button. Single
          confirmation — refunds the pause credit on commit. */}
      <MobileSheet
        open={showCancelPlannedPause && !!sub.planned_pause_start}
        onClose={() => setShowCancelPlannedPause(false)}
        maxWidth={420}
        ariaLabel="Cancel your planned pause"
        footer={
          <>
            <button
              onClick={() => setShowCancelPlannedPause(false)}
              style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ds-border-strong)', background: 'var(--ds-surface2)', color: S.fg, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
            >
              Keep it planned
            </button>
            <button
              onClick={handleCancelPlannedPause}
              style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: 'none', background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 0 16px rgba(245,127,32,0.45)' }}
            >
              Cancel pause
            </button>
          </>
        }
      >
        {sub.planned_pause_start && (
          <>
            <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.01em', marginRight: 28 }}>
              Cancel your planned pause?
            </div>
            <div style={{ fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 12, lineHeight: 1.65 }}>
              Your pause is scheduled for{' '}
              <strong style={{ color: S.fg }}>
                {new Date(sub.planned_pause_start + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })}
              </strong>. Cancelling now returns your <strong style={{ color: S.fg }}>1 free pause</strong> to use later in this cycle.
            </div>
          </>
        )}
      </MobileSheet>

      {/* Action confirmation toast — a bottom-center pull-up on every successful
          skip / un-skip / pause / resume / plan-skip / plan-pause / cancel, so
          the user always gets acknowledgement. Auto-dismisses (~2.8s). */}
      {confirmMsg && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'max(env(safe-area-inset-bottom), 18px)', zIndex: 250, display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none' }}>
          <div role="status" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '10px 8px 10px 12px', borderRadius: 999, background: 'linear-gradient(135deg, #1a3e4f 0%, #091825 100%)', color: '#f5f0e8', fontFamily: BODY, fontSize: 13.5, fontWeight: 700, boxShadow: '0 14px 36px -10px rgba(9,24,37,0.55), 0 2px 8px rgba(9,24,37,0.2)', animation: 'fadeUp 0.3s ease-out', pointerEvents: 'auto' }}>
            <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: 999, background: '#1d8a30', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Check size={14} strokeWidth={3} color="#fff" />
            </span>
            <span style={{ paddingRight: 2 }}>{confirmMsg}</span>
            <button type="button" onClick={dismissConfirm} aria-label="Dismiss" style={{ marginLeft: 2, width: 26, height: 26, flexShrink: 0, padding: 0, borderRadius: 999, background: 'rgba(245,240,232,0.1)', border: 'none', color: 'rgba(245,240,232,0.7)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={14} strokeWidth={2.4} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
