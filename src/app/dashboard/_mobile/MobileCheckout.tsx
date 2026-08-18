'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Lock, MapPin, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { Customer, CreditByPlan } from '../_shared/types'
import { whatsAppHref } from '@/shared/contacts'
import { pricePerMeal, totalPrice, mealsForPlan, PLANS, PLAN_KEBAB, type PlanId, type Pref, type WeekType, type PriceOverride } from '@/contexts/subscriptions/domain/pricing'
import { taperedMaxStart } from '@/contexts/subscriptions/domain/season-taper'
import { prettySeasonDate } from '@/contexts/subscriptions/domain/season-horizon'
import type { PlanId as KebabPlanId } from '@/contexts/subscriptions/domain/plans'
import { MobileDatePicker } from './MobileDatePicker'
import { MobileSheet, PlanGlyph, eyebrow, OG, S, BODY } from './kit'
import { LockedCreditNote } from '../_shared/LockedCreditNote'

/**
 * MobileCheckout — the rising checkout sheet for /explore (≤768). It owns the
 * MobileSheet (slides up like the dashboard's skip/pause confirmations), with
 * the total + Pay pinned to the bottom safe area.
 *
 * The PAYMENT-CRITICAL logic — /api/checkout POST + Stripe redirect, the 2 PM
 * cutoff date bounds, the veg-day seed, the bfcache reset — is copied VERBATIM
 * from CheckoutPanel so behaviour is identical. Only the date picker swaps from
 * DateField's popover (which clips in a sheet) to the inline MobileDatePicker.
 */

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function computeMinIso(active: { end_date: string } | null): string {
  let d: Date
  if (active) {
    d = new Date(active.end_date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1)
  } else {
    const aeHour = new Date(Date.now() + 4 * 60 * 60 * 1000).getUTCHours()
    d = new Date(); d.setHours(0, 0, 0, 0)
    if (aeHour >= 14) d.setDate(d.getDate() + 1)
  }
  return isoDate(d)
}
function clampToDeliveryDay(iso: string, weekType: WeekType): string {
  const d = new Date(iso + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const js = d.getDay(); const dow = js === 0 ? 7 : js
    if (weekType === '5DAYS' ? (dow !== 6 && dow !== 7) : (dow !== 7)) break
    d.setDate(d.getDate() + 1)
  }
  return isoDate(d)
}
// Backward twin, season-taper only — see CheckoutPanel for the full note:
// the tapered ceiling can land on a non-delivery day, and walking back to
// the previous working day keeps the auto-correction pickable (an earlier
// start can only finish earlier, so the fit still holds).
function clampBackToDeliveryDay(iso: string, weekType: WeekType): string {
  const d = new Date(iso + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const js = d.getDay(); const dow = js === 0 ? 7 : js
    if (weekType === '5DAYS' ? (dow !== 6 && dow !== 7) : (dow !== 7)) break
    d.setDate(d.getDate() - 1)
  }
  return isoDate(d)
}

interface Props {
  selected: PlanId | null
  onClose: () => void
  pref: Pref
  vegDayCount: number
  customer: Customer | null
  userEmail: string
  activeSubscription: { end_date: string } | null
  weekType: WeekType
  outOfZone?: boolean
  /** Per-plan split of approved credits in fils (getCreditSplitByPlan runs
   *  one query, computed in memory for every selectable plan). Looked up
   *  here by the sheet's own `plan` state so switching plan cards, and the
   *  close-animation's retained-last-plan, both resolve without a round
   *  trip. */
  creditByPlan?: CreditByPlan
  /** Active admin price overrides (plan_pricing rows) — same rows the
   *  server validates against, so the sheet total === charged amount. */
  priceOverrides?: PriceOverride[]
  /** Season taper — last delivery day before a SCHEDULED seasonal pause
   *  (IntakeGateState.lastDeliveryDay), null when none. Clamps this sheet's
   *  pick window exactly like CheckoutPanel clamps the desktop one; the
   *  server's INTAKE_ENDING 409 stays authoritative. */
  lastDeliveryDay?: string | null
}

