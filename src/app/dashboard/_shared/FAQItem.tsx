'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BODY, NV, OG, S } from './tokens'

/**
 * Collapsible FAQ row with animated expand/collapse. Was duplicated
 * near-verbatim in PlanClient and SupportClient with minor padding /
 * line-height drift; this is the SupportClient version (slightly
 * looser spacing) which reads better on long-form answers.
 */
export function FAQItem({ q, a }: { q: string; a: string }) {
    const [open, setOpen] = useState(false)
    return (
        <div style={{ borderBottom: `1px solid ${S.border}` }}>
            <button
                onClick={() => setOpen((o) => !o)}
                style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '18px 0',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    gap: 16,
                    textAlign: 'left',
                }}
            >
                <span style={{ fontFamily: BODY, fontSize: 14, fontWeight: 600, color: NV, flex: 1 }}>
                    {q}
                </span>
                <span
                    style={{
                        color: open ? OG : S.fgMuted,
                        fontFamily: BODY,
                        fontSize: 18,
                        flexShrink: 0,
                        transition: 'transform 200ms',
                        transform: open ? 'rotate(45deg)' : 'none',
                        display: 'inline-block',
                    }}
                >
                    +
                </span>
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div
                            style={{
                                paddingBottom: 18,
                                fontFamily: BODY,
                                fontSize: 13,
                                color: S.fgMuted,
                                lineHeight: 1.65,
                            }}
                        >
                            {a}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
