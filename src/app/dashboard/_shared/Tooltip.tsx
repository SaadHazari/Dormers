'use client'

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BODY, TIER_POP_TEXT } from './tokens'

interface Props {
    children: ReactNode
    /** Tooltip copy. When falsy, no tooltip renders even on hover — lets
     *  the parent control visibility purely by setting/clearing this string. */
    label?: string | null
    /** Where the tooltip sits relative to the trigger. Defaults to 'top'. */
    placement?: 'top' | 'bottom'
    /** How the wrapper sizes itself.
     *  - 'block' (default): full-width wrapper so `width: 100%` buttons
     *    (QuickActions) keep their layout and the tooltip centers over them.
     *  - 'inline': wrapper shrink-wraps the trigger — required when the
     *    trigger is a small inline-flex pill sitting inside a flex row,
     *    otherwise the 100% wrapper stretches across the row and the
     *    tooltip drifts far to the right of the actual button. */
    fit?: 'block' | 'inline'
}

/**
 * Instant hover tooltip for action buttons. Replaces the native `title`
 * attribute (which has a 500-700ms browser-imposed delay) with a custom
 * dark-navy bubble that animates in within ~120ms. Same surface vocabulary
 * as the PlanProgress pill tooltips so the dashboard reads as one family.
 *
 * Wraps a single child (typically a <button>). The wrapper defaults to
 * display: block + width: 100% so it doesn't shrink-wrap a full-width
 * button — pass `fit="inline"` for small pill triggers that need the
 * wrapper to hug the child so the tooltip stays centered over it.
 */
export function Tooltip({ children, label, placement = 'top', fit = 'block' }: Props) {
    const [hovered, setHovered] = useState(false)
    const show = hovered && !!label

    const above = placement === 'top'
    const inline = fit === 'inline'

    return (
        <span
            style={inline
                ? { position: 'relative', display: 'inline-block' }
                : { position: 'relative', display: 'block', width: '100%' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
        >
            {children}
            <AnimatePresence>
                {show && (
                    <motion.span
                        role="tooltip"
                        // x: '-50%' centers horizontally — handled by motion's
                        // x prop (not inline transform) so the y animation
                        // doesn't clobber the centering.
                        initial={{ opacity: 0, x: '-50%', y: above ? 4 : -4 }}
                        animate={{ opacity: 1, x: '-50%', y: 0 }}
                        exit={{ opacity: 0, x: '-50%', y: above ? 4 : -4 }}
                        transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                            position: 'absolute',
                            ...(above
                                ? { bottom: 'calc(100% + 8px)' }
                                : { top: 'calc(100% + 8px)' }),
                            left: '50%',
                            zIndex: 50,
                            pointerEvents: 'none',
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'linear-gradient(135deg, #1a3e4f 0%, #091825 100%)',
                            boxShadow: 'var(--ds-shadow-modal)',
                            fontFamily: BODY,
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: TIER_POP_TEXT.primary,
                            lineHeight: 1.45,
                            // An absolutely positioned box with no width
                            // shrink-wraps to the space left inside its
                            // positioned parent from `left: 50%` onward —
                            // about half the trigger's width. Without
                            // max-content the copy wraps into a tall skinny
                            // column and maxWidth never comes into play.
                            width: 'max-content',
                            maxWidth: 280,
                            minWidth: 60,
                            textAlign: 'center',
                            whiteSpace: 'normal',
                        }}
                    >
                        {label}
                        {/* Arrow */}
                        <span
                            aria-hidden
                            style={{
                                position: 'absolute',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: 0,
                                height: 0,
                                borderLeft: '5px solid transparent',
                                borderRight: '5px solid transparent',
                                ...(above
                                    ? { top: '100%', borderTop: '5px solid #091825' }
                                    : { bottom: '100%', borderBottom: '5px solid #091825' }),
                            }}
                        />
                    </motion.span>
                )}
            </AnimatePresence>
        </span>
    )
}
