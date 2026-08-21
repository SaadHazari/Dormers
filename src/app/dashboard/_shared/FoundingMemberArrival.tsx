'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Bookmark } from 'lucide-react'
import { OG, OG_DEEP, NV, BODY, TIER_POP_TEXT } from './tokens'
import { intakeCreditDisplay, creditMechanicsLine, REOPEN_MESSAGE_PROMISE } from './intake-join-outcome'

interface FoundingMemberArrivalProps {
  /** The customer's first name. Empty string drops the name entirely rather
   *  than printing a placeholder — a place card reading "there" is worse than
   *  a place card reading nothing. */
  firstName: string
  /** The ACTUAL minted amount from the join action's own result, never the
   *  prospective per-preference prop. Zero is a legitimate value (the spot
   *  saved but the credit insert failed) and renders a card with no money on
   *  it — see intakeCreditDisplay, which owns that rule. */
  creditAed: number
  /** The join action's own message, used verbatim whenever there is no credit
   *  to name. Same precedence rule as every other joined surface. */
  message: string | null
  onClose: () => void
}

/**
 * The arrival moment — shown once, immediately, when someone saves a spot on
 * the seasonal waitlist. Not a state, a response: it mounts as the direct
 * result of a tap and is gone when dismissed. Nothing persists it, because a
 * moment that reappears on the next visit is not a moment.
 *
 * Why this exists as its own screen. The three join surfaces (IntakePausedGate,
 * PlanEndingPausedBanner, IntakePauseTakeover) each transform in place into a
 * confirmed state, and that is the correct RETURNING state — a customer who
 * already joined should not be re-celebrated on every page load. But the first
 * tap deserves more than a 380px card swapping its contents. It is the largest
 * commitment a cold lead makes: they have just handed over an email, a verified
 * phone number, a dorm and their food restrictions in order to buy dinner, and
 * they cannot buy dinner. They have agreed to wait an unknown number of weeks.
 * There is no useful next action, so the only job of this screen is to make the
 * wait feel like a position they hold.
 *
 * All three surfaces mount THIS component on a successful join, so the moment
 * is authored once and cannot drift into three celebrations.
 *
 * Design intent — the kitchen before service: pass lamp on, tables set, nobody
 * seated yet. Ground and type come from the IntakePauseTakeover /
 * CheckoutSuccessTakeover family (same navy gradient, same cream-gradient H1,
 * same pill CTAs) so this reads as a fourth member of that family rather than a
 * new pattern. It departs from them in exactly one place, deliberately: the
 * place card.
 *
 * The place card is the signature. A TIER1 cream surface sitting on the navy,
 * carrying the customer's own name in navy ink, with the credit held beneath
 * it. A table setting with your name on it before the doors open. It is also
 * the only personal surface anywhere in this flow.
 *
 * Three defaults this screen deliberately rejects:
 *
 * 1. A tick and the word "Success". Nothing succeeded and nothing was bought.
 *    The mark is a bookmark — a thing that holds a place.
 * 2. Confetti. It is already this codebase's language for checkout success,
 *    Dorm Wars and the monthly wrap. Firing it here would claim a purchase
 *    happened, and would cheapen the real one. The celebration is scale and
 *    stillness instead: a slow rise and a lamp bloom behind the card.
 * 3. A queue position or list count. Owner decision, and the same rule the
 *    gate has carried since it was built — a low number reads as unwanted, a
 *    high one as hopeless. Standing replaces rank, and standing does not decay
 *    as the list grows.
 *
 * Money copy is NOT authored here. Every figure and every closing line comes
 * from intake-join-outcome.ts, the module that exists because this exact class
 * of screen once promised money that was never minted.
 */
