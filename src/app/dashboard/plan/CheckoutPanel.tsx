'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Lock } from 'lucide-react'
import { TIER1, NV, BODY } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'
import { PlanGlyph } from '../_shared/PlanGlyph'
import { DateField } from './DateField'
import { pricePerMeal, totalPrice, PLANS, type PlanId, type Pref } from './pricing'

interface CheckoutCustomer {
  name?: string | null
  email?: string | null
  whatsapp_number?: string | null
  dorm_name?: string | null
}

interface CheckoutSubscription {
  end_date: string
}

interface Props {
  selected: PlanId
  pref: Pref
  vegDayCount: number
  customer: CheckoutCustomer | null
  userEmail: string
  activeSubscription: CheckoutSubscription | null
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Slide-in checkout panel — appears once a plan is selected and owns the
 * date picker, the Stripe redirect, and the panel-local state (startDate,
 * loading, error). Auto-scrolls itself into view on mount/selection-change
 * and resets `checkoutLoading` on browser-back from Stripe (bfcache).
 *
 * Was 128 inline JSX lines + 244 CSS lines in PlanClient.tsx.
 */
export function CheckoutPanel({
  selected, pref, vegDayCount, customer, userEmail, activeSubscription,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [startDate, setStartDate] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Date picker bounds — both bounds anchored to a single starting point so
  // the user always gets a 30-day window to pick from:
  //   • Active sub      → window = [end_date + 1, end_date + 31]
  //   • No active sub   → window = [today,        today      + 30]
  // The calendar's initial month follows `min`, so the popover lands on a
  // relevant month even when `startDate` is still empty.
  const dateBounds = useMemo(() => {
    let minD: Date
    if (activeSubscription) {
      minD = new Date(activeSubscription.end_date)
      minD.setHours(0, 0, 0, 0)
      minD.setDate(minD.getDate() + 1)
    } else {
      minD = new Date()
      minD.setHours(0, 0, 0, 0)
    }
    const maxD = new Date(minD)
    maxD.setDate(maxD.getDate() + 30)
    return { min: isoDate(minD), max: isoDate(maxD) }
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
    setCheckoutLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(totalPrice(selected, pref, vegDayCount) * 100),
          name: customer?.name ?? '',
          email: customer?.email ?? userEmail,
          phone: customer?.whatsapp_number ?? '',
          location: customer?.dorm_name ?? '',
          preference: pref === 'Religious' ? 'Religious Preference' : pref === 'Veg' ? 'Plant-Based' : 'Carnivore',
          plan: selected === 'Monthly Premium' ? 'Monthly Premium' :
                selected === 'Monthly Max'     ? 'Monthly Max' :
                selected === 'Weekly Flex'     ? 'Weekly Flex' :
                'One-Time Trial',
          vegDays: pref === 'Religious'
            ? ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].slice(0, vegDayCount)
            : [],
          start_date: startDate,
          cancel_path: window.location.pathname,
        }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setError(data.error ?? 'Checkout failed. Please try again.')
    } catch {
      setError('Network error. Please try again.')
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
              <PlanGlyph planName={selected} size={24} color={NV} />
              <span>{selected}</span>
            </div>
            <div className="checkout-plan-meta">
              {pricePerMeal(selected, pref, vegDayCount)} AED/meal &middot; {PLANS.find(p => p.id === selected)?.meals} meals
            </div>
          </div>

          {/* Headline number — single dominant moment of the panel.
              Clamped scale, tabular numerals, tight tracking. The "AED"
              lockup is a small footer beneath, not a same-line equal partner. */}
          <div className="checkout-total-block">
            <div className="checkout-total-line">
              <span className="checkout-total-num">
                {totalPrice(selected, pref, vegDayCount)}
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

        {/* ── ACTION STRIP ──
            Two stacked grids so the trigger button and the CTA button share
            a baseline regardless of how tall the helper text below them runs.
            The controls grid is bottom-aligned (date col taller because of its
            label; the CTA col centres its single button to that bottom), and
            the helpers grid sits underneath top-aligned. */}
        <div className="checkout-action">
          <div className="checkout-action-controls">
            <div className="checkout-date">
              <div className="checkout-label">Start date</div>
              <DateField
                value={startDate}
                onChange={setStartDate}
                minDate={dateBounds.min}
                maxDate={dateBounds.max}
              />
            </div>

            {/* Three-state CTA:
                • !startDate → "Pick a date to continue" (faded, awaiting input)
                • ready      → "Checkout securely →"     (orange, lift on hover)
                • loading    → spinner + "Redirecting…"  (press-scaled momentarily) */}
            <button
              type="button"
              disabled={checkoutLoading || !startDate}
              onClick={handleCheckout}
              className={`checkout-cta${!startDate && !checkoutLoading ? ' is-awaiting' : ''}${checkoutLoading ? ' is-loading' : ''}`}
            >
              {checkoutLoading ? (
                <>
                  <Loader2 size={14} strokeWidth={2.6} className="checkout-cta-spinner" aria-hidden />
                  <span>Redirecting&hellip;</span>
                </>
              ) : !startDate ? (
                <span>Pick a date to continue</span>
              ) : (
                <span>Checkout securely →</span>
              )}
            </button>
          </div>

          <div className="checkout-action-helpers">
            <p className="checkout-helper">
              Your meals begin on this date — you won&apos;t be charged for days before.
            </p>
            <div>
              <p className="checkout-trust">
                <Lock size={11} strokeWidth={2.4} color="#1d8a30" aria-hidden />
                Powered by Stripe &middot; Card details never touch our servers.
              </p>
              {error && <p className="checkout-error">{error}</p>}
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
          color: #091825;
          letter-spacing: -0.02em;
          line-height: 1.05;
        }
        .checkout-plan-meta {
          margin-top: 6px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 12px;
          color: rgba(9, 24, 37, 0.65);
          font-feature-settings: 'tnum';
        }

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
          color: rgba(9, 24, 37, 0.65);
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
            rgba(9, 24, 37, 0) 0%,
            rgba(9, 24, 37, 0.10) 18%,
            rgba(9, 24, 37, 0.10) 82%,
            rgba(9, 24, 37, 0) 100%
          );
        }

        /* Action strip — split into TWO grids so the trigger button and the
           CTA button share a baseline (controls grid, bottom-aligned), with
           the helper texts laid out top-aligned underneath in a separate grid.
           Bottom-aligning the controls means: the date column (label + trigger)
           is taller than the CTA column (button only); the CTA gets pushed
           down so its bottom edge meets the trigger's bottom edge. */
        .checkout-action-controls,
        .checkout-action-helpers {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }
        .checkout-action-helpers {
          gap: 12px;
          margin-top: 12px;
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
          }
        }

        /* Eyebrow label above the date trigger. */
        .checkout-label {
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(9, 24, 37, 0.65);
          line-height: 1;
          margin-bottom: 12px;
        }

        .checkout-helper {
          margin: 0;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11.5px;
          color: rgba(9, 24, 37, 0.45);
          line-height: 1.55;
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
          box-shadow: 0 4px 12px rgba(9, 24, 37, 0.10);
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
           reinforces the safety message at the moment of commitment. */
        .checkout-trust {
          margin: 0;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11px;
          color: rgba(9, 24, 37, 0.45);
          line-height: 1.5;
        }

        .checkout-error {
          margin-top: 8px;
          text-align: center;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 12px;
          color: #b91c1c;
        }

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
