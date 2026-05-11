import type { CSSProperties, HTMLAttributes } from 'react'

/**
 * Pulse-animated skeleton block. Was inlined ~30 times across the 7
 * `dashboard/**\/loading.tsx` files with three alpha tones for visual
 * hierarchy:
 *   - subtle  (rgba(9,24,37,0.04))  — background panels
 *   - base    (rgba(9,24,37,0.05))  — default block
 *   - strong  (rgba(9,24,37,0.06))  — focal hero / titles
 *
 * Pair with <SkeletonKeyframes /> rendered once per loading view.
 */

type SkeletonTone = 'subtle' | 'base' | 'strong'

// Theme-aware skeleton tones — values resolve from globals.css.
// In dark mode, `--ds-skeleton-base` flips to a cream-alpha so blocks read
// as elevated panels against the deep navy page background.
const TONE_BG: Record<SkeletonTone, string> = {
    subtle: 'var(--ds-skeleton-base)',
    base:   'var(--ds-skeleton-base)',
    strong: 'var(--ds-skeleton-shine)',
}

export function Skel({
    tone = 'base',
    radius = 6,
    style,
    ...rest
}: {
    tone?: SkeletonTone
    radius?: number
    style?: CSSProperties
} & Omit<HTMLAttributes<HTMLDivElement>, 'style'>) {
    return (
        <div
            {...rest}
            style={{
                background: TONE_BG[tone],
                borderRadius: radius,
                animation: 'pulse 1.4s ease-in-out infinite',
                ...style,
            }}
        />
    )
}

/**
 * Renders the `@keyframes pulse` definition once. Render anywhere inside
 * a loading.tsx — the browser dedupes identical @keyframes by name, so
 * multiple instances are a no-op.
 */
export function SkeletonKeyframes() {
    return (
        <style>{`
            @keyframes pulse {
                0%, 100% { opacity: 0.55; }
                50%      { opacity: 0.85; }
            }
        `}</style>
    )
}
