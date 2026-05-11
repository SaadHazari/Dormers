'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Lock, PauseCircle, MapPin } from 'lucide-react'
import Link from 'next/link'
import { TIER1, BODY, OG, S } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'
import { PlanGlyph } from '../_shared/PlanGlyph'
import { DateField } from './DateField'
import { fmtWithDay } from '../_shared/format'
import { whatsAppHref } from '@/lib/contacts'
import { pricePerMeal, totalPrice, mealsForPlan, PLANS, type PlanId, type Pref, type WeekType } from './pricing'

interface CheckoutCustomer {
  name?: string | null
  email?: string | null
  whatsapp_number?: string | null
  dorm_name?: string | null
  week_type?: '5DAYS' | '6DAYS' | null
  // Religious-mix only — the customer's saved veg-day preference. Used to
  // pre-fill the day picker so returning religious-mix users don't restart
  // from blank every checkout. They can still override any pick here.
  veg_days?: string[] | null
  // Pending wins over canonical for renewals — if the customer queued a
  // veg-day change while their current sub is still running, the next
  // sub's day picker should pre-fill from those queued days, not the
  // already-superseded canonical ones. Mirrors `effectivePreferences()`.
  pending_veg_days?: string[] | null
}

interface CheckoutSubscription {
  end_date: string
}

interface Props {
  selected: PlanId
  pref: Pref
  /** Religious-mix count — gated upstream so this is always a real number
   *  by the time the panel mounts (cards aren't selectable for religious
   *  users without a count chosen). Non-religious users get a numeric
   *  fallback at the call site so pricing helpers stay number-typed. */
  vegDayCount: number
  customer: CheckoutCustomer | null
  userEmail: string
  activeSubscription: CheckoutSubscription | null
  /** Effective delivery cadence — pending wins over canonical. Threaded
   *  from PlanClient so the card grid and the checkout panel always agree
   *  on the meal count + price (canonical-only here would silently submit
   *  6DAYS pricing for a customer who queued a 5DAYS change). */
  weekType: WeekType
  /** Customer's dorm is outside the delivery radius — disables checkout
   *  and shows the out-of-zone notice inline rather than waiting for a
   *  server-side rejection after the user clicks. */
  outOfZone?: boolean
}

// Format a Date as YYYY-MM-DD using LOCAL components — never UTC. The Date
// objects we hand this are built via setHours(0,0,0,0), i.e. local midnight;
// `.toISOString()` would shift them to UTC and slice off the previous day in
// any positive offset (AE is UTC+4 → local midnight is UTC 20:00 the day
// before → toISOString slice = wrong day). Mirrors DateField.pick().
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Earliest date the user can start. Always **tomorrow at the earliest** —
// today's prep window has already begun in the kitchen by the time someone is
// checking out, so a same-day start can't be honoured. For renewals we anchor
// to the day after the existing plan ends.
//   • Active sub      → end_date + 1
//   • No active sub   → today + 1
function computeMinIso(active: { end_date: string } | null): string {
  let d: Date
  if (active) {
    d = new Date(active.end_date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 1)
  } else {
    d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 1) // tomorrow, never today
  }
  return isoDate(d)
}

// Bump an ISO date forward until it lands on a delivery day for the customer's
// week_type. Used to seed the date picker default — if the natural earliest
// pick (tomorrow / day-after-end) falls on a Sunday (or Saturday for 5DAYS),
// we land the user on the next valid working day instead of an immediately
// invalid pre-fill.
function clampToDeliveryDay(iso: string, weekType: WeekType): string {
  const d = new Date(iso + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const js = d.getDay()
    const dow = js === 0 ? 7 : js  // 1=Mon..7=Sun
    if (weekType === '5DAYS' ? (dow !== 6 && dow !== 7) : (dow !== 7)) break
    d.setDate(d.getDate() + 1)
  }
  return isoDate(d)
}

/**
 * Slide-in checkout panel — appears once a plan is selected and owns the
 * date picker, the Stripe redirect, and the panel-local state (startDate,
 * loading, error). Auto-scrolls itself into view on mount/selection-change
 * and resets `checkoutLoading` on browser-back from Stripe (bfcache).
 *
 * Was 128 inline JSX lines + 244 CSS lines in PlanClient.tsx.
 */
