'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { OG, OG3, NV2, CR, BODY } from './_shared/tokens'
import { Eyebrow } from './_shared/Eyebrow'
import { btnStyle } from './_shared/buttons'

/**
 * Empty-state view shown when the customer has no active subscription.
 * Confident plan-picker invitation — no faded skeleton apology.
 *
 * Was 50 LOC inlined in ClientDashboard.tsx.
 */
export function NoPlanView() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        padding: 'clamp(36px, 5vw, 56px)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid rgba(245,127,32,0.25)',
        background: NV2,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column', gap: 22, alignItems: 'flex-start',
        position: 'relative', overflow: 'hidden',
        color: CR,
      }}
    >
      {/* Brand DNA: dashed grid pattern */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18, pointerEvents: 'none' }} aria-hidden>
        <defs>
          <pattern id="noplan-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(245,127,32,0.35)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#noplan-grid)" />
      </svg>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Eyebrow color={OG3}>Get started</Eyebrow>
        <div style={{
          marginTop: 12,
          fontFamily: BODY, fontSize: 'clamp(34px, 4.5vw, 52px)',
          fontWeight: 900, color: OG,
          lineHeight: 1, letterSpacing: '-0.02em',
        }}>
          Pick your plan.
        </div>
        <div style={{ marginTop: 12, fontFamily: BODY, fontSize: 16, color: 'rgba(237,232,218,0.78)', lineHeight: 1.65, maxWidth: 520 }}>
          Daily meals delivered to your dorm, 7–8 PM. Choose what fits your week.
        </div>
      </div>

      <Link href="/dashboard/explore-plans" className="btn-primary" style={{ ...btnStyle('primary'), position: 'relative', zIndex: 1 }}>
        Pick a plan <ChevronRight size={16} strokeWidth={2.5} />
      </Link>
    </motion.div>
  )
}