export function FoundingMemberArrival({ firstName, creditAed, message, onClose }: FoundingMemberArrivalProps) {
  const prefersReducedMotion = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const display = intakeCreditDisplay(creditAed, message)
  const mechanics = creditMechanicsLine(creditAed)

  // Focus the CONTAINER, not a control. A keyboard or screen-reader user has to
  // land inside the dialog rather than behind it on the (now inert) surface, but
  // focusing the Close button would paint a ring on the exit — the loudest thing
  // on screen pointing at the way out of a moment we just built. Tab from here
  // reaches the primary CTA first. The existing takeovers predate this; new
  // full-screen surfaces should not repeat that gap.
  useEffect(() => {
    rootRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rise = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="founding-arrival-title"
      // ds-overlay-root gives fixed overlays the brand focus ring; without it
      // controls in here fall back to the browser's blue default.
      className="ds-overlay-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        // Same ground as IntakePauseTakeover — one navy room for every
        // state-change moment in the product.
        background: `
          radial-gradient(ellipse 90% 60% at 92% -8%, rgba(245,127,32,0.13) 0%, transparent 55%),
          radial-gradient(ellipse 70% 50% at 8% 108%, rgba(255,170,0,0.07) 0%, transparent 55%),
          linear-gradient(135deg, #1c4255 0%, #0a1c2a 55%, #061421 100%)
        `,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px clamp(20px, 4vw, 48px)',
        fontFamily: BODY,
        color: TIER_POP_TEXT.primary,
        overflow: 'auto',
      }}
    >
      <motion.div
        initial={rise}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.15 : 0.32 }}
        style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}
      >
        {/* The pass lamp. Family shape (72px orange-gradient disc), new mark:
            a bookmark holds a place, a tick says finished. */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${OG} 0%, #ffaa00 100%)`,
            // Softer than the family's 0.55: on this screen the disc is the
            // announcement, not the subject. The place card has to win.
            boxShadow: '0 10px 32px rgba(245,127,32,0.42)',
            marginBottom: 16,
          }}
        >
          <Bookmark size={28} strokeWidth={2.4} color="#fff" fill="#fff" />
        </div>

        {/* Standing, not rank. Sits above the headline because it is the thing
            being conferred; the headline is only its announcement. */}
        <div style={{ marginBottom: 12 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '5px 13px',
              borderRadius: 'var(--radius-pill)',
              // No fill. Any orange at low alpha over this navy resolves to a
              // dull olive-brown, which read as a disabled chip in the first two
              // builds. An outline and warm ink make it a stamp instead — and a
              // stamp is the right object for something that was conferred.
              background: 'transparent',
              border: '1px solid rgba(255,170,0,0.50)',
              fontFamily: BODY,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#ffd9a0',
            }}
          >
            Founding member
          </span>
        </div>

        <h1
          id="founding-arrival-title"
          style={{
            margin: '0 0 8px',
            fontFamily: BODY,
            fontSize: 'clamp(30px, 4.6vw, 48px)',
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            backgroundImage: 'linear-gradient(180deg, #fdf8ef 0%, #f0e6cf 55%, #d6c8a8 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
            filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.25))',
          }}
        >
          You&rsquo;re in.
        </h1>

        {/* What the standing actually means, in facts a student can check. No
            claim about hearing "before anyone else" — the reopen broadcast also
            goes to lapsed customers, so that sentence would be false. */}
        <p
          style={{
            margin: '0 auto 28px',
            fontFamily: BODY,
            fontSize: 'clamp(14px, 1.5vw, 16px)',
            fontWeight: 400,
            lineHeight: 1.55,
            color: 'rgba(245,238,222,0.72)',
            maxWidth: 380,
          }}
        >
          You are on our waitlist before the kitchen restarts this semester. We
          cook once enough of you are back on campus.
        </p>

        {/* ── The place card ─────────────────────────────────────────────────
            The signature. A cream TIER1 surface on the navy, carrying their own
            name in navy ink — the only navy-on-cream object on this screen, so
            it reads as a physical thing set down on the table rather than
            another panel. Delayed behind the column so the eye lands on it
            last and rests there. */}
        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.15 : 0.42, delay: prefersReducedMotion ? 0 : 0.12 }}
          style={{ position: 'relative', marginBottom: 24 }}
        >
          {/* Lamp bloom. The celebration, in place of particles: warm light
              gathering behind the card rather than thrown across the screen. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: '-34px -18px',
              borderRadius: 36,
              background: 'radial-gradient(ellipse 72% 92% at 50% 50%, rgba(255,170,0,0.30) 0%, transparent 72%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'relative',
              background: '#fcf8ee',
              border: '1px solid rgba(9,24,37,0.10)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 18px 44px rgba(0,0,0,0.34), 0 2px 6px rgba(0,0,0,0.20)',
              padding: 20,
              textAlign: 'left',
            }}
          >
            <div
              style={{
                fontFamily: BODY,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(9,24,37,0.55)',
                marginBottom: 4,
              }}
            >
              Seat held for
            </div>
            <div
              style={{
                fontFamily: BODY,
                fontSize: 28,
                fontWeight: 800,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
                color: NV,
                // A long name must not blow the card open on a 375px screen.
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {firstName || 'Your seat'}
            </div>

            {/* Short rule, not a full-width divider — a place card is scored,
                not sectioned. Full width made the card read as a two-row panel. */}
            <div style={{ height: 1, width: 44, background: 'rgba(9,24,37,0.18)', margin: '12px 0' }} />

            {/* Money, or honestly no money. intakeCreditDisplay owns which. */}
            {display.hasCredit ? (
              <div
                style={{
                  fontFamily: BODY,
                  fontSize: 16,
                  fontWeight: 800,
                  lineHeight: 1.25,
                  letterSpacing: '-0.01em',
                  color: OG_DEEP,
                  fontFeatureSettings: '"tnum"',
                }}
              >
                AED {display.creditAed} waiting
              </div>
            ) : (
              <div style={{ fontFamily: BODY, fontSize: 13, lineHeight: 1.55, color: 'rgba(9,24,37,0.62)' }}>
                {display.text}
              </div>
            )}
          </div>
        </motion.div>

        {/* Owner-locked order (2026-08-18): what the money does first, how they
            hear from us second. Both strings come from the shared module. */}
        {mechanics && (
          <p style={{ margin: '0 auto 8px', maxWidth: 380, fontSize: 13, lineHeight: '20px', color: TIER_POP_TEXT.muted }}>
            {mechanics}
          </p>
        )}
        <p
          style={{
            margin: '0 auto 24px',
            maxWidth: 380,
            fontFamily: BODY,
            fontSize: 'clamp(15px, 2vw, 18px)',
            fontWeight: 700,
            lineHeight: 1.4,
            letterSpacing: '-0.01em',
            color: '#fbe5b5',
          }}
        >
          {REOPEN_MESSAGE_PROMISE}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {/* There is nothing to buy, so the one warm action left is food they
              can look at. Same destination the gate's confirmed state offers,
              promoted here from a text link to the primary control. */}
          <Link
            href="/dashboard/menu"
            onClick={onClose}
            className="ds-overlay-cta"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              minHeight: 48, padding: '14px 32px',
              borderRadius: 'var(--radius-pill)', border: 0,
              background: OG, color: '#fff',
              fontFamily: BODY, fontSize: 13, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              textDecoration: 'none',
              boxShadow: '0 8px 28px rgba(245,127,32,0.50)',
            }}
          >
            See what you&rsquo;ll be eating
            <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>&rarr;</span>
          </Link>

          {/* A screen whose only exit moves you somewhere else is a trap — the
              same rule pause-takeover-actions.ts applies to the reopened
              takeover's "Maybe later". */}
          <button
            type="button"
            onClick={onClose}
            className="ds-overlay-ghost"
            style={{
              minHeight: 44, padding: '10px 24px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid rgba(245,240,232,0.28)',
              background: 'transparent', color: TIER_POP_TEXT.primary,
              fontFamily: BODY, fontSize: 12, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  )
}
