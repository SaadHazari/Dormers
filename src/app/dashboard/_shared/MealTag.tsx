import { BODY, OG } from './tokens'

// Theme-aware palette — values resolve to CSS variables that flip in dark
// mode. The hue family stays the same (orange/green/blue/neutral); contrast
// is achieved by the variable swap behind the scenes. Tuned for cream/white
// (light) and navy panel (dark) surfaces alike.
const PALETTE: Record<string, { bg: string; fg: string; mark: string }> = {
    'Non Veg': { bg: 'var(--ds-og-wash-strong)',  fg: OG,                       mark: OG },
    'Veg':     { bg: 'var(--ds-success-wash)',    fg: 'var(--ds-success-fg)',   mark: 'var(--ds-success-fg)' },
    'Mix':     { bg: 'rgba(58,111,140,0.18)',     fg: '#5fa1c4',                mark: '#5fa1c4' },
    'Off':     { bg: 'var(--ds-skeleton-base)',   fg: 'var(--ds-fg-soft)',      mark: 'var(--ds-fg-tint)' },
}

// Dark-surface palette — tuned for TIER_POP (#091825 base). Same hue families,
// bright foreground values so the pill shape is legible and contrast passes AA.
// Non Veg uses OG directly (7.3:1 on #091825, brand-true orange on navy).
// Veg + Mix use light tints of their hues (~10:1+). Off recedes to faint cream.
const DARK_PALETTE: Record<string, { bg: string; fg: string; mark: string }> = {
    'Non Veg': { bg: 'rgba(245,127,32,0.20)', fg: OG,        mark: OG },
    'Veg':     { bg: 'rgba(86,239,172,0.14)', fg: '#86efac', mark: '#86efac' },
    'Mix':     { bg: 'rgba(147,197,253,0.14)', fg: '#93c5fd', mark: '#93c5fd' },
    'Off':     { bg: 'rgba(245,240,232,0.08)', fg: 'rgba(245,240,232,0.40)', mark: 'rgba(245,240,232,0.30)' },
}

/**
 * Pill-style tag indicating the kind of meal (Veg / Non Veg / Off-day).
 * `compact=true` shortens "Non Veg" to "N.V" for tight grids (e.g. the
 * 7-column next-week layout). `oneLine=true` shortens it to "N.VEG" — the
 * middle ground used in the hero card, where "Non-Veg" can wrap onto two
 * lines when the meta row gets squeezed on a phone. `onDark=true` switches
 * to the dark-surface palette for use inside TIER_POP cards.
 *
 * Was duplicated near-verbatim in ClientDashboard and MenuClient; the
 * compact variant came from MenuClient.
 */
export function MealTag({ kind, compact, onDark, oneLine }: { kind: string; compact?: boolean; onDark?: boolean; oneLine?: boolean }) {
    const c = (onDark ? DARK_PALETTE : PALETTE)[kind] || (onDark ? DARK_PALETTE : PALETTE).Veg
    const labelText =
        kind === 'Non Veg' ? (compact ? 'N.V' : oneLine ? 'N.VEG' : 'Non-Veg')
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
                whiteSpace: 'nowrap',
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