export function MobileCheckout({ selected, onClose, pref, vegDayCount, customer, userEmail, activeSubscription, weekType, outOfZone = false, creditByPlan = {}, priceOverrides = [], lastDeliveryDay = null }: Props) {
  const open = selected !== null
  // Retain the last selected plan so the sheet keeps its content while it
  // animates out (selected → null) instead of blanking instantly.
  const [plan, setPlan] = useState<PlanId | null>(selected)
  // Two-step flow: 1 = choose date, 2 = review + pay. Reset to step 1 whenever
  // the sheet (re)opens for a plan so a reopened sheet never lands on summary.
  const [step, setStep] = useState<1 | 2>(1)
  useEffect(() => { if (selected) { setPlan(selected); setStep(1) } }, [selected])

  const workingDayNames = useMemo(
    () => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].slice(0, weekType === '5DAYS' ? 5 : 6),
    [weekType],
  )
  const [startDate, setStartDate] = useState<string>(() => clampToDeliveryDay(computeMinIso(activeSubscription), weekType))

  const buildVegDaySeed = (p: Pref, count: number, days: readonly string[]): string[] => {
    if (p !== 'Religious') return []
    const seed = customer?.pending_veg_days ?? customer?.veg_days ?? []
    return seed.filter(d => (days as string[]).includes(d)).slice(0, count)
  }
  const [vegDays, setVegDays] = useState<string[]>(() => buildVegDaySeed(pref, vegDayCount, workingDayNames))
  useEffect(() => {
    setVegDays(buildVegDaySeed(pref, vegDayCount, workingDayNames))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pref, vegDayCount, weekType])
  const toggleVegDay = (day: string) => setVegDays(prev => {
    if (prev.includes(day)) return prev.filter(d => d !== day)
    if (prev.length >= vegDayCount) return prev
    return [...prev, day]
  })
  const vegDaysReady = pref !== 'Religious' || vegDays.length === vegDayCount

  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const [dateBounds, setDateBounds] = useState(() => {
    const minIso = computeMinIso(activeSubscription)
    const maxD = new Date(minIso + 'T00:00:00'); maxD.setDate(maxD.getDate() + 30)
    const cutoffActive = !activeSubscription && new Date(Date.now() + 4 * 60 * 60 * 1000).getUTCHours() >= 14
    return { min: minIso, max: isoDate(maxD), cutoffActive }
  })
  useEffect(() => {
    const tick = () => {
      const minIso = computeMinIso(activeSubscription)
      const maxD = new Date(minIso + 'T00:00:00'); maxD.setDate(maxD.getDate() + 30)
      const cutoffActive = !activeSubscription && new Date(Date.now() + 4 * 60 * 60 * 1000).getUTCHours() >= 14
      setDateBounds(prev => prev.min === minIso && prev.cutoffActive === cutoffActive ? prev : { min: minIso, max: isoDate(maxD), cutoffActive })
    }
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [activeSubscription])
  useEffect(() => {
    if (startDate && startDate < dateBounds.min) setStartDate(clampToDeliveryDay(dateBounds.min, weekType))
  }, [dateBounds.min, startDate, weekType])

  // ── Season taper (mirrors CheckoutPanel) ──────────────────────────────
  // With a pause scheduled, the ceiling is the latest start whose journey
  // still finishes by the last delivery day; null means this plan is done
  // for the term (its card is already disabled upstream).
  const taperMax = useMemo(
    () => plan
      ? taperedMaxStart({
          planId: PLAN_KEBAB[plan] as KebabPlanId,
          weekType,
          minStart: dateBounds.min,
          maxStart: dateBounds.max,
          lastDeliveryDay,
        })
      : dateBounds.max,
    [plan, weekType, dateBounds.min, dateBounds.max, lastDeliveryDay],
  )
  const seasonClosed = !!lastDeliveryDay && taperMax === null
  const maxPickable = taperMax ?? dateBounds.min
  // The sheet keeps its picked date across plan switches, so pull it back
  // under a tighter horizon rather than letting the CTA reach a refusal.
  useEffect(() => {
    if (!lastDeliveryDay || !startDate || !taperMax) return
    if (startDate > taperMax) {
      const back = clampBackToDeliveryDay(taperMax, weekType)
      if (back >= dateBounds.min) setStartDate(back)
    }
  }, [taperMax, startDate, weekType, lastDeliveryDay, dateBounds.min])
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setCheckoutLoading(false) }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  const handleCheckout = async () => {
    if (!startDate || !plan) return
    setError(null); setErrorCode(null); setCheckoutLoading(true)
    try { sessionStorage.setItem('checkout-handoff-at', String(Date.now())) } catch {}
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(totalPrice(plan, pref, vegDayCount, weekType, priceOverrides) * 100),
          name: customer?.name ?? '',
          email: customer?.email ?? userEmail,
          phone: customer?.whatsapp_number ?? '',
          location: customer?.dorm_name ?? '',
          preference: pref === 'Religious' ? 'Religious Preference' : pref === 'Veg' ? 'Veg' : 'Non Veg',
          plan: plan === 'Monthly Premium' ? 'Monthly Premium' : plan === 'Monthly Max' ? 'Monthly Max' : plan === 'Weekly Flex' ? 'Weekly Flex' : 'One-Time Trial',
          vegDays: pref === 'Religious' ? vegDays : [],
          start_date: startDate,
          cancel_path: window.location.pathname,
        }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else if (data.error === 'QUEUE_FULL' || data.error === 'PROFILE_INCOMPLETE' || data.error === 'OUT_OF_ZONE' || data.error === 'PLAN_PAUSED' || data.error === 'INTAKE_PAUSED' || data.error === 'INTAKE_ENDING') {
        // INTAKE_ENDING is the season taper's authoritative refusal (the
        // client clamps are courtesy); INTAKE_PAUSED is its sibling. Both
        // ship a written `message` — without this branch they fell through
        // to the fallback and rendered the raw error code.
        setErrorCode(data.error)
        setError(data.message ?? 'Checkout blocked — please review your account and try again.')
      } else {
        setErrorCode(null)
        setError(data.error ?? "Couldn't reach our payment system. Please try again — or message us on WhatsApp to complete your order.")
      }
    } catch {
      setError("Couldn't reach our payment system. Check your connection and try again — or message us on WhatsApp to complete your order.")
    } finally {
      setCheckoutLoading(false)
    }
  }

  if (!plan) return null
  const total = totalPrice(plan, pref, vegDayCount, weekType, priceOverrides)
  // Split for the currently open plan only, computed once server-side for
  // every selectable plan, so this lookup is free of any round trip.
  const selectedCredit = creditByPlan[plan]
  const creditBalanceAed = (selectedCredit?.balanceFils ?? 0) / 100
  const lockedCreditAed  = (selectedCredit?.lockedFils  ?? 0) / 100
  const appliedAed = Math.min(creditBalanceAed, total)
  const leftoverAed = Math.max(0, creditBalanceAed - appliedAed)
  // What the customer actually pays now — gross minus the Dorm Wars credit the
  // server applies as a Stripe coupon. The POST still sends the GROSS amount
  // (the coupon is synthesized against it server-side); this is display-only.
  const netDueAed = Math.max(0, total - appliedAed)
  const ctaDisabled = checkoutLoading || !startDate || !vegDaysReady || outOfZone || seasonClosed

  // ── Summary fields (step 2) — derived once, read-only recognition surface ──
  const planDef = PLANS.find(p => p.id === plan)
  const W = weekType === '5DAYS' ? 5 : 6
  const meals = mealsForPlan(plan, weekType)
  const perMeal = pricePerMeal(plan, pref, vegDayCount, weekType, priceOverrides)
  const planKindLabel =
    plan === 'Weekly Flex' ? 'Weekly plan'
    : (plan === 'Monthly Premium' || plan === 'Monthly Max') ? 'Monthly plan'
    : 'Trial'
  const durationLabel =
    plan === 'Weekly Flex' ? `1 week · ${W} days`
    : plan === 'Monthly Premium' ? `4 weeks · ${W} days/week`
    : plan === 'Monthly Max' ? `4 weeks · ${W} days/week · 2 meals/day`
    : (planDef?.duration ?? 'One-time')
  const prefSummary =
    pref === 'Religious' ? `Religious mix · ${vegDayCount} veg/wk`
    : pref === 'Veg' ? 'Vegetarian'
    : 'Non-veg'
  const weekLabel = weekType === '5DAYS' ? 'Mon–Fri' : 'Mon–Sat'
  const startLabel = startDate
    ? new Date(startDate + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })
    : '—'
  const dormLabel = customer?.dorm_name || '—'
  const vegDaysLabel = vegDays.map(d => d.slice(0, 3)).join(', ')
  const continueDisabled = !startDate || !vegDaysReady

  // Season refusals read as calendar facts, so they drop the danger tone AND
  // the support offer; a paused plan keeps the soft tone but keeps its
  // one-tap fix.
  const seasonError = errorCode === 'INTAKE_ENDING' || errorCode === 'INTAKE_PAUSED'
  const softError = seasonError || errorCode === 'PLAN_PAUSED'

  // Step 1 advances to summary only with a complete choice; both transitions
  // clear any stale server error so it can't haunt the other step.
  const goToSummary = () => { if (continueDisabled) return; setError(null); setErrorCode(null); setStep(2) }
  const goBackToDate = () => { setError(null); setErrorCode(null); setStep(1) }

  // Shared primary-CTA shell (orange pill); per-use overrides set width/flex +
  // disabled tint so step-1 Continue and step-2 Pay stay visually identical.
  const primaryBtn: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '16px', borderRadius: 14, border: 'none', fontFamily: BODY, fontSize: 14, fontWeight: 800,
    letterSpacing: '0.04em', textTransform: 'uppercase', color: '#fff',
  }
  const cardStyle: CSSProperties = {
    marginTop: 12, borderRadius: 14, border: `1px solid ${S.border}`,
    background: 'var(--ds-surface2)', padding: '6px 14px',
  }

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      ariaLabel="Checkout"
      footer={step === 1 ? (
        <>
          {pref === 'Religious' && !vegDaysReady && (
            <div style={{ flexBasis: '100%', width: '100%', fontSize: 12, fontWeight: 600, color: '#3a6f8c' }}>
              Pick {vegDayCount} veg day{vegDayCount === 1 ? '' : 's'} above to continue.
            </div>
          )}
          <button
            type="button"
            onClick={goToSummary}
            disabled={continueDisabled}
            style={{
              ...primaryBtn, width: '100%',
              background: continueDisabled ? 'rgba(245,127,32,0.36)' : OG,
              boxShadow: continueDisabled ? 'none' : '0 8px 22px -8px rgba(245,127,32,0.7)',
              cursor: continueDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            Review &amp; pay →
          </button>
        </>
      ) : (
        <>
          {/* Blocking feedback lives AT the trigger — a server rejection appears
              right above the Pay button (pinned, always in view) and slides in.
              Nielsen #1/#9 + microinteractions "feedback at the source". */}
          {error && (
            /* Soft states (og-wash, no red): a paused plan and the two season
               states are facts, not failures — the season ones carry no CTA
               at all, since there is nothing the customer can fix today. Only
               real checkout failures get the danger tone + WhatsApp offer. */
            <div role="alert" style={{ flexBasis: '100%', width: '100%', animation: 'mc-fb 240ms cubic-bezier(0.16,1,0.3,1)', padding: '11px 13px', borderRadius: 10, background: softError ? 'var(--ds-og-wash)' : 'var(--ds-danger-wash)', border: `1px solid ${softError ? 'var(--ds-og-border)' : 'var(--ds-danger-border)'}` }}>
              <p style={{ margin: 0, fontSize: 12, color: softError ? 'var(--ds-fg)' : 'var(--ds-danger-fg)', lineHeight: 1.45 }}>{error}</p>
              {errorCode === 'PLAN_PAUSED'
                ? <Link href="/dashboard" style={{ display: 'inline-block', marginTop: 6, fontSize: 11.5, fontWeight: 700, color: OG, textDecoration: 'none', letterSpacing: '0.04em' }}>Resume my plan →</Link>
                : seasonError
                  ? null
                  : <a href={whatsAppHref('Hi! I had trouble checking out — could you help me complete my order?')} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 11.5, fontWeight: 700, color: '#1ea34d', textDecoration: 'none', letterSpacing: '0.04em' }}>Message us on WhatsApp →</a>}
            </div>
          )}
          <div style={{ flexBasis: '100%', width: '100%', display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={goBackToDate}
              disabled={checkoutLoading}
              style={{
                flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '16px 18px', borderRadius: 14, border: `1px solid ${S.border2}`, background: 'transparent',
                fontFamily: BODY, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                color: S.fg, cursor: checkoutLoading ? 'not-allowed' : 'pointer',
              }}
            >
              <ArrowLeft size={15} strokeWidth={2.4} /> Back
            </button>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={ctaDisabled}
              style={{
                ...primaryBtn, flex: '1 1 auto',
                background: ctaDisabled && !checkoutLoading ? 'rgba(245,127,32,0.36)' : OG,
                boxShadow: ctaDisabled ? 'none' : '0 8px 22px -8px rgba(245,127,32,0.7)',
                cursor: ctaDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              {checkoutLoading
                ? <><Loader2 size={15} strokeWidth={2.6} style={{ animation: 'mc-spin 700ms linear infinite' }} /> Redirecting…</>
                : netDueAed > 0 ? <>Pay {netDueAed} AED →</>
                : <>Confirm — AED 0 →</>}
            </button>
          </div>
          {/* Trust line — pinned directly under the Pay button (the moment of decision). */}
          <p style={{ flexBasis: '100%', width: '100%', margin: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: S.fgFaint, lineHeight: 1.4 }}>
            <Lock size={11} strokeWidth={2.4} color="#1d8a30" /> Powered by Stripe · Card details never touch our servers.
          </p>
          <style>{`@keyframes mc-spin{to{transform:rotate(360deg)}}@keyframes mc-fb{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
        </>
      )}
    >
      {/* Step progress — Trunk Test "where am I": two segments, both orange by step 2. */}
      <div style={{ marginTop: 4 }}>
        <StepBar step={step} />
      </div>

      {/* Out-of-zone gate — a global block; shown on both steps so a disabled Pay is explained. */}
      {outOfZone && (
        <div style={{ marginTop: 14, padding: '13px 14px', borderRadius: 12, background: 'rgba(58,111,140,0.10)', border: '1px solid rgba(58,111,140,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <MapPin size={16} strokeWidth={2} color="#5fa1c4" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ds-fg)', lineHeight: 1.35 }}>Your dorm is outside our delivery radius</p>
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: S.fgMuted, lineHeight: 1.5 }}>Message us on WhatsApp so we can confirm we can cater to you before checkout.</p>
            </div>
          </div>
          <a href={whatsAppHref('Hi! My dorm is outside the listed delivery radius — could you confirm whether you can deliver to me before I check out?')} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '9px 15px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', background: '#25D366', color: '#fff', textDecoration: 'none' }}>Message us →</a>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {step === 1 ? (
          <motion.div key="step1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
            <div style={{ ...eyebrow, marginTop: 16 }}>Step 1 of 2</div>
            <h2 style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 800, color: S.fg, letterSpacing: '-0.01em', lineHeight: 1.2 }}>Choose your start date</h2>

            <div style={{ marginTop: 14 }}>
              <MobileDatePicker value={startDate} onChange={setStartDate} minDate={dateBounds.min} maxDate={maxPickable} weekType={weekType} cutoffActive={dateBounds.cutoffActive} activeUntil={activeSubscription?.end_date} seasonEndsOn={lastDeliveryDay} />
              <p style={{ margin: '12px 0 0', fontSize: 12, color: S.fgMuted, lineHeight: 1.5 }}>
                {startDate ? <>Starts <strong style={{ color: S.fg, fontWeight: 700 }}>{startLabel}</strong>. No charge for days before.</> : 'Pick any working day in the next 30 days.'}
              </p>
              {/* Season taper — states the real ceiling right under the
                  calendar, so a greyed-out late week is explained before it
                  is tapped rather than after. Muted, not orange: the
                  picker's own tap-refusal line is the loud one, and two
                  orange sentences in a stack blunt each other. */}
              {lastDeliveryDay && (
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: S.fgMuted, fontWeight: 600, lineHeight: 1.45 }}>
                  {seasonClosed
                    ? <>This plan runs past {prettySeasonDate(lastDeliveryDay)}, the last delivery day this term.</>
                    : <>Latest start this term: <strong style={{ color: S.fg, fontWeight: 700 }}>{prettySeasonDate(clampBackToDeliveryDay(maxPickable, weekType))}</strong>.</>}
                </p>
              )}
            </div>

            {pref === 'Religious' && (
              <div style={{ marginTop: 16, padding: 13, borderRadius: 14, background: 'rgba(58,111,140,0.06)', border: '1px solid rgba(58,111,140,0.20)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <span style={eyebrow}>Pick your veg days</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: vegDaysReady ? '#1d8a30' : '#3a6f8c', fontFeatureSettings: '"tnum"' }}>{vegDays.length} of {vegDayCount}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${workingDayNames.length}, 1fr)`, gap: 5 }}>
                  {workingDayNames.map(day => {
                    const active = vegDays.includes(day)
                    const atCap = !active && vegDays.length >= vegDayCount
                    return (
                      <button key={day} type="button" onClick={() => toggleVegDay(day)} disabled={atCap} style={{ padding: '11px 0', borderRadius: 8, border: `1px solid ${active ? '#5fa1c4' : 'var(--ds-border-strong)'}`, background: active ? 'rgba(58,111,140,0.20)' : (atCap ? 'var(--ds-skeleton-base)' : 'var(--ds-surface2)'), color: active ? 'var(--ds-fg)' : (atCap ? 'var(--ds-fg-tint)' : S.fg), fontFamily: BODY, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: atCap ? 'not-allowed' : 'pointer' }}>{day.slice(0, 3)}</button>
                    )
                  })}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="step2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
            <div style={{ ...eyebrow, marginTop: 16 }}>Step 2 of 2</div>
            <h2 style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 800, color: S.fg, letterSpacing: '-0.01em', lineHeight: 1.2 }}>Review &amp; confirm</h2>

            {/* Plan identity — name + recurring price, the anchor of the receipt. */}
            <div style={{ marginTop: 14, borderRadius: 14, border: `1px solid ${S.border}`, background: 'var(--ds-surface2)', padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--ds-skeleton-base)', color: OG, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><PlanGlyph planName={plan} size={18} color={OG} /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: S.fg, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan}</div>
                  <div style={{ fontSize: 11.5, color: S.fgMuted, marginTop: 1 }}>{planKindLabel} · {durationLabel}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: S.fg, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{total}</div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: S.fgMuted }}>AED{planDef?.period ?? ''}</div>
              </div>
            </div>

            {/* Setup + delivery — scannable label/value rows (recognition, not recall). */}
            <div style={cardStyle}>
              <SummaryRow label="Meals" value={`${meals} meals`} sub={`${perMeal} AED / meal`} />
              <SummaryRow label="Preference" value={prefSummary} sub={pref === 'Religious' && vegDays.length > 0 ? `Veg: ${vegDaysLabel}` : undefined} />
              <SummaryRow label="Schedule" value={`${weekLabel} · 7–8 PM`} />
              <SummaryRow label="Starts" value={startLabel} onEdit={goBackToDate} />
              <SummaryRow label="Deliver to" value={dormLabel} />
            </div>

            {/* Payment receipt — transparent price → credit → due-today total. */}
            <div style={cardStyle}>
              <SummaryRow label="Plan price" value={`AED ${total}`} />
              {appliedAed > 0 && (
                <SummaryRow label="Dorm Wars credit" value={`− AED ${appliedAed.toFixed(0)}`} valueColor="#1d8a30" sub={leftoverAed > 0 ? `AED ${leftoverAed.toFixed(0)} stays in your wallet` : undefined} />
              )}
              <div style={{ borderTop: `1px solid ${S.border}`, margin: '4px 0' }} />
              <SummaryRow label="Total due today" value={`AED ${netDueAed}`} emphasize />
            </div>

            {/* The customer holds a credit that does NOT apply to this plan
                (e.g. the seasonal-pause waitlist credit is monthly-only),
                told why here, before they pay, on every plan it doesn't
                apply to. Renders null at zero. */}
            <LockedCreditNote lockedAed={lockedCreditAed} />
          </motion.div>
        )}
      </AnimatePresence>
    </MobileSheet>
  )
}

