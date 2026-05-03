/**
 * Three-chili spice indicator. Inactive chilis are greyscaled out so
 * the active count reads at a glance.
 *
 * Was inlined in DesktopMenuCarousel, MobileMenuCard, and TonightsMeal
 * with three slightly different gap/fontSize combos. Pulled up here.
 */
export function SpiceMeter({
    level,
    gap = 6,
    fontSize,
}: {
    /** 0–3 — number of chilis to show as "active". */
    level: number
    /** Gap between chilis in px. Default 6 (matches Desktop/Mobile carousel). */
    gap?: number
    /** Optional explicit font-size for the chili emoji. TonightsMeal uses 16. */
    fontSize?: number
}) {
    return (
        <div style={{ display: 'flex', gap, fontSize }}>
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    style={{
                        filter: i < (level || 0) ? 'none' : 'grayscale(100%) opacity(25%)',
                        transition: 'all 0.3s ease',
                    }}
                >
                    🌶️
                </span>
            ))}
        </div>
    )
}
