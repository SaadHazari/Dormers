'use client'

import { useState, useTransition, type ReactElement } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { CalendarClock, Check } from 'lucide-react'
import { OG, OG_DEEP, BODY, S } from './tokens'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'

interface PlanEndingPausedBannerProps {
  daysRemaining: number
  creditAed: number
  alreadyJoined: boolean
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
 * No date, no countdown, no "back soon", no reopening estimate — same
 * governing rule as the gate. The caller (ActiveDashboard) decides WHETHER
 * to mount this (intake.paused AND within the 7-day window); the guard below
 * is a defensive belt-and-suspenders check on daysRemaining alone, since the
 * copy is written specifically for that window.
 */
export function PlanEndingPausedBanner({ daysRemaining, creditAed, alreadyJoined }: PlanEndingPausedBannerProps): ReactElement | null {
  const [joined, setJoined] = useState(alreadyJoined)
  const [isPending, startTransition] = useTransition()
  const prefersReducedMotion = useReducedMotion()

  const handleJoin = () => {
    startTransition(async () => {
      const result = await joinIntakeWaitlist()
      if (result.ok) setJoined(true)
    })
  }

  if (daysRemaining > 7 || daysRemaining < 0) return null

  return (
    <div style={{
      marginBottom: 18,
      padding: '14px 18px',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--ds-og-wash-strong)',
      border: '1px solid var(--ds-og-border-strong)',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{
        width: 36, height: 36, flexShrink: 0, borderRadius: '50%',
        background: 'var(--ds-og-wash)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: OG,
      }}>
        {joined ? <Check size={18} strokeWidth={2.4} /> : <CalendarClock size={18} strokeWidth={2.2} />}
      </div>

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
            <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
              You are on the list.
            </div>
            <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: OG_DEEP, fontWeight: 700, lineHeight: 1.5, fontFeatureSettings: '"tnum"' }}>
              AED {creditAed} is waiting in your account.
            </div>
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
              Your plan ends in{' '}
              <span style={{ color: OG_DEEP, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>
                {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
              </span>.
            </div>
            <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>
              New plans are paused between semesters, so this one will not roll over. Save your spot and AED {creditAed} is waiting for the day we reopen.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!joined && (
        <button
          type="button"
          onClick={handleJoin}
          disabled={isPending}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 16px',
            background: OG, color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-pill)',
            fontFamily: BODY, fontSize: 12, fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            boxShadow: '0 4px 12px rgba(245,127,32,0.40)',
            opacity: isPending ? 0.75 : 1,
            cursor: isPending ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {isPending ? 'Saving…' : 'Save my spot'}
        </button>
      )}
    </div>
  )
}
