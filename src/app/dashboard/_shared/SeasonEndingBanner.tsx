'use client'

import type { ReactElement } from 'react'
import { CalendarClock } from 'lucide-react'
import { BODY, OG, OG_DEEP, S } from './tokens'
import { prettySeasonDate } from '@/contexts/subscriptions/domain/season-horizon'
import type { IntakeGateState } from './types'

/**
 * The sales taper's one announcement: an operator has SCHEDULED the seasonal
 * pause, so the shop is still open but only for plans that can finish before
 * the last delivery day.
 *
 * Sibling of OutOfZoneBanner / PlanEndingPausedBanner — same inline
 * full-width card shell (icon disc, title, supporting line), because this
 * isn't blocking anything: it frames the plan grid underneath, which is
 * still fully shoppable for whatever fits. Loud enough to be read before the
 * cards, quiet enough not to compete with them.
 *
 * Owns the "never both" rule for the taper: once the cron flips the switch,
 * `paused` is true and IntakePausedGate frosts the same surface, so this
 * returns null rather than stacking two seasonal messages on one screen.
 * Every caller can therefore mount it unconditionally.
 */
export function SeasonEndingBanner({ intake }: { intake: IntakeGateState }): ReactElement | null {
  if (intake.paused || !intake.lastDeliveryDay) return null

  return (
    <div
      role="status"
      style={{
        marginBottom: 18,
        padding: '14px 18px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--ds-og-wash-strong)',
        border: '1px solid var(--ds-og-border-strong)',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}
    >
      <div style={{
        width: 36, height: 36, flexShrink: 0, borderRadius: '50%',
        background: 'var(--ds-og-wash)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: OG,
      }}>
        <CalendarClock size={18} strokeWidth={2.2} />
      </div>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
          The semester wraps up on{' '}
          <span style={{ color: OG_DEEP, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>
            {prettySeasonDate(intake.lastDeliveryDay)}
          </span>.
        </div>
        <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>
          Plans that fit before then are still open.
        </div>
      </div>
    </div>
  )
}
