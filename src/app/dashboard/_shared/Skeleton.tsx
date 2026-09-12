import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { COMPACT } from './breakpoints'

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

/**
 * Two skeletons, one per breakpoint tree. The routes swap between a desktop
 * tree and a phone tree at the shell's COMPACT contract (1024 landscape / any
 * portrait), so the placeholder has to swap there too — a raw
 * `max-width: 1024px` collapsed a 12-column desktop grid at a different
 * boundary and never looked like the phone page that replaced it.
 */
export function SkeletonTrees({ desktop, mobile }: { desktop: ReactNode; mobile: ReactNode }) {
    return (
        <div style={{ fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
            <div className="skel-desktop" style={{ padding: 'clamp(20px, 3vw, 40px)' }}>{desktop}</div>
            {/* owns-burger-row: like every phone page, the skeleton opens with a
                title row indented past the shell's burger, so it opts out of
                the layout's burger clearance (see dashboard/layout.tsx). */}
            <div className="skel-mobile owns-burger-row" style={{ padding: '14px 14px 24px' }}>{mobile}</div>
            <SkeletonKeyframes />
            <style>{`
                .skel-mobile { display: none; }
                @media ${COMPACT} {
                    .skel-desktop { display: none; }
                    .skel-mobile { display: block; }
                }
            `}</style>
        </div>
    )
}

/** Phone page header: the title placeholder sits beside the shell's floating
 *  burger (the shell owns that button; the skeleton just leaves room for it). */
export function SkelMobileHeader({ titleWidth = 150 }: { titleWidth?: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 'var(--burger-size, 44px)', paddingLeft: 56, marginBottom: 16 }}>
            <Skel tone="strong" radius={8} style={{ width: titleWidth, height: 26 }} />
        </div>
    )
}
