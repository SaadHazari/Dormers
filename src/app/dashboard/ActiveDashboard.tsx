'use client'

import { useState, useTransition, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, PartyPopper } from 'lucide-react'
import { pauseSubscription, resumeSubscription, skipMeal } from './actions'
import { MENU_DATA, getMenuWeek } from '@/lib/menuData'
import { cleanPlanName, OG, NV, BG, BODY, S } from './_shared/tokens'
import { fmtWithDay } from './_shared/format'
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

// Build Mon–Sat of the CURRENT week (or NEXT week if today is Sunday).
// Each item is tagged with its delivery state — past / today / future.
// If this week has no dishes, fall back to last week's so the variable-reward
// engine never goes flat (returns weekStatus so consumers can rephrase the header).
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
export function ActiveDashboard({ sub, customer, userEmail, allSubscriptions, justCheckedOut = false }: {
  sub: Subscription; customer: Customer | null; userEmail: string; allSubscriptions: Subscription[]
  justCheckedOut?: boolean
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
    sub.status === SUBSCRIPTION_STATUS.PAUSED ? 'paused'
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
      sub.status === SUBSCRIPTION_STATUS.PAUSED ? 'paused'
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
    <div className="dash-root" style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: NV }}>

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
              background: 'radial-gradient(circle at center, rgba(245,127,32,0.18) 0%, rgba(9,24,37,0.55) 70%)',
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
                background: 'linear-gradient(135deg, rgba(245,127,32,0.10) 0%, rgba(255,170,0,0.05) 100%)',
                border: '1px solid rgba(245,127,32,0.32)',
                display: 'flex', alignItems: 'center', gap: 14,
              }}
            >
              <div style={{
                width: 40, height: 40, flexShrink: 0, borderRadius: '50%',
                background: 'rgba(245,127,32,0.16)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: OG,
              }}>
                <PartyPopper size={20} strokeWidth={2} aria-hidden />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: NV, lineHeight: 1.3 }}>
                  Your <strong style={{ color: OG }}>{cleanPlanName(justBoughtSub.plan_name)}</strong> is {new Date(justBoughtSub.start_date) > new Date() ? 'scheduled' : 'active'}.
                </div>
                <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>
                  First meal arrives <strong style={{ color: NV }}>{fmtWithDay(justBoughtSub.start_date)}</strong>. Receipt sent to your inbox.
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
            subStartDate={isScheduled ? sub.start_date : undefined}
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
                  Your end date moves out by <strong style={{ color: NV }}>1 day</strong> so you don&rsquo;t lose this meal.{' '}
                  {skipQuota.total > 0 && (
                    <>You&rsquo;ll have <strong style={{ color: NV }}>{Math.max(0, skipQuota.left - 1)} of {skipQuota.total}</strong> skip{skipQuota.total === 1 ? '' : 's'} left after this.</>
                  )}
                </div>
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', color: '#9a2828', fontFamily: BODY, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
                  Once you confirm, the kitchen will be informed and this can&rsquo;t be undone.
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
