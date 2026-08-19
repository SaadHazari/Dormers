'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Check, Utensils, Gem, Crown, Sparkles, Info,
  CalendarDays, CalendarClock, Unlock, Heart, Moon,
} from 'lucide-react'
import { OG, OG_DEEP, BODY, S, TIER1, TIER2, TIER3, TIER_POP, TIER_POP_TEXT, cleanPlanName } from '../_shared/tokens'
import { PlanGlyph } from '../_shared/PlanGlyph'
import { Eyebrow } from '../_shared/Eyebrow'
import { StatusDot } from '../_shared/StatusDot'
import { OutOfZoneBanner } from '../_shared/OutOfZoneBanner'
import { ProfileBanner } from '../_shared/ProfileBanner'
import { ProfileGateOverlay } from '../_shared/ProfileGateOverlay'
import { IntakePausedGate } from '../_shared/IntakePausedGate'
import { SeasonEndingBanner } from '../_shared/SeasonEndingBanner'
import { Tooltip } from '../_shared/Tooltip'
import { FAQItem } from '../_shared/FAQItem'
import { fmt, fmtWithDay } from '../_shared/format'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { missingProfileFields } from '@/contexts/subscriptions/domain/profile-completion'
import { CheckoutPanel } from './CheckoutPanel'
import { effectivePreferences } from '@/contexts/subscriptions/domain/preferences'
import { DateField } from './DateField'
import { NoPlanView } from '../NoPlanView'
import { changeStartDate, cancelPlannedPause } from '@/contexts/subscriptions/usecases/subscription-mutations'
import { whatsAppHref } from '@/shared/contacts'
import { pricePerMeal, totalPrice, mealsForPlan, PLANS, PLAN_KEBAB, type PlanId, type Pref, type PlanDef, type WeekType, type PriceOverride } from '@/contexts/subscriptions/domain/pricing'
import { taperWindow, taperedMaxStart } from '@/contexts/subscriptions/domain/season-taper'
import { prettySeasonDate } from '@/contexts/subscriptions/domain/season-horizon'
import { resolvePlan, type PlanId as KebabPlanId } from '@/contexts/subscriptions/domain/plans'
import { MobilePlan } from '../_mobile/MobilePlan'
import { MobileExplore } from '../_mobile/MobileExplore'
import { CreditSection, type CreditItem } from '../_shared/CreditSection'

// DB stores the raw `meal_preference_type` value; this map yields the friendly
// label for read-only displays. (Kept here because the Plan page only renders
// the value; full editing happens at /dashboard/profile.)
const MEAL_PREFS = [
  { value: 'Non Veg',              label: 'Non-Vegetarian'      },
  { value: 'Veg',                  label: 'Veg'                 },
  { value: 'Religious Preference', label: 'Religious Preference' },
]

// ── Tokens ────────────────────────────────────────────────────────────────────
// OG / S / TIER1-3 are pulled from the shared dashboard token system so this
// page sits on the same surface tiers, palette, and typeface as Home and Menu.
// DISPLAY is intentionally an alias of BODY — single typeface across the
// dashboard; hierarchy comes from scale + weight + colour. BG resolves to the
// theme-aware page gradient (cream in light, deep navy in dark).
const BG = 'var(--ds-bg-gradient)'
const DISPLAY = BODY

// Customer + Subscription canonical types live in _shared/types.ts. The local
// duplicates here drifted out of sync with downstream code during Phase 1+5
// development. Consuming the shared definitions keeps every render path on
// the same shape.
import type { Customer, Subscription, IntakeGateState, CreditByPlan } from '../_shared/types'
import { INTAKE_NOT_PAUSED } from '../_shared/types'
import { COMPACT } from '../_shared/breakpoints'
interface Props {
  customer: Customer | null
  activeSubscription: Subscription | null
  allSubscriptions: Subscription[]
  userEmail: string
  // 'plan'    → /dashboard/plan: shows current plan, profile, past plans (no pricing grid).
  // 'explore' → /dashboard/explore-plans: shows ONLY pricing grid + checkout, no other sections.
  mode?: 'plan' | 'explore'
  /** Per-plan split of approved credits in fils, server-fetched ONCE
   *  (getCreditSplitByPlan) and computed in memory for every selectable
   *  plan. Threaded to both checkout surfaces so switching plan cards
   *  updates the applied-discount row and the locked-credit explanation
   *  without a round trip. Optional, defaults to {} when the SSR fetch
   *  returns nothing (preview mode / fetch failure). */
  creditByPlan?: CreditByPlan
  /** Itemized credits rows (approved + applied) for the credit statement
   *  on /plan — the sidebar chip's #credit landing spot. Empty hides the
   *  section entirely. */
  creditItems?: CreditItem[]
  /** Active admin price overrides (plan_pricing rows, server-fetched).
   *  Threaded into every pricePerMeal/totalPrice call so the cards, the
   *  checkout panels, and the POSTed amount all show the DB-backed price.
   *  Defaults to [] (code prices) in preview mode / fetch failure. */
  priceOverrides?: PriceOverride[]
  /** Seasonal intake pause (server-fetched via getIntakeState + the
   *  customer's intake_waitlist row). Drives IntakePausedGate everywhere a
   *  plan can be bought. Takes precedence over the profile-completion gate
   *  — never render both. Defaults to "not paused" in preview mode. */
  intake?: IntakeGateState
}

// ── Reusable bits ─────────────────────────────────────────────────────────────
// Eyebrow moved to _shared/Eyebrow.tsx — imported above.

// StatusDot moved to _shared/StatusDot.tsx — imported above.

