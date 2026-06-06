import { OG } from './tokens'

const SPICE_LABELS = ['', 'Mild', 'Medium', 'Hot']

/**
 * Three-segment spice indicator. `level` 0–3.
 *
 * The component exposes the level as `aria-label` so screen readers
 * announce "Spice level: Medium" rather than reading three empty bars.
 *
 * Was duplicated in ClientDashboard (with span+aria) and MenuClient
 * (without aria) — this version is the union.
 */
export function HeatBar({ level, onDark = false }: { level: number; onDark?: boolean }) {
    const text = SPICE_LABELS[level] ?? ''
    const inactiveColor = onDark ? 'rgba(245,240,232,0.28)' : 'var(--ds-border-strong)'
    return (
        <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            aria-label={text ? `Spice level: ${text}` : 'No spice'}
        >
            <span style={{ display: 'flex', gap: 3 }}>
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        style={{
                            width: 5,
                            height: 9,
                            borderRadius: 1.5,
                            background: i < level ? OG : inactiveColor,
                            display: 'inline-block',
                        }}
                    />
                ))}
            </span>
        </span>
    )
}
