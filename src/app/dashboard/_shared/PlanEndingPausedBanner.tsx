'use client'

import { useState, useTransition, type ReactElement } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { CalendarClock, Check, ChevronDown } from 'lucide-react'
import { OG, OG_DEEP, NV, BODY, S, TIER1 } from './tokens'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import { deriveJoinOutcome, intakeCreditDisplay, intakeNextSteps, REOPEN_MESSAGE_PROMISE } from './intake-join-outcome'
import { planEndingHeadline, saveSpotButtonLabel } from './plan-ending-copy'
import { FoundingMemberArrival } from './FoundingMemberArrival'

interface PlanEndingPausedBannerProps {
  daysRemaining: number
  /** Prospective per-preference amount from the CURRENT intake_settings row.
   *  Correct ONLY for the pre-tap offer below — nothing has been minted yet,
   *  so this is a promise, not a balance. Never used once `joined` is true. */
  creditAed: number
  alreadyJoined: boolean
  /** Actual minted credit already sitting in this customer's ledger
   *  (IntakeGateState.waitlistCreditAed) — the real number for the
   *  already-joined confirmed state. Can differ from `creditAed` if an
   *  admin changed the credit amounts after this customer joined. */
  waitlistCreditAed: number
  /** Customer's first name (IntakeGateState.firstName) for the arrival place
   *  card. Empty string is fine — the card renders a neutral fallback. */
  firstName?: string
  /** Mobile home mounts this inside the orange sun canopy, where the default
   *  translucent-orange-wash shell disappears into the ground (every layer of
   *  it is a low-alpha orange designed for cream). `onSun` swaps the SHELL
   *  only — opaque cream card, no icon column, tighter frame — while the copy
   *  and behavior stay identical to desktop. */
  onSun?: boolean
}

/**
 * Spec §6.4 "plan ending during a pause" — shown on the dashboard home when
 * the customer's active plan ends within the same 7-day window PlanClient's
 * renewEligible uses, AND intake is paused. Without it a loyal customer
 * discovers the pause by reaching checkout and finding it shut; this closes
 * that silent flow break.
 *
 * Sibling of IntakePausedGate — same one-tap join() and in-place transform
 * to a confirmed state, so the two read as one product, not two
 * implementations. Differs only in shell: an inline full-width card
 * (OutOfZoneBanner's pattern) instead of a frosted overlay, because this
 * surface isn't blocking anything — the customer's current plan keeps
 * running right up to end_date.
 *
 * Copy contract (owner-locked 2026-08-18): what's happening ("Your plan ends
 * …"), why ("New plans are paused between semesters" — "New" is load-bearing,
 * without it a customer reads his RUNNING plan as paused), and what he can do
 * and when ("You can renew the moment we reopen"). Never what he can't do —
 * no "will not roll over". The reward rides the button itself.
 *
 * No date, no countdown, no "back soon", no reopening estimate — same
 * governing rule as the gate. The caller (ActiveDashboard) decides WHETHER
 * to mount this (intake.paused AND within the 7-day window); the guard below
 * is a defensive belt-and-suspenders check on daysRemaining alone, since the
 * copy is written specifically for that window.
 */
