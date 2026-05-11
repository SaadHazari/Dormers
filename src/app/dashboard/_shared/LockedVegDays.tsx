import { Lock } from 'lucide-react'
import { BODY, S } from './tokens'
import { Eyebrow } from './Eyebrow'

/**
 * Read-only display of a religious-mix subscription's chosen veg days.
 * Shared between the /plan "Your current plan" callout and /profile so
 * the customer reads the same locked snapshot in both places.
 *
 * Each working day for the customer's week_type renders as a chip:
 *   • veg-selected day → green outline + dot
 *   • non-veg day      → muted gray
 * Both look intentionally non-interactive (cursor:not-allowed) and surface
 * a tooltip explaining why: the kitchen-ops calendar is anchored to this
 * choice for the cycle, so changing it mid-cycle isn't allowed. The user
 * can repick at renewal.
 */
export function LockedVegDays({ vegDays, weekType }: {
  vegDays: string[] | null | undefined
  weekType: '5DAYS' | '6DAYS' | null | undefined
}) {
  if (!vegDays || vegDays.length === 0) return null
  const W = weekType === '5DAYS' ? 5 : 6
  const days = (['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'] as const).slice(0, W)
  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: 'rgba(58,111,140,0.10)',
      border: '1px solid rgba(58,111,140,0.30)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <Eyebrow>Your veg days</Eyebrow>
        <span
          title="Locked for this plan — chosen at checkout. Re-pick when you renew."
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: BODY, fontSize: 10.5, fontWeight: 700,
            color: S.fgMuted, letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: 'help',
          }}
        >
          <Lock size={11} strokeWidth={2.4} aria-hidden /> Locked
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {days.map(day => {
          const isVegDay = vegDays.includes(day)
          return (
            <span
              key={day}
              title={isVegDay
                ? `${day} · veg meal — locked until your next renewal`
                : `${day} · non-veg meal — locked until your next renewal`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 999,
                border: `1px solid ${isVegDay ? 'var(--ds-success-border)' : 'var(--ds-border)'}`,
                background: isVegDay ? 'var(--ds-success-wash)' : 'var(--ds-skeleton-base)',
                color: isVegDay ? 'var(--ds-success-fg)' : S.fgMuted,
                fontFamily: BODY, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                cursor: 'not-allowed',
                opacity: 0.95,
              }}
            >
              {isVegDay && <span style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--ds-success-fg)', display: 'inline-block' }} />}
              {day.slice(0, 3)}
            </span>
          )
        })}
      </div>
      <p style={{ marginTop: 10, fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, lineHeight: 1.45 }}>
        Green = veg deliveries, gray = non-veg. You can change this when you renew.
      </p>
    </div>
  )
}
