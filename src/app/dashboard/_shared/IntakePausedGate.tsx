'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Gift, Check } from 'lucide-react'
import { OG, OG_DEEP, BODY, S } from './tokens'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'

interface IntakePausedGateProps {
  headline: string
  body: string
  creditAed: number
  alreadyJoined: boolean
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
export function IntakePausedGate({ headline, body, creditAed, alreadyJoined }: IntakePausedGateProps) {
  const [joined, setJoined] = useState(alreadyJoined)
  const [isPending, startTransition] = useTransition()
  const prefersReducedMotion = useReducedMotion()

  const handleJoin = () => {
    startTransition(async () => {
      const result = await joinIntakeWaitlist()
      if (result.ok) setJoined(true)
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
                You are on the list.
              </div>
              <div style={{ fontFamily: BODY, fontSize: 19, fontWeight: 800, color: OG_DEEP, lineHeight: 1.3, letterSpacing: '-0.01em', fontFeatureSettings: '"tnum"' }}>
                AED {creditAed} is waiting in your account
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
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
