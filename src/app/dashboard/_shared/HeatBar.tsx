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
export function HeatBar({ level }: { level: number }) {
    const text = SPICE_LABELS[level] ?? ''
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
                            background: i < level ? OG : 'rgba(9,24,37,0.10)',
                            display: 'inline-block',
                        }}
                    />
                ))}
            </span>
        </span>
    )
}