export function PlanEndingPausedBanner({ daysRemaining, creditAed, alreadyJoined, waitlistCreditAed, firstName = '', onSun = false }: PlanEndingPausedBannerProps): ReactElement | null {
  const [joined, setJoined] = useState(alreadyJoined)
  // Always the ACTUAL minted amount once joined — never the prospective
  // `creditAed` prop. Starts from the server-computed ledger value for a
  // customer who was already on the list, then gets overwritten with the
  // action's own result the moment a fresh tap resolves. Same rule for the
  // message: a failed mint reports "we will sort your credit," which must
  // win over any credit-amount line.
  const [confirmedCreditAed, setConfirmedCreditAed] = useState(waitlistCreditAed)
  const [confirmedMessage, setConfirmedMessage] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const prefersReducedMotion = useReducedMotion()
  // Joined-state collapse (owner call, 2026-08-19): a returning customer who
  // already saved a spot gets the two-line version — status + credit — with
  // the mechanics and reopen-promise lines behind a chevron, because on the
  // home surface this banner is a standing reminder, not news. A FRESH join
  // starts expanded: the payoff lines are the reward for the tap and must
  // not be born hidden. (alreadyJoined=false at mount means any joined
  // render this component ever shows came from a fresh tap.)
  const [expanded, setExpanded] = useState(!alreadyJoined)
  // Fires only on a fresh tap in this session — a returning joined customer
  // gets the collapsed banner above, never a re-celebration.
  const [showArrival, setShowArrival] = useState(false)

  const handleJoin = () => {
    setJoinError(null)
    startTransition(async () => {
      const result = await joinIntakeWaitlist()
      const outcome = deriveJoinOutcome(result)
      if (outcome.joined) {
        setJoined(true)
        setConfirmedCreditAed(outcome.creditAed ?? 0)
        setConfirmedMessage(outcome.message)
        setShowArrival(true)
      } else {
        // Silence is never acceptable on the most important tap in this
        // flow — surface the real reason and leave the button enabled so
        // the customer can retry.
        setJoinError(outcome.error)
      }
    })
  }

  if (daysRemaining > 7 || daysRemaining < 0) return null

  const headline = planEndingHeadline(daysRemaining)

  return (
    <>
    {showArrival && (
      <FoundingMemberArrival
        firstName={firstName}
        creditAed={confirmedCreditAed}
        message={confirmedMessage}
        onClose={() => setShowArrival(false)}
      />
    )}
    <div onClick={joined ? () => setExpanded(v => !v) : undefined} style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap',
      cursor: joined ? 'pointer' : undefined,
      ...(onSun
        ? {
            // TIER1 — the system's warm-cream card surface, NOT white: on the
            // orange canopy a whiter fill reads sharp and off-brand next to
            // the hero's warm card. The canopy arc tucks BEHIND this card
            // (MobileHome anchors --sun-cap to it when mounted), so the card
            // overlaps the sun's edge exactly like the hero does on normal
            // days. No marginBottom: mhome-root's own gap handles spacing.
            ...TIER1,
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px', gap: 12,
          }
        : {
            marginBottom: 18,
            padding: '14px 18px', gap: 14,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--ds-og-wash-strong)',
            border: '1px solid var(--ds-og-border-strong)',
          }),
    }}>
      {/* The icon column is a cream-shell affordance. On the sun it was a
          ghost (brand-orange glyph on orange ground) that only squeezed the
          text into extra wraps — the onSun shell drops it entirely and the
          joined state carries a small inline check instead. */}
      {!onSun && (
        <div style={{
          width: 36, height: 36, flexShrink: 0, borderRadius: '50%',
          background: 'var(--ds-og-wash)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: OG,
        }}>
          {joined ? <Check size={18} strokeWidth={2.4} /> : <CalendarClock size={18} strokeWidth={2.2} />}
        </div>
      )}

      {/* Real flex-basis so the CTA wraps below on phones — see OutOfZoneBanner. */}
      <AnimatePresence mode="wait" initial={false}>
        {joined ? (
          <motion.div
            key="joined"
            initial={alreadyJoined ? false : (prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 })}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.15 : 0.24 }}
            style={{ flex: '1 1 200px', minWidth: 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
              {onSun && <Check size={15} strokeWidth={2.8} color={OG} aria-hidden />}
              You are on our waitlist.
            </div>
            {(() => {
              const display = intakeCreditDisplay(confirmedCreditAed, confirmedMessage)
              return display.hasCredit ? (
                <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 13, color: OG_DEEP, fontWeight: 700, lineHeight: 1.5, fontFeatureSettings: '"tnum"' }}>
                  {display.text}.
                </div>
              ) : (
                <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>
                  {display.text}
                </div>
              )
            })()}
            {/* Owner-locked close of the loop: what the money does first,
                how they hear from us second — see intakeNextSteps. The
                reopen promise gets full-strength ink (owner call,
                2026-08-19): it is the release condition for the pause and
                must not blend into the muted mechanics line. No extra words
                on this tight surface — elevation is ink only. Behind the
                chevron for returning customers — see `expanded` above. */}
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  key="details"
                  initial={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0.12 : 0.22 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>
                    {intakeNextSteps(confirmedCreditAed).map(line => (
                      <div key={line} style={line === REOPEN_MESSAGE_PROMISE ? { color: S.fg, fontWeight: 600 } : undefined}>{line}</div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="pending"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.15 : 0.24 }}
            style={{ flex: '1 1 200px', minWidth: 0 }}
          >
            <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
              {headline.lead}
              <span style={{ color: OG_DEEP, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>
                {headline.emphasis}
              </span>.
            </div>
            <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>
              New plans are paused between semesters. You can renew the moment we reopen.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The chevron is the visible affordance; the whole row toggles too
          (the joined banner has no other interactive element to fight).
          stopPropagation so a chevron tap doesn't bubble into the row's
          own toggle and cancel itself out. */}
      {joined && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide waitlist details' : 'Show waitlist details'}
          style={{
            background: 'none', border: 'none', color: S.fgMuted,
            cursor: 'pointer', flexShrink: 0, padding: 8, margin: -4,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronDown
            size={18}
            strokeWidth={2.4}
            aria-hidden
            style={{
              transition: prefersReducedMotion ? undefined : 'transform 200ms',
              transform: expanded ? 'rotate(180deg)' : 'none',
            }}
          />
        </button>
      )}

      {!joined && (
        <button
          type="button"
          onClick={handleJoin}
          disabled={isPending}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            minHeight: 44,
            padding: '10px 18px',
            border: 'none',
            borderRadius: 'var(--radius-pill)',
            fontFamily: BODY, fontSize: 12, fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            // On the sun: the quiet navy pill the mobile kit already uses for
            // its modal actions (kit.tsx) — an orange-glow primary next to
            // the giant orange canopy vibrates and screams. Cream label per
            // the no-sharp-white-on-navy rule. On cream desktop the system
            // primary (orange + glow) stays correct.
            ...(onSun
              ? { background: NV, color: '#f5f0e8', boxShadow: 'none' }
              : { background: OG, color: '#fff', boxShadow: '0 4px 12px rgba(245,127,32,0.40)' }),
            opacity: isPending ? 0.75 : 1,
            cursor: isPending ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {isPending ? 'Saving…' : saveSpotButtonLabel(creditAed)}
        </button>
      )}
      {joinError && (
        <div style={{ flexBasis: '100%', fontFamily: BODY, fontSize: 12, color: 'var(--ds-danger-fg)', lineHeight: 1.5 }}>
          {joinError}
        </div>
      )}
    </div>
    </>
  )
}