// ── Two-segment progress bar — answers "where am I" without stealing space. ──
function StepBar({ step }: { step: 1 | 2 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} aria-hidden>
      {[1, 2].map(n => (
        <span key={n} style={{ height: 4, flex: 1, borderRadius: 999, background: n <= step ? OG : 'var(--ds-border-strong)', transition: 'background 220ms ease' }} />
      ))}
    </div>
  )
}

// ── Summary row — label left, value (optional sub + inline edit) right. ──
function SummaryRow({ label, value, sub, emphasize, valueColor, onEdit }: {
  label: string
  value: string
  sub?: string
  emphasize?: boolean
  valueColor?: string
  onEdit?: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '9px 0' }}>
      <span style={{ fontSize: 12.5, color: S.fgMuted, flexShrink: 0, lineHeight: 1.4 }}>{label}</span>
      <span style={{ textAlign: 'right', minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: emphasize ? 18 : 13, fontWeight: emphasize ? 800 : 600, color: valueColor || S.fg, lineHeight: 1.3, fontFeatureSettings: '"tnum"' }}>{value}</span>
        {sub && <span style={{ display: 'block', fontSize: 11, color: S.fgMuted, marginTop: 2, lineHeight: 1.35 }}>{sub}</span>}
        {onEdit && (
          <button type="button" onClick={onEdit} style={{ marginTop: 3, padding: 0, background: 'none', border: 'none', color: OG, fontFamily: BODY, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>Change</button>
        )}
      </span>
    </div>
  )
}
