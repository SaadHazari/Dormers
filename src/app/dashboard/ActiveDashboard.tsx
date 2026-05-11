'use client'

import { useState, useTransition, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, PartyPopper, ChevronRight, PauseCircle } from 'lucide-react'
import { pauseSubscription, resumeSubscription, skipMeal } from './actions'
import { MENU_DATA, getMenuWeek } from '@/lib/menuData'
import { cleanPlanName, OG, BG, BODY, S } from './_shared/tokens'
import { fmtWithDay } from './_shared/format'
import { ProfileBanner } from './_shared/ProfileBanner'
import { OutOfZoneBanner } from './_shared/OutOfZoneBanner'
import { vegDayNumbersFor, type WeekType } from '@/lib/veg-day'
import { SUBSCRIPTION_STATUS } from '@/lib/subscription-status'
import { HeroToday } from './HeroToday'
import { PlanProgress } from './PlanProgress'
import { StatRow } from './StatRow'
import { QuickActions } from './QuickActions'
import type { Customer, Subscription, MenuItem, MealState, WeekStatus, LocalState } from './_shared/types'

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
  now: Date = new Date()
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
  let dishes = MENU_DATA.filter(d => d.week === weekKey)
  let usedFallback = false
  if (dishes.length === 0) {
    const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7)
    const lastKey = getMenuWeek(lastMonday)
    const lastDishes = MENU_DATA.filter(d => d.week === lastKey)
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
      date:  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * State-owning dashboard for customers with an active subscription.
 * Composes HeroToday / PlanProgress / StatRow / QuickActions, owns the
 * skip / pause / resume optimistic state machine + confirm modals, and
 * derives the effective subscription used to drive the visible tiles.
 *
 * Was 363 inline LOC in ClientDashboard.tsx.
 */
