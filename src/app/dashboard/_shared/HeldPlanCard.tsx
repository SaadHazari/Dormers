'use client'

import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { BODY, OG, OG_DEEP, S } from './tokens'
import { heldCardCopy } from './season-break-copy'
import { useSaveSpot } from './use-save-spot'
import type { CustomerHold } from '@/contexts/season/domain/customer-hold'

interface Props {
  hold: CustomerHold
  alreadyJoined: boolean
  /** Prospective waitlist credit for this customer's meal preference. */
  creditAed: number
}

/**
 * The plan held over the semester break, on home (desktop and mobile). Same
 * inline card shell as SeasonEndingBanner. Every amount after a join comes
 * from the action's own result.
 */
export function HeldPlanCard({ hold, alreadyJoined, creditAed }: Props) {
  const { outcome, joining, join } = useSaveSpot()
  const copy = heldCardCopy({ hold, alreadyJoined: alreadyJoined || !!outcome?.joined, creditAed })

  const line = { marginTop: 4, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 } as const

  return (
    <div
      data-testid="held-plan-card"
      data-state={hold.state}
      role="status"
      style={{
        marginBottom: 18, padding: '14px 18px', borderRadius: 'var(--radius-sm)',
        background: 'var(--ds-og-wash-strong)', border: '1px solid var(--ds-og-border-strong)',
        display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
      }}
    >
      <div style={{
        width: 36, height: 36, flexShrink: 0, borderRadius: '50%', background: 'var(--ds-og-wash)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: OG,
      }}>
        <CalendarClock size={18} strokeWidth={2.2} aria-hidden />
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.35 }}>{copy.headline}</div>
        <div style={line}>{copy.body}</div>
        {copy.creditLine && <div style={{ ...line, color: OG_DEEP, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{copy.creditLine}</div>}
        {copy.joinLine && !outcome?.joined && <div style={line}>{copy.joinLine}</div>}
        {outcome?.message && <div style={line}>{outcome.message}</div>}
        {outcome?.error && <div style={{ ...line, color: '#b3261e' }}>{outcome.error}</div>}
        {(copy.joinLine && !outcome?.joined) || copy.pickDate ? (
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {copy.joinLine && !outcome?.joined && (
              <button
                data-testid="held-plan-join"
                type="button"
                onClick={join}
                disabled={joining}
                style={{
                  minHeight: 40, padding: '9px 18px', borderRadius: 'var(--radius-pill)', border: 0,
                  background: OG, color: '#fff', fontFamily: BODY, fontSize: 12.5, fontWeight: 700,
                  cursor: joining ? 'default' : 'pointer',
                }}
              >
                {joining ? 'Saving your spot' : 'Save my spot'}
              </button>
            )}
            {copy.pickDate && (
              <Link
                data-testid="held-plan-pick-date"
                href="/dashboard/plan"
                style={{
                  minHeight: 40, padding: '9px 18px', borderRadius: 'var(--radius-pill)',
                  background: OG, color: '#fff', fontFamily: BODY, fontSize: 12.5, fontWeight: 700,
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
                }}
              >
                Pick my start date
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