export function CheckoutPanel({
  selected, pref, vegDayCount, customer, userEmail, activeSubscription, weekType,
  outOfZone = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // weekType is the effective cadence (pending → canonical fallback) supplied
  // by PlanClient. Reading customer.week_type here would diverge from the
  // pricing cards above when a pending_week_type change is queued.
  // Working days for this customer. Religious-mix users pick exactly
  // `vegDayCount` of these for veg deliveries; the rest get non-veg.
  const workingDayNames = useMemo(
    () => ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].slice(0, weekType === '5DAYS' ? 5 : 6),
    [weekType],
  )
  // Default the start date to the earliest valid pick. The most common path is
  // "start as soon as possible" — pre-filling removes one click from the critical
  // path and lets the CTA wake up in its actionable state on panel mount.
  // Clamp forward to the next delivery day so the seed never lands on a
  // non-delivery weekday (Sun / Sat-Sun) that the calendar would reject.
  const [startDate, setStartDate] = useState<string>(() =>
    clampToDeliveryDay(computeMinIso(activeSubscription), weekType),
  )
  // Religious-mix only: which specific working days are veg. Length must
  // equal `vegDayCount` before checkout is enabled. Pre-fills from the
  // customer's saved veg-day preference so returning religious-mix users
  // don't have to re-pick from scratch — they can still override any day.
  // The seed re-applies whenever pref / count / weekType changes (those
  // changes invalidate the previous picks); user-edited picks within a
  // stable seed configuration are preserved.
  const buildVegDaySeed = (
    p: typeof pref, count: number, days: readonly string[],
  ): string[] => {
    if (p !== 'Religious') return []
    // Pending wins over canonical — the queued change is what the next
    // sub will be created with, so the picker must reflect it. Without
    // this fallback, a customer who queued a Mon/Wed/Fri → Tue/Thu/Sat
    // swap would see the OLD days pre-selected on renewal checkout even
    // though the webhook drains pending_veg_days into the new sub.
    const seed = customer?.pending_veg_days ?? customer?.veg_days ?? []
    return seed
      .filter(d => (days as string[]).includes(d))
      .slice(0, count)
  }
  const [vegDays, setVegDays] = useState<string[]>(() =>
    buildVegDaySeed(pref, vegDayCount, workingDayNames),
  )
  useEffect(() => {
    setVegDays(buildVegDaySeed(pref, vegDayCount, workingDayNames))
    // customer.veg_days is request-stable; re-seed when the panel's primary
    // inputs change (pref, count, weekType) — workingDayNames is derived
    // from weekType so it's covered by that dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pref, vegDayCount, weekType])
  const hasSavedVegPref =
    (customer?.pending_veg_days?.length ?? 0) > 0 ||
    (customer?.veg_days?.length ?? 0) > 0

  const toggleVegDay = (day: string) => {
    setVegDays(prev => {
      if (prev.includes(day)) return prev.filter(d => d !== day)
      if (prev.length >= vegDayCount) return prev   // hard cap — block over-selection
      return [...prev, day]
    })
  }
  const vegDaysReady = pref !== 'Religious' || vegDays.length === vegDayCount
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  // Date picker bounds — both bounds anchored to a single starting point so
  // the user always gets a 30-day window to pick from:
  //   • Active sub      → window = [end_date + 1, end_date + 31]
  //   • No active sub   → window = [today,        today      + 30]
  // The calendar's initial month follows `min`, so the popover lands on a
  // relevant month even when `startDate` is still empty.
  const dateBounds = useMemo(() => {
    const minIso = computeMinIso(activeSubscription)
    const maxD = new Date(minIso + 'T00:00:00')
    maxD.setDate(maxD.getDate() + 30)
    return { min: minIso, max: isoDate(maxD) }
  }, [activeSubscription])

  // Scroll the panel into clear view on mount and when selection changes,
  // so the user sees the date picker + checkout button without hunting for
  // them. Small delay lets the slide-in finish before we move the page;
  // `block: 'center'` keeps the selected card and the panel both visible.
  // Honours `prefers-reduced-motion`.
  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t = window.setTimeout(() => {
      ref.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      })
    }, 180)
    return () => window.clearTimeout(t)
  }, [selected])

  // Browser-BACK from Stripe restores this page from bfcache with
  // `checkoutLoading: true` still set (the `finally` never ran before
  // `window.location.href = …` unloaded the page). Reset on pageshow.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setCheckoutLoading(false)
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  const handleCheckout = async () => {
    if (!startDate) return
    setError(null)
    setErrorCode(null)
    setCheckoutLoading(true)
    // Mark the moment we hand off to Stripe — the dashboard uses this on
    // return to wait for a sub created *after* this timestamp before showing
    // the order-confirmation UI. Without this gate, existing customers see
    // banner/overlay populated from the OLD active sub (the new one hasn't
    // been written by the webhook yet on first render).
    try { sessionStorage.setItem('checkout-handoff-at', String(Date.now())) } catch {}
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(totalPrice(selected, pref, vegDayCount, weekType) * 100),
          name: customer?.name ?? '',
          email: customer?.email ?? userEmail,
          phone: customer?.whatsapp_number ?? '',
          location: customer?.dorm_name ?? '',
          preference: pref === 'Religious' ? 'Religious Preference' : pref === 'Veg' ? 'Plant-Based' : 'Carnivore',
          plan: selected === 'Monthly Premium' ? 'Monthly Premium' :
                selected === 'Monthly Max'     ? 'Monthly Max' :
                selected === 'Weekly Flex'     ? 'Weekly Flex' :
                'One-Time Trial',
          vegDays: pref === 'Religious' ? vegDays : [],
          start_date: startDate,
          cancel_path: window.location.pathname,
        }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else if (data.error === 'QUEUE_FULL' || data.error === 'TRIAL_COOLDOWN' || data.error === 'PROFILE_INCOMPLETE' || data.error === 'OUT_OF_ZONE' || data.error === 'PLAN_PAUSED') {
        // Friendly server-side rejection — message is pre-formatted for display.
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
    >
      {/*
        Receipt-header + action-strip composition.

        Top section is a full-width plan summary — what you're buying gets
        the panel's prime real estate, with the total as the headline number
        (bold, tight tracking, tabular numerals). A gradient hairline fades
        into the panel rather than slicing across it. The bottom strip is a
        2-col 1fr/1fr action row, bottom-aligned so the input baseline and
        the CTA baseline meet at the same line. Mobile collapses to a single
        top-down flow.
      */}
      <div ref={ref} className="checkout-panel" style={{
        ...TIER1,
        padding: 'clamp(24px, 3vw, 36px)',
        borderRadius: 24,
        // Match the orange-accent intensity used on the active-plan callout
        // and the recommended PlanCard — atmospheric, not shouty. The CTA
        // inside is the assertive moment.
        border: '1.5px solid rgba(245,127,32,0.32)',
        marginBottom: 48,
        scrollMarginBlock: 24,
        fontFamily: BODY,
      }}>

        {/* ── RECEIPT HEADER — what you're buying, anchored ── */}
        <div className="checkout-summary-row">
          <div className="checkout-identity">
            <Eyebrow>Selected plan</Eyebrow>
            {/* Glyph sits *inline* with the plan-name text on the same
                baseline — Crown next to "Monthly Max", Gem next to
                "Monthly Premium", etc. */}
            <div className="checkout-plan-name">
              <PlanGlyph planName={selected} size={24} color="currentColor" />
              <span>{selected}</span>
            </div>
            <div className="checkout-plan-meta">
              {pricePerMeal(selected, pref, vegDayCount, weekType)} AED/meal &middot; {mealsForPlan(selected, weekType)} meals
            </div>
            {startDate && (
              <div className="checkout-plan-when">
                Starts <strong>{fmtWithDay(startDate)}</strong>
              </div>
            )}
          </div>

          {/* Headline number — single dominant moment of the panel.
              Clamped scale, tabular numerals, tight tracking. The "AED"
              lockup is a small footer beneath, not a same-line equal partner. */}
          <div className="checkout-total-block">
            <div className="checkout-total-line">
              <span className="checkout-total-num">
                {totalPrice(selected, pref, vegDayCount, weekType)}
              </span>
              <span className="checkout-total-cur">AED</span>
            </div>
            <span className="checkout-total-period">
              per {(PLANS.find(p => p.id === selected)?.period ?? '').replace('/', '')}
            </span>
          </div>
        </div>

        {/* Gradient hairline — fades into the panel edges so it reads as
            a soft transition, not a hard slice. */}
        <div className="checkout-divider" aria-hidden />

        {/* ── VEG-DAY PICKER (Religious mix only) ──
            Lets the customer choose exactly which days are veg. Selection
            count must equal vegDayCount (the count picker upstream). The
            block is anchored above the date+CTA so the user can't reach
            the CTA until they've made a complete choice. Persists onto
            subscription.veg_days via the webhook so the dashboard menu
            picks the right dish per day. Pre-fills from the customer's
            saved veg-day preference (customer.veg_days) when present. */}
        {pref === 'Religious' && (
          <div style={{
            margin: '14px 0 4px',
            padding: 14,
            borderRadius: 14,
            background: 'rgba(58,111,140,0.06)',
            border: '1px solid rgba(58,111,140,0.20)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
              <Eyebrow>Pick your veg days</Eyebrow>
              <span style={{
                fontFamily: BODY, fontSize: 12, fontWeight: 700,
                color: vegDaysReady ? '#1d8a30' : '#3a6f8c',
                fontFeatureSettings: '"tnum"',
              }}>
                {vegDays.length} of {vegDayCount} chosen
              </span>
            </div>
            {/* Prefill note — only when the customer has a saved veg-day
                preference. Sets expectation that the picker is seeded from
                Profile while making it explicit they can still change
                anything for this plan. Hidden if no saved preference exists
                (first-time religious-mix purchase). */}
            {hasSavedVegPref && (
              <p style={{
                margin: '0 0 10px 0',
                fontFamily: BODY, fontSize: 11.5, fontWeight: 600,
                color: '#1d8a30', lineHeight: 1.45,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span aria-hidden style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, background: '#1d8a30' }} />
                Pre-filled from your saved meal preferences — change anything for this plan.
              </p>
            )}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${workingDayNames.length}, minmax(0, 1fr))`,
              gap: 6,
            }}>
              {workingDayNames.map(day => {
                const active = vegDays.includes(day)
                const atCap = !active && vegDays.length >= vegDayCount
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleVegDay(day)}
                    disabled={atCap}
                    style={{
                      padding: '10px 0',
                      borderRadius: 8,
                      border: `1px solid ${active ? '#5fa1c4' : 'var(--ds-border-strong)'}`,
                      background: active ? 'rgba(58,111,140,0.20)' : (atCap ? 'var(--ds-skeleton-base)' : 'var(--ds-surface2)'),
                      color: active ? 'var(--ds-fg)' : (atCap ? 'var(--ds-fg-tint)' : S.fg),
                      fontFamily: BODY,
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      cursor: atCap ? 'not-allowed' : 'pointer',
                      transition: 'background 120ms, border-color 120ms, color 120ms',
                    }}
                  >
                    {day.slice(0, 3)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── ACTION STRIP ──
            Single 2-col grid: date trigger | CTA button — both centred
            vertically so the trigger and the button share a baseline no
            matter what (the date col only contains label + trigger now;
            the date hint moved into a structured helper row below).
            Below: a 2-col helper row — date hint left (under the trigger),
            trust line + payment-method note centred under the button. */}
        <div className="checkout-action">
          <div className="checkout-action-controls">
            <div className="checkout-date">
              <div className="checkout-label">Start date</div>
              <DateField
                value={startDate}
                onChange={setStartDate}
                minDate={dateBounds.min}
                maxDate={dateBounds.max}
                weekType={weekType}
              />
            </div>

            {/* Three-state CTA:
                • !startDate → "Pick a date to continue" (faded, awaiting input)
                • ready      → "Continue to checkout →"  (orange, lift on hover)
                • loading    → spinner + "Redirecting…"  (press-scaled momentarily) */}
            <button
              type="button"
              disabled={checkoutLoading || !startDate || !vegDaysReady || outOfZone}
              onClick={handleCheckout}
              className={`checkout-cta${((!startDate || !vegDaysReady) || outOfZone) && !checkoutLoading ? ' is-awaiting' : ''}${checkoutLoading ? ' is-loading' : ''}`}
              title={outOfZone ? 'Your dorm is outside our delivery radius — message us on WhatsApp to confirm coverage.' : !vegDaysReady ? `Pick ${vegDayCount} veg day${vegDayCount === 1 ? '' : 's'} above` : undefined}
            >
              {checkoutLoading ? (
                <>
                  <Loader2 size={14} strokeWidth={2.6} className="checkout-cta-spinner" aria-hidden />
                  <span>Redirecting&hellip;</span>
                </>
              ) : !startDate ? (
                <span>Pick a date to continue</span>
              ) : (
                <span>Continue to checkout →</span>
              )}
            </button>
          </div>

          <div className="checkout-action-helpers">
            {/* LEFT — date hint, three-line stack ordered by importance:
                line 1 = the rule (the WHEN — what date the customer is bound
                  to). Navy, weighted.
                line 2 = the consequence (charge model — answers "if I pick
                  next month, what am I paying for?"). Smaller, muted.
                line 3 = the constraint (picker window). Smallest, faintest.
                The charge-model line moved here from beneath the CTA — it
                belongs adjacent to the date input where the implication
                actually arises, not in a stack of trust + secondary copy
                under the button. */}
            <div className="checkout-date-hints">
              <p className="checkout-window-rule">
                {activeSubscription
                  ? <>Starts <strong>the day after your current plan ends</strong>.</>
                  : <>Earliest start: <strong>tomorrow</strong>.</>}
              </p>
              <p className="checkout-window-charge">
                Meals begin on this date — no charge for days before.
              </p>
              <p className="checkout-window-window">
                Any working day in the next 30 days.
              </p>
            </div>

            {/* RIGHT — single trust line under the CTA. */}
            <div className="checkout-cta-captions">
              <p className="checkout-trust">
                <Lock size={11} strokeWidth={2.4} color="#1d8a30" aria-hidden />
                Powered by Stripe &middot; Card details never touch our servers.
              </p>

              {/* Out-of-zone gate — shown upfront, not waiting for a failed
                  click. Matches OutOfZoneBanner tone (slate-blue) so the
                  visual language is consistent with the banner above the grid. */}
              {outOfZone && (
                <div style={{
                  marginTop: 10,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'rgba(58,111,140,0.10)',
                  border: '1px solid rgba(58,111,140,0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <MapPin size={16} strokeWidth={2} color="#5fa1c4" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                    <div>
                      <p style={{ margin: 0, fontFamily: BODY, fontSize: 13, fontWeight: 700, color: 'var(--ds-fg)', lineHeight: 1.35 }}>
                        Your dorm is outside our delivery radius
                      </p>
                      <p style={{ margin: '4px 0 0', fontFamily: BODY, fontSize: 12, color: S.fgMuted, lineHeight: 1.5 }}>
                        Message customer service on WhatsApp so we can confirm whether we can cater to you before checkout.
                      </p>
                    </div>
                  </div>
                  <a
                    href={whatsAppHref('Hi! My dorm is outside the listed delivery radius — could you confirm whether you can deliver to me before I check out?')}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      alignSelf: 'flex-start',
                      padding: '9px 16px', borderRadius: 999,
                      fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      background: '#25D366', color: '#fff', textDecoration: 'none', border: 0,
                      boxShadow: '0 2px 8px rgba(37,211,102,0.28)',
                    }}
                  >
                    Message us on WhatsApp →
                  </a>
                </div>
              )}

              {error && (
                errorCode === 'PLAN_PAUSED' ? (
                  /* Paused-plan block — actionable, not a dead end.
                     Orange/amber tone matches the pause visual language
                     used throughout the dashboard. No WhatsApp link:
                     the user can fix this themselves in one tap. */
                  <div style={{
                    marginTop: 10,
                    padding: '14px 16px',
                    borderRadius: 12,
                    background: 'var(--ds-og-wash)',
                    border: '1px solid var(--ds-og-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <PauseCircle size={16} strokeWidth={2} color={OG} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                      <div>
                        <p style={{ margin: 0, fontFamily: BODY, fontSize: 13, fontWeight: 700, color: 'var(--ds-fg)', lineHeight: 1.35 }}>
                          Your current plan is paused
                        </p>
                        <p style={{ margin: '4px 0 0', fontFamily: BODY, fontSize: 12, color: S.fgMuted, lineHeight: 1.5 }}>
                          Resume your plan first — your next plan can only start once your current end date is confirmed.
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/dashboard"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        alignSelf: 'flex-start',
                        padding: '9px 16px', borderRadius: 999,
                        fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                        background: OG, color: '#fff', textDecoration: 'none', border: 0,
                        boxShadow: '0 2px 8px rgba(245,127,32,0.28)',
                      }}
                    >
                      Resume my plan →
                    </Link>
                  </div>
                ) : (
                  <div className="checkout-error">
                    <p className="checkout-error-msg">{error}</p>
                    <a
                      href={whatsAppHref('Hi! I had trouble checking out — could you help me complete my order?')}
                      target="_blank"
                      rel="noreferrer"
                      className="checkout-error-cta"
                    >
                      Message us on WhatsApp →
                    </a>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        /* Receipt header — plan identity left, headline price right. Wraps
           on narrow screens so the price drops below the identity block
           rather than crushing into it. */
        .checkout-summary-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }
        .checkout-identity { min-width: 0; flex: 1 1 240px; }

        /* Plan name with the glyph sitting *inline* on the same baseline
           as the text — Crown ↔ "Monthly Max", Gem ↔ "Monthly Premium"… */
        .checkout-plan-name {
          margin-top: 12px;
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: clamp(22px, 2.6vw, 28px);
          font-weight: 700;
          color: var(--ds-fg);
          letter-spacing: -0.02em;
          line-height: 1.05;
        }
        .checkout-plan-meta {
          margin-top: 6px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 12px;
          color: var(--ds-fg-muted);
          font-feature-settings: 'tnum';
        }
        .checkout-plan-when {
          margin-top: 4px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 12px;
          color: var(--ds-fg-muted);
          font-feature-settings: 'tnum';
        }
        .checkout-plan-when strong { color: #091825; font-weight: 700; }

        /* Headline number — single hero moment of the panel. Dramatic scale,
           tight tracking, OG accent, tabular numerals so digits don't
           shift width as the user toggles preferences. */
        .checkout-total-block {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }
        .checkout-total-line {
          display: inline-flex;
          align-items: baseline;
          gap: 8px;
        }
        .checkout-total-num {
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: clamp(36px, 4.6vw, 48px);
          font-weight: 800;
          color: #f57f20;
          letter-spacing: -0.03em;
          line-height: 0.95;
          font-feature-settings: 'tnum';
        }
        .checkout-total-cur {
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: #f57f20;
          letter-spacing: -0.01em;
        }
        .checkout-total-period {
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11px;
          font-weight: 700;
          color: var(--ds-fg-muted);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        /* Gradient hairline — fades into the panel edges so the divider
           reads as a transition rather than a hard slice. */
        .checkout-divider {
          height: 1px;
          margin: 28px 0;
          background: linear-gradient(
            to right,
            transparent 0%,
            var(--ds-border) 18%,
            var(--ds-border) 82%,
            transparent 100%
          );
        }

        /* Action strip — split into TWO grids so the trigger button and the
           CTA button share a baseline (controls grid, centre-aligned). The
           date column now holds only label + trigger; date hint moved into
           the helpers row, so the trigger height matches the CTA height
           without internal padding mismatch. The helpers row mirrors the
           same 1fr/1fr split: hint left, captions right (centred). */
        .checkout-action-controls,
        .checkout-action-helpers {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }
        .checkout-action-helpers {
          gap: 14px;
          margin-top: 14px;
          align-items: start;
        }
        @media (min-width: 560px) {
          .checkout-action-controls {
            grid-template-columns: 1fr 1fr;
            gap: 32px;
            align-items: end;
          }
          .checkout-action-helpers {
            grid-template-columns: 1fr 1fr;
            gap: 32px;
            align-items: start;
          }
        }

        /* Eyebrow label above the date trigger. */
        .checkout-label {
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ds-fg-muted);
          line-height: 1;
          margin-bottom: 12px;
        }

        /* Date-hint stack — primary rule on top, secondary window line
           underneath. Hierarchy comes from font-weight + colour, so the
           user reads the *when* before the *how-far*. */
        .checkout-date-hints {
          display: flex;
          flex-direction: column;
          gap: 4px;
          text-align: left;
        }
        /* Primary rule — gets the heavier weight + navy ink so the
           customer's eye lands on the WHEN before the HOW FAR. */
        .checkout-window-rule {
          margin: 0;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: var(--ds-fg);
          line-height: 1.45;
        }
        .checkout-window-rule strong {
          color: var(--ds-fg);
          font-weight: 800;
        }
        /* Charge-model line — the customer-relevant implication of the
           start date. Sits between the rule and the picker window so the
           reader naturally goes WHEN → CONSEQUENCE → CONSTRAINT. */
        .checkout-window-charge {
          margin: 4px 0 0 0;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 12px;
          font-weight: 500;
          color: var(--ds-fg-soft);
          line-height: 1.5;
        }
        /* Secondary constraint — visually subordinated. Same colour family
           as muted body copy elsewhere in the dashboard so it reads as a
           supporting note, not a parallel statement. */
        .checkout-window-window {
          margin: 2px 0 0 0;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11.5px;
          font-weight: 500;
          color: var(--ds-fg-faint);
          line-height: 1.45;
        }

        /* CTA caption stack — centred under the button. The helper line
           explains the charge model; the trust line reassures about the
           payment provider. Both centred so the eye reads them as a unit
           directly under the orange CTA. */
        .checkout-cta-captions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
          text-align: center;
        }
        .checkout-helper {
          margin: 0;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11.5px;
          color: var(--ds-fg-soft);
          line-height: 1.55;
          text-align: center;
        }

        /* Primary CTA — orange-glow only on hover (at-rest sits on the
           consolidated neutral shadow scale). Lift + intensified glow on
           hover, snap-back on press. Visible focus ring inside the button
           for keyboard nav without breaking the visual edge. */
        .checkout-cta {
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 18px 22px;
          border-radius: 14px;
          background: #f57f20;
          color: #fff;
          border: 0;
          cursor: pointer;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          box-shadow: var(--ds-shadow-tier1);
          transition:
            transform   220ms cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow  220ms cubic-bezier(0.16, 1, 0.3, 1),
            opacity     150ms;
          will-change: transform;
        }
        .checkout-cta:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow:
            0 14px 32px rgba(245, 127, 32, 0.30),
            0 2px 8px   rgba(245, 127, 32, 0.16);
        }
        .checkout-cta:active:not(:disabled):not(.is-loading) {
          transform: scale(0.97);
          transition-duration: 80ms;
        }
        .checkout-cta:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.85);
          outline-offset: -4px;
        }
        .checkout-cta:disabled {
          cursor: not-allowed;
        }

        /* "Awaiting" — the user hasn't picked a date yet. Visually obvious
           it's not actionable (faded fill, dimmed text, no shadow) so the
           eye is pulled to the date trigger as the unmet step. */
        .checkout-cta.is-awaiting {
          background: rgba(245, 127, 32, 0.36);
          color: rgba(255, 255, 255, 0.92);
          box-shadow: none;
        }
        .checkout-cta.is-awaiting:hover {
          transform: none;
          box-shadow: none;
        }

        /* "Loading" — Stripe redirect in flight. Spinner replaces the arrow,
           button briefly compresses to confirm the press registered, then
           sits in a slightly weighted state until the redirect lands. */
        .checkout-cta.is-loading {
          transform: scale(0.98);
          box-shadow: 0 2px 8px rgba(245, 127, 32, 0.22);
        }
        .checkout-cta-spinner {
          animation: checkout-spin 700ms linear infinite;
          transform-origin: center;
        }
        @keyframes checkout-spin {
          to { transform: rotate(360deg); }
        }

        /* Trust line — pairs visually with the CTA above it. Lock icon
           reinforces the safety message at the moment of commitment.
           Centre-justified inside the captions stack so it sits directly
           under the orange button. */
        .checkout-trust {
          margin: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11px;
          color: var(--ds-fg-faint);
          line-height: 1.5;
          text-align: center;
        }

        /* Error block — Norman: error messages must offer an alternative
           path. The WhatsApp link is the always-on fallback when the payment
           pipeline can't be reached, so the user is never dead-ended. */
        .checkout-error {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          background: var(--ds-danger-wash);
          border: 1px solid var(--ds-danger-border);
        }
        .checkout-error-msg {
          margin: 0;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 12px;
          color: var(--ds-danger-fg);
          line-height: 1.5;
        }
        .checkout-error-cta {
          display: inline-block;
          margin-top: 6px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11.5px;
          font-weight: 700;
          color: #1ea34d;
          text-decoration: none;
          letter-spacing: 0.04em;
        }
        .checkout-error-cta:hover { text-decoration: underline; }

        /* Sticky checkout panel — desktop only. On mobile a sticky panel
           would cover too much of the viewport, so it stays in flow there.
           Sticks until its natural position scrolls past, then un-sticks. */
        @media (min-width: 920px) {
          .checkout-panel {
            position: sticky;
            bottom: 16px;
            z-index: 5;
          }
        }

        /* Honour reduced-motion preferences — strip the lift/transitions
           but keep the hover signal via box-shadow only. */
        @media (prefers-reduced-motion: reduce) {
          .checkout-cta {
            transition: none;
          }
          .checkout-cta:hover:not(:disabled),
          .checkout-cta:active:not(:disabled) {
            transform: none;
          }
        }
      `}</style>
    </motion.div>
  )
}
