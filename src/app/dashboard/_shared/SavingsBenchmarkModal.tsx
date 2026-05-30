'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PiggyBank } from 'lucide-react'
import { BG, BODY, OG, S } from './tokens'
import { useFocusTrap } from './useFocusTrap'

interface Props {
    open: boolean
    onClose: () => void
    isPending: boolean
    /** Per-meal cost the customer is currently paying on their active sub. Drives
     *  the live "you'd be saving AED X / meal" preview. Passed in from the parent
     *  so we don't have to recompute it here. */
    perMealDormers: number
    /** Existing benchmark, if the user is editing rather than answering for the
     *  first time. Defaults to AED 25 — the midpoint of the slider range and a
     *  conservative anchor that won't feel manufactured. */
    initialValue?: number | null
    onConfirm: (aed: number) => void
}

const MIN = 15
const MAX = 50
const DEFAULT = 25

/**
 * One-time slider question that captures the customer's typical takeout
 * cost. The number drives the "Saved this cycle" StatTile and the lifetime
 * savings line in the greeting ribbon.
 *
 * Why a slider, not a free-text input: slider commits the customer to a
 * specific number through physical interaction, which (Cialdini's
 * consistency principle) makes them believe the resulting savings figure
 * more strongly than a number they typed. It also bounds the input to a
 * defensible range, so the dashboard never has to display AED 5,000+
 * savings against a fabricated AED 100/meal counterfactual.
 *
 * The live preview ("AED X saved per meal") is the trust-building move —
 * the customer can see the math before committing, and they know the
 * resulting dashboard numbers come from a benchmark they themselves set.
 */
