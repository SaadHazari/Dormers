import { BODY, OG3 } from './tokens'

/**
 * Subscription-status pill used on /plan and the dashboard's no-plan view.
 * Slate-blue for Scheduled — desaturated enough to live alongside the warm
 * cream / orange palette without competing for the eye, distinct enough
 * from green (running) and orange (paused) to pass the squint test. The
 * four states span: running (green), paid-but-not-yet (slate-blue), on-hold
 * (warm orange), finished (gray).
 */
export function StatusDot({ status }: { status: string }) {
    const map: Record<string, { bg: string; fg: string; dot: string }> = {
        Active:    { bg: 'rgba(9,145,14,0.14)',  fg: '#1d8a30',           dot: '#1d8a30' },
        Paused:    { bg: 'rgba(255,170,0,0.16)', fg: '#a36900',           dot: OG3 },
        Scheduled: { bg: 'rgba(58,111,140,0.12)', fg: '#3a6f8c',          dot: '#3a6f8c' },
        Ended:     { bg: 'rgba(9,24,37,0.08)',    fg: 'rgba(9,24,37,0.55)', dot: 'rgba(9,24,37,0.45)' },
    }
    const c = map[status] || map.Active
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px 4px 8px',
                borderRadius: 999,
                background: c.bg,
                color: c.fg,
                fontFamily: BODY,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
            }}
        >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />
            {status}
        </span>
    )
}
