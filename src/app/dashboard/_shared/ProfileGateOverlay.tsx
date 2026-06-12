'use client'

import Link from 'next/link'
import { ChevronRight, AlertTriangle } from 'lucide-react'
import { OG, BODY, S } from './tokens'

/**
 * Frosted gate rendered over the plan grid when the profile is incomplete.
 * The parent wrapper must be `position: relative` — this overlay fills it,
 * blurs the cards underneath, and pins a completion card in view. Pointer
 * events stop here; keyboard selection is guarded separately at the
 * onSelect call sites (an overlay can't intercept tab + enter).
 */
export function ProfileGateOverlay({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null
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
      <div style={{
        position: 'sticky', top: 96,
        maxWidth: 380, width: '100%',
        background: 'var(--ds-content-bg)',
        border: '1px solid var(--ds-og-border-strong)',
        borderRadius: 18,
        boxShadow: 'var(--ds-shadow-modal)',
        padding: '26px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        textAlign: 'center',
      }}>
        <span style={{
          width: 42, height: 42, borderRadius: '50%',
          background: 'var(--ds-og-wash-strong)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: OG,
        }}>
          <AlertTriangle size={20} strokeWidth={2.4} />
        </span>
        <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
          Finish your profile to unlock plans.
        </div>
        <div style={{ fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.55 }}>
          Still needed: <strong style={{ color: S.fg }}>{missing.join(', ')}</strong>.
        </div>
        <Link
          href="/dashboard/profile"
          style={{
            marginTop: 4,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '11px 18px',
            background: OG, color: '#fff',
            borderRadius: 'var(--radius-pill)',
            fontFamily: BODY, fontSize: 12, fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(245,127,32,0.40)',
          }}
        >
          Complete profile <ChevronRight size={14} strokeWidth={2.6} />
        </Link>
      </div>
    </div>
  )
}
