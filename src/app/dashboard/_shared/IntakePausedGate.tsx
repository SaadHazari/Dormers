'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Gift, Check } from 'lucide-react'
import { OG, OG_DEEP, BODY, S } from './tokens'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import { deriveJoinOutcome, intakeCreditDisplay, intakeNextSteps, REOPEN_MESSAGE_PROMISE } from './intake-join-outcome'
import { FoundingMemberArrival } from './FoundingMemberArrival'

interface IntakePausedGateProps {
  headline: string
  body: string
  /** Customer's first name (IntakeGateState.firstName) for the arrival place
   *  card. Empty string is fine — the card renders a neutral fallback. */
  firstName?: string
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
  /** How the gate claims its space. 'overlay' (default) floats it over the
   *  mount surface — correct wherever that surface is TALLER than the gate
   *  card (the desktop plan hero, the explore grid). 'stacked' makes it a
   *  grid item instead, for a `display:grid` wrapper that stacks gate and
   *  surface in one cell: the wrapper then sizes to whichever is taller, so
   *  a gate mounted over a short card pushes the next card down rather than
   *  painting over it (the mobile /plan empty state was 83px buried).
   *  'inline' drops the frosted backdrop entirely and renders the card as a
   *  normal in-flow hero — the "lights on, register closed" treatment: the
   *  surface below stays readable and the card leads it instead of hiding it. */
  variant?: 'overlay' | 'stacked' | 'inline'
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
export function IntakePausedGate({ headline, body, firstName = '', creditAed, alreadyJoined, waitlistCreditAed, variant = 'overlay' }: IntakePausedGateProps) {
  const [joined, setJoined] = useState(alreadyJoined)
  // The arrival moment fires ONLY on a fresh tap in this session, never for a
  // customer who was already joined at mount — that person gets the confirmed
  // card below, which is the correct returning state. See
  // FoundingMemberArrival's docblock for why the moment is not persisted.
  const [showArrival, setShowArrival] = useState(false)
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
        setShowArrival(true)
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

  // ── Inline variant: invitation → membership pass ─────────────────────────
  // The two states are opposite emotional moments and wear opposite
  // materials. The OFFER is a light invitation card (left-aligned, the AED
  // amount as the dominant ink, one saturated CTA). JOINED promotes the card
  // to the dark hero surface — in this design system the dark card means
  // "the thing you hold" (an active plan's hero), and a joined waitlister
  // holds something: a reserved spot and minted credit. The light→dark flip
  // on tap is the reward. Styles are documented copies from _mobile/kit
  // (this file serves desktop too, so it cannot import the mobile kit —
  // same copy precedent as MobilePlan's own header).
  if (variant === 'inline') {
    const cream = 'rgba(245,240,232,0.92)'
    const creamMuted = 'rgba(245,240,232,0.65)'
    // SectionTitle idiom appends the orange period — but the headline is
    // owner copy from the DB, so never double its own punctuation.
    const headlineDot = !/[.!?…]$/.test(headline.trim())
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
      <div aria-live="polite" style={{ display: 'contents' }}>
      {joined ? (
        // The membership pass — promoted to the dark hero surface (owner
        // call, 2026-09-08: navy over the sunlit alternative). The reserved
        // chip wears the kit's on-dark green with an outline check — the
        // confirmed "you're in" signal.
        <motion.section
          initial={initial}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          style={{
            position: 'relative', overflow: 'hidden',
            background: 'linear-gradient(150deg, #1f4456 0%, #0c1f2e 62%, #091825 100%)',
            borderRadius: 24, padding: 22,
            boxShadow: '0 10px 34px -12px rgba(9,24,37,0.55), 0 2px 6px rgba(9,24,37,0.18)',
            display: 'flex', flexDirection: 'column', gap: 15,
            fontFamily: BODY,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: creamMuted }}>Early access</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, background: 'rgba(29,138,48,0.16)', border: '1px solid rgba(29,138,48,0.4)', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7ee29a' }}>
              <Check size={11} strokeWidth={2.2} />
              Spot reserved
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: cream, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
            Your spot is saved{firstName ? `, ${firstName}` : ''}<span style={{ color: OG }}>.</span>
          </div>
          {(() => {
            const display = intakeCreditDisplay(confirmedCreditAed, confirmedMessage)
            return display.hasCredit ? (
              <div>
                <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.03em', color: OG, lineHeight: 0.95, fontFeatureSettings: '"tnum"' }}>AED {confirmedCreditAed}</span>
                <div style={{ marginTop: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: creamMuted }}>secured in your account</div>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: creamMuted, lineHeight: 1.55 }}>{display.text}</div>
            )
          })()}
          {/* Owner-locked close of the loop — the reopen promise keeps its
              full-strength ink on the dark surface too. */}
          <div style={{ fontSize: 12.5, color: creamMuted, lineHeight: 1.6 }}>
            {intakeNextSteps(confirmedCreditAed).map(line => (
              <div key={line} style={line === REOPEN_MESSAGE_PROMISE ? { color: cream, fontWeight: 600 } : undefined}>{line}</div>
            ))}
          </div>
          <Link
            href="/dashboard/menu"
            style={{
              width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '13px 16px', borderRadius: 999,
              background: 'rgba(237,232,218,0.10)', color: cream, border: '1px solid rgba(237,232,218,0.34)',
              fontFamily: BODY, fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', textDecoration: 'none',
            }}
          >
            See what you&rsquo;ll be eating &rarr;
          </Link>
        </motion.section>
      ) : (
        <motion.section
          initial={initial}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          style={{
            background: 'linear-gradient(180deg, #fdfbf6 0%, #fdfbf6 58%, #fdf1e3 100%)',
            border: '1px solid var(--ds-og-border-strong)',
            borderRadius: 22, padding: 22,
            boxShadow: '0 1px 2px rgba(9,24,37,0.04), 0 8px 24px -12px rgba(9,24,37,0.16)',
            display: 'flex', flexDirection: 'column', gap: 14,
            fontFamily: BODY,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--ds-og-wash-strong)', color: OG, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Gift size={13} strokeWidth={2.4} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: S.fgFaint }}>Seasonal break</span>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: S.fg, lineHeight: 1.25 }}>
              {headline}{headlineDot && <span style={{ color: OG }}>.</span>}
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: S.fgMuted, lineHeight: 1.55 }}>{body}</p>
          </div>
          <div>
            {/* Honest tense: nothing is minted until the tap below — this is
                a promise, not a balance (see creditAed's docblock). */}
            <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: OG_DEEP, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>AED {creditAed}</span>
            <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: S.fgMuted }}>yours if you save your spot</div>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: S.fg, lineHeight: 1.5 }}>{REOPEN_MESSAGE_PROMISE}</div>
          <button
            type="button"
            onClick={handleJoin}
            disabled={isPending}
            style={{
              width: '100%', minHeight: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px 18px', borderRadius: 999, background: OG, color: '#fff', border: 'none',
              fontFamily: BODY, fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
              boxShadow: '0 6px 18px -6px rgba(245,127,32,0.6)',
              opacity: isPending ? 0.75 : 1, cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? 'Saving your spot…' : 'Save my spot'}
          </button>
          {joinError && (
            <div style={{ fontSize: 12, color: 'var(--ds-danger-fg)', lineHeight: 1.5 }}>{joinError}</div>
          )}
        </motion.section>
      )}
      </div>
      </>
    )
  }

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
    <div style={{
      // Same 8px bleed past the mount surface either way — only how the box
      // earns its height differs (see the variant prop's docblock).
      // ('inline' never reaches this path — it returned above.)
      ...(variant === 'stacked'
        ? { gridArea: '1 / 1', margin: -8, position: 'relative' as const }
        : { position: 'absolute' as const, inset: -8 }),
      zIndex: 5,
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
          position: 'sticky', top: 96, maxWidth: 380, width: '100%',
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
    </>
  )
}
