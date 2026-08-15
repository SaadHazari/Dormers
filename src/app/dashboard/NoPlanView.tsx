'use client'

import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { OG, OG3, BODY, S, TIER1, TIER3, cleanPlanName } from './_shared/tokens'
import { Eyebrow } from './_shared/Eyebrow'
import { StatusDot } from './_shared/StatusDot'
import { PlanGlyph } from './_shared/PlanGlyph'
import { btnStyle, BtnSpinner } from './_shared/buttons'
import { fmt } from './_shared/format'
import { useNavigation } from './_shared/useNavigation'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { lifetimeSavings as computeLifetimeSavings, formatSavedAmount } from '@/contexts/subscriptions/domain/savings'
import { IntakePausedGate } from './_shared/IntakePausedGate'
import type { Customer, Subscription, IntakeGateState } from './_shared/types'
import { INTAKE_NOT_PAUSED } from './_shared/types'

interface Props {
  customer?: Customer | null
  allSubscriptions?: Subscription[]
  userEmail?: string
  /** True iff customer profile is incomplete OR dorm is out of zone OR
   *  intake is paused — disables purchase CTAs. */
  purchaseGated?: boolean
  /** Subset of purchaseGated: true when the gate is the out-of-zone flag (vs missing profile fields). Drives the disabled-CTA tooltip copy. */
  outOfZone?: boolean
  /** Banner stack (out-of-zone / profile gate / checkout-canceled / monthly
   *  wrap) rendered BETWEEN the greeting ribbon and the hero card. The
   *  greeting must always be the first thing on the dashboard — banners
   *  slot in below it, never above. */
  banners?: React.ReactNode
  /** Seasonal intake pause — mounts IntakePausedGate over the hero card,
   *  taking precedence over the profile / out-of-zone gate copy below. */
  intake?: IntakeGateState
}

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1] // expo-out

/**
 * Empty-state view shown when the customer has no active subscription.
 * Two branches by visit history:
 *   • First-time      → "Pick your plan." onboarding-style invitation
 *   • Returning user  → "Pick up where you left off." with ledger
 *                       (delivered count, member-since, last plan name)
 *
 * Lives on the same light dashboard surface as the rest of the routes —
 * no dark island. Two-zone composition (copy left, illustration right)
 * with choreographed staggered reveal. Renew CTA pre-fills the plan
 * preselect param so /dashboard/explore-plans can land on the user's
 * previous tier.
 */