export function ActiveDashboard({ sub, customer, userEmail, allSubscriptions, queuedSub = null, profileGate = [], outOfZone = false, justCheckedOut = false }: {
  sub: Subscription; customer: Customer | null; userEmail: string; allSubscriptions: Subscription[]
  queuedSub?: Subscription | null
  /** Missing-field labels — empty array = profile complete; non-empty disables purchase CTAs. */
  profileGate?: string[]
  /** True when the customer's dorm is outside the listed delivery radius — disables purchase CTAs and renders the OutOfZoneBanner above ProfileBanner. */
  outOfZone?: boolean
  justCheckedOut?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError]     = useState<string | null>(null)
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
  const [pendingAction, setPendingAction]   = useState<'skip' | 'pause' | 'resume' | null>(null)
  const [successAction, setSuccessAction]   = useState<'skip' | 'pause' | 'resume' | null>(null)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [showPauseConfirm, setShowPauseConfirm] = useState(false)
  const [showQueuedPauseWarning, setShowQueuedPauseWarning] = useState(false)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalState(
      sub.status === SUBSCRIPTION_STATUS.PAUSED ? 'paused'
      : sub.status === SUBSCRIPTION_STATUS.SKIPPED ? 'skipped'
      : isSameDay(sub.last_skipped_date) ? 'skipped'
      : 'active'
    )
  }, [sub.status, sub.last_skipped_date])

  useEffect(() => () => { if (successTimer.current) clearTimeout(successTimer.current) }, [])

  useEffect(() => {
    if (!showSkipConfirm && !showPauseConfirm && !showQueuedPauseWarning) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSkipConfirm(false)
        setShowPauseConfirm(false)
        setShowQueuedPauseWarning(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSkipConfirm, showPauseConfirm, showQueuedPauseWarning])

  const isWeekly       = sub.plan_name.includes('Weekly Flex')
  const isOneTime      = sub.plan_name.includes('One-Time')
  const isPausableTier = sub.plan_name.includes('Monthly Premium') || sub.plan_name.includes('Monthly Max')
  const isScheduled    = sub.status === SUBSCRIPTION_STATUS.SCHEDULED || new Date(sub.start_date).getTime() > Date.now()
  const canPause       = isPausableTier && !sub.has_paused_before && !isWeekly && !isOneTime && sub.status !== SUBSCRIPTION_STATUS.ENDED && !isScheduled
  const endedPlans      = allSubscriptions.filter(s => s.status === SUBSCRIPTION_STATUS.ENDED)
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

  const handleSkipRequest  = () => { if (localState !== 'active' || isPending || isScheduled) return; setShowSkipConfirm(true) }
  const handleSkipConfirm  = () => { setShowSkipConfirm(false); act(() => skipMeal(sub.id), 'skipped', 'skip') }
  const handlePauseRequest = () => {
    if (isPending || isScheduled) return
    if (localState === 'paused') {
      // Same-day lock: kitchen needs a committed no-prep window. UI button is
      // already disabled, but guard here too so a double-tap can't sneak through.
      if (resumeLockedSameDay) return
      act(() => resumeSubscription(sub.id), 'active', 'resume')
    }
    else if (pausePastFinalDay) return
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
  const handleQueuedPauseConfirm = () => {
    setShowQueuedPauseWarning(false)
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
    status: localState === 'paused' ? SUBSCRIPTION_STATUS.PAUSED : localState === 'skipped' ? SUBSCRIPTION_STATUS.SKIPPED : sub.status,
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
    () => buildCurrentWeekMenu(vegDayNumbers, subWeekType),
    [vegDayNumbers, subWeekType]
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

  // Final-day pause lock: it's the cycle's last delivery date AND the AE
  // wall clock has crossed 14:00 (kitchen prep cutoff). Pausing now would
  // push end_date out by 1 calendar day, but tonight's delivery is already
  // committed — the pause wouldn't protect anything; it'd just delay the
  // closure. Lock it; the customer can still Resume from a paused state.
  const pausePastFinalDay = useMemo(() => {
    if (!skipPastCutoff) return false   // tracks the same 14:00 AE tick
    // Compare AE wall-date to the sub's end_date. They're both calendar
    // dates so a string compare on YYYY-MM-DD works.
    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const aeIso = `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`
    return aeIso === sub.end_date
  }, [skipPastCutoff, sub.end_date])

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
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(justCheckedOut)
  useEffect(() => {
    if (!showSuccessOverlay) return
    const t = setTimeout(() => setShowSuccessOverlay(false), 3000)
    return () => clearTimeout(t)
  }, [showSuccessOverlay])

  return (
    <div className="dash-root" style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: S.fg }}>

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

        {/* Greeting ribbon — name + accumulated equity (loyalty as endowed progress, not guilt) */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 500, color: S.fgMuted, letterSpacing: 0 }}>
              {getGreeting()}, <strong style={{ color: S.fg, fontWeight: 700 }}>{firstName}</strong>.
            </div>
            {totalDelivered >= 5 && (
              <div style={{ fontFamily: BODY, fontSize: 12, color: S.fgSub, letterSpacing: 0, lineHeight: 1.5 }}>
                <strong style={{ color: S.fg, fontWeight: 700 }}>{totalDelivered}</strong> dinners with us
                {memberSinceText && <> · since {memberSinceText}</>}
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
          </div>
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
        <ProfileBanner missing={profileGate} />

        {/* Last-day-of-cycle renew banner — shown when end_date is today and
            no Scheduled is queued. The single highest-leverage retention moment
            in the product. Hidden if a queued sub exists (the user has already
            renewed). Always shown above the queued-banner so the bookend gets
            the dominant slot. */}
        {!queuedSub && !isScheduled && (() => {
          const todayIsEndDate = new Date(sub.end_date + 'T00:00:00').toDateString() === new Date().toDateString()
          if (!todayIsEndDate) return null
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
                  Last meal of your <strong style={{ color: OG }}>{cleanPlanName(sub.plan_name)}</strong> tonight.
                </div>
                <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>
                  Renew now to keep dinner showing up — your next plan can start tomorrow.
                </div>
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
            </div>
          )
        })()}

        {/* Queued-renewal banner — shown only when an Active|Paused|Skipped
            primary AND a Scheduled queue both exist. Saturated slate-blue
            pill on a deeper-tint background so the "something's coming"
            signal pops at a glance. The Scheduled row auto-flips to Active
            via subscription_status_tick at midnight AE on its start_date. */}
        {queuedSub && (
          <div style={{
            marginBottom: 18,
            padding: '16px 18px',
            borderRadius: 'var(--radius-sm)',
            // Saturated slate-blue surface so the banner pops as a confident
            // "something's coming" signal, not a quiet caption. Subtle inner
            // highlight + heavier glow give it dimensional pop without
            // shouting at the user.
            background: 'linear-gradient(135deg, #3a6f8c 0%, #2a5470 100%)',
            border: '1px solid rgba(58,111,140,0.55)',
            color: '#ffffff',
            fontFamily: BODY,
            fontSize: 14,
            lineHeight: 1.45,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 8px 24px rgba(58,111,140,0.30), inset 0 1px 0 rgba(255,255,255,0.10)',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              padding: '6px 12px',
              borderRadius: 999,
              background: '#FFAA00',
              color: '#3a2200',
              boxShadow: '0 0 0 3px rgba(255,170,0,0.22), 0 4px 12px rgba(255,170,0,0.40)',
              flexShrink: 0,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#3a2200',
                boxShadow: '0 0 8px rgba(58,34,0,0.55)',
              }} />
              Up next
            </span>
            <span style={{ color: '#ffffff', minWidth: 0, fontWeight: 600 }}>
              <strong style={{ fontWeight: 800 }}>{cleanPlanName(queuedSub.plan_name)}</strong>
              <span style={{ color: 'rgba(255,255,255,0.50)', margin: '0 8px' }}>·</span>
              <span style={{ color: '#FFD27A', fontWeight: 700 }}>
                Starts {new Date(queuedSub.start_date).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </span>
          </div>
        )}

        {/* 12-column grid — order:
            (1) Stats row (Deliveries/Delivered/Skips/Days)
            (2) Tonight's dish + Quick actions
            (3) Plan progress                                                   */}
        <div className={`dash-grid${skipStagger ? ' dash-grid-no-stagger' : ''}`}>
          <StatRow sub={effectiveSub} isPaused={localState === 'paused'} />
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
            disabledReason={isScheduled
              ? `Available once your plan starts on ${new Date(sub.start_date).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}.`
              : undefined}
            skipPastCutoff={!isScheduled && skipPastCutoff}
            skipNoDelivery={!isScheduled && skipNoDelivery}
            pausePastFinalDay={!isScheduled && pausePastFinalDay}
            resumeLockedSameDay={resumeLockedSameDay}
            isPausableTier={isPausableTier}
            isTrialPlan={isOneTime}
          />
          {/* PlanProgress takes the full row width on the main dashboard.
              The Past plans card has moved to /dashboard/plan (beside the
              Common questions block) so the live progress can breathe and
              the historical view lives in one obvious place. */}
          <PlanProgress sub={effectiveSub} isPaused={localState === 'paused'} />
        </div>

        {/* Skip confirmation modal — sharpened for irreversibility */}
        <AnimatePresence>
          {showSkipConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'var(--ds-overlay-strong)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}
              onClick={() => setShowSkipConfirm(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                onClick={e => e.stopPropagation()}
                style={{ background: BG, borderRadius: 'var(--radius-md)', padding: 32, maxWidth: 440, width: '100%', border: '1px solid var(--ds-og-border)', boxShadow: 'var(--ds-shadow-modal)' }}
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
                  You won&rsquo;t lose this meal — your end date pushes out by one delivery day so it joins the end of your plan.
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

                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
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
              style={{ position: 'fixed', inset: 0, background: 'var(--ds-overlay-strong)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}
              onClick={() => setShowPauseConfirm(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                onClick={e => e.stopPropagation()}
                style={{ background: BG, borderRadius: 'var(--radius-md)', padding: 32, maxWidth: 420, width: '100%', border: '1px solid var(--ds-og-border)', boxShadow: 'var(--ds-shadow-modal)' }}
              >
                <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                  Pause your plan?
                </div>
                <div style={{ fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 12, lineHeight: 1.65 }}>
                  This uses your <strong style={{ color: S.fg }}>1 free pause</strong> for the cycle. Your end date extends by the days you stay paused. Resume any time after tomorrow.
                </div>
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-og-wash)', border: '1px solid var(--ds-og-border)', fontFamily: BODY, fontSize: 12, color: OG, lineHeight: 1.5 }}>
                  Pauses available: <strong>1 of 1</strong>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
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
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Queued-plan pause warning modal — shown instead of the standard
            pause-confirm when the user has a Scheduled next plan. Explains
            that the queued plan's start date shifts with each delivery day
            they stay paused (handled automatically by the DB trigger). The
            user acknowledges and taps "Pause anyway" to proceed directly,
            or cancels. Single confirmation — no secondary "Are you sure?" */}
        <AnimatePresence>
          {showQueuedPauseWarning && queuedSub && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'var(--ds-overlay-strong)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}
              onClick={() => setShowQueuedPauseWarning(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                onClick={e => e.stopPropagation()}
                style={{ background: BG, borderRadius: 'var(--radius-md)', padding: 32, maxWidth: 460, width: '100%', border: '1px solid var(--ds-og-border)', boxShadow: 'var(--ds-shadow-modal)' }}
              >
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

                <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 800, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
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

                <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                  <button
                    onClick={() => setShowQueuedPauseWarning(false)}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ds-border-strong)', background: 'var(--ds-surface2)', color: S.fg, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleQueuedPauseConfirm}
                    style={{ flex: 2, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: 'none', background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 0 16px rgba(245,127,32,0.45)' }}
                  >
                    Understood — pause anyway
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
        .view-menu-btn:active { opacity: 0.7; }
      `}</style>
    </div>
  )
}
