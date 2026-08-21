'use client'

import { useEffect, useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Moon, CalendarDays, ChevronRight, ArrowUpRight, Repeat, Utensils, SkipForward, PauseCircle, CalendarClock, Plus, HelpCircle, Gift, Wallet } from 'lucide-react'
import type { Customer, Subscription, IntakeGateState } from '../_shared/types'
import { INTAKE_NOT_PAUSED } from '../_shared/types'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { effectivePreferences } from '@/contexts/subscriptions/domain/preferences'
import { whatsAppHref } from '@/shared/contacts'
import { changeStartDate } from '@/contexts/subscriptions/usecases/subscription-mutations'
import { fmt, fmtWithDay } from '../_shared/format'
import { StatusDot } from '../_shared/StatusDot'
import { SeeAllPastPlans } from '../_shared/SeeAllPastPlans'
import { MobileDatePicker } from './MobileDatePicker'
import { IntakePausedGate } from '../_shared/IntakePausedGate'
import { SeasonEndingBanner } from '../_shared/SeasonEndingBanner'
import { taperedMaxStart } from '@/contexts/subscriptions/domain/season-taper'
import { prettySeasonDate } from '@/contexts/subscriptions/domain/season-horizon'
import { resolvePlan, type PlanId as KebabPlanId } from '@/contexts/subscriptions/domain/plans'
import { skipCapFor } from '@/contexts/subscriptions/domain/subscription-rules'
import {
  MobileColumn, HERO, CARD, MobileSheet, CompactMetricStrip, PlanGlyph, SectionTitle,
  eyebrow, eyebrowSm, solidNavyBtn, OG, OG_DEEP, S, BODY, cleanPlanName,
} from './kit'

/**
 * MobilePlan — ground-up mobile /dashboard/plan (status-first, ≤768). Desktop
 * (PlanClient, mode='plan') untouched. Built from MOBILE-REDESIGN-SPEC §7.3.
 *
 * Scan order: current-plan dark hero → planned-pause → action → metric strip →
 * queued sub → change-plan → setup (2-up) → FAQ → past plans. All derivations
 * are copied verbatim from PlanClient's ActivePlanCallout so the state machine
 * matches exactly; ChangeStartDate + cancel-pause route through MobileSheet.
 */

// Duplicated from PlanClient (static copy; desktop stays the source for its own).
const MEAL_PREFS = [
  { value: 'Non Veg', label: 'Non-Vegetarian' },
  { value: 'Veg', label: 'Veg' },
  { value: 'Religious Preference', label: 'Religious Preference' },
]
const PLAN_FAQS = [
  { q: 'How does pausing work?', a: 'Monthly Premium and Monthly Max include 1 free pause (indefinite duration). When you resume, your end date extends by the exact number of days paused — you never lose meals.' },
  { q: 'Can I switch plans mid-cycle?', a: 'Plan changes apply from your next renewal. You can renew early once you’re within 7 days of your end date.' },
  { q: 'Why is Monthly Max only 0.50 AED less per meal?', a: 'Both daily meals are delivered together (7–8 PM) and are the same dish — so you’re effectively buying a second portion of the same prep. The discount reflects that prep efficiency.' },
  { q: 'Can I skip a meal?', a: 'Yes — Weekly Flex includes 1 skip, Monthly Premium and Monthly Max include 3 skips per cycle. Use the Skip button on your dashboard before midnight the day prior.' },
]

const CREAM = 'rgba(245,240,232,0.92)'
const CREAM_MUTED = 'rgba(245,240,232,0.65)'
const CREAM_FAINT = 'rgba(245,240,232,0.42)'

// Day + month only — the year is understood on a live plan, so it's noise that
// forces the date line to wrap. (Past-plans keep the year via `fmt`.)
const dm = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })

