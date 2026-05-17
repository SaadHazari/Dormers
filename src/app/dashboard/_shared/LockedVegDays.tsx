import { Lock } from 'lucide-react'
import { BODY, S, TIER_POP_TEXT } from './tokens'
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
export function LockedVegDays({ vegDays, weekType, onDark }: {
  vegDays: string[] | null | undefined
  weekType: '5DAYS' | '6DAYS' | null | undefined
  onDark?: boolean
}) {
  if (!vegDays || vegDays.length === 0) return null
  const W = weekType === '5DAYS' ? 5 : 6
  const days = (['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'] as const).slice(0, W)

  const containerBg     = onDark ? 'rgba(255,255,255,0.07)'           : 'rgba(58,111,140,0.10)'
  const containerBorder = onDark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(58,111,140,0.30)'
  const labelColor      = onDark ? TIER_POP_TEXT.faint                : S.fgMuted
  const bodyColor       = onDark ? TIER_POP_TEXT.muted                : S.fgMuted
  const eyebrowColor    = onDark ? TIER_POP_TEXT.muted                : undefined // Eyebrow default is S.fgMuted

  // Dark-surface veg: mint (#6ee7b7) reads cleanly on navy — WCAG AA ✓
  // Dark-surface non-veg: translucent white chip with muted cream text
  const vegChipStyle = onDark
    ? { border: '1px solid rgba(52,211,153,0.35)', background: 'rgba(52,211,153,0.14)', color: '#6ee7b7' }
    : { border: '1px solid var(--ds-success-border)', background: 'var(--ds-success-wash)', color: 'var(--ds-success-fg)' }
  const nonVegChipStyle = onDark
    ? { border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: TIER_POP_TEXT.muted }
    : { border: '1px solid var(--ds-border)', background: 'var(--ds-skeleton-base)', color: S.fgMuted }
  const vegDotColor = onDark ? '#6ee7b7' : 'var(--ds-success-fg)'

  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: containerBg,
      border: containerBorder,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <Eyebrow color={eyebrowColor}>Your veg days</Eyebrow>
        <span
          title="Locked for this plan — chosen at checkout. Re-pick when you renew."
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: BODY, fontSize: 10.5, fontWeight: 700,
            color: labelColor, letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: 'help',
          }}
        >
          <Lock size={11} strokeWidth={2.4} aria-hidden /> Locked
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {days.map(day => {
          const isVegDay = vegDays.includes(day)
          const chipStyle = isVegDay ? vegChipStyle : nonVegChipStyle
          return (
            <span
              key={day}
              title={isVegDay
                ? `${day} · veg meal — locked until your next renewal`
                : `${day} · non-veg meal — locked until your next renewal`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 999,
                ...chipStyle,
                fontFamily: BODY, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                cursor: 'not-allowed',
                opacity: 0.95,
              }}
            >
              {isVegDay && <span style={{ width: 6, height: 6, borderRadius: 2, background: vegDotColor, display: 'inline-block' }} />}
              {day.slice(0, 3)}
            </span>
          )
        })}
      </div>
      <p style={{ marginTop: 10, fontFamily: BODY, fontSize: 11.5, color: bodyColor, lineHeight: 1.45 }}>
        Green = veg deliveries, gray = non-veg. You can change this when you renew.
      </p>
    </div>
  )
}