export function NoPlanView({ customer, allSubscriptions = [], userEmail = '', purchaseGated = false, outOfZone = false, banners = null, intake = INTAKE_NOT_PAUSED }: Props) {
  // Intake pause wins the tooltip copy too — telling someone to finish
  // their profile so they can buy something that isn't for sale is the
  // wrong instruction. IntakePausedGate below carries the real message;
  // this tooltip is just a defensive fallback on the (disabled) CTA span.
  const gateTooltip = intake.paused
    ? 'New plans are paused right now'
    : outOfZone
      ? 'Outside delivery radius — message us on WhatsApp'
      : 'Complete your profile first'
  const prefersReducedMotion = useReducedMotion()
  const { navigate, isPending } = useNavigation()

  const endedPlans     = allSubscriptions.filter(s => s.status === SUBSCRIPTION_STATUS.ENDED)
  const lastEnded      = endedPlans[0]
  const totalDelivered = allSubscriptions.reduce((acc, x) => acc + (x.delivered_meals ?? 0), 0)
  const isReturning    = !!lastEnded
  // Lifetime savings narrative — only when the customer set their benchmark
  // on a prior session. The greeting ribbon doubles as a retrospective
  // retention asset here: customers with a lapsed plan still see what they
  // saved, which is the pull force that nudges them back to renewal.
  const lifetimeSavingsValue = computeLifetimeSavings(allSubscriptions, customer)

  const rawName   = customer?.name ?? userEmail.split('@')[0]
  const firstName = rawName?.split(' ')[0] ?? null
  const memberSinceText = customer?.created_at
    ? new Date(customer.created_at).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })
    : null

  const lastPlanClean = lastEnded ? cleanPlanName(lastEnded.plan_name) : null
  const renewParam    = lastEnded
    ? `?plan=${encodeURIComponent(lastEnded.plan_name)}`
    : ''

  // Copy — diverges by branch but shares structure so the layout doesn't shift.
  const eyebrow  = isReturning ? 'Welcome back' : 'Get started'
  const headline = isReturning ? 'Pick up where you left off.' : 'Pick your plan.'
  const subline  = isReturning
    ? <>Your <strong style={{ color: S.fg, fontWeight: 700 }}>{lastPlanClean}</strong> wrapped up. Renew it in one tap, or switch the rhythm — your kitchen, your call.</>
    : <>Daily meals delivered to your dorm, 7&ndash;8&nbsp;PM. Choose what fits your week.</>

  // Stagger schedule — expo-out feels physical, not mechanical. Reduced
  // motion users get a quiet group fade, no per-element choreography.
  const t = (delay: number) =>
    prefersReducedMotion
      ? { duration: 0.25, delay: 0 }
      : { duration: 0.6, ease: EASE, delay }

  return (
    <div className="noplan-root">
      {/* ── Greeting ribbon — only renders for returning users, mirrors the
            ActiveDashboard pattern so the loyalty ledger stays visible at
            exactly the moment we're asking the user to come back. ── */}
      {isReturning && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={t(0)}
          style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 500, color: S.fgMuted }}>
            Welcome back
            {firstName && firstName !== userEmail.split('@')[0] && (
              <>, <strong style={{ color: S.fg, fontWeight: 700 }}>{firstName}</strong></>
            )}
            .
          </div>
          {totalDelivered >= 1 && (
            <div style={{ fontFamily: BODY, fontSize: 12, color: S.fgSub, lineHeight: 1.5 }}>
              <strong style={{ color: S.fg, fontWeight: 700 }}>{totalDelivered}</strong> dinner{totalDelivered === 1 ? '' : 's'} with us
              {memberSinceText && <> · since {memberSinceText}</>}
              {lifetimeSavingsValue && lifetimeSavingsValue.saved > 0 && (
                <> · <strong style={{ color: S.fg, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>AED {formatSavedAmount(lifetimeSavingsValue.saved)}</strong> below ordering in</>
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
      )}

      {/* ── Banner stack — gates and wrap nudges sit BELOW the greeting
            (the greeting always owns the top of the page) but above the
            hero so they're still read before the plan picker. ── */}
      {banners}

      {/* ── Hero card — light TIER1 surface (matches the rest of the dashboard).
            Two-zone grid: copy left, illustration right. Stacks vertically on
            mobile so the headline is never compromised. Wrapped in its own
            position:relative box so IntakePausedGate can frost exactly this
            block (the actionable area) without covering the past-plans
            reference section below it — same idiom as the plan grid's own
            gate wrapper in PlanClient. ── */}
      <div style={{ position: 'relative' }}>
        {intake.paused && (
          <IntakePausedGate
            headline={intake.headline}
            body={intake.body}
            creditAed={intake.creditAed}
            alreadyJoined={intake.alreadyJoined}
          />
        )}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={t(0.05)}
          style={{
            ...TIER1,
            padding: 'clamp(28px, 4vw, 56px)',
            borderRadius: 24,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
        {/* Faint grid wash — same DNA as before, but tuned down for the light
            surface so it reads as texture, not pattern. */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5, pointerEvents: 'none', color: 'var(--ds-fg)' }} aria-hidden>
          <defs>
            <pattern id="noplan-grid-light" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#noplan-grid-light)" />
        </svg>

        <div className="noplan-grid">
          {/* ── Copy column ─────────────────────────────────────────── */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start', minWidth: 0 }}>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={t(0.15)}>
              <Eyebrow color={OG}>{eyebrow}</Eyebrow>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t(0.25)}
              style={{
                margin: 0,
                fontFamily: BODY,
                fontSize: 'clamp(36px, 5.4vw, 64px)',
                fontWeight: 700,
                color: S.fg,
                letterSpacing: '-0.02em',
                lineHeight: 1.04,
                textWrap: 'balance' as React.CSSProperties['textWrap'],
              }}
            >
              {headline}
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t(0.4)}
              style={{
                fontFamily: BODY,
                fontSize: 16,
                color: S.fgMuted,
                lineHeight: 1.65,
                maxWidth: 460,
              }}
            >
              {subline}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t(0.55)}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginTop: 6 }}
            >
              {purchaseGated ? (
                <span
                  title={gateTooltip}
                  style={{
                    ...btnStyle('primary'),
                    background: 'var(--ds-fg-tint)',
                    color: 'rgba(255,255,255,0.85)',
                    boxShadow: 'none',
                    cursor: 'not-allowed',
                  }}
                >
                  {isReturning ? `Renew ${lastPlanClean}` : 'Pick a plan'}
                  <ChevronRight size={16} strokeWidth={2.5} />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/explore-plans${renewParam}`)}
                  disabled={isPending}
                  className="btn-primary"
                  style={{
                    ...btnStyle('primary'),
                    opacity: isPending ? 0.85 : 1,
                    transition: 'opacity 150ms, transform 150ms, box-shadow 150ms, background 150ms',
                  }}
                >
                  {isPending ? <BtnSpinner /> : (isReturning ? `Renew ${lastPlanClean}` : 'Pick a plan')}
                  {!isPending && <ChevronRight size={16} strokeWidth={2.5} />}
                </button>
              )}
              {isReturning && (
                purchaseGated ? (
                  <span
                    title={gateTooltip}
                    style={{
                      fontFamily: BODY,
                      fontSize: 13,
                      fontWeight: 600,
                      color: S.fgFaint,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      padding: '12px 6px',
                      cursor: 'not-allowed',
                    }}
                  >
                    Browse all plans
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard/explore-plans')}
                    disabled={isPending}
                    style={{
                      fontFamily: BODY,
                      fontSize: 13,
                      fontWeight: 600,
                      color: isPending ? S.fgFaint : S.fgMuted,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      padding: '12px 6px',
                      borderBottom: `1px solid transparent`,
                      transition: 'color 150ms, border-color 150ms',
                      background: 'transparent',
                      border: 'none',
                      cursor: isPending ? 'default' : 'pointer',
                    }}
                    className="noplan-secondary-link"
                  >
                    {isPending ? <BtnSpinner /> : 'Browse all plans'}
                  </button>
                )
              )}
            </motion.div>
          </div>

          {/* ── Illustration column ─────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={t(0.4)}
            aria-hidden
            className="noplan-art"
            style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <OrbitMark spin={!prefersReducedMotion} />
          </motion.div>
        </div>
        </motion.div>
      </div>

      {/* ── Past plans — same layout as /plan so the user reads identical
            structure across surfaces. Compact reference grid; tiles are
            non-interactive on purpose (history → /dashboard/history). ── */}
      {endedPlans.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={t(0.7)}
          style={{ marginTop: 32 }}
        >
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eyebrow>Past plans</Eyebrow>
            <div style={{ flex: 1, height: 1, background: S.border }} />
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, 220px)',
            gap: 10,
          }}>
            {endedPlans.map(s => (
              <div key={s.id} style={{ ...TIER3, padding: '12px 14px', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: BODY, fontSize: 13, fontWeight: 700, color: S.fg }}>
                    <PlanGlyph planName={s.plan_name} size={13} color="currentColor" />
                    {cleanPlanName(s.plan_name)}
                  </div>
                  <StatusDot status="Ended" />
                </div>
                <div style={{ fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, fontFeatureSettings: '"tnum"' }}>
                  {fmt(s.start_date)} → {fmt(s.end_date)}
                </div>
                <div style={{ fontFamily: BODY, fontSize: 11.5, fontWeight: 600, color: S.fgMuted, fontFeatureSettings: '"tnum"' }}>
                  {s.delivered_meals}/{s.total_meals} meals
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <style jsx>{`
        .noplan-root {
          font-family: ${BODY};
          color: var(--ds-fg);
        }
        .noplan-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
          gap: clamp(24px, 4vw, 56px);
          align-items: center;
        }
        /* 768 = the app-wide mobile boundary (was 720 — the only surface on
           a non-standard breakpoint, leaving 720–768 in a half-mobile state).
           NOTE: .noplan-art sits on a motion.div and .noplan-secondary-link
           on a <Link> — styled-jsx only attaches its scope hash to plain DOM
           elements, so scoped rules NEVER match components. :global() opts
           out of scoping; without it these rules are dead CSS (the art used
           to render below the copy on phones because order:-1 never fired). */
        @media (max-width: 768px) {
          .noplan-grid {
            grid-template-columns: 1fr;
            gap: 28px;
          }
          :global(.noplan-art) {
            order: -1;
            max-width: 220px;
            margin-inline: auto;
          }
        }
        :global(.noplan-secondary-link:hover) {
          color: var(--ds-fg) !important;
          border-color: var(--ds-border-strong) !important;
        }
      `}</style>
    </div>
  )
}

/**
 * Brand mark — "The Orbit". Two concentric rings on a soft warm halo, with
 * a single bright orange dot riding the inner ring. The orbit IS the
 * narrative: the meal returns at the same point every day. Service shape,
 * not food shape.
 *
 *   • Outer ring: dashed brand-grid wrapped into a circle (low-opacity NV)
 *   • Inner ring: hairline solid (the dot's track)
 *   • Centre seed: a small navy dot that anchors the eye
 *   • Orbiting dot: bright OG with soft halo + inner highlight
 *
 * Animation is SMIL (<animateTransform>) rather than CSS keyframes: the
 * previous CSS approach (transform-box: view-box + scoped keyframes in a
 * styled-jsx block inside the SVG) rendered a static dot on iOS Safari.
 * SMIL rotation around an explicit centre point runs identically in every
 * engine and needs no transform-box/transform-origin support. Reduced
 * motion is honoured by the caller via the `spin` prop (framer's
 * useReducedMotion) — falls back to a static dot at the 3 o'clock rest
 * position.
 */
function OrbitMark({ spin = true }: { spin?: boolean }) {
  return (
    <svg
      viewBox="0 0 280 280"
      width="100%"
      style={{ maxWidth: 320, display: 'block', color: 'var(--ds-fg)' }}
      role="img"
      aria-label="A meal arriving on schedule, every day"
    >
      <defs>
        <radialGradient id="orbit-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor={OG3} stopOpacity="0.20" />
          <stop offset="55%" stopColor={OG}  stopOpacity="0.05" />
          <stop offset="100%" stopColor={OG} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft warm halo — gives the rings something to sit on without
          weighing them down. Pure atmosphere; the eye reads it as warmth
          before reading the geometry. */}
      <circle cx="140" cy="140" r="132" fill="url(#orbit-halo)" />

      {/* Outer ring — dashed circle, the brand grid wrapped. Reads as
          texture at a glance, structure on a closer look. */}
      <circle
        cx="140" cy="140" r="110"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="1.5"
        strokeDasharray="3 7"
        strokeLinecap="round"
      />

      {/* Inner ring — the dot's track. Hairline, solid, slightly stronger
          opacity so the eye understands "the orbit lives here". */}
      <circle
        cx="140" cy="140" r="80"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.30"
        strokeWidth="1.25"
      />

      {/* Centre seed — anchors the composition; without it the rings feel
          unmoored. Tiny enough to read as origin, not as content. */}
      <circle cx="140" cy="140" r="3.5" fill="currentColor" fillOpacity="0.55" />

      {/* Orbiting group — rotates around (140, 140) at 14s/loop via SMIL.
          The dot starts at 3 o'clock and orbits clockwise. */}
      <g>
        {spin && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 140 140"
            to="360 140 140"
            dur="14s"
            repeatCount="indefinite"
          />
        )}
        {/* Trailing halo — softens the leading edge, gives the dot
            radiance without a literal glow filter. */}
        <circle cx="220" cy="140" r="22" fill={OG} fillOpacity="0.18" />
        {/* The meal — the focal punctuation of the whole illustration. */}
        <circle cx="220" cy="140" r="11" fill={OG} />
        {/* Inner highlight — gives the dot weight + a hint of dimension
            so it reads as a body, not a flat sticker. */}
        <circle cx="217" cy="137" r="3.5" fill="#fff" fillOpacity="0.55" />
      </g>
    </svg>
  )
}