interface Props {
  customer: Customer | null
  activeSubscription: Subscription | null
  queuedSub: Subscription | null
  primaryIsPaused: boolean
  endedPlans: Subscription[]
  outOfZone: boolean
  /** Profile incomplete — disables the empty-state CTA (same gate as the
   *  dashboard home + desktop NoPlanView; /api/checkout rejects anyway). */
  profileGated: boolean
  /** Routes to /dashboard/explore-plans (openPricing in plan mode). */
  onRenew: () => void
  /** PlanClient.handleCancelPlannedPause — runs the action + refresh. */
  onConfirmCancelPause: () => void
  /** Seasonal intake pause — mounts IntakePausedGate over the empty-state
   *  card, taking precedence over the profile / out-of-zone gate copy. */
  intake?: IntakeGateState
  /** True when the customer holds any usable credit — shows the slim
   *  pointer row to /dashboard/credit. The full story lives on that page,
   *  never here (a statement card competed with the plan hero). */
  hasCredit?: boolean
  /** creditOutlook's one sentence ("AED 20 off your next Monthly plan").
   *  Shown under the row label so the amount is visible before the tap. */
  creditSentence?: string | null
}

export function MobilePlan({ customer, activeSubscription, queuedSub, primaryIsPaused, endedPlans, outOfZone, profileGated, onRenew, onConfirmCancelPause, intake = INTAKE_NOT_PAUSED, hasCredit = false, creditSentence = null }: Props) {
  // Season taper — null while intake is paused so the gate and the banner
  // never share a screen (SeasonEndingBanner enforces the same rule itself;
  // this keeps the reschedule sheets on the identical condition).
  const taperLastDay = intake.paused ? null : intake.lastDeliveryDay
  return (
    <MobileColumn style={{ color: S.fg }}>
      <div style={{ paddingLeft: 56, minHeight: 34, display: 'flex', alignItems: 'center' }}>
        <SectionTitle size={24}>My plan</SectionTitle>
      </div>

      {/* Season taper — leads the surface, same as the desktop /plan page:
          every CTA below it (renew, switch plans) routes into a term that
          is closing. */}
      <SeasonEndingBanner intake={intake} />

      {activeSubscription
        ? <ActiveHero sub={activeSubscription} hasQueuedSub={!!queuedSub} outOfZone={outOfZone} onRenew={onRenew} onConfirmCancelPause={onConfirmCancelPause} lastDeliveryDay={taperLastDay} />
        : <EmptyState onRenew={onRenew} profileGated={profileGated} outOfZone={outOfZone} intake={intake} />}

      {queuedSub && <QueuedCard sub={queuedSub} primaryIsPaused={primaryIsPaused} lastDeliveryDay={taperLastDay} />}

      {/* Credit pointer — slim row to the credit page, same reading order as
          desktop /plan: current plan → your credit → switch plans. */}
      {hasCredit && (
        <Link
          href="/dashboard/credit"
          style={{
            ...CARD, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
            textDecoration: 'none', fontFamily: BODY,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Wallet size={16} strokeWidth={2.2} color={OG} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: S.fg }}>
            Your credit
            {creditSentence && (
              <span style={{ display: 'block', marginTop: 2, fontSize: 12, fontWeight: 600, color: OG }}>
                {creditSentence}
              </span>
            )}
          </span>
          <ChevronRight size={16} strokeWidth={2.4} color={S.fgFaint} style={{ flexShrink: 0 }} />
        </Link>
      )}

      {activeSubscription && <ChangePlanRow paused={activeSubscription.status === SUBSCRIPTION_STATUS.PAUSED} />}

      <PlanSetup customer={customer} sub={activeSubscription} />

      {/* Reference fold — extra air + a hairline marks the shift from
          actionable cards to read-only reference content. */}
      <div style={{ marginTop: 10, paddingTop: 18, borderTop: '1px solid rgba(9,24,37,0.08)' }}>
        <span style={{ ...eyebrow, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <HelpCircle size={13} strokeWidth={2.4} color={OG} /> Pricing FAQ
        </span>
        <div style={{ marginTop: 6 }}>
          {PLAN_FAQS.map(f => <FaqRow key={f.q} q={f.q} a={f.a} />)}
        </div>
      </div>

      {/* Past plans (deep fold). The heading row carries the way through to
          the full record — before this, mobile had NO route to
          /dashboard/history at all: the only in-app link lives inside
          .home-desktop, which never renders below 768. */}
      {endedPlans.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={eyebrow}>Past plans</span>
            <SeeAllPastPlans count={endedPlans.length} />
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {endedPlans.map(s => (
              <div key={s.id} style={{ ...CARD, padding: '12px 14px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 700, color: S.fg, minWidth: 0 }}>
                    <PlanGlyph planName={s.plan_name} size={14} color="currentColor" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanPlanName(s.plan_name)}</span>
                  </span>
                  <StatusDot status="Ended" />
                </div>
                <div style={{ fontSize: 11.5, color: S.fgMuted, fontFeatureSettings: '"tnum"' }}>{fmt(s.start_date)} → {fmt(s.end_date)}</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: S.fgMuted, fontFeatureSettings: '"tnum"' }}>{s.delivered_meals}/{s.total_meals} meals delivered</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </MobileColumn>
  )
}

// ── Active plan dark hero + metric strip ─────────────────────────────────────
function ActiveHero({ sub, hasQueuedSub, outOfZone, onRenew, onConfirmCancelPause, lastDeliveryDay = null }: {
  sub: Subscription; hasQueuedSub: boolean; outOfZone: boolean; onRenew: () => void; onConfirmCancelPause: () => void
  /** Season taper — handed to the reschedule sheet so a Scheduled plan
   *  can't be moved past the last delivery day. */
  lastDeliveryDay?: string | null
}) {
  const [showChangeStart, setShowChangeStart] = useState(false)
  const [showCancelPause, setShowCancelPause] = useState(false)

  // ── Derivations copied verbatim from ActivePlanCallout ──
  const daysToEnd = Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
  const daysToStart = Math.max(0, Math.ceil((new Date(sub.start_date).getTime() - Date.now()) / 86400000))
  const startsInFuture = new Date(sub.start_date).getTime() > Date.now()
  const daysLeft = startsInFuture ? daysToStart : daysToEnd
  const renewEligible = !startsInFuture && daysToEnd <= 7
  const status = startsInFuture && sub.status !== SUBSCRIPTION_STATUS.PAUSED ? SUBSCRIPTION_STATUS.SCHEDULED : sub.status
  // Both from the plan domain — see the same fix in PlanClient/ActiveDashboard.
  const supportsPause = resolvePlan(sub.plan_name)?.canPause ?? false
  const isPaused = sub.status === SUBSCRIPTION_STATUS.PAUSED
  const skipAllowance = skipCapFor(sub)
  const skipsLeft = Math.max(0, skipAllowance - sub.skipped_meals_count)
  // 'Not included', never '—' — see the same change in PlanClient.
  const pauseStatus = !supportsPause ? 'Not included' : isPaused ? 'In use' : sub.has_paused_before ? 'Used' : 'Available'
  const plannedPauseStart = sub.planned_pause_start ?? null
  const hasPlannedPause = !!plannedPauseStart && !isPaused
  const todayAEIso = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const futureSkipCount = (sub.skipped_dates ?? []).filter(d => d > todayAEIso).length
  const dateChangeUsed = !!sub.start_date_changed_at

  return (
    <>
      <section style={{ ...HERO, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header — eyebrow + status share the top row so the plan NAME owns a
            full-width line below it (never wraps "Monthly / Premium"). */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 9 }}>
            <span style={{ ...eyebrow, color: CREAM_MUTED }}>Your current plan</span>
            <StatusDot status={status} onDark />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 700, color: CREAM, letterSpacing: '-0.01em' }}>
            <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: 'rgba(245,240,232,0.08)', border: '1px solid rgba(245,240,232,0.16)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: OG }}>
              <PlanGlyph planName={sub.plan_name} size={16} color={OG} />
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanPlanName(sub.plan_name)}</span>
          </div>
          <div style={{ marginTop: 7, fontSize: 12, color: CREAM_MUTED, lineHeight: 1.45, fontFeatureSettings: '"tnum"' }}>
            {startsInFuture
              ? <>Beginning <strong style={{ color: CREAM }}>{dm(sub.start_date)}</strong></>
              : isPaused
                ? <>Started {dm(sub.start_date)} · <span style={{ color: CREAM_FAINT }}>est. ends {dm(sub.end_date)}</span></>
                : <>Started {dm(sub.start_date)} · ends <strong style={{ color: CREAM }}>{dm(sub.end_date)}</strong></>}
          </div>
        </div>

        {/* Planned-pause banner */}
        {hasPlannedPause && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(245,240,232,0.06)', border: '1px solid rgba(245,240,232,0.18)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: CREAM, lineHeight: 1.4 }}>
            <Moon size={15} strokeWidth={2} color="#FFD27A" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              Pause planned for <strong style={{ fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{new Date(plannedPauseStart + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
            </span>
            <button type="button" onClick={() => setShowCancelPause(true)} style={{ background: 'transparent', border: 'none', padding: '6px 6px', margin: '-6px -2px', fontFamily: BODY, fontSize: 12, fontWeight: 700, color: '#FFD27A', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>Cancel</button>
          </div>
        )}

        {/* Days-left big number */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {isPaused ? (
            <>
              <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-0.02em', color: CREAM_FAINT, lineHeight: 0.9 }}>—</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: CREAM_MUTED }}>plan paused</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-0.03em', color: OG, lineHeight: 0.9, fontFeatureSettings: '"tnum"' }}>{daysLeft}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: CREAM }}>day{daysLeft === 1 ? '' : 's'} {startsInFuture ? 'until your plan starts' : 'left in your plan'}</span>
            </>
          )}
        </div>

        {/* Action (full-width below the number) + inline caption */}
        {isPaused ? (
          <div style={{ fontSize: 12, color: CREAM_MUTED, lineHeight: 1.45 }}>Resume any time from your dashboard — meals will be waiting.</div>
        ) : renewEligible && !hasQueuedSub ? (
          <div>
            <button type="button" onClick={outOfZone ? undefined : onRenew} disabled={outOfZone} style={outOfZone ? darkDisabledPill : orangePill}>Renew now →</button>
            <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: outOfZone ? CREAM_MUTED : CREAM_FAINT, lineHeight: 1.4 }}>
              {outOfZone ? 'Your dorm is outside our delivery radius — message us on WhatsApp.' : 'Choose a plan + start date.'}
            </div>
          </div>
        ) : startsInFuture ? (
          <div>
            <button type="button" onClick={() => { if (!dateChangeUsed) setShowChangeStart(true) }} disabled={dateChangeUsed} style={dateChangeUsed ? darkDisabledPill : darkOutlinePill}>
              <CalendarDays size={14} strokeWidth={2.4} /> {dateChangeUsed ? 'Date already changed' : 'Change start date'}
            </button>
            <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: CREAM_FAINT, lineHeight: 1.4 }}>You can only change the start date once.</div>
          </div>
        ) : null}
      </section>

      {/* Behavioural metric strip — hidden for scheduled (no activity yet) */}
      {!startsInFuture && (
        <CompactMetricStrip
          columns={futureSkipCount > 0 || (sub.bonus_meals ?? 0) > 0 ? 2 : 3}
          ariaLabel="Plan progress"
          metrics={[
            { label: 'Delivered', value: `${sub.delivered_meals}/${sub.total_meals}`, glyph: <Utensils size={13} strokeWidth={2.2} /> },
            // Goodwill meals support added — already inside the delivered/total
            // figure; this tile makes the gift visible. Mirrors the desktop
            // plan page's "Gifted by Dormers" stat. Hidden when zero.
            ...((sub.bonus_meals ?? 0) > 0 ? [{ label: 'Gifted', value: `+${sub.bonus_meals}`, accent: true, glyph: <Gift size={13} strokeWidth={2.2} /> }] : []),
            { label: 'Skips left', value: skipAllowance > 0 ? `${skipsLeft} of ${skipAllowance}` : '—', glyph: <SkipForward size={13} strokeWidth={2.2} /> },
            { label: 'Pause', value: pauseStatus, glyph: <PauseCircle size={13} strokeWidth={2.2} /> },
            ...(futureSkipCount > 0 ? [{ label: 'Scheduled', value: `${futureSkipCount}`, accent: true, glyph: <CalendarClock size={13} strokeWidth={2.2} /> }] : []),
          ]}
        />
      )}

      <ChangeStartSheet sub={sub} open={showChangeStart} onClose={() => setShowChangeStart(false)} lastDeliveryDay={lastDeliveryDay} />

      {/* Cancel planned pause */}
      <MobileSheet open={showCancelPause} onClose={() => setShowCancelPause(false)} ariaLabel="Cancel planned pause"
        footer={<>
          <button type="button" onClick={() => setShowCancelPause(false)} style={sheetGhostBtn}>Keep it planned</button>
          <button type="button" onClick={() => { setShowCancelPause(false); onConfirmCancelPause() }} style={sheetOrangeBtn}>Cancel pause</button>
        </>}>
        <SectionTitle size={20}>Cancel your planned pause?</SectionTitle>
        {plannedPauseStart && (
          <p style={{ margin: '12px 0 0', fontSize: 13.5, color: S.fgMuted, lineHeight: 1.6 }}>
            Your pause is scheduled for <strong style={{ color: S.fg }}>{new Date(plannedPauseStart + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>. Cancelling now returns your <strong style={{ color: S.fg }}>1 free pause</strong> to use later in this cycle.
          </p>
        )}
      </MobileSheet>
    </>
  )
}

