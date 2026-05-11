import { BODY, OG3 } from './tokens'

/**
 * Subscription-status pill used on /plan and the dashboard's no-plan view.
 * Scheduled gets a saturated slate-blue fill (not a tint) so the user
 * immediately sees that something is queued to start — until the plan
 * begins it's the only signal that *anything* is live, so it earns the
 * eye-catch. The other three states stay calmer because they live next to
 * cards/copy that already communicate state.
 */
// Theme-aware map — tuned for cream/white surfaces (light) and navy panels
// (dark). Hue families stay constant; the underlying CSS variables flip the
// surface tint and text alpha so each pill reads clearly in either theme.
const LIGHT_MAP: Record<string, { bg: string; fg: string; dot: string; border?: string; shadow?: string }> = {
    Active:    { bg: 'var(--ds-success-wash)', fg: 'var(--ds-success-fg)', dot: 'var(--ds-success-fg)' },
    Paused:    { bg: 'rgba(255,170,0,0.18)',   fg: '#c89417',              dot: OG3 },
    Scheduled: {
        bg: '#3a6f8c', fg: '#ffffff',
        dot: '#ffffff',
        border: '1px solid rgba(58,111,140,0.55)',
        shadow: '0 0 0 4px rgba(58,111,140,0.14), 0 4px 12px rgba(58,111,140,0.30)',
    },
    Ended:     { bg: 'var(--ds-skeleton-base)', fg: 'var(--ds-fg-soft)',   dot: 'var(--ds-fg-faint)' },
}

// Dark-surface map — tuned for TIER_POP (#091825 base). Bright foreground
// values so each pill reads clearly against dark navy. Active mint ~10:1,
// Paused amber ~8:1, Scheduled unchanged (white on blue already correct).
const DARK_MAP: Record<string, { bg: string; fg: string; dot: string; border?: string; shadow?: string }> = {
    Active:    { bg: 'rgba(86,239,172,0.14)', fg: '#86efac', dot: '#86efac' },
    Paused:    { bg: 'rgba(255,208,0,0.18)',  fg: '#fcd34d', dot: '#fcd34d' },
    Scheduled: {
        bg: '#3a6f8c', fg: '#ffffff',
        dot: '#ffffff',
        border: '1px solid rgba(255,255,255,0.25)',
        shadow: '0 0 0 4px rgba(58,111,140,0.30)',
    },
    Ended:     { bg: 'rgba(245,240,232,0.08)', fg: 'rgba(245,240,232,0.45)', dot: 'rgba(245,240,232,0.35)' },
}

export function StatusDot({ status, onDark }: { status: string; onDark?: boolean }) {
    const map = onDark ? DARK_MAP : LIGHT_MAP
    const c = map[status] || map.Active
    const isScheduled = status === 'Scheduled'
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: isScheduled ? '5px 12px 5px 10px' : '4px 10px 4px 8px',
                borderRadius: 999,
                background: c.bg,
                color: c.fg,
                border: c.border,
                boxShadow: c.shadow,
                fontFamily: BODY,
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
            }}
        >
            <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: c.dot,
                boxShadow: isScheduled ? '0 0 0 1.5px rgba(255,255,255,0.4)' : undefined,
            }} />
            {status}
        </span>
    )
}