export function SavingsBenchmarkModal({
    open, onClose, isPending, perMealDormers, initialValue, onConfirm,
}: Props) {
    const [value, setValue] = useState<number>(initialValue ?? DEFAULT)
    const dialogRef = useRef<HTMLDivElement | null>(null)
    useFocusTrap(open, dialogRef)

    useEffect(() => {
        if (open) setValue(initialValue ?? DEFAULT)
    }, [open, initialValue])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    const perMealSaved = Math.max(0, value - perMealDormers)
    const perMealDisplay = Math.round(perMealDormers * 10) / 10
    const perMealSavedDisplay = Math.round(perMealSaved * 10) / 10
    // First-time vs re-edit. When `initialValue` is null the customer is
    // answering for the first time — use the friendly "tell us once" copy.
    // When it's a number, they're re-editing a previously-set benchmark —
    // use shorter copy that respects they already know the drill.
    const isEditing = initialValue != null

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 200,
                        background: 'var(--ds-overlay-strong)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 24, backdropFilter: 'blur(8px)',
                    }}
                    onClick={onClose}
                >
                    <motion.div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="savings-benchmark-title"
                        initial={{ opacity: 0, scale: 0.95, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 12 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: BG,
                            borderRadius: 'var(--radius-md)',
                            padding: 32,
                            maxWidth: 460,
                            width: '100%',
                            border: '1px solid var(--ds-og-border)',
                            boxShadow: 'var(--ds-shadow-modal)',
                        }}
                    >
                        {/* Icon medallion — same vocabulary as the queued-pause warning */}
                        <div style={{
                            width: 48, height: 48, borderRadius: '50%',
                            background: 'var(--ds-og-wash)',
                            border: '1.5px solid var(--ds-og-border-strong)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: 18, color: OG,
                        }}>
                            <PiggyBank size={22} strokeWidth={2} />
                        </div>

                        <h2
                            id="savings-benchmark-title"
                            style={{
                            margin: 0,
                            fontFamily: BODY, fontSize: 20, fontWeight: 800,
                            color: S.fg, lineHeight: 1.2, letterSpacing: '-0.02em',
                        }}>
                            {isEditing
                                ? 'Update your takeout benchmark'
                                : 'What would a typical takeout dinner cost you?'}
                        </h2>
                        <p style={{
                            margin: '10px 0 0 0',
                            fontFamily: BODY, fontSize: 14, color: S.fgMuted,
                            lineHeight: 1.65,
                        }}>
                            {isEditing
                                ? 'Adjust the figure if your usual takeout cost has changed. Your savings number recalculates from here.'
                                : 'One quick answer. We’ll use it to show how much you’re saving with Dormers each cycle.'}
                        </p>

                        {/* Slider — AED 15 to 50, integer steps. Live AED value below. */}
                        <div style={{ marginTop: 22 }}>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                fontFamily: BODY, fontSize: 10.5, fontWeight: 800,
                                letterSpacing: '0.16em', textTransform: 'uppercase',
                                color: S.fgSub, marginBottom: 8,
                            }}>
                                <span>AED 15</span>
                                <span>AED 50</span>
                            </div>
                            <input
                                type="range"
                                min={MIN}
                                max={MAX}
                                step={1}
                                value={value}
                                onChange={(e) => setValue(Number(e.target.value))}
                                aria-label="Typical takeout cost in AED"
                                style={{
                                    width: '100%',
                                    accentColor: OG,
                                    cursor: 'pointer',
                                }}
                            />
                            <div style={{
                                marginTop: 14,
                                textAlign: 'center',
                            }}>
                                <span style={{
                                    fontFamily: BODY, fontSize: 12, fontWeight: 700,
                                    color: S.fgFaint, marginRight: 4,
                                }}>AED</span>
                                <span style={{
                                    fontFamily: BODY, fontSize: 32, fontWeight: 900,
                                    color: S.fg, letterSpacing: '-0.02em',
                                    fontFeatureSettings: '"tnum"',
                                }}>
                                    {value}
                                </span>
                                <span style={{
                                    fontFamily: BODY, fontSize: 12.5, fontWeight: 500,
                                    color: S.fgMuted, marginLeft: 6,
                                }}>
                                    / meal
                                </span>
                            </div>
                        </div>

                        {/* Live preview — composites the user's input with the per-meal cost
                            so they can see the math before committing. Surfaces zero (or near-zero)
                            saving as an honest signal, not a hidden negative result.
                            When perMealDormers is 0 (plan_name didn't resolve — extremely rare
                            edge case from corrupted legacy data), suppress the comparison line
                            so we never display "AED 0 per meal" or a falsely huge saving. */}
                        {perMealDormers > 0 ? (
                            <div style={{
                                marginTop: 18,
                                padding: '12px 14px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--ds-og-wash)',
                                border: '1px solid var(--ds-og-border)',
                                fontFamily: BODY, fontSize: 12.5, color: S.fg,
                                lineHeight: 1.55,
                            }}>
                                Dormers costs you about{' '}
                                <strong style={{ color: S.fg, fontFeatureSettings: '"tnum"' }}>AED {perMealDisplay}</strong> per meal.{' '}
                                {perMealSaved > 0 ? (
                                    <>That&apos;s{' '}
                                        <strong style={{ color: OG, fontFeatureSettings: '"tnum"' }}>
                                            AED {perMealSavedDisplay}
                                        </strong>{' '}
                                        saved on each one.</>
                                ) : (
                                    <>Your benchmark is close to that — savings will look small.</>
                                )}
                            </div>
                        ) : (
                            <div style={{
                                marginTop: 18,
                                padding: '12px 14px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--ds-skeleton-base)',
                                border: '1px solid var(--ds-border-soft)',
                                fontFamily: BODY, fontSize: 12.5, color: S.fgMuted,
                                lineHeight: 1.55,
                            }}>
                                We&apos;ll show your live savings once your plan is fully set up.
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isPending}
                                style={{
                                    flex: 1, padding: '12px 0',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--ds-border-strong)',
                                    background: 'var(--ds-surface2)',
                                    color: S.fg,
                                    fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                    letterSpacing: '0.04em',
                                    cursor: isPending ? 'not-allowed' : 'pointer',
                                    opacity: isPending ? 0.6 : 1,
                                }}
                            >
                                Not now
                            </button>
                            <button
                                type="button"
                                onClick={() => { if (!isPending) onConfirm(value) }}
                                disabled={isPending}
                                style={{
                                    flex: 2, padding: '12px 0',
                                    borderRadius: 'var(--radius-sm)',
                                    border: 'none',
                                    background: OG, color: '#fff',
                                    fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                    letterSpacing: '0.04em',
                                    boxShadow: '0 0 16px rgba(245,127,32,0.45)',
                                    cursor: isPending ? 'not-allowed' : 'pointer',
                                    opacity: isPending ? 0.6 : 1,
                                }}
                            >
                                {isPending ? 'Saving…' : isEditing ? 'Update benchmark' : 'Confirm'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