// ── Change-start-date sheet (mirrors desktop ChangeStartDateModal logic) ──────
function ChangeStartSheet({ sub, open, onClose, lastDeliveryDay = null }: { sub: Subscription; open: boolean; onClose: () => void; lastDeliveryDay?: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const localStart = sub.start_date.slice(0, 10)
  const [picked, setPicked] = useState(localStart)
  useEffect(() => { if (open) { setPicked(localStart); setError(null) } }, [open, localStart])

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const cap = new Date(today); cap.setDate(cap.getDate() + 30)
  const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const minIso = isoLocal(tomorrow)
  const rawMaxIso = isoLocal(cap)
  // Season taper — clamped for THIS sub's plan + cadence, exactly like the
  // desktop ChangeStartDateModal. Null means no move keeps it inside the
  // term, so the picker collapses to one day and Save is disabled.
  const subWeekType = sub.week_type === '5DAYS' ? '5DAYS' : '6DAYS'
  const taperMax = taperedMaxStart({
    // Unresolvable plan name → assume the LONGEST journey (tightest clamp),
    // so an unknown label narrows the picker rather than opening it up.
    planId: (resolvePlan(sub.plan_name)?.id ?? 'monthly-max') as KebabPlanId,
    weekType: subWeekType,
    minStart: minIso,
    maxStart: rawMaxIso,
    lastDeliveryDay,
  })
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
    <MobileSheet open={open} onClose={onClose} ariaLabel="Change start date"
      footer={<>
        <button type="button" onClick={onClose} disabled={pending} style={{ ...sheetGhostBtn, opacity: pending ? 0.6 : 1 }}>Cancel</button>
        <button type="button" onClick={handleSave} disabled={pending || !picked || seasonBlocked} style={{ ...sheetOrangeBtn, opacity: pending || seasonBlocked ? 0.7 : 1 }}>{pending ? 'Saving…' : 'Save new date'}</button>
      </>}>
      <SectionTitle size={20}>Change start date</SectionTitle>
      {/* The 30-day promise stops being true once the term caps the window. */}
      <p style={{ margin: '8px 0 0', fontSize: 13, color: S.fgMuted, lineHeight: 1.6 }}>{lastDeliveryDay
        ? 'Pick any day that still finishes this term. Your end date adjusts so the cycle stays the same length.'
        : 'Pick any day in the next 30 days. Your end date adjusts so the cycle stays the same length.'}</p>
      <div style={{ margin: '12px 0 16px', padding: '10px 12px', borderRadius: 10, background: 'var(--ds-og-wash)', border: '1px solid var(--ds-og-border)', color: OG_DEEP, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
        You can only change the start date <strong>once</strong>. After saving, this option locks for this plan.
      </div>
      {/* Season taper — stated before the calendar so the new ceiling is
          read, not discovered by tapping a closed week. */}
      {lastDeliveryDay && (
        <div style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 10, background: 'var(--ds-skeleton-base)', border: `1px solid ${S.border}`, color: S.fgMuted, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
          {seasonBlocked
            ? <>The semester wraps up on <strong style={{ color: S.fg }}>{prettySeasonDate(lastDeliveryDay)}</strong>. This plan can no longer be moved and still finish in time.</>
            : <>The semester wraps up on <strong style={{ color: S.fg }}>{prettySeasonDate(lastDeliveryDay)}</strong>, so later dates are closed off.</>}
        </div>
      )}
      <MobileDatePicker value={picked} onChange={setPicked} minDate={minIso} maxDate={maxIso} weekType={sub.week_type === '5DAYS' || sub.week_type === '6DAYS' ? sub.week_type : undefined} seasonEndsOn={lastDeliveryDay} />
      {error && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--ds-danger-wash)', border: '1px solid var(--ds-danger-border)', color: 'var(--ds-danger-fg)', fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>{error}</div>}
    </MobileSheet>
  )
}

// ── Queued sub card ──────────────────────────────────────────────────────────
function QueuedCard({ sub, primaryIsPaused, lastDeliveryDay = null }: { sub: Subscription; primaryIsPaused: boolean; lastDeliveryDay?: string | null }) {
  const [showChangeStart, setShowChangeStart] = useState(false)
  const daysToStart = Math.max(0, Math.ceil((new Date(sub.start_date).getTime() - Date.now()) / 86400000))
  const dateChangeUsed = !!sub.start_date_changed_at
  const cancelHref = whatsAppHref(`Hi! I'd like to cancel my upcoming ${cleanPlanName(sub.plan_name)} subscription scheduled to start ${fmt(sub.start_date)}.`)

  return (
    <section style={{ ...CARD, padding: 18, borderLeft: `3px solid ${OG}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <span style={eyebrow}>Up next</span>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 700, color: S.fg, letterSpacing: '-0.01em' }}>
            <PlanGlyph planName={sub.plan_name} size={17} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cleanPlanName(sub.plan_name)}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: S.fgMuted }}>
            {primaryIsPaused ? 'Est. starts ' : 'Starts '}<strong style={{ color: S.fg }}>{fmtWithDay(sub.start_date)}</strong>
            {primaryIsPaused && <span style={{ marginLeft: 7, padding: '2px 7px', borderRadius: 999, background: 'rgba(58,111,140,0.12)', color: '#3a6f8c', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Tentative</span>}
          </div>
        </div>
        <StatusDot status={SUBSCRIPTION_STATUS.SCHEDULED} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', color: OG, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{daysToStart}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: S.fgMuted }}>day{daysToStart === 1 ? '' : 's'} {primaryIsPaused ? 'estimated' : 'until it starts'}</span>
        </span>
        <button type="button" onClick={() => { if (!dateChangeUsed) setShowChangeStart(true) }} disabled={dateChangeUsed} style={lightOutlineBtn(dateChangeUsed)}>
          <CalendarDays size={13} strokeWidth={2.4} /> {dateChangeUsed ? 'Date set' : 'Change date'}
        </button>
      </div>
      {primaryIsPaused && <div style={{ fontSize: 11, color: S.fgFaint, lineHeight: 1.4 }}>Shifts forward while you&rsquo;re paused — locks in when you resume.</div>}
      <div style={{ fontSize: 11.5, color: S.fgMuted, paddingTop: 4, borderTop: `1px solid ${S.border}` }}>
        Need to cancel? <a href={cancelHref} target="_blank" rel="noopener noreferrer" style={{ color: S.fgSub, textDecoration: 'underline', textUnderlineOffset: 3, fontWeight: 600 }}>Message us on WhatsApp</a>
      </div>
      <ChangeStartSheet sub={sub} open={showChangeStart} onClose={() => setShowChangeStart(false)} lastDeliveryDay={lastDeliveryDay} />
    </section>
  )
}

// ── Change-plan row ──────────────────────────────────────────────────────────
function ChangePlanRow({ paused }: { paused: boolean }) {
  return (
    <div style={{ ...CARD, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: 'var(--ds-og-wash-strong)', border: '1px solid var(--ds-og-border)', color: OG, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Repeat size={16} strokeWidth={2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: S.fg }}>Switch plans or upgrade?</div>
        <div style={{ fontSize: 11.5, color: S.fgMuted, marginTop: 2, lineHeight: 1.4 }}>{paused ? 'Resume first — next start date needs your current end date.' : 'Changes apply at your next renewal.'}</div>
      </div>
      {paused
        ? <span style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', border: `1px solid ${S.border}`, color: S.fgFaint, opacity: 0.6 }}>Explore</span>
        : <Link href="/dashboard/explore-plans" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '9px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', border: `1px solid ${S.border2}`, background: 'var(--ds-surface2)', color: S.fg, textDecoration: 'none' }}>Explore <ChevronRight size={13} strokeWidth={2.4} /></Link>}
    </div>
  )
}

// ── Setup card (2-up dials) ──────────────────────────────────────────────────
function PlanSetup({ customer, sub }: { customer: Customer | null; sub: Subscription | null }) {
  const isReligious = /religious/i.test(effectivePreferences(customer).meal_preference_type ?? '')
  const mealPrefLabel = MEAL_PREFS.find(m => m.value === customer?.meal_preference_type)?.label ?? customer?.meal_preference_type ?? null
  const weekLabel = sub?.week_type === '5DAYS' ? '5 days a week' : sub?.week_type === '6DAYS' ? '6 days a week' : null
  const allergens = (customer?.allergens ?? '').split(',').map(a => a.trim()).filter(Boolean)
  const allergensValue = allergens.length > 0 ? allergens.join(' · ') : 'None'

  const Dial = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => {
    const empty = value == null || value === '—'
    return (
      <div style={{ minWidth: 0 }}>
        <div style={eyebrowSm}>{label}</div>
        <div style={{ marginTop: 5, fontSize: 13.5, fontWeight: 700, color: empty ? S.fgFaint : S.fg, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(mono ? { fontFeatureSettings: '"tnum"' as const } : {}) }}>{empty ? '—' : value}</div>
      </div>
    )
  }

  return (
    // Reference surface — quieter than the raised action cards above it (no
    // lift, faint recessed fill) so the pair reads action-over-reference.
    <div style={{ background: '#f7f4ec', border: '1px solid rgba(9,24,37,0.07)', borderRadius: 18, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <span style={eyebrow}>Your setup</span>
        <Link href="/dashboard/profile" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', border: `1px solid ${S.border2}`, background: 'var(--ds-surface2)', color: S.fg, textDecoration: 'none' }}>Adjust <ArrowUpRight size={13} strokeWidth={2.4} /></Link>
      </div>
      {sub && (
        <>
          {/* Plan gets its own full-width row — the headline dial, and long
              names ("Monthly Premium" + glyph) truncate in a half cell. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Dial label="Plan" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}><PlanGlyph planName={sub.plan_name} size={14} color={OG} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cleanPlanName(sub.plan_name)}</span></span>} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Dial label="Week" value={weekLabel} />
              <Dial label="Meal type" value={mealPrefLabel} />
              {isReligious && <Dial label="Veg days" mono value={`${sub.veg_days} of ${sub.week_type === '5DAYS' ? 5 : 6}`} />}
            </div>
          </div>
          <div style={{ height: 1, background: S.border, margin: '14px 0' }} />
        </>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Dial label="Dorm" value={customer?.dorm_name} />
        <Dial label="Spice" value={customer?.spice_level_preference} />
        <Dial label="Allergens" value={allergensValue} />
      </div>
    </div>
  )
}

// ── FAQ row — peppy: an orange toggle that fills + spins to a × on open.
//    Hairline-separated rows, no container (keeps the card hierarchy intact). ──
function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid rgba(9,24,37,0.08)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 2px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: BODY }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: open ? OG : S.fg, lineHeight: 1.35, transition: 'color 180ms' }}>{q}</span>
        <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: open ? OG : 'var(--ds-og-wash-strong)', border: `1px solid ${open ? OG : 'var(--ds-og-border)'}`, color: open ? '#fff' : OG, transform: open ? 'rotate(135deg)' : 'rotate(0deg)', transition: 'transform 240ms cubic-bezier(0.16,1,0.3,1), background 200ms, color 200ms' }}>
          <Plus size={15} strokeWidth={2.6} />
        </span>
      </button>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 260ms cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ overflow: 'hidden' }}>
          <p style={{ margin: '0 2px 14px', fontSize: 12.5, color: S.fgMuted, lineHeight: 1.6 }}>{a}</p>
        </div>
      </div>
    </div>
  )
}

// ── Empty state (no active plan) ─────────────────────────────────────────────
function EmptyState({ onRenew, profileGated, outOfZone, intake }: { onRenew: () => void; profileGated: boolean; outOfZone: boolean; intake: IntakeGateState }) {
  const gated = profileGated || outOfZone || intake.paused
  return (
    // Wrapper is the gate's mount point (position:relative), so
    // IntakePausedGate frosts exactly this card and nothing else on the
    // page — same idiom as the desktop plan grid's gate wrapper.
    <div style={{ position: 'relative' }}>
      {intake.paused && (
        <IntakePausedGate
          headline={intake.headline}
          body={intake.body}
          firstName={intake.firstName}
          creditAed={intake.creditAed}
          alreadyJoined={intake.alreadyJoined}
          waitlistCreditAed={intake.waitlistCreditAed}
        />
      )}
      <section style={{ ...CARD, padding: '28px 22px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--ds-og-wash-strong)', border: '1px solid var(--ds-og-border)', color: OG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CalendarDays size={20} strokeWidth={2} /></span>
        <SectionTitle size={20}>No active plan</SectionTitle>
        <p style={{ margin: 0, fontSize: 13, color: S.fgMuted, lineHeight: 1.55 }}>Pick a plan and your dinners start arriving 7–8 PM, every evening.</p>
        {gated ? (
          <>
            <span style={{ ...lightDisabledPill, maxWidth: 280 }}>Browse plans →</span>
            <p style={{ margin: '-4px 0 0', fontSize: 12, color: S.fgMuted, lineHeight: 1.5 }}>
              {intake.paused
                ? 'New plans are paused right now.'
                : outOfZone
                  ? 'Your dorm is outside our delivery radius — message us on WhatsApp.'
                  : <>Finish your profile to unlock plans.{' '}
                      <Link href="/dashboard/profile" style={{ color: OG, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Complete profile →</Link>
                    </>}
            </p>
          </>
        ) : (
          <button type="button" onClick={onRenew} style={{ ...orangePill, color: '#fff', maxWidth: 280 }}>Browse plans →</button>
        )}
      </section>
    </div>
  )
}

// ── Button atoms ─────────────────────────────────────────────────────────────
const orangePill: CSSProperties = { width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 18px', borderRadius: 999, background: OG, color: '#fff', border: 'none', fontFamily: BODY, fontSize: 13.5, fontWeight: 800, letterSpacing: '0.04em', cursor: 'pointer', boxShadow: '0 6px 18px -6px rgba(245,127,32,0.6)' }
const lightDisabledPill: CSSProperties = { width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 18px', borderRadius: 999, background: 'var(--ds-skeleton-base)', color: S.fgFaint, border: '1px dashed var(--ds-border-strong)', fontFamily: BODY, fontSize: 13.5, fontWeight: 800, letterSpacing: '0.04em', cursor: 'not-allowed' }
const darkDisabledPill: CSSProperties = { width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 18px', borderRadius: 999, background: 'rgba(237,232,218,0.05)', color: 'rgba(245,240,232,0.45)', border: '1px dashed rgba(237,232,218,0.26)', fontFamily: BODY, fontSize: 13.5, fontWeight: 800, cursor: 'default' }
const darkOutlinePill: CSSProperties = { width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 18px', borderRadius: 999, background: 'rgba(237,232,218,0.10)', color: CREAM, border: '1px solid rgba(237,232,218,0.34)', fontFamily: BODY, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const sheetGhostBtn: CSSProperties = { flex: 1, padding: '13px 0', borderRadius: 999, border: '1px solid var(--ds-border-strong)', background: 'var(--ds-surface2)', color: S.fg, fontFamily: BODY, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const sheetOrangeBtn: CSSProperties = { ...solidNavyBtn, flex: 1, width: 'auto', background: OG, boxShadow: '0 0 16px rgba(245,127,32,0.4)' }
function lightOutlineBtn(used: boolean): CSSProperties {
  return { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', border: used ? `1px solid ${S.border}` : `1px solid ${S.border2}`, background: used ? 'var(--ds-skeleton-base)' : 'var(--ds-surface2)', color: used ? S.fgFaint : S.fg, cursor: used ? 'not-allowed' : 'pointer', fontFamily: BODY }
}
