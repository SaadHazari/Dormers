'use client'

import Link from 'next/link'
import { ChevronRight, AlertTriangle } from 'lucide-react'
import { OG, BODY, S } from './tokens'

/**
 * Persistent (non-dismissable) banner shown at the top of the dashboard
 * when the customer's profile is incomplete. Required fields are listed
 * inline so the user knows exactly what's blocking purchase.
 *
 * Pairs with src/lib/profile-completion.ts which is the single source of
 * truth for what counts as "complete".
 */
export function ProfileBanner({ missing, deprioritized = false }: { missing: string[]; deprioritized?: boolean }) {
  if (missing.length === 0) return null
  return (
    <div style={{
      marginBottom: 18,
      padding: '14px 18px',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--ds-og-wash)',
      border: '1px solid var(--ds-og-border-strong)',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{
        width: 36, height: 36, flexShrink: 0, borderRadius: '50%',
        background: 'var(--ds-og-wash-strong)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: OG,
      }}>
        <AlertTriangle size={18} strokeWidth={2.4} />
      </div>
      {/* flex-basis must be a real width (not `flex: 1` ≡ basis 0) — with a
          0 basis the wrap never engages and phones squeeze the text to a
          one-word-per-line sliver beside the no-shrink CTA. */}
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
          Finish your profile to unlock plan purchase.
        </div>
        <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>
          Still needed: <strong style={{ color: S.fg }}>{missing.join(', ')}</strong>.
          {/* Out-of-zone outranks this. Finishing the profile cannot unlock a
              purchase we may not be able to deliver, so say which step is
              actually first instead of showing two equal-weight CTAs. */}
          {deprioritized && ' Sort the delivery check above first.'}
        </div>
      </div>
      <Link
        href="/dashboard/profile"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '10px 16px',
          // Secondary treatment while a higher-priority blocker is on screen:
          // one solid CTA per view, so the eye lands on the step that actually
          // comes first. Still fully actionable, just not the loudest thing.
          background: deprioritized ? 'transparent' : OG,
          color: deprioritized ? OG : '#fff',
          border: deprioritized ? '1px solid var(--ds-og-border-strong)' : '1px solid transparent',
          borderRadius: 'var(--radius-pill)',
          fontFamily: BODY, fontSize: 12, fontWeight: 700,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          textDecoration: 'none',
          boxShadow: deprioritized ? 'none' : '0 4px 12px rgba(245,127,32,0.40)',
          flexShrink: 0,
        }}
      >
        Complete profile <ChevronRight size={14} strokeWidth={2.6} />
      </Link>
    </div>
  )
}
