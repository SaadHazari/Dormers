import { BODY, OG } from './tokens'

const PALETTE: Record<string, { bg: string; fg: string; mark: string }> = {
    'Non Veg': { bg: 'rgba(245,127,32,0.14)', fg: '#a35100', mark: OG },
    'Veg':     { bg: 'rgba(9,145,14,0.12)',   fg: '#1d8a30', mark: '#1d8a30' },
    // Mix — religious customers whose week alternates veg + non-veg per the
    // sub.veg_days choice. Slate-blue (matches the Scheduled badge family)
    // so it reads as "configured per-day" rather than either category.
    'Mix':     { bg: 'rgba(58,111,140,0.12)', fg: '#3a6f8c', mark: '#3a6f8c' },
    'Off':     { bg: 'rgba(9,24,37,0.06)',    fg: 'rgba(9,24,37,0.55)', mark: 'rgba(9,24,37,0.40)' },
}

/**
 * Pill-style tag indicating the kind of meal (Veg / Non Veg / Off-day).
 * `compact=true` shortens "Non Veg" to "N.V" for tight grids (e.g. the
 * 7-column next-week layout).
 *
 * Was duplicated near-verbatim in ClientDashboard and MenuClient; the
 * compact variant came from MenuClient.
 */
export function MealTag({ kind, compact }: { kind: string; compact?: boolean }) {
    const c = PALETTE[kind] || PALETTE.Veg
    const labelText =
        kind === 'Non Veg' ? (compact ? 'N.V' : 'Non-Veg')
        : kind === 'Mix'   ? (compact ? 'Mix' : 'Religious Mix')
        : kind
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                background: c.bg,
                color: c.fg,
                fontFamily: BODY,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
            }}
        >
            <span
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: 2,
                    background: kind === 'Veg' ? 'transparent' : c.mark,
                    boxShadow: kind === 'Veg' ? `inset 0 0 0 1.5px ${c.mark}` : 'none',
                }}
            />
            {labelText}
        </span>
    )
}
