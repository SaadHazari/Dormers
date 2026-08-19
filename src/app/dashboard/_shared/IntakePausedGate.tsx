'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Gift, Check } from 'lucide-react'
import { OG, OG_DEEP, BODY, S } from './tokens'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import { deriveJoinOutcome, intakeCreditDisplay, intakeNextSteps, REOPEN_MESSAGE_PROMISE } from './intake-join-outcome'

interface IntakePausedGateProps {
  headline: string
  body: string
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
}

/**
 * Frosted gate rendered over a plan surface during a seasonal intake pause.
 * Sibling of ProfileGateOverlay — same absolute-inset frosted backdrop and
 * sticky card, so the two read as one family. It differs in three ways:
 * it animates in via framer-motion, it carries a one-tap action (join the
 * early-access list), and it transforms in place into a confirmed state on
 * success instead of linking away.
 *
 * No date, no countdown, no "back soon" — the business genuinely does not
 * know the reopening date, so the only honest promise is "we will message
 * you." No queue position or count is ever shown either: a low number reads
 * as unwanted, a high one as hopeless.
 */
export function IntakePausedGate({ headline, body, creditAed, alreadyJoined, waitlistCreditAed }: IntakePausedGateProps) {
  const [joined, setJoined] = useState(alreadyJoined)
  // The number shown once joined is always an ACTUAL minted amount, never
  // the prospective `creditAed` prop — starts from the server-computed
  // ledger value (waitlistCreditAed) for a customer who was already on the
  // list before this render, then gets overwritten with the action's own
  // result the moment a fresh tap resolves. Same rule for the message: a
  // fresh tap can come back with "we will sort your credit" when the mint
  // failed, and that message must win over any credit-amount line.
  const [confirmedCreditAed, setConfirmedCreditAed] = useState(waitlistCreditAed)
  const [confirmedMessage, setConfirmedMessage] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const prefersReducedMotion = useReducedMotion()
  const router = useRouter()

  const handleJoin = () => {
    setJoinError(null)
    startTransition(async () => {
      const result = await joinIntakeWaitlist()
      const outcome = deriveJoinOutcome(result)
      if (outcome.joined) {
        setJoined(true)
        setConfirmedCreditAed(outcome.creditAed ?? 0)
        setConfirmedMessage(outcome.message)
        // The Credit Wallet is server-rendered in dashboard/layout.tsx — without
        // this refresh a customer who just joined sees no wallet in the sidebar
        // until their next navigation.
        router.refresh()
      } else {
        // Silence is never acceptable on the most important tap in this
        // flow — surface the real reason and leave the button enabled so
        // the customer can retry.
        setJoinError(outcome.error)
      }
    })
  }

  // alreadyJoined skips the entry animation outright (this is a repeat visit,
  // not a fresh encounter). Otherwise fade + rise in, unless reduced motion
  // is requested — then the transform is dropped but the fade still plays,
  // so the message still arrives, just without movement.
  const initial = alreadyJoined
    ? false
    : prefersReducedMotion
      ? { opacity: 0 }
      : { opacity: 0, y: 8 }

  return (
    <div style={{
      position: 'absolute', inset: -8, zIndex: 5,
      borderRadius: 20,
      background: 'var(--ds-overlay)',
      backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 18px',
    }}>
      {/* Sticky so the card stays in view while the (blurred) stack scrolls
          past on mobile — the gate message is never below the fold. */}
      <motion.div
        initial={initial}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        style={{
          position: 'sticky', top: 96,
          maxWidth: 380, width: '100%',
          background: 'var(--ds-content-bg)',
          border: '1px solid var(--ds-og-border-strong)',
          borderRadius: 18,
          boxShadow: 'var(--ds-shadow-modal)',
          padding: '26px 24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          textAlign: 'center',
        }}
      >
        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
          {joined ? (
            <>
              <span style={{
                width: 42, height: 42, borderRadius: '50%',
                background: 'var(--ds-og-wash-strong)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: OG,
              }}>
                <Check size={20} strokeWidth={2.4} />
              </span>
              <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
                You are on our waitlist.
              </div>
              {(() => {
                const display = intakeCreditDisplay(confirmedCreditAed, confirmedMessage)
                return display.hasCredit ? (
                  <div style={{ fontFamily: BODY, fontSize: 19, fontWeight: 800, color: OG_DEEP, lineHeight: 1.3, letterSpacing: '-0.01em', fontFeatureSettings: '"tnum"' }}>
                    {display.text}
                  </div>
                ) : (
                  <div style={{ fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.55 }}>
                    {display.text}
                  </div>
                )
              })()}
              {/* Owner-locked close of the loop: what the money does first,
                  how they hear from us second. Never end a confirmation
                  open-ended — see intakeNextSteps. The reopen promise gets
                  full-strength ink (owner call, 2026-08-19): it is the
                  release condition for the pause, not a footnote, so it
                  never blends into the muted mechanics line above it. */}
              <div style={{ fontFamily: BODY, fontSize: 13, color: S.fgMuted, lineHeight: 1.55 }}>
                {intakeNextSteps(confirmedCreditAed).map(line => (
                  <div key={line} style={line === REOPEN_MESSAGE_PROMISE ? { color: S.fg, fontWeight: 600 } : undefined}>{line}</div>
                ))}
              </div>
              <Link
                href="/dashboard/menu"
                style={{
                  marginTop: 4,
                  fontFamily: BODY, fontSize: 13, fontWeight: 600, color: OG,
                  textDecoration: 'underline', textUnderlineOffset: 3,
                }}
              >
                See what you will be eating
              </Link>
            </>
          ) : (
            <>
              <span style={{
                width: 42, height: 42, borderRadius: '50%',
                background: 'var(--ds-og-wash-strong)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: OG,
              }}>
                <Gift size={20} strokeWidth={2.4} />
              </span>
              <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
                {headline}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.55 }}>
                {body}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 19, fontWeight: 800, color: OG_DEEP, lineHeight: 1.3, letterSpacing: '-0.01em', fontFeatureSettings: '"tnum"' }}>
                AED {creditAed} is waiting in your account
              </div>
              {/* The reopen promise stands on its own line in full-strength
                  ink (owner call, 2026-08-19) — quieter than the credit
                  figure that drives the tap, but never buried in the muted
                  body above. It is what unblocks buying, so it reads as a
                  commitment, not an aside. */}
              <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: S.fg, lineHeight: 1.5 }}>
                {REOPEN_MESSAGE_PROMISE}
              </div>
              <button
                type="button"
                onClick={handleJoin}
                disabled={isPending}
                style={{
                  marginTop: 4, minHeight: 44,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '12px 22px',
                  background: OG, color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-pill)',
                  fontFamily: BODY, fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                  boxShadow: '0 4px 12px rgba(245,127,32,0.40)',
                  opacity: isPending ? 0.75 : 1,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {isPending ? 'Saving your spot…' : 'Save my spot'}
              </button>
              {joinError && (
                <div style={{ fontFamily: BODY, fontSize: 12, color: 'var(--ds-danger-fg)', lineHeight: 1.5 }}>
                  {joinError}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
