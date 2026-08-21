'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { OG, BODY } from './tokens'
import { seeAllLabel } from './past-plans'

/**
 * The doorway to /dashboard/history.
 *
 * Four surfaces render finished-plan tiles and, before this, every one of
 * them was a dead end — the history page had a mobile tree, an empty state
 * and delivery/skip/completion figures none of the tiles show, and nothing
 * linked to it. One component so the way out is the same shape wherever the
 * record appears, and so its label can only come from `seeAllLabel`.
 *
 * Brand orange rather than muted: this is the one affordance the change
 * exists to make findable, and a grey chevron beside a heading is exactly
 * how it stayed invisible.
 */
export function SeeAllPastPlans({ count, style }: { count: number; style?: React.CSSProperties }) {
    return (
        <>
        {/* `style jsx global`, not a scoped block: the rules target a next/link
            — a React component — and the styled-jsx scope hash never reaches
            one, so a scoped rule here would be dead CSS. Global keeps them in
            the file that owns them instead of in globals.css; styled-jsx
            dedupes identical global blocks, so rendering this four times on a
            page still injects one copy. */}
        <style jsx global>{`
            .see-all-past-plans { transition: color 150ms ease; }
            .see-all-past-plans:hover {
                text-decoration: underline;
                text-underline-offset: 3px;
            }
            /* Keyboard users get a real ring, not the underline that hover
               happens to give. */
            .see-all-past-plans:focus-visible {
                outline: 2px solid #f57f20;
                outline-offset: 2px;
                border-radius: 6px;
            }
            /* Press goes LIGHTER — #f57f20 is the brand ceiling, so a darker
               press would drift into burnt orange. */
            .see-all-past-plans:active { color: #ff9038; }
            @media (prefers-reduced-motion: reduce) {
                .see-all-past-plans { transition: none; }
            }
        `}</style>
        <Link
            href="/dashboard/history"
            className="see-all-past-plans"
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontFamily: BODY, fontSize: 12, fontWeight: 700,
                color: OG, textDecoration: 'none', whiteSpace: 'nowrap',
                // Negative-margin padding buys a touch-sized hit area without
                // adding height to the heading row it sits in — same idiom as
                // MobileHome's savings info button.
                padding: '10px 8px', margin: '-10px -8px',
                WebkitTapHighlightColor: 'transparent',
                ...style,
            }}
        >
            {seeAllLabel(count)}
            <ChevronRight size={13} strokeWidth={2.6} aria-hidden />
        </Link>
        </>
    )
}
