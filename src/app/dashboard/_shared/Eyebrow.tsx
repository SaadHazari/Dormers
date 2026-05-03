import { BODY, S } from './tokens'

/**
 * Uppercase, letter-spaced label used as a "kicker" above headings and
 * inside cards. Was inlined ~5 times across the dashboard with subtle
 * lineHeight drift (1, 1.2, 1.35); this canonical version uses 1.2 and
 * accepts a `color` prop for the rare case a consumer needs darker text.
 */
export function Eyebrow({
    children,
    color = S.fgMuted,
}: {
    children: React.ReactNode
    color?: string
}) {
    return (
        <div
            style={{
                fontFamily: BODY,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color,
                lineHeight: 1.2,
            }}
        >
            {children}
        </div>
    )
}
