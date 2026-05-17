'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, PauseCircle, X } from 'lucide-react'
import { BODY, OG, S, TIER1, cleanPlanName } from './tokens'
import type { Subscription } from './types'

interface Props {
    open: boolean
    onClose: () => void
    sub: Subscription
    queuedSub?: Subscription | null
    isPending: boolean
    onConfirm: (startDateIso: string) => void
}

function isoOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function aeTodayIso(): string {
    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
    return `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`
}

function isWorkingDay(d: Date, weekType: '5DAYS' | '6DAYS'): boolean {
    const isoDow = ((d.getDay() + 6) % 7) + 1
    if (weekType === '5DAYS') return isoDow !== 6 && isoDow !== 7
    return isoDow !== 7
}

function formatLongDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * "Plan a pause" modal — Variant B (open-ended pause).
 *
 * Customer picks a future start date; pause auto-activates on that date and
 * stays paused until the customer manually resumes. The credit is consumed
 * at plan-time (refundable via cancelPlannedPause before activation).
 *
 * Mirrors FutureSkipModal's visual language so the dashboard's planning
 * surfaces read as one family. Queued-renewal warning surfaces the cascade
 * the customer should know about before committing.
 */
export function PlanPauseModal({
    open, onClose, sub, queuedSub, isPending, onConfirm,
}: Props) {
    const [selectedDate, setSelectedDate] = useState<string>('')

    useEffect(() => {
        if (!open) setSelectedDate('')
    }, [open])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    // Available start dates: strictly-future working days within the current
    // cycle, capped at totalDeliveries (no make-up days as pause-start, same
    // rule as future skip).
    const availableDates = useMemo(() => {
        if (!open) return []
        const weekType: '5DAYS' | '6DAYS' = sub.week_type === '5DAYS' ? '5DAYS' : '6DAYS'
        const todayIso = aeTodayIso()
        const tomorrow = new Date(todayIso + 'T00:00:00')
        tomorrow.setDate(tomorrow.getDate() + 1)
        const end = new Date(sub.end_date + 'T00:00:00')
        // Monthly Max delivers 2 meals/day in a single drop; everything else
        // delivers 1/day. Matches the derivation in PlanProgress.
        const mealsPerDelivery = sub.plan_name.includes('Monthly Max') ? 2 : 1
        const total = sub.total_meals ?? 0
        const totalDeliveries = Math.max(1, Math.ceil(total / mealsPerDelivery))

        const out: string[] = []
        const cursor = new Date(sub.start_date + 'T00:00:00')
        let position = 0
        while (cursor.getTime() <= end.getTime()) {
            if (isWorkingDay(cursor, weekType)) {
                position++
                if (position <= totalDeliveries && cursor.getTime() >= tomorrow.getTime()) {
                    out.push(isoOf(cursor))
                }
            }
            cursor.setDate(cursor.getDate() + 1)
        }
        return out
    }, [open, sub.week_type, sub.start_date, sub.end_date, sub.total_meals, sub.plan_name])

    // Queued-renewal warning. Unlike skip (which shifts by exactly 1 working
    // day), planned pause is open-ended — we can't predict the queued plan's
    // new start until the customer resumes. Warn directionally without a
    // specific new date.
    const queuedWarning = useMemo(() => {
        if (!queuedSub) return null
        return {
            name: cleanPlanName(queuedSub.plan_name),
            currentStart: queuedSub.start_date,
        }
    }, [queuedSub])

    // Scheduled skips that fall inside the would-be pause window — these
    // get auto-cancelled by the server action on commit (credit refunded).
    // We warn the customer explicitly so the cancellation isn't silent.
    // Only computed once the customer has picked a start date.
    const overlappingSkips = useMemo(() => {
        if (!selectedDate) return [] as string[]
        const skipped = sub.skipped_dates ?? []
        return skipped.filter(d => d >= selectedDate).sort()
    }, [selectedDate, sub.skipped_dates])

    const onConfirmClick = () => {
        if (!selectedDate || isPending) return
        onConfirm(selectedDate)
    }

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="plan-pause-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={onClose}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="plan-pause-headline"
                    style={{
                        position: 'fixed', inset: 0, zIndex: 300,
                        background: 'rgba(9,24,37,0.65)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 20,
                        cursor: 'pointer',
                    }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.94, y: 14 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            ...TIER1,
                            cursor: 'default',
                            width: '100%',
                            maxWidth: 460,
                            borderRadius: 'var(--radius-md)',
                            padding: 'clamp(24px, 4vw, 32px)',
                            position: 'relative',
                        }}
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            style={{
                                position: 'absolute', top: 14, right: 14,
                                padding: 6, borderRadius: 6,
                                background: 'transparent', border: 'none',
                                color: S.fgFaint, cursor: 'pointer',
                            }}
                        >
                            <X size={18} strokeWidth={2.2} />
                        </button>

                        {/* Medallion */}
                        <div style={{
                            width: 44, height: 44, borderRadius: '50%',
                            background: 'var(--ds-og-wash)',
                            border: '1.5px solid var(--ds-og-border-strong)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: 14, color: OG,
                        }}>
                            <PauseCircle size={20} strokeWidth={2} />
                        </div>

                        <div
                            id="plan-pause-headline"
                            style={{
                                fontFamily: BODY, fontSize: 'clamp(20px, 3vw, 24px)',
                                fontWeight: 800, color: S.fg,
                                letterSpacing: '-0.01em', lineHeight: 1.2,
                                marginRight: 30,
                            }}
                        >
                            {selectedDate ? `Pause from ${formatLongDate(selectedDate)}?` : 'Plan a pause'}
                        </div>

                        <div style={{ marginTop: 10, fontFamily: BODY, fontSize: 13.5, color: S.fgMuted, lineHeight: 1.55 }}>
                            Pick when your pause begins. You&apos;ll <strong style={{ color: S.fg, fontWeight: 700 }}>manually resume</strong> when you&apos;re back — each paused day extends your cycle by one.
                        </div>

                        {queuedWarning && (
                            <div style={{
                                marginTop: 16,
                                padding: '12px 14px',
                                borderRadius: 10,
                                background: 'var(--ds-og-wash)',
                                border: '1px solid var(--ds-og-border)',
                                display: 'flex', gap: 10, alignItems: 'flex-start',
                            }}>
                                <span style={{ flex: 'none', marginTop: 1, color: OG }}>
                                    <CalendarClock size={16} strokeWidth={2.2} />
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontFamily: BODY, fontSize: 11,
                                        fontWeight: 800, letterSpacing: '0.12em',
                                        textTransform: 'uppercase', color: S.fgSub,
                                    }}>
                                        Your queued plan shifts later
                                    </div>
                                    <div style={{
                                        marginTop: 6, fontFamily: BODY, fontSize: 12.5,
                                        color: S.fg, lineHeight: 1.55,
                                    }}>
                                        Your queued <strong style={{ fontWeight: 700 }}>{queuedWarning.name}</strong> is set to start{' '}
                                        <strong style={{ fontWeight: 700 }}>{formatLongDate(queuedWarning.currentStart)}</strong>. Each day you stay paused will push it one day later — your dashboard will show the confirmed start the moment you resume.
                                    </div>
                                </div>
                            </div>
                        )}

                        {overlappingSkips.length > 0 && (
                            <div style={{
                                marginTop: 16,
                                padding: '12px 14px',
                                borderRadius: 10,
                                background: 'var(--ds-og-wash)',
                                border: '1px solid var(--ds-og-border)',
                                display: 'flex', gap: 10, alignItems: 'flex-start',
                            }}>
                                <span style={{ flex: 'none', marginTop: 1, color: OG }}>
                                    <CalendarClock size={16} strokeWidth={2.2} />
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontFamily: BODY, fontSize: 11,
                                        fontWeight: 800, letterSpacing: '0.12em',
                                        textTransform: 'uppercase', color: S.fgSub,
                                    }}>
                                        {overlappingSkips.length === 1
                                            ? 'A scheduled skip will be cancelled'
                                            : `${overlappingSkips.length} scheduled skips will be cancelled`}
                                    </div>
                                    <div style={{
                                        marginTop: 6, fontFamily: BODY, fontSize: 12.5,
                                        color: S.fg, lineHeight: 1.55,
                                    }}>
                                        The pause covers{' '}
                                        <strong style={{ fontWeight: 700 }}>
                                            {overlappingSkips.map(d => formatLongDate(d)).join(', ')}
                                        </strong>
                                        {' '}— so those skip credits will be refunded automatically when you confirm.
                                    </div>
                                </div>
                            </div>
                        )}

                        {availableDates.length > 0 && (
                            <div style={{ marginTop: 18 }}>
                                <div style={{
                                    fontFamily: BODY, fontSize: 11, fontWeight: 700,
                                    letterSpacing: '0.12em', textTransform: 'uppercase',
                                    color: S.fgSub, marginBottom: 8,
                                }}>
                                    Pause should start on
                                </div>
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: 6,
                                    maxHeight: 200, overflowY: 'auto',
                                }}>
                                    {availableDates.map(iso => {
                                        const isSelected = iso === selectedDate
                                        const d = new Date(iso + 'T00:00:00')
                                        const label = d.toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
                                        return (
                                            <button
                                                key={iso}
                                                type="button"
                                                onClick={() => setSelectedDate(iso)}
                                                style={{
                                                    padding: '8px 12px', borderRadius: 8,
                                                    border: `1px solid ${isSelected ? OG : 'var(--ds-border)'}`,
                                                    background: isSelected ? OG : 'transparent',
                                                    color: isSelected ? '#fff' : S.fg,
                                                    fontFamily: BODY, fontSize: 12, fontWeight: 700,
                                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                                    fontFeatureSettings: '"tnum"',
                                                    transition: 'background 150ms, border-color 150ms, color 150ms',
                                                }}
                                            >
                                                {label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {availableDates.length === 0 && (
                            <div style={{
                                marginTop: 18, padding: 14, borderRadius: 10,
                                background: 'var(--ds-skeleton-base)',
                                fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.55,
                            }}>
                                No eligible future working days in your current cycle.
                            </div>
                        )}

                        <div style={{
                            marginTop: 16,
                            padding: '10px 14px',
                            borderRadius: 8,
                            background: 'var(--ds-skeleton-base)',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontFamily: BODY, fontSize: 12, fontWeight: 700,
                            color: S.fg,
                        }}>
                            <span style={{
                                color: S.fgMuted, textTransform: 'uppercase',
                                fontSize: 10.5, letterSpacing: '0.1em',
                            }}>
                                Pause credit:
                            </span>
                            <span>1 of 1 available</span>
                        </div>

                        <div style={{
                            marginTop: 24, display: 'flex', gap: 10,
                            justifyContent: 'flex-end', flexWrap: 'wrap',
                        }}>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isPending}
                                style={{
                                    padding: '11px 18px', borderRadius: 999,
                                    background: 'transparent',
                                    border: `1px solid ${S.border2}`,
                                    color: S.fg,
                                    fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={onConfirmClick}
                                disabled={!selectedDate || isPending}
                                style={{
                                    padding: '11px 20px', borderRadius: 999,
                                    background: OG, color: '#fff',
                                    border: 'none',
                                    fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                    cursor: selectedDate && !isPending ? 'pointer' : 'not-allowed',
                                    opacity: selectedDate && !isPending ? 1 : 0.55,
                                    boxShadow: '0 4px 16px rgba(245,127,32,0.30)',
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                }}
                            >
                                <PauseCircle size={14} strokeWidth={2.4} />
                                {selectedDate ? `Plan pause from ${formatLongDate(selectedDate)}` : 'Pick a date'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
