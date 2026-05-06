import { BODY, OG3 } from './tokens'

/**
 * Subscription-status pill used on /plan and the dashboard's no-plan view.
 * Scheduled gets a saturated slate-blue fill (not a tint) so the user
 * immediately sees that something is queued to start — until the plan
 * begins it's the only signal that *anything* is live, so it earns the
 * eye-catch. The other three states stay calmer because they live next to
 * cards/copy that already communicate state.
 */
export function StatusDot({ status }: { status: string }) {
    const map: Record<string, { bg: string; fg: string; dot: string; border?: string; shadow?: string }> = {
        Active:    { bg: 'rgba(9,145,14,0.14)',  fg: '#1d8a30',           dot: '#1d8a30' },
        Paused:    { bg: 'rgba(255,170,0,0.16)', fg: '#a36900',           dot: OG3 },
        Scheduled: {
            bg: '#3a6f8c', fg: '#ffffff',
            dot: '#ffffff',
            border: '1px solid rgba(58,111,140,0.55)',
            shadow: '0 0 0 4px rgba(58,111,140,0.14), 0 4px 12px rgba(58,111,140,0.30)',
        },
        Ended:     { bg: 'rgba(9,24,37,0.08)',    fg: 'rgba(9,24,37,0.55)', dot: 'rgba(9,24,37,0.45)' },
    }
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