// ── ChangeStartDateModal ──────────────────────────────────────────────────────
// Lives only on Scheduled subs — once the plan begins, rescheduling is a
// kitchen-ops concern, not self-serve. Reuses the brand DateField so the date
// picker UX is identical to checkout.
function ChangeStartDateModal({
  sub, isOpen, onClose, lastDeliveryDay = null,
}: {
  sub: Subscription
  isOpen: boolean
  onClose: () => void
  /** Season taper — a Scheduled sub moved LATER must not cross the last
   *  delivery day either, so the same clamp the checkout picker uses applies
   *  here, computed for the plan + cadence of the sub being rescheduled. */
  lastDeliveryDay?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Pre-fill with the current scheduled date — most users will tweak by a few
  // days, not start from blank. Refresh the value whenever the modal reopens.
  const localStart = sub.start_date.slice(0, 10)
  const [picked, setPicked] = useState(localStart)
  useEffect(() => { if (isOpen) { setPicked(localStart); setError(null) } }, [isOpen, localStart])

  // Window: tomorrow .. today + 30 (mirrors /api/checkout + the action's check)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const cap = new Date(today); cap.setDate(cap.getDate() + 30)
  const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const minIso = isoLocal(tomorrow)
  const rawMaxIso = isoLocal(cap)
  // Season taper — the plan being rescheduled decides its own horizon, so
  // the clamp is computed from THIS sub's plan and cadence, not the
  // customer's current shopping preferences.
  const subWeekType: WeekType = sub.week_type === '5DAYS' ? '5DAYS' : '6DAYS'
  const taperMax = taperedMaxStart({
    // Unresolvable plan name → assume the LONGEST journey (tightest clamp),
    // so an unknown label narrows the picker rather than opening it up.
    planId: (resolvePlan(sub.plan_name)?.id ?? 'monthly-max') as KebabPlanId,
    weekType: subWeekType,
    minStart: minIso,
    maxStart: rawMaxIso,
    lastDeliveryDay,
  })
  // No viable day left: keep the picker at a single day rather than
  // offering dates the server action will refuse. The note below says why.
  const maxIso = taperMax ?? minIso
  const seasonBlocked = !!lastDeliveryDay && taperMax === null

  const handleSave = () => {
    if (!picked || picked === localStart) { onClose(); return }
    setError(null)
    startTransition(async () => {
      const res = await changeStartDate(sub.id, picked)
      if (res?.error) { setError(res.error); return }
      onClose()
      router.refresh()
    })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'var(--ds-overlay-strong)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--ds-content-bg)', borderRadius: 'var(--radius-md)', padding: 32, maxWidth: 460, width: '100%', border: '1px solid var(--ds-og-border)', boxShadow: 'var(--ds-shadow-modal)' }}
          >
            <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
              Change start date
            </div>
            <div style={{ fontFamily: BODY, fontSize: 13, color: S.fgMuted, marginTop: 8, lineHeight: 1.6 }}>
              {/* The 30-day promise stops being true once the term caps the
                  window — say what the picker actually allows. */}
              {lastDeliveryDay
                ? 'Pick any day that still finishes this term. Your end date adjusts so the cycle stays the same length.'
                : 'Pick any day in the next 30 days. Your end date adjusts so the cycle stays the same length.'}
            </div>
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-og-wash)', border: '1px solid var(--ds-og-border)', color: OG_DEEP, fontFamily: BODY, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
              You can only change the start date <strong>once</strong>. After saving, this option will be locked for this plan.
            </div>

            {/* Season taper — stated before the calendar, so the customer
                reads the new ceiling rather than discovering it by tapping
                a greyed-out week. */}
            {lastDeliveryDay && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-skeleton-base)', border: `1px solid ${S.border}`, color: S.fgMuted, fontFamily: BODY, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
                {seasonBlocked
                  ? <>The semester wraps up on <strong style={{ color: S.fg }}>{prettySeasonDate(lastDeliveryDay)}</strong>. This plan can no longer be moved and still finish in time.</>
                  : <>The semester wraps up on <strong style={{ color: S.fg }}>{prettySeasonDate(lastDeliveryDay)}</strong>, so later dates are closed off.</>}
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <DateField
                value={picked}
                onChange={setPicked}
                minDate={minIso}
                maxDate={maxIso}
                weekType={sub.week_type === '5DAYS' || sub.week_type === '6DAYS' ? sub.week_type : undefined}
                seasonEndsOn={lastDeliveryDay}
              />
            </div>

            {error && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-danger-wash)', border: '1px solid var(--ds-danger-border)', color: 'var(--ds-danger-fg)', fontFamily: BODY, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button
                onClick={onClose}
                disabled={pending}
                style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ds-border-strong)', background: 'var(--ds-surface2)', color: S.fg, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', letterSpacing: '0.04em', opacity: pending ? 0.6 : 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={pending || !picked || seasonBlocked}
                style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: 'none', background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', letterSpacing: '0.04em', boxShadow: '0 0 16px rgba(245,127,32,0.45)', opacity: pending ? 0.7 : 1 }}
              >
                {pending ? 'Saving…' : 'Save new date'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Active plan callout ───────────────────────────────────────────────────────
function ActivePlanCallout({ sub, onRenewClick, onCancelPlannedPause, hasQueuedSub = false, outOfZone = false, purchaseGated = false, gateBanner = null, intake = INTAKE_NOT_PAUSED }: {
  sub: Subscription | null
  onRenewClick: () => void
  // Opens the cancel-planned-pause confirmation modal. Wired by PlanClient
  // when a planned pause exists on the active sub. Mirrors the dashboard's
  // planned-pause banner pattern so the customer can act from /plan too.
  onCancelPlannedPause?: () => void
  // True when a Scheduled sub is already queued behind this one. Gates
  // the end-of-cycle "Renew now" nudge — if the customer has already
  // committed to a follow-up plan, surfacing a renew button on top of
  // the QueuedSubCallout below would be redundant noise.
  hasQueuedSub?: boolean
  outOfZone?: boolean
  /** Full purchase gate (profile incomplete OR out of zone OR intake
   *  paused) — disables the empty-state CTA exactly like the dashboard home. */
  purchaseGated?: boolean
  /** ProfileBanner node shown above the empty-state hero when profile gated.
   *  Caller already suppresses this when intake.paused (never both). */
  gateBanner?: React.ReactNode
  /** Seasonal intake pause — mounts IntakePausedGate over the empty-state
   *  hero, taking precedence over the profile gate. */
  intake?: IntakeGateState
}) {
  const [showChangeStart, setShowChangeStart] = useState(false)

  if (!sub) {
    // Reuse the dashboard's NoPlanView so the new-customer entry point reads
    // identically across /dashboard and /dashboard/plan — same brand DNA grid,
    // same headline, same CTA. Single source of truth for the empty state.
    return <NoPlanView outOfZone={outOfZone} purchaseGated={purchaseGated || outOfZone} banners={gateBanner} intake={intake} />
  }
  const daysToEnd   = Math.max(0, Math.ceil((new Date(sub.end_date).getTime()   - Date.now()) / 86400000))
  const daysToStart = Math.max(0, Math.ceil((new Date(sub.start_date).getTime() - Date.now()) / 86400000))
  const startsInFuture = new Date(sub.start_date).getTime() > Date.now()
  // While the plan is still in the future, surface days-until-start as the hero
  // number (the user's burning question is "when does it begin?"). Once it's
  // started, switch to days-left-in-plan.
  const daysLeft = startsInFuture ? daysToStart : daysToEnd
  const renewEligible = !startsInFuture && daysToEnd <= 7
  // Honest state — "Scheduled" with slate-blue is more legible than forcing
  // "Active" + a clarifying subline. Color carries the meaning at a glance;
  // the subline confirms the *when*, not disambiguates the *what*.
  const status = startsInFuture && sub.status !== SUBSCRIPTION_STATUS.PAUSED
    ? SUBSCRIPTION_STATUS.SCHEDULED
    : sub.status

  // Behavioural numbers — the answer to "how is my plan going?". Pulled from
  // the existing subscription record; no new data fetched.
  // NOTE: legacy `plan_name` rows include decoration (emojis, etc.), which is
  // why ClientDashboard uses `.includes()` and a cleanPlanName helper. We
  // match the same convention here so monthly subs read correctly even when
  // the stored string isn't a clean exact match.
  const isMax       = sub.plan_name.includes('Monthly Max')
  const isPremium   = sub.plan_name.includes('Monthly Premium')
  const isWeekly    = sub.plan_name.includes('Weekly Flex')
  const supportsPause = isMax || isPremium
  const isPaused = sub.status === SUBSCRIPTION_STATUS.PAUSED
  const skipAllowance = isMax || isPremium ? 3 : isWeekly ? 1 : 0
  const skipsLeft = Math.max(0, skipAllowance - sub.skipped_meals_count)
  const pauseStatus = !supportsPause
    ? '—'
    : isPaused
      ? 'In use'
      : sub.has_paused_before
        ? 'Used'
        : 'Available'

  // Future-facing state — mirrors the dashboard so /plan is in sync with
  // whatever the customer scheduled there. Planned-pause banner fires when
  // a future pause is set; the future-skip count surfaces planned skips
  // that haven't fired yet so customers see the queue from this page too.
  const plannedPauseStart = sub.planned_pause_start ?? null
  const hasPlannedPause = !!plannedPauseStart && !isPaused
  const todayAEIso = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const futureSkipCount = (sub.skipped_dates ?? []).filter(d => d > todayAEIso).length

  return (
    <div style={{
      ...TIER_POP,
      padding: 28, borderRadius: 20,
      display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow color={TIER_POP_TEXT.muted}>Your current plan</Eyebrow>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color: TIER_POP_TEXT.primary, letterSpacing: '-0.01em' }}>
            <PlanGlyph planName={sub.plan_name} size={22} />
            {cleanPlanName(sub.plan_name)}
          </div>
          <div style={{ marginTop: 4, fontFamily: BODY, fontSize: 12.5, color: TIER_POP_TEXT.muted }}>
            {startsInFuture
              ? <>Beginning <strong style={{ color: TIER_POP_TEXT.primary }}>{fmtWithDay(sub.start_date)}</strong> · ends {fmtWithDay(sub.end_date)}</>
              : isPaused
                ? <>Started {fmtWithDay(sub.start_date)} · <span style={{ color: TIER_POP_TEXT.faint }}>est. ends {fmtWithDay(sub.end_date)}</span></>
                : <>Started {fmtWithDay(sub.start_date)} · ends <strong style={{ color: TIER_POP_TEXT.primary }}>{fmtWithDay(sub.end_date)}</strong></>}
          </div>
        </div>
        <StatusDot status={status} onDark />
      </div>

      {/* Planned-pause banner — mirrors the dashboard's PlannedPauseBanner
          but inverted for the dark TIER_POP surface. Cream-on-dark vocabulary
          matches LockedVegDays (onDark variant). Cancel link wired to the
          confirm modal in PlanClient. */}
      {hasPlannedPause && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 10,
          background: 'rgba(245,240,232,0.06)',
          border: '1px solid rgba(245,240,232,0.18)',
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: BODY, fontSize: 13, color: TIER_POP_TEXT.primary, lineHeight: 1.4,
        }}>
          <span style={{ flex: 'none', color: '#FFD27A', display: 'inline-flex' }}>
            <Moon size={15} strokeWidth={2} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            Pause planned for{' '}
            <strong style={{ fontWeight: 700, fontFeatureSettings: '"tnum"', color: TIER_POP_TEXT.primary }}>
              {new Date(plannedPauseStart + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}
            </strong>
          </span>
          {onCancelPlannedPause && (
            <button
              type="button"
              onClick={onCancelPlannedPause}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 8px',
                fontFamily: BODY, fontSize: 12, fontWeight: 700,
                color: '#FFD27A',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
                textDecorationThickness: '1px',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {isPaused ? (
            <>
              <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', color: TIER_POP_TEXT.faint, lineHeight: 1 }}>—</span>
              <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: TIER_POP_TEXT.muted }}>plan paused</span>
            </>
          ) : (
            <>
              <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', color: OG, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{daysLeft}</span>
              <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: TIER_POP_TEXT.primary }}>day{daysLeft === 1 ? '' : 's'} {startsInFuture ? 'until your plan starts' : 'left in your plan'}</span>
            </>
          )}
        </div>

        {/* Right-side affordance: paused first (blocks renew even if within the
            window), then renew, then change-start, then calm info line.
            Only one of the four shows at a time. */}
        {isPaused ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: BODY, fontSize: 12.5, fontWeight: 600, color: TIER_POP_TEXT.primary }}>
              Plan paused
            </div>
            <div style={{ fontFamily: BODY, fontSize: 11.5, color: TIER_POP_TEXT.muted, marginTop: 2 }}>
              Resume any time — meals will be waiting.
            </div>
          </div>
        ) : renewEligible && !hasQueuedSub ? (
          /* End-of-cycle renew nudge — last 7 days AND no queued
             follow-up. With a queued sub already behind this one, this
             button would just duplicate the QueuedSubCallout below;
             surface it only when the customer genuinely hasn't committed
             to a next plan yet. */
          outOfZone ? (
            <Tooltip fit="inline" label="Your dorm is outside our delivery radius — message us on WhatsApp to confirm coverage.">
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '11px 18px', borderRadius: 999,
                  fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  border: 0, cursor: 'not-allowed',
                  background: 'var(--ds-fg-tint)', color: 'rgba(255,255,255,0.65)',
                  opacity: 0.6,
                }}
              >
                Renew now →
              </span>
            </Tooltip>
          ) : (
            <Tooltip fit="inline" label="Choose a plan + start date below.">
              <button
                type="button"
                onClick={onRenewClick}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '11px 18px', borderRadius: 999,
                  fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  border: 0, cursor: 'pointer',
                  background: OG, color: '#fff',
                  transition: 'opacity 150ms',
                }}
              >
                Renew now →
              </button>
            </Tooltip>
          )
        ) : startsInFuture ? (() => {
          const dateChangeUsed = !!sub.start_date_changed_at
          return (
            <Tooltip fit="inline" label={dateChangeUsed
              ? "You can only change the start date once."
              : "Pick a different start date (you can only do this once)"}>
              <button
                type="button"
                onClick={() => { if (!dateChangeUsed) setShowChangeStart(true) }}
                disabled={dateChangeUsed}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px', borderRadius: 999,
                  fontFamily: BODY, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  border: dateChangeUsed
                    ? '1px solid rgba(245,240,232,0.12)'
                    : '1px solid rgba(245,240,232,0.28)',
                  background: dateChangeUsed
                    ? 'rgba(245,240,232,0.05)'
                    : 'rgba(245,240,232,0.10)',
                  color: dateChangeUsed ? TIER_POP_TEXT.faint : TIER_POP_TEXT.primary,
                  cursor: dateChangeUsed ? 'not-allowed' : 'pointer',
                  opacity: dateChangeUsed ? 0.7 : 1,
                  transition: 'background 150ms, border-color 150ms',
                }}
              >
                <CalendarDays size={13} strokeWidth={2.4} aria-hidden />
                {dateChangeUsed ? 'Date already changed' : 'Change start date'}
              </button>
            </Tooltip>
          )
        })() : null}
      </div>

      <ChangeStartDateModal
        sub={sub}
        isOpen={showChangeStart}
        onClose={() => setShowChangeStart(false)}
        lastDeliveryDay={intake.paused ? null : intake.lastDeliveryDay}
      />

      {/* Behavioural stats — the "how is it going?" row. Label-value pattern:
          small uppercase eyebrow over emphasised value. Hidden for scheduled
          plans (no activity yet). */}
      {!startsInFuture && (
        <>
          <div style={{ height: 1, background: 'rgba(245,240,232,0.15)', margin: '4px 0' }} />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 18,
          }}>
            <Stat label="Meals delivered" value={`${sub.delivered_meals}/${sub.total_meals}`} light />
            {/* Gifted-meals surface — only renders when support has added
                goodwill meals onto this plan. The gift is already inside the
                delivered/total figure and the end date; this tile makes the
                gesture visible instead of silently inflating the numbers. */}
            {(sub.bonus_meals ?? 0) > 0 && (
              <Stat
                label="Gifted by Dormers"
                value={`+${sub.bonus_meals} meal${(sub.bonus_meals ?? 0) === 1 ? '' : 's'}`}
                light
              />
            )}
            <Stat
              label="Skips left"
              value={skipAllowance > 0 ? `${skipsLeft} of ${skipAllowance}` : '—'}
              light
            />
            <Stat label="Pause" value={pauseStatus} light />
            {/* Future-skip surface — only renders when one or more skips
                are scheduled for upcoming dates. Mirrors what the dashboard
                shows on the calendar bar so /plan isn't blind to scheduled
                state. Hidden when zero (avoids dead-tile clutter). */}
            {futureSkipCount > 0 && (
              <Stat
                label="Skips scheduled"
                value={`${futureSkipCount}`}
                light
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Queued sub callout ────────────────────────────────────────────────────────
// Renders the customer's Scheduled sub when one sits BEHIND a live primary
// (Active|Paused|Skipped). Without this card, the dashboard's "Up next →
// Manage" banner pointed at /plan but /plan never surfaced the queue —
// classic dead-end. Visually a TIER2 card so it sits a notch below the
// dark TIER_POP active callout above; orange left-rail signals "yours
// too, not just decoration". The same ChangeStartDateModal that
// ActivePlanCallout uses is reused here so the rescheduling UX is
// identical regardless of which sub the customer is editing.
function QueuedSubCallout({ sub, primaryIsPaused = false, lastDeliveryDay = null }: {
  sub: Subscription
  // When the active sub is paused or has a planned pause queued, the
  // queued start date is tentative — it shifts as the cycle stretches.
  // Surface the ambiguity rather than promise a date that'll move.
  primaryIsPaused?: boolean
  /** Season taper — passed straight through to the reschedule modal so a
   *  queued sub can't be moved past the last delivery day either. */
  lastDeliveryDay?: string | null
}) {
  const [showChangeStart, setShowChangeStart] = useState(false)
  const daysToStart = Math.max(0, Math.ceil((new Date(sub.start_date).getTime() - Date.now()) / 86400000))
  const dateChangeUsed = !!sub.start_date_changed_at
  const cancelHref = whatsAppHref(`Hi! I'd like to cancel my upcoming ${cleanPlanName(sub.plan_name)} subscription scheduled to start ${fmt(sub.start_date)}.`)

  return (
    <div style={{
      ...TIER2,
      padding: 22, borderRadius: 16,
      marginBottom: 16,
      display: 'flex', flexDirection: 'column', gap: 14,
      // Orange left-rail anchors "Up next" as a Dormers-branded surface.
      borderLeft: `3px solid ${OG}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Up next</Eyebrow>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: S.fg, letterSpacing: '-0.01em' }}>
            <PlanGlyph planName={sub.plan_name} size={22} />
            {cleanPlanName(sub.plan_name)}
          </div>
          <div style={{ marginTop: 4, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted }}>
            {primaryIsPaused ? 'Est. starts ' : 'Starts '}
            <strong style={{ color: S.fg }}>{fmtWithDay(sub.start_date)}</strong>
            {primaryIsPaused && (
              <Tooltip fit="inline" label="Shifts forward as you stay paused. Confirmed once you resume.">
                <span style={{
                  marginLeft: 8, padding: '2px 8px', borderRadius: 999,
                  background: 'rgba(58,111,140,0.12)',
                  color: '#3a6f8c',
                  fontFamily: BODY, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'help',
                }}>Tentative</span>
              </Tooltip>
            )}
          </div>
        </div>
        <StatusDot status={SUBSCRIPTION_STATUS.SCHEDULED} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', color: OG, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{daysToStart}</span>
          <span style={{ fontFamily: BODY, fontSize: 12.5, fontWeight: 600, color: S.fgMuted }}>
            day{daysToStart === 1 ? '' : 's'} {primaryIsPaused ? 'estimated' : 'until it starts'}
          </span>
        </div>

        <Tooltip fit="inline" label={dateChangeUsed
          ? "You can only change the start date once."
          : "Pick a different start date (you can only do this once)"}>
          <button
            type="button"
            onClick={() => { if (!dateChangeUsed) setShowChangeStart(true) }}
            disabled={dateChangeUsed}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 999,
              fontFamily: BODY, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              border: dateChangeUsed ? `1px solid ${S.border}` : `1px solid ${S.border2}`,
              background: dateChangeUsed ? 'var(--ds-skeleton-base)' : 'var(--ds-surface2)',
              color: dateChangeUsed ? S.fgFaint : S.fg,
              cursor: dateChangeUsed ? 'not-allowed' : 'pointer',
              opacity: dateChangeUsed ? 0.7 : 1,
              transition: 'background 150ms, border-color 150ms',
            }}
          >
            <CalendarDays size={13} strokeWidth={2.4} aria-hidden />
            {dateChangeUsed ? 'Date already changed' : 'Change start date'}
          </button>
        </Tooltip>
      </div>

      {/* Cancellation fallback — there's no server action for cancelling a
          Scheduled sub yet (refunds + state cleanup are operator-handled).
          Soft-link to WhatsApp so the customer has an exit path instead of
          a dead-end card. Pre-fills the chat with plan + start-date context
          so support doesn't have to ask. */}
      <div style={{
        fontFamily: BODY, fontSize: 11.5, color: S.fgMuted,
        paddingTop: 4,
        borderTop: `1px solid ${S.border}`,
        marginTop: 2,
      }}>
        Need to cancel?{' '}
        <a
          href={cancelHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: S.fgSub, textDecoration: 'underline',
            textDecorationColor: 'var(--ds-fg-tint)', textUnderlineOffset: 3,
            fontWeight: 600,
          }}
        >
          Message us on WhatsApp
        </a>
      </div>

      <ChangeStartDateModal
        sub={sub}
        isOpen={showChangeStart}
        onClose={() => setShowChangeStart(false)}
        lastDeliveryDay={lastDeliveryDay}
      />
    </div>
  )
}

// ── Mini stat tile — uppercase label over emphasised numeric value. Used
// inside the active-plan callout so the behavioural data sits as supporting
// info under the days-left hero number.
function Stat({ label, value, light = false }: { label: string; value: string; light?: boolean }) {
  return (
    <div>
      <Eyebrow color={light ? TIER_POP_TEXT.muted : undefined}>{label}</Eyebrow>
      <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 18, fontWeight: 800, color: light ? TIER_POP_TEXT.primary : S.fg, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  )
}

// ── Veg-day slider for Religious ──────────────────────────────────────────────
function VegDayPicker({
  count, setCount, weekType,
}: {
  count: number | null                              // null = unselected (price cards show empty state)
  setCount: (n: number) => void
  weekType: WeekType
}) {
  // 6DAYS week → 1..5 veg days (max 5 of 6); 5DAYS week → 1..4 (max 4 of 5).
  // Upper end is W-1 because picking all-veg defeats the "mix" purpose —
  // those customers should switch their top-level preference to plain Veg.
  const W = weekType === '5DAYS' ? 5 : 6
  const maxVeg = W - 1
  const options = Array.from({ length: maxVeg }, (_, i) => i + 1)
  // Defensive cap: if customer's week_type changed and the stored count now
  // exceeds the new max, clamp the displayed count.
  const safeCount = count == null ? null : Math.min(count, maxVeg)
  const cols = options.length     // 4 or 5 — keeps each pill the same size

  // Anticipatory hint — pulsing amber dot + soft instructional copy when no
  // count is picked yet. Communicates "this is the entry point of the
  // configuration" without screaming. Disappears the moment the user
  // engages with any count button.
  const showHint = count == null

  return (
    <div style={{ padding: 14, borderRadius: 14, background: 'var(--ds-skeleton-base)', border: `1px solid ${S.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Eyebrow>Veg Days per Week</Eyebrow>
        <span style={{
          fontFamily: BODY, fontSize: 13, fontWeight: 700,
          color: safeCount == null ? S.fgFaint : OG,
          fontFeatureSettings: '"tnum"',
        }}>
          {safeCount == null ? `— of ${W}` : `${safeCount} of ${W}`}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
        {options.map(n => {
          const active = safeCount === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              style={{
                padding: '10px 0', borderRadius: 8, border: `1px solid ${active ? OG : S.border}`,
                background: active ? 'rgba(245,127,32,0.12)' : 'rgba(255,255,255,0.5)',
                color: active ? OG : S.fg, fontFamily: BODY, fontSize: 13, fontWeight: 700,
                fontFeatureSettings: '"tnum"', cursor: 'pointer',
                transition: 'background 160ms, border-color 160ms, color 160ms',
              }}
            >
              {n}
            </button>
          )
        })}
      </div>

      <AnimatePresence initial={false}>
        {showHint && (
          <motion.div
            key="count-hint"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 999,
              background: 'rgba(245,127,32,0.08)',
              border: '1px solid rgba(245,127,32,0.20)',
            }}>
              <span
                aria-hidden
                style={{
                  display: 'inline-block', width: 7, height: 7,
                  borderRadius: 999, background: OG,
                  animation: 'veg-count-pulse 2s ease-in-out infinite',
                }}
              />
              <span style={{
                fontFamily: BODY, fontSize: 11.5, fontWeight: 600,
                color: OG, letterSpacing: '0.02em',
              }}>
                Pick how many veg days you want — your plan adapts.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p style={{
        marginTop: showHint ? 0 : 10,
        fontFamily: BODY, fontSize: 11.5, color: S.fgMuted,
      }}>
        {safeCount == null
          ? `Choose your weekly veg-day count (1–${maxVeg}).`
          : `${safeCount} veg day${safeCount === 1 ? '' : 's'} · ${W - safeCount} non-veg day${W - safeCount === 1 ? '' : 's'}. Pick the specific days at checkout.`}
      </p>
      <p style={{ marginTop: 4, fontFamily: BODY, fontSize: 11, color: S.fgFaint, lineHeight: 1.5 }}>
        Want all-veg or all-non-veg? Switch your preference on{' '}
        <Link href="/dashboard/profile" style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: 'var(--ds-fg-tint)', textUnderlineOffset: 2 }}>
          your profile
        </Link>
        .
      </p>

      <style>{`
        @keyframes veg-count-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.55; }
        }
      `}</style>
    </div>
  )
}

// ── Plan card ─────────────────────────────────────────────────────────────────
function PlanCard({
  plan, pref, vegDayCount, weekType, selected, onSelect, priceOverrides, doneForTerm = false, creditAed = 0,
}: {
  plan: PlanDef
  pref: Pref
  /** null = religious-mix user hasn't picked count yet → card shows
   *  placeholder price area instead of misleading numbers. */
  vegDayCount: number | null
  weekType: WeekType
  selected: boolean
  onSelect: (id: PlanId) => void
  priceOverrides?: PriceOverride[]
  /** Season taper: no start date left in the pick window lets this plan
   *  finish before the last delivery day. The card keeps its price (the
   *  customer is shopping for next semester too) but goes unavailable —
   *  same dim + disabled treatment the "pick veg days first" state uses,
   *  so the grid has one language for "not selectable yet". */
  doneForTerm?: boolean
  /** Credit that applies to THIS plan (checkout's per-plan math, in AED).
   *  A restricted credit is a discount on a specific door — it belongs on
   *  that door, at the moment of choosing, not as a footnote elsewhere. */
  creditAed?: number
}) {
  // Religious-mix prices DEPEND on vegDayCount (it's a weighted average),
  // so when count is null we can't honestly show a number. Veg/NonVeg
  // prices are independent of count, so they always render.
  const priceUnknown = pref === 'Religious' && vegDayCount == null
  // Either reason closes the card's select path; they never coexist in copy
  // (the veg-day state is an instruction, this one is a season fact).
  const unavailable = priceUnknown || doneForTerm
  // Pricing math uses 3 as a defensive fallback when count is null — the
  // value is never actually displayed for that branch, but the helpers
  // need a real number to avoid Math.floor(null) → 0 fallthrough.
  const safeCount = vegDayCount ?? 3
  const price = pricePerMeal(plan.id, pref, safeCount, weekType, priceOverrides)
  const total = totalPrice(plan.id, pref, safeCount, weekType, priceOverrides)
  const meals = mealsForPlan(plan.id, weekType)
  const featured = plan.id === 'Monthly Premium'
  // Every prominence cue the recommended card earns — the lifted TIER1
  // surface, the orange border, the extra top padding, the orange total, the
  // ribbon — is a recommendation. A plan the customer cannot buy this term
  // must not be the loudest thing on the grid, so the whole featured
  // treatment steps down to the plain card and only the dim + the
  // "Done for this term" line remain.
  const showFeatured = featured && !doneForTerm

  // Static PLANS strings reflect 6DAYS. Override duration + the meals-count
  // line in the feature list so 5DAYS customers see correct numbers.
  const W = weekType === '5DAYS' ? 5 : 6
  const dynamicDuration =
    plan.id === 'Trial' ? plan.duration
    : plan.id === 'Weekly Flex' ? `1 week · ${W} days/week`
    : plan.id === 'Monthly Premium' ? `4 weeks · ${W} days/week`
    : `4 weeks · ${W} days/week · 2 meals/day`
  const dynamicMealsLine =
    plan.id === 'Weekly Flex' ? `${meals} meals per week`
    : plan.id === 'Monthly Premium' ? `${meals} meals per month`
    : plan.id === 'Monthly Max' ? `${meals} meals per month (${meals / 2} days × 2)`
    : null
  const dynamicFeatures = dynamicMealsLine
    ? [{ ...plan.features[0], text: dynamicMealsLine }, ...plan.features.slice(1)]
    : plan.features

  // Anchor each upgrade against the entry-level plan at *equal meal count* so
  // the saving reflects the real monthly delta the user pays, not a per-meal
  // figure that hides commitment scale.
  //   • Premium (4×W meals)   vs  Weekly Flex × 4 weeks  (also 4×W meals)
  //   • Max     (8×W meals)   vs  Weekly Flex × 8 weeks  (also 8×W meals)
  let saveAmount: number | null = null
  let saveAgainst: string | null = null
  if (plan.id === 'Monthly Premium') {
    const flexFourWeeks = totalPrice('Weekly Flex', pref, safeCount, weekType, priceOverrides) * 4
    const diff = flexFourWeeks - total
    if (diff > 0) { saveAmount = diff; saveAgainst = 'Weekly Flex' }
  } else if (plan.id === 'Monthly Max') {
    const eightWeeksFlex = totalPrice('Weekly Flex', pref, safeCount, weekType, priceOverrides) * 8
    const diff = eightWeeksFlex - total
    if (diff > 0) { saveAmount = diff; saveAgainst = 'Weekly Flex' }
  }
  // Hide savings badge in the no-count state — number is meaningless until
  // the user has actually picked something for us to compare against.
  const showSave = saveAmount !== null && !priceUnknown
  const saveLabel = saveAmount !== null
    ? (saveAmount % 1 === 0 ? `${saveAmount}` : saveAmount.toFixed(2))
    : ''

  const badgeStyle = ((): { bg: string; fg: string; border: string } => {
    if (plan.badgeTone === 'gold')   return { bg: 'rgba(212,160,23,0.12)', fg: '#a37800', border: 'rgba(212,160,23,0.30)' }
    if (plan.badgeTone === 'orange') return { bg: 'var(--ds-og-wash-strong)', fg: OG, border: 'var(--ds-og-border-strong)' }
    return { bg: 'var(--ds-skeleton-base)', fg: S.fgMuted, border: S.border }
  })()

  const planIcon = plan.id === 'Monthly Premium' ? <Gem size={16}/> :
                   plan.id === 'Monthly Max' ? <Crown size={16}/> :
                   plan.id === 'Weekly Flex' ? <Sparkles size={16}/> :
                   <Utensils size={16}/>

  // Recommended plan sits on TIER1 (lifted, focal); the rest sit on TIER2
  // (supporting). Selected adds an orange border ring + small lift but
  // keeps the underlying surface on the same tier scale as the rest of
  // the dashboard — no white floating cards, no orange-glow shadows.
  const baseTier = showFeatured ? TIER1 : TIER2

  return (
    <button
      type="button"
      onClick={() => { if (!unavailable) onSelect(plan.id) }}
      disabled={unavailable}
      aria-disabled={unavailable}
      style={{
        ...baseTier,
        position: 'relative',
        display: 'flex', flexDirection: 'column', gap: 18,
        textAlign: 'left',
        // Recommended card gets +8px top padding so its content starts a bit
        // lower than peers — combined with the floating ribbon above, the
        // card visually weighs more without breaking grid alignment.
        padding: showFeatured ? '32px 24px 28px' : 24,
        borderRadius: 24,
        border: `1.5px solid ${selected ? OG : (showFeatured ? 'var(--ds-og-border-strong)' : 'var(--ds-border-tier2)')}`,
        transition: 'transform 150ms, border-color 200ms, opacity 200ms',
        cursor: unavailable ? 'not-allowed' : 'pointer',
        transform: selected ? 'translateY(-2px)' : 'none',
        opacity: unavailable ? 0.65 : 1,
      }}
    >
      {/* Floating "Most Popular" ribbon — only on the recommended card. The
          ribbon carries the social-proof hook ("many people pick this") and
          the inline "Best value" caption below carries the value-claim hook.
          Two distinct messages reinforcing the recommendation, not the same
          phrase repeated. */}
      {/* Recommending a plan the customer cannot buy is noise — the ribbon
          steps aside for the season state. */}
      {showFeatured && (
        <span style={{
          position: 'absolute',
          top: -13,
          left: '50%',
          transform: 'translateX(-50%)',
          background: OG,
          color: '#fff',
          fontFamily: BODY,
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          padding: '6px 14px',
          borderRadius: 999,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          Most Popular
        </span>
      )}

      {/* Header */}
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: S.fg, fontFamily: BODY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'var(--ds-skeleton-base)' }}>
            {planIcon}
          </span>
          {plan.id}
        </div>
        {/* The badge is a value claim ("Best value", "For the hungry"). On a
            card that cannot be bought this term the claim is noise, and its
            orange/gold tint is exactly the prominence the state is trying to
            remove — so it steps aside for the done-for-term line below. */}
        {plan.badge && !doneForTerm && (
          <div style={{ marginTop: 4, fontFamily: BODY, fontSize: 11, fontWeight: 600, color: badgeStyle.fg, letterSpacing: '0.04em' }}>
            {plan.badge}
          </div>
        )}
      </div>

      {/* Price — placeholder state for religious-mix users who haven't yet
          picked a veg-day count. Showing real numbers in that state would
          either lie (commit to a default count the user didn't choose) or
          flicker as they shop counts. The placeholder is honest and routes
          attention back up to the count picker. */}
      <div>
        {priceUnknown ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 800, color: S.fgFaint, letterSpacing: '-0.03em', lineHeight: 1 }}>—</span>
              <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: S.fgFaint }}>AED / meal</span>
            </div>
            <div style={{ marginTop: 8, fontFamily: BODY, fontSize: 12, fontWeight: 700, color: OG, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Set veg days first
            </div>
            <div style={{ marginTop: 4, fontFamily: BODY, fontSize: 11.5, color: S.fgFaint }}>{dynamicDuration}</div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 800, color: S.fg, letterSpacing: '-0.03em', lineHeight: 1 }}>{price}</span>
              <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: S.fgMuted }}>AED / meal</span>
            </div>
            <div style={{ marginTop: 8, fontFamily: BODY, fontSize: 12, fontWeight: 700, color: (selected || showFeatured) ? OG : S.fgMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {total} AED{plan.period}
            </div>
            <div style={{ marginTop: 4, fontFamily: BODY, fontSize: 11.5, color: S.fgFaint }}>{dynamicDuration}</div>
            {/* Credit line — the exact amount checkout will apply to THIS
                plan, capped at its price. Success tone (money coming back),
                matching the checkout credit row, distinct from the orange
                savings badge (marketing claim) below. Hidden on an unbuyable
                card — a discount on a closed door is noise. */}
            {!doneForTerm && creditAed > 0 && (() => {
              const appliedAed = Math.min(creditAed, total)
              return (
                <div style={{
                  marginTop: 10,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 999,
                  background: 'var(--ds-success-wash)',
                  border: '1px solid var(--ds-success-border)',
                  color: 'var(--ds-success-fg)',
                  fontFamily: BODY, fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.04em', fontFeatureSettings: '"tnum"',
                }}>
                  {appliedAed >= total
                    ? 'Your credit covers this plan'
                    : `AED ${Math.round(appliedAed)} off with your credit`}
                </div>
              )
            })()}
            {/* Season taper — the one line that explains the dim. Sits with
                the price block (where "Set veg days first" also lives) so
                the reason is next to what it invalidates, and replaces the
                savings badge rather than stacking with it. */}
            {doneForTerm ? (
              <div style={{
                marginTop: 10,
                display: 'flex', alignItems: 'flex-start', gap: 6,
                fontFamily: BODY, fontSize: 11.5, fontWeight: 700,
                color: S.fgMuted, lineHeight: 1.45,
              }}>
                <CalendarClock size={13} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                <span>Done for this term. Back next semester.</span>
              </div>
            ) : showSave && (
              <div style={{
                marginTop: 10,
                display: 'inline-flex', alignItems: 'center',
                padding: '4px 10px',
                borderRadius: 999,
                background: 'rgba(245,127,32,0.10)',
                color: OG,
                fontFamily: BODY, fontSize: 11, fontWeight: 700,
                letterSpacing: '0.04em',
              }}>
                Save {saveLabel} AED/month vs {saveAgainst}
              </div>
            )}
          </>
        )}
      </div>

      {/* Features — each with its own descriptive icon */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dynamicFeatures.map(f => {
          const FeatureIcon = f.icon
          return (
            <li key={f.text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontFamily: BODY, fontSize: 13, color: S.fg, lineHeight: 1.45 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: 7,
                background: 'rgba(245,127,32,0.10)',
                flexShrink: 0, marginTop: 1,
              }}>
                <FeatureIcon size={12} strokeWidth={2.2} color={OG} />
              </span>
              <span>{f.text}</span>
            </li>
          )
        })}
      </ul>

      {/* Disclaimer (Monthly Max) */}
      {plan.disclaimer && (
        <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.22)' }}>
          <Info size={14} style={{ color: '#a37800', flexShrink: 0, marginTop: 2 }} strokeWidth={2.4} />
          <p style={{ fontFamily: BODY, fontSize: 11.5, color: '#7a5a00', lineHeight: 1.45, margin: 0 }}>{plan.disclaimer}</p>
        </div>
      )}

      {/* CTA — three-state hierarchy so nothing competes:
          • selected (any card)        → solid orange, white text. The "I'm picked" state.
          • featured (recommended) only → subtle orange tint + orange border + orange text.
                                          Reads as "I'm the recommended one" without
                                          shouting over a different selected card.
          • everything else            → quiet neutral.
          One brand colour, three weights — selection always wins visually. */}
      <span style={{
        marginTop: 'auto',
        display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 6,
        padding: '12px 16px', borderRadius: 12,
        background:
          selected ? OG :
          doneForTerm ? 'transparent' :
          featured ? 'var(--ds-og-wash-strong)' :
          'var(--ds-skeleton-base)',
        color:
          selected ? '#fff' :
          doneForTerm ? S.fgFaint :
          featured ? OG :
          S.fg,
        fontFamily: BODY, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        border:
          selected ? 0 :
          // Dashed = the dashboard's standing "not available to press"
          // affordance (see the mobile empty-state pill), so the state reads
          // as closed rather than merely quiet.
          doneForTerm ? '1px dashed var(--ds-border-strong)' :
          featured ? '1px solid rgba(245,127,32,0.40)' :
          `1px solid ${S.border2}`,
      }}>
        {selected ? <><Check size={13} strokeWidth={3}/> Selected</> : (priceUnknown ? 'Pick veg days' : doneForTerm ? 'Unavailable' : 'Choose plan')}
      </span>
    </button>
  )
}

// ── Plan setup card ───────────────────────────────────────────────────────────
// Read-only "dials at a glance" — the variables that shape the plan plus the
// personal touches the kitchen uses. Edits all funnel to /dashboard/profile
// (single source of truth). Two zones:
//   1. Plan dials — price-sensitive: Plan, Week, Meal type, +Veg days when
//      religious. Bigger value treatment so the eye lands here first.
//   2. Personal — non-price: Dorm, Spice, Allergens. Quieter, lower-tier row.
// One CTA in the top-right. The card is intentionally the only surface that
// owns Meal type + Veg days — the upstairs status callout used to mirror them
// and the duplication blurred the source-of-truth.
function PlanSetupCard({
  customer,
  activeSubscription,
}: {
  customer: Customer | null
  activeSubscription: Subscription | null
}) {
  const sub = activeSubscription
  const isReligious = /religious/i.test(
    effectivePreferences(customer).meal_preference_type ?? ''
  )

  const mealPrefLabel =
    MEAL_PREFS.find(m => m.value === customer?.meal_preference_type)?.label ??
    customer?.meal_preference_type ??
    null

  const weekLabel = sub?.week_type === '5DAYS'
    ? '5 days a week'
    : sub?.week_type === '6DAYS' ? '6 days a week' : null

  const allergens = (customer?.allergens ?? '')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean)
  const allergensValue = allergens.length > 0 ? allergens.join(' · ') : 'None'

  // Dial primitive — eyebrow + value. `prominent` scales the value up for the
  // price-sensitive top zone so it visually outweighs the personal row.
  const Dial = ({
    label, value, prominent = false, mono = false,
  }: {
    label: string
    value: React.ReactNode
    prominent?: boolean
    mono?: boolean
  }) => {
    const isEmpty = value === null || value === undefined || value === '—'
    return (
      <div style={{ minWidth: 0 }}>
        <Eyebrow>{label}</Eyebrow>
        <div style={{
          marginTop: 6,
          fontFamily: BODY,
          fontSize: prominent ? 15.5 : 13.5,
          fontWeight: 700,
          color: isEmpty ? S.fgFaint : S.fg,
          lineHeight: 1.35,
          letterSpacing: prominent ? '-0.005em' : 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          ...(mono ? { fontFeatureSettings: '"tnum"' as const } : {}),
        }}>
          {isEmpty ? '—' : value}
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...TIER2, padding: '22px 24px', borderRadius: 16 }}>
      {/* Header — single eyebrow + CTA. No headline: the dials are the
          content, so chrome stays out of the way. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 18,
      }}>
        <Eyebrow>Your setup</Eyebrow>
        <Link
          href="/dashboard/profile"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 999,
            fontFamily: BODY, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            border: `1px solid ${S.border2}`,
            background: 'var(--ds-surface2)', color: S.fg,
            textDecoration: 'none',
            transition: 'background 150ms, border-color 150ms, transform 150ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = OG
            e.currentTarget.style.color = OG
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = S.border2
            e.currentTarget.style.color = S.fg
          }}
        >
          Adjust on profile →
        </Link>
      </div>

      {/* ZONE A — Plan dials (price-sensitive). Only rendered when a sub
          exists; for empty-state browsers the personal row below carries
          the card on its own. Veg days only joins the row for religious
          users (the only diet where veg_days is a per-subscription dial). */}
      {sub && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isReligious
              ? 'repeat(auto-fit, minmax(150px, 1fr))'
              : 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 20,
          }}>
            <Dial
              label="Plan"
              prominent
              value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <PlanGlyph planName={sub.plan_name} size={14} color="currentColor" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cleanPlanName(sub.plan_name)}
                  </span>
                </span>
              }
            />
            <Dial label="Week" prominent value={weekLabel} />
            <Dial label="Meal type" prominent value={mealPrefLabel} />
            {isReligious && (
              <Dial
                label="Veg days"
                prominent
                mono
                value={`${sub.veg_days} of ${sub.week_type === '5DAYS' ? 5 : 6}`}
              />
            )}
          </div>

          {/* Whisper divider between the two zones — quiet tonal break, not
              a hard line. Border (not border2) so it sits just under the
              perception threshold. */}
          <div style={{ height: 1, background: S.border, margin: '18px 0' }} />
        </>
      )}

      {/* ZONE B — Personal (non-price). Always visible. Allergens leads the
          row because it's the only safety-critical field; layout-wise it
          gets the most room to breathe. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 20,
      }}>
        <Dial label="Dorm" value={customer?.dorm_name} />
        <Dial label="Spice" value={customer?.spice_level_preference} />
        <Dial label="Allergens" value={allergensValue} />
      </div>
    </div>
  )
}


// ── FAQ accordion ─────────────────────────────────────────────────────────────
const PLAN_FAQS = [
  { q: 'How does pausing work?',
    a: 'Monthly Premium and Monthly Max include 1 free pause (indefinite duration). When you resume, your end date extends by the exact number of days paused — you never lose meals.' },
  { q: 'Can I switch plans mid-cycle?',
    a: 'Plan changes apply from your next renewal. You can renew early once you\'re within 7 days of your end date.' },
  { q: 'Why is Monthly Max only 0.50 AED less per meal?',
    a: 'Both daily meals are delivered together (7–8 PM) and are the same dish — so you\'re effectively buying a second portion of the same prep. The discount reflects that prep efficiency.' },
  { q: 'Can I skip a meal?',
    a: 'Yes — Weekly Flex includes 1 skip, Monthly Premium and Monthly Max include 3 skips per cycle. Use the Skip button on your dashboard before midnight the day prior.' },
]

// FAQItem moved to _shared/FAQItem.tsx — imported above.

// ── PostCutoffOverlay ─────────────────────────────────────────────────────────
// Full-screen modal that announces the 2 PM Asia/Dubai kitchen cutoff. Fires
// once per session-day when a customer picks a plan after 14:00 AE so they
// know — before paying — that their first delivery is tomorrow evening, not
// tonight. Mirrors ResumeWelcomeOverlay's "cutoff" treatment: dark navy base
// + amber radial glow + Moon medallion. Dismissed by CTA, backdrop click, or
// Escape; the underlying plan-card selection stays intact so the customer can
// proceed straight to checkout.
function PostCutoffOverlay({ onDismiss }: { onDismiss: () => void }) {
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <motion.div
      key="cutoff-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.15 : 0.28 }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cutoff-overlay-title"
      aria-describedby="cutoff-overlay-body"
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse 55% 45% at center, rgba(200,148,23,0.32) 0%, transparent 70%), rgba(9,24,37,0.92)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        cursor: 'pointer',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 22, maxWidth: 460, padding: '0 24px',
          cursor: 'default',
        }}
      >
        {/* Amber Moon medallion — same treatment as the "cutoff" resume
            overlay so the design language stays cohesive across surfaces. */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={prefersReducedMotion
            ? { duration: 0.2 }
            : { type: 'spring', stiffness: 240, damping: 16, delay: 0.04 }}
          style={{
            width: 96, height: 96, borderRadius: '50%',
            background: '#c89417',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 20px 50px rgba(200,148,23,0.38), 0 0 0 8px rgba(200,148,23,0.15)',
          }}
        >
          <Moon size={40} strokeWidth={1.8} color="#fff" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion
            ? { duration: 0.2, delay: 0.1 }
            : { duration: 0.46, ease: [0.16, 1, 0.3, 1], delay: 0.48 }}
          style={{ textAlign: 'center' }}
        >
          <div
            id="cutoff-overlay-title"
            style={{
              fontFamily: BODY, fontSize: 'clamp(26px, 4vw, 34px)',
              fontWeight: 800, color: '#fff',
              letterSpacing: '-0.02em', lineHeight: 1.1,
              textShadow: '0 2px 16px rgba(9,24,37,0.25)',
            }}
          >
            First meal lands tomorrow<span style={{ color: '#ffe09a' }}>.</span>
          </div>
          <div
            id="cutoff-overlay-body"
            style={{
              marginTop: 12,
              fontFamily: BODY, fontSize: 14.5, fontWeight: 500,
              color: 'rgba(255,255,255,0.82)',
              lineHeight: 1.55,
              textShadow: '0 1px 8px rgba(9,24,37,0.30)',
            }}
          >
            The 2 PM kitchen cutoff has passed — tonight&apos;s run is already prepping. Your first delivery will arrive tomorrow evening, 7–8 PM.
          </div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion
            ? { duration: 0.2, delay: 0.12 }
            : { duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.72 }}
          onClick={onDismiss}
          autoFocus
          style={{
            marginTop: 4,
            padding: '13px 28px', borderRadius: 999,
            background: OG, color: '#fff',
            border: 'none', cursor: 'pointer',
            fontFamily: BODY, fontSize: 13, fontWeight: 700,
            letterSpacing: '0.04em',
            boxShadow: '0 8px 24px rgba(245,127,32,0.35)',
            transition: 'transform 150ms, box-shadow 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
        >
          Got it, continue
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PlanClient({ customer, activeSubscription, allSubscriptions, userEmail, mode = 'plan', creditByPlan = {}, creditItems = [], priceOverrides = [], intake = INTAKE_NOT_PAUSED }: Props) {
  const isExplore = mode === 'explore'
  const outOfZone = !!customer?.out_of_zone
  // Same purchase gate as the dashboard home (ClientDashboard) — the /plan
  // empty-state CTA and the /explore-plans grid must never offer a purchase
  // path that /api/checkout will reject (PROFILE_INCOMPLETE). Seasonal
  // intake pause folds into the same gate — a paused intake blocks every
  // purchase CTA site-wide, same as an incomplete profile or an out-of-zone
  // dorm. Which MESSAGE is shown is decided separately (intake wins).
  const missingFields = missingProfileFields(customer)
  const profileGated = missingFields.length > 0
  const purchaseGated = profileGated || outOfZone || intake.paused

  // ── Season taper ──────────────────────────────────────────────────────
  // A SCHEDULED pause keeps the shop open but only for journeys that finish
  // by the last delivery day. Everything below hangs off this one value, and
  // it is null while intake is paused — the frosted gate already owns that
  // state, and the two seasonal messages must never share a screen.
  const taperLastDay = intake.paused ? null : intake.lastDeliveryDay
  const router = useRouter()
  const [, startPlanTransition] = useTransition()

  // Queued sub — picks the soonest Scheduled row that is NOT the primary.
  // When the customer has a live (Active|Paused|Skipped) primary AND a
  // Scheduled queued, the queries layer surfaces them as two distinct rows:
  // activeSubscription is the live primary, and the Scheduled one lives
  // inside allSubscriptions. We exclude activeSubscription.id so a customer
  // whose primary is itself Scheduled (no live sub yet) doesn't double-
  // render — ActivePlanCallout already handles that case.
  const queuedSub = (!isExplore && activeSubscription)
    ? allSubscriptions.find(s => s.status === SUBSCRIPTION_STATUS.SCHEDULED && s.id !== activeSubscription.id) ?? null
    : null
  const primaryIsPaused = activeSubscription?.status === SUBSCRIPTION_STATUS.PAUSED
    || !!activeSubscription?.planned_pause_start

  // Cancel-planned-pause modal state — mirrors the dashboard's pattern.
  // The button inside ActivePlanCallout's planned-pause banner opens this;
  // confirming fires the cancelPlannedPause server action and refreshes
  // the page data so the banner disappears.
  const [showCancelPlannedPause, setShowCancelPlannedPause] = useState(false)
  const handleCancelPlannedPause = () => {
    if (!activeSubscription) return
    setShowCancelPlannedPause(false)
    startPlanTransition(async () => {
      await cancelPlannedPause(activeSubscription.id)
      router.refresh()
    })
  }
  // The next subscription uses the EFFECTIVE preferences — pending wins
  // when the customer has queued a change in Profile, otherwise the
  // canonical customer.* fields. This is what makes "Save for next
  // subscription" actually flow through to the price + veg-day picker
  // when the renewal goes through checkout.
  const eff = effectivePreferences(customer)
  const mpt = eff.meal_preference_type?.toLowerCase() ?? ''
  const pref: Pref = mpt.includes('religious')
    ? 'Religious'
    : (mpt.includes('plant') || (mpt.includes('veg') && !mpt.includes('non')))
      ? 'Veg'
      : 'NonVeg'
  const prefLabel = pref === 'NonVeg' ? 'Non-Veg' : pref === 'Veg' ? 'Vegetarian' : 'Religious Mix'
  // Religious-mix count seed:
  //   - eff.veg_days has values  → count = .length (returning user / saved
  //                                profile pref / onboarding pick)
  //   - no saved prefs           → count = null (empty state on cards;
  //                                the configurator shows the anticipatory
  //                                hint until the user picks a number)
  // The actual day-of-week picker (which specific days are veg) lives
  // inside CheckoutPanel — the customer picks the count up here while
  // shopping plans, and the days down there during the final checkout
  // step. Both surfaces seed from customer.veg_days for cohesion.
  const seededVegDays = Array.isArray(eff.veg_days) ? eff.veg_days : []
  const [vegDayCount, setVegDayCount] = useState<number | null>(
    () => seededVegDays.length > 0 ? seededVegDays.length : null,
  )
  // Effective delivery cadence — pending wins for renewals.
  const weekType: WeekType = eff.week_type === '5DAYS' ? '5DAYS' : '6DAYS'

  // Per-plan season verdict for the grid. The window is earliest start (day
  // after the live plan, else today / tomorrow past the 2 PM AE cutoff)
  // through +30 days, derived in AE wall time so this SSR-rendered dimming
  // can't disagree between the server pass and the browser. The date pickers
  // keep their own local-time window and clamp it at interaction time.
  // `taperedMaxStart` returning null means no start in that window lets the
  // plan finish in time: it is done for this term.
  const planStartWindow = taperWindow(activeSubscription?.end_date ?? null)
  const doneForTermByPlan: Partial<Record<PlanId, boolean>> = {}
  if (taperLastDay) {
    for (const p of PLANS) {
      doneForTermByPlan[p.id] = taperedMaxStart({
        planId: PLAN_KEBAB[p.id] as KebabPlanId,
        weekType,
        minStart: planStartWindow.minStart,
        maxStart: planStartWindow.maxStart,
        lastDeliveryDay: taperLastDay,
      }) === null
    }
  }
  const [selected, setSelected] = useState<PlanId | null>(null)
  const [cancelBanner, setCancelBanner] = useState(false)
  // Post-cutoff overlay — fires once per AE day per session when a customer
  // picks a plan after 14:00 Asia/Dubai. Keyed to today's AE date so a long-
  // lived tab still re-prompts on a new day.
  const [showCutoffOverlay, setShowCutoffOverlay] = useState(false)

  // ?checkout_canceled=true → show inline banner, then scrub the param so a
  // refresh doesn't re-trigger the banner. (The bfcache reset for the inflight
  // checkout-loading state lives inside <CheckoutPanel>.)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout_canceled') === 'true') {
      setCancelBanner(true)
      params.delete('checkout_canceled')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [])

  // Trigger PostCutoffOverlay on plan selection when AE clock is past 14:00.
  // Shows once per AE day per session so toggling between plan cards doesn't
  // re-fire it. Uses sessionStorage (per-tab) keyed to today's AE date.
  useEffect(() => {
    if (!selected || typeof window === 'undefined') return
    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
    if (ae.getUTCHours() < 14) return
    const todayAE = ae.toISOString().slice(0, 10)
    const key = `cutoff-overlay-shown:${todayAE}`
    if (sessionStorage.getItem(key) === '1') return
    sessionStorage.setItem(key, '1')
    setShowCutoffOverlay(true)
  }, [selected])

  // Pricing grid: in 'explore' mode it's always visible; in 'plan' mode it's
  // gone entirely (users go to /dashboard/explore-plans for it).
  const showPricing = isExplore

  const endedPlans = allSubscriptions.filter(s => s.status === SUBSCRIPTION_STATUS.ENDED)

  // In 'plan' mode, "Renew" routes the user to /dashboard/explore-plans.
  // In 'explore' mode, the pricing grid is already visible — just scroll to it.
  const openPricing = () => {
    if (!isExplore) { router.push('/dashboard/explore-plans'); return }
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.getElementById('plans-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
    })
  }

  return (
    <>
    <div className="plan-desktop" style={{ minHeight: '100vh', background: BG, padding: '28px 28px 48px', fontFamily: BODY, color: S.fg }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {cancelBanner && (
          <div
            role="status"
            style={{
              marginBottom: 22, padding: '12px 18px', borderRadius: 'var(--radius-sm)',
              background: 'var(--ds-skeleton-base)', border: `1px solid ${S.border}`,
              color: S.fgMuted, fontSize: 13, fontFamily: BODY, lineHeight: 1.5,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            }}
          >
            <span>Checkout was cancelled — no charge was made. Pick a plan when you&rsquo;re ready.</span>
            <button
              type="button"
              onClick={() => setCancelBanner(false)}
              aria-label="Dismiss"
              style={{ background: 'transparent', border: 'none', color: S.fgMuted, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
            >
              ×
            </button>
          </div>
        )}

        {/* Header — clean hierarchy: H1 anchored, supporting paragraph in muted weight */}
        <header style={{ marginBottom: 48 }}>
          <h1 style={{
            fontFamily: DISPLAY,
            fontSize: 'clamp(34px, 5vw, 48px)',
            fontWeight: 700, letterSpacing: '-0.025em',
            marginTop: 0,
            lineHeight: 1.05, color: S.fg,
          }}>
            {isExplore
              ? <>Explore plans<span style={{ color: OG }}>.</span></>
              : <>My plan<span style={{ color: OG }}>.</span></>}
          </h1>
          <p style={{
            fontFamily: BODY, fontSize: 15, fontWeight: 400,
            color: S.fgMuted, marginTop: 10,
            maxWidth: 640, lineHeight: 1.6,
          }}>
            {isExplore
              ? (activeSubscription
                  ? 'Browse alternatives to your current plan — changes apply at your next renewal cycle.'
                  : 'Choose a plan that fits your week.')
              : 'Your current subscription, account details, and past plans — all in one place.'}
          </p>
        </header>

        {/* Season taper — /plan has no grid, so the banner leads the page
            instead: the renew + switch-plan CTAs below it all route into a
            term that is closing, and the customer should know that before
            they follow one. Same component, same once-per-surface rule. */}
        {!isExplore && <SeasonEndingBanner intake={intake} />}

        {/* Active plan callout — only on /plan, not /explore-plans */}
        {!isExplore && (
          <div style={{ marginBottom: 16 }}>
            <ActivePlanCallout
              sub={activeSubscription}
              onRenewClick={openPricing}
              onCancelPlannedPause={() => setShowCancelPlannedPause(true)}
              hasQueuedSub={!!queuedSub}
              outOfZone={outOfZone}
              purchaseGated={purchaseGated}
              // Intake pause wins — telling someone to finish their profile
              // so they can buy something that isn't for sale is the wrong
              // instruction. IntakePausedGate carries its own message.
              gateBanner={intake.paused ? null : (profileGated ? <ProfileBanner missing={missingFields} /> : null)}
              intake={intake}
            />
          </div>
        )}

        {/* Queued sub callout — sits BELOW the active callout so the
            customer scans current → next in reading order. Only renders
            when a Scheduled sub exists behind a live primary (handled by
            the queuedSub derivation above). Without this card, the
            dashboard's "Up next · Manage →" link landed on /plan with no
            queue info — a dead-end the customer rightly flagged. */}
        {!isExplore && queuedSub && (
          <QueuedSubCallout sub={queuedSub} primaryIsPaused={primaryIsPaused} lastDeliveryDay={taperLastDay} />
        )}

        {/* Credit statement — the sidebar chip's landing spot (#credit).
            Sits between the current plan and the switch-plans prompt on
            purpose: credit is about the NEXT purchase, so it reads as
            "current plan → what your next one costs less → go pick one". */}
        {!isExplore && creditItems.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <CreditSection items={creditItems} creditByPlan={creditByPlan} anchorId="credit" />
          </div>
        )}

        {/* Change-plan CTA — only on /plan. Locked when the active plan is
            paused: end date is unknown until resumed, so the next plan's
            start date can't be computed yet. */}
        {!isExplore && activeSubscription && (() => {
          const activePlanIsPaused = activeSubscription.status === SUBSCRIPTION_STATUS.PAUSED
          return (
            <div style={{ ...TIER2, marginBottom: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 18px', borderRadius: 14 }}>
              <div>
                <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: S.fg }}>Want to switch plans or upgrade?</div>
                <div style={{ fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, marginTop: 2 }}>
                  {activePlanIsPaused
                    ? 'Resume your plan first — next plan start date can\'t be set until your current end date is confirmed.'
                    : 'Browse all plans and pricing — changes apply at your next renewal.'}
                </div>
              </div>
              {activePlanIsPaused ? (
                <Tooltip fit="inline" label="Resume your current plan before exploring new plans.">
                  <span
                    aria-disabled="true"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '10px 16px', borderRadius: 999,
                      fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      border: `1px solid ${S.border}`, background: 'transparent', color: S.fgFaint,
                      cursor: 'not-allowed', userSelect: 'none',
                      opacity: 0.55,
                    }}
                  >
                    Explore plans
                  </span>
                </Tooltip>
              ) : (
                <Link
                  href="/dashboard/explore-plans"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 16px', borderRadius: 999,
                    fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    border: `1px solid ${S.border2}`, background: 'var(--ds-surface2)', color: S.fg, cursor: 'pointer', textDecoration: 'none',
                    transition: 'background 150ms, border-color 150ms',
                  }}
                  className="change-plan-btn"
                >
                  Explore plans →
                </Link>
              )}
            </div>
          )
        })()}

        {/* Pricing section. `showPricing` is bound to `isExplore` (a route-
            level prop), so it never toggles after mount — the animation is
            opacity-only and overflow is left clear so a `position: sticky`
            descendant (the checkout panel) actually sticks. */}
        <AnimatePresence initial={false}>
          {showPricing && (
            <motion.section
              key="pricing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {/* Paused-plan notice — shown at the top of the pricing section
                  when the customer's current plan is paused. Browsing is fine;
                  purchasing is blocked (server + UI) until they resume. */}
              {activeSubscription?.status === SUBSCRIPTION_STATUS.PAUSED && (
                <div style={{
                  marginBottom: 20,
                  padding: '14px 18px',
                  borderRadius: 14,
                  background: 'rgba(245,127,32,0.07)',
                  border: '1px solid rgba(245,127,32,0.22)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                }}>
                  <div>
                    <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: S.fg }}>
                      Your current plan is paused
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: 12, color: S.fgMuted, marginTop: 2, lineHeight: 1.5 }}>
                      You can browse plans now, but purchasing is locked until you resume — your next plan&apos;s start date depends on when the current one ends.
                    </div>
                  </div>
                  <Link
                    href="/dashboard"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '9px 16px', borderRadius: 999, whiteSpace: 'nowrap',
                      fontFamily: BODY, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      background: OG, color: '#fff', textDecoration: 'none', border: 0,
                    }}
                  >
                    Resume plan →
                  </Link>
                </div>
              )}

              {/* Value strip — anchors the universal promise of any plan
                  before the user reads prices. Frames the offer as outcome
                  + low effort + low risk, instead of a feature list. Only
                  shown in explore mode (this whole block is gated by
                  `showPricing`). */}
              <div className="explore-trust-strip" style={{
                ...TIER2,
                marginBottom: 24,
                padding: 'clamp(18px, 2vw, 22px)',
                borderRadius: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 18,
              }}>
                {[
                  { icon: Utensils,     title: 'Dinner sorted, every evening', sub: 'Chef-cooked, hot at your door. No planning, no cooking.' },
                  { icon: CalendarDays, title: 'Delivered 7–8 PM, your dorm',  sub: 'Same time, every day. Sunday off.' },
                  { icon: Unlock,       title: 'Skip, pause, cancel anytime',  sub: 'Life happens — flex without losing the meal.' },
                ].map(({ icon: Icon, title, sub }) => (
                  <div key={title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: 'rgba(245,127,32,0.10)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: OG,
                    }}>
                      <Icon size={16} strokeWidth={2.2} />
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
                      {title}
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: 12.5, fontWeight: 400, color: S.fgMuted, lineHeight: 1.5 }}>
                      {sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Static preference display — pricing is scoped to the user's
                  saved preference (one source of truth: profile). The toggle
                  that used to live here invited a false choice. The veg-day
                  picker stays for Religious users — that's a real choice
                  inside their preference, not a switch between preferences. */}
              <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  fontFamily: BODY, fontSize: 13, color: S.fgMuted,
                }}>
                  <span>Showing prices for</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 10px', borderRadius: 999,
                    background: 'rgba(245,127,32,0.10)',
                    color: S.fg, fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                  }}>
                    {prefLabel}
                  </span>
                  {/* Week-type pill — sits next to the meal-pref pill so the
                      reader sees BOTH dimensions of the customer's plan
                      (what they eat × how many days/week) before reading the
                      grid. Slate-blue tone keeps it visually subordinate to
                      the orange meal-pref pill. */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 10px', borderRadius: 999,
                    background: 'rgba(58,111,140,0.10)',
                    color: '#3a6f8c', fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                  }}>
                    {weekType === '5DAYS' ? '5 days: MON–FRI' : '6 days: MON–SAT'}
                  </span>
                  <Link href="/dashboard/profile" style={{ color: S.fgSub, fontSize: 12, fontWeight: 600, textDecoration: 'underline', textDecorationColor: 'var(--ds-fg-tint)', textUnderlineOffset: 3 }}>
                    Change
                  </Link>
                  {/* Prices in AED — pushed to the far right of the same row
                      via marginLeft: auto. Keeps the meta info aligned to
                      the price column on the grid below. */}
                  <span style={{
                    marginLeft: 'auto',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    <Info size={13} /> Prices in AED.
                  </span>
                </div>

                <AnimatePresence initial={false}>
                  {pref === 'Religious' && (
                    <motion.div
                      key="veg-picker"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <VegDayPicker
                        count={vegDayCount}
                        setCount={setVegDayCount}
                        weekType={weekType}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Season taper — one line above the grid, once per surface,
                  framing every card below it. Self-suppressing when intake
                  is paused (the frosted gate owns that state instead). */}
              <SeasonEndingBanner intake={intake} />

              {/* Out-of-zone gate — mirrors the dashboard-home banner so the
                  visual language is identical wherever the user encounters it. */}
              <OutOfZoneBanner show={outOfZone} />

              {/* Plan grid */}
              {/* Explicit 1 / 2 / 4 column breakpoints — skips the awkward
                  3-column zone that orphans the 4th plan. The recommended
                  card sits in row position 3 of 4 at desktop and bottom-left
                  of a 2x2 grid at tablet, both deliberate. */}
              {/* Intake-paused / profile gate — frosted overlay over the
                  grid until plans are open (or the profile is complete).
                  Intake pause wins: telling someone to finish their profile
                  so they can buy something that isn't for sale is the wrong
                  instruction, so the two never render together. The
                  onSelect guard below covers the keyboard path the overlay
                  can't intercept — it must repeat the same precedence. */}
              <div style={{ position: 'relative', marginBottom: 24 }}>
                {intake.paused
                  ? <IntakePausedGate headline={intake.headline} body={intake.body} creditAed={intake.creditAed} alreadyJoined={intake.alreadyJoined} waitlistCreditAed={intake.waitlistCreditAed} />
                  : profileGated && <ProfileGateOverlay missing={missingFields} />}
                <div id="plans-grid" className="plans-grid">
                  {PLANS.map(p => (
                    <PlanCard
                      key={p.id}
                      plan={p}
                      pref={pref}
                      vegDayCount={vegDayCount}
                      weekType={weekType}
                      selected={selected === p.id}
                      // Season taper joins the same guard the overlay can't
                      // intercept (keyboard), per plan rather than per grid.
                      onSelect={(id) => { if (intake.paused || profileGated || doneForTermByPlan[id]) return; setSelected(prev => prev === id ? null : id) }}
                      priceOverrides={priceOverrides}
                      doneForTerm={!!doneForTermByPlan[p.id]}
                      creditAed={(creditByPlan[p.id]?.balanceFils ?? 0) / 100}
                    />
                  ))}
                </div>
              </div>

              {/* Checkout panel — slides in once a plan is selected.
                  Owns its own date-picker, Stripe redirect, and the panel-
                  local state (startDate, loading, error). Sticks to the
                  bottom of the viewport on desktop. */}
              <AnimatePresence>
                {selected && (
                  <CheckoutPanel
                    selected={selected}
                    pref={pref}
                    // Religious users can't reach this point with a null
                    // count (PlanCard click is gated on priceUnknown). For
                    // non-religious users vegDayCount is irrelevant to
                    // pricing; default to 3 to keep the panel's prop typed
                    // as `number`.
                    vegDayCount={vegDayCount ?? 3}
                    customer={customer}
                    userEmail={userEmail}
                    activeSubscription={activeSubscription}
                    weekType={weekType}
                    outOfZone={outOfZone}
                    creditByPlan={creditByPlan}
                    priceOverrides={priceOverrides}
                    lastDeliveryDay={taperLastDay}
                  />
                )}
              </AnimatePresence>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Plan setup card — read-only "dials at a glance" for the variables
            that shape the plan + the personal touches. Edits route to
            /dashboard/profile (single source of truth). */}
        {!isExplore && (
          <div style={{ marginBottom: 24 }}>
            <PlanSetupCard customer={customer} activeSubscription={activeSubscription} />
          </div>
        )}

        {/* Reference row — Common questions on the left, Past plans on the
            right. Two equal columns on wide viewports; stacks at < 920px so
            both sections remain readable on narrow screens. The Past plans
            table moved here from the main dashboard so the live progress
            card can take the full 12-grid width and the historical record
            lives in one obvious place. */}
        {!isExplore && (
          <div className="plan-reference-row" style={{ marginBottom: 24 }}>
            <div style={{ ...TIER3, padding: 28, borderRadius: 20 }}>
              <Eyebrow>Pricing FAQ</Eyebrow>
              <div style={{ marginTop: 8, fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: S.fg }}>Common questions</div>
              <div style={{ marginTop: 14 }}>
                {PLAN_FAQS.map(f => <FAQItem key={f.q} q={f.q} a={f.a} />)}
              </div>
            </div>
            <div style={{ ...TIER3, padding: 28, borderRadius: 20, display: 'flex', flexDirection: 'column' }}>
              <Eyebrow>History</Eyebrow>
              <div style={{ marginTop: 8, fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: S.fg }}>Past plans</div>
              {endedPlans.length === 0 ? (
                <div style={{ marginTop: 18, padding: '20px 4px', fontFamily: BODY, fontSize: 13, color: S.fgFaint, lineHeight: 1.55 }}>
                  Your finished plans will appear here. Each one is a record of how many dinners we&rsquo;ve made for you so far.
                </div>
              ) : (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {endedPlans.map(s => (
                    <div key={s.id} style={{ ...TIER1, padding: '12px 14px', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: BODY, fontSize: 13, fontWeight: 700, color: S.fg, minWidth: 0 }}>
                          <PlanGlyph planName={s.plan_name} size={13} color="currentColor" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cleanPlanName(s.plan_name)}
                          </span>
                        </div>
                        <StatusDot status="Ended" />
                      </div>
                      <div style={{ fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, fontFeatureSettings: '"tnum"' }}>
                        {fmt(s.start_date)} → {fmt(s.end_date)}
                      </div>
                      <div style={{ fontFamily: BODY, fontSize: 11.5, fontWeight: 600, color: S.fgMuted, fontFeatureSettings: '"tnum"' }}>
                        {s.delivered_meals}/{s.total_meals} meals delivered
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', padding: '12px 0', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgFaint, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 6, width: '100%' }}>
          Made with <Heart size={11} fill={OG} strokeWidth={0} aria-hidden /> in Dubai
        </div>
      </div>

      <AnimatePresence>
        {showCutoffOverlay && (
          <PostCutoffOverlay onDismiss={() => setShowCutoffOverlay(false)} />
        )}
      </AnimatePresence>

      {/* Cancel-planned-pause confirmation — mirrors the ActiveDashboard
          modal so the language is identical wherever the customer cancels
          a planned pause. Refunds the pause credit on commit (server side). */}
      <AnimatePresence>
        {showCancelPlannedPause && activeSubscription?.planned_pause_start && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'var(--ds-overlay-strong)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}
            onClick={() => setShowCancelPlannedPause(false)}
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
                Cancel your planned pause?
              </div>
              <div style={{ fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 12, lineHeight: 1.65 }}>
                Your pause is scheduled for{' '}
                <strong style={{ color: S.fg }}>
                  {new Date(activeSubscription.planned_pause_start + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })}
                </strong>. Cancelling now returns your <strong style={{ color: S.fg }}>1 free pause</strong> to use later in this cycle.
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
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
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .plans-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .plans-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 1024px) {
          .plans-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }

        /* Trust strip — collapses to a single column below 720px so the
           three promises stack instead of getting cramped at narrow widths. */
        @media (max-width: 768px) {
          .explore-trust-strip { grid-template-columns: 1fr !important; gap: 14px !important; }
        }

        /* Reference row — two equal columns above 920px (Common questions
           left, Past plans right), single column below so each section
           keeps a comfortable reading width on narrow viewports. */
        .plan-reference-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 18px;
        }
        @media (min-width: 1024px) {
          .plan-reference-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; align-items: start; }
        }
      `}</style>
    </div>

    <div className="plan-mobile">
      {isExplore ? (
        <MobileExplore
          customer={customer}
          userEmail={userEmail}
          activeSubscription={activeSubscription}
          pref={pref}
          prefLabel={prefLabel}
          weekType={weekType}
          vegDayCount={vegDayCount}
          setVegDayCount={setVegDayCount}
          selected={selected}
          setSelected={setSelected}
          outOfZone={outOfZone}
          profileGated={profileGated}
          missingFields={missingFields}
          creditByPlan={creditByPlan}
          priceOverrides={priceOverrides}
          intake={intake}
        />
      ) : (
        <MobilePlan
          customer={customer}
          activeSubscription={activeSubscription}
          queuedSub={queuedSub}
          primaryIsPaused={primaryIsPaused}
          endedPlans={endedPlans}
          outOfZone={outOfZone}
          profileGated={profileGated}
          onRenew={openPricing}
          onConfirmCancelPause={handleCancelPlannedPause}
          intake={intake}
          creditItems={creditItems}
          creditByPlan={creditByPlan}
        />
      )}
    </div>
    <style>{`
      .plan-mobile { display: none; }
      @media ${COMPACT} {
        .plan-desktop { display: none; }
        .plan-mobile { display: block; }
      }
    `}</style>
    </>
  )
}
