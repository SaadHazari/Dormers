'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, RotateCcw, SkipForward, X } from 'lucide-react'
import { BODY, OG, S, TIER1, cleanPlanName } from './tokens'
import type { Subscription } from './types'

export type FutureSkipMode = 'confirm-skip' | 'confirm-unskip' | 'pick-then-skip'

interface Props {
    open: boolean
    onClose: () => void
    mode: FutureSkipMode
    /** Pre-filled date for confirm modes. Optional for picker mode. */
    initialDate?: string
    sub: Subscription
    maxSkips: number
    /** Queued renewal, if any. When set, the modal shows a warning banner
     *  explaining that the queued plan's start date will shift forward by
     *  one working day per skip — the DB trigger handles the actual
     *  cascade, but the customer needs to know before they confirm. */
    queuedSub?: Subscription | null
    isPending: boolean
    onConfirmSkip: (dateIso: string) => void
    onConfirmUnskip: (dateIso: string) => void
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
 * Unified confirmation modal for future-skip and future-unskip flows.
 *
 *   • confirm-skip    — pre-filled date, ask the customer to confirm skipping it
 *   • confirm-unskip  — pre-filled date, ask the customer to confirm undoing it
 *   • pick-then-skip  — no date, render a picker chip-grid then confirm
 *
 * Mirrors the dashboard's `TIER1` surface tokens and motion vocabulary so the
 * modal reads as part of the same family as the existing skip-today / pause
 * confirmation modals in ActiveDashboard.
 */
export function FutureSkipModal({
    open, onClose, mode, initialDate, sub, maxSkips, queuedSub, isPending,
    onConfirmSkip, onConfirmUnskip,
}: Props) {
    const [selectedDate, setSelectedDate] = useState<string>(initialDate ?? '')

    // Sync internal state with the prop. When the modal re-opens with a
    // different initialDate (e.g., user clicks pill A then closes, opens
    // pill B), reset the selection.
    useEffect(() => {
        if (open) setSelectedDate(initialDate ?? '')
    }, [open, initialDate])

    // Picker mode: build the list of selectable future working days. Filters:
    //   • strictly > today AE
    //   • <= end_date
    //   • working day for the customer's week_type
    //   • not already in skipped_dates
    //   • not a make-up day (position <= totalDeliveries from start)
    const availableDates = useMemo(() => {
        if (mode !== 'pick-then-skip') return []
        const weekType: '5DAYS' | '6DAYS' = sub.week_type === '5DAYS' ? '5DAYS' : '6DAYS'
        const todayIso = aeTodayIso()
        const tomorrow = new Date(todayIso + 'T00:00:00')
        tomorrow.setDate(tomorrow.getDate() + 1)
        const end = new Date(sub.end_date + 'T00:00:00')
        // Monthly Max delivers 2 meals/day in a single drop; everything else
        // delivers 1/day. Matches PlanProgress + server actions.
        const mealsPerDelivery = sub.plan_name.includes('Monthly Max') ? 2 : 1
        const total = sub.total_meals ?? 0
        const totalDeliveries = Math.max(1, Math.ceil(total / mealsPerDelivery))
        const skippedSet = new Set(sub.skipped_dates ?? [])

        // Block all dates inside the planned-pause window (open-ended).
        // Skipping inside the pause is wasted credit — the pause covers it.
        const plannedPauseStart = sub.planned_pause_start ?? null

        const out: string[] = []
        const cursor = new Date(sub.start_date + 'T00:00:00')
        let position = 0
        while (cursor.getTime() <= end.getTime()) {
            if (isWorkingDay(cursor, weekType)) {
                position++
                const iso = isoOf(cursor)
                const insidePlannedPause = !!plannedPauseStart && iso >= plannedPauseStart
                if (position <= totalDeliveries
                    && cursor.getTime() >= tomorrow.getTime()
                    && !skippedSet.has(iso)
                    && !insidePlannedPause) {
                    out.push(iso)
                }
            }
            cursor.setDate(cursor.getDate() + 1)
        }
        return out
    }, [mode, sub.week_type, sub.end_date, sub.start_date, sub.total_meals, sub.skipped_dates, sub.plan_name, sub.planned_pause_start])

    // Close on Escape
    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    const isUnskip = mode === 'confirm-unskip'

    // Queued-plan shift preview. The DB trigger
    // `trg_subscriptions_shift_queued_scheduled` pushes the queued sub's
    // start_date forward by 1 working day per skip; we mirror that math
    // client-side so the customer sees the consequence before confirming.
    // Only shown for SKIP modes (un-skip contracts the cycle but doesn't
    // automatically un-shift the queue, so no preview applies there).
    const queuedShiftPreview = useMemo(() => {
        if (!queuedSub || isUnskip) return null
        const wt: '5DAYS' | '6DAYS' = queuedSub.week_type === '5DAYS' ? '5DAYS' : '6DAYS'
        const next = new Date(queuedSub.start_date + 'T00:00:00')
        next.setDate(next.getDate() + 1)
        // Safety cap mirroring the trigger's 14-step cap.
        for (let i = 0; i < 14 && !isWorkingDay(next, wt); i++) {
            next.setDate(next.getDate() + 1)
        }
        return {
            name: cleanPlanName(queuedSub.plan_name),
            oldStart: queuedSub.start_date,
            newStart: isoOf(next),
        }
    }, [queuedSub, isUnskip])
    const headline = isUnskip
        ? `Un-skip ${selectedDate ? formatLongDate(selectedDate) : 'this day'}?`
        : mode === 'pick-then-skip' && !selectedDate
            ? 'Plan a skip'
            : `Skip ${selectedDate ? formatLongDate(selectedDate) : 'this day'}?`

    const subline = isUnskip
        ? 'Your meal for that day will be delivered. The make-up day at the end of your cycle will be removed.'
        : 'You won’t get a meal that day. We’ll add a make-up day at the end of your cycle so you still get every meal you paid for.'

    const skipsLeft = Math.max(0, maxSkips - sub.skipped_meals_count)
    const ctaText = isUnskip
        ? (selectedDate ? `Un-skip ${formatLongDate(selectedDate)}` : 'Un-skip')
        : (selectedDate ? `Skip ${formatLongDate(selectedDate)}` : 'Pick a date')

    const onConfirm = () => {
        if (!selectedDate || isPending) return
        if (isUnskip) onConfirmUnskip(selectedDate)
        else onConfirmSkip(selectedDate)
    }

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="future-skip-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={onClose}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="future-skip-headline"
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

                        <div
                            id="future-skip-headline"
                            style={{
                                fontFamily: BODY, fontSize: 'clamp(20px, 3vw, 24px)',
                                fontWeight: 800, color: S.fg,
                                letterSpacing: '-0.01em', lineHeight: 1.2,
                                marginRight: 30,
                            }}
                        >
                            {headline}
                        </div>

                        <div style={{ marginTop: 10, fontFamily: BODY, fontSize: 13.5, color: S.fgMuted, lineHeight: 1.55 }}>
                            {subline}
                        </div>

                        {queuedShiftPreview && (
                            <div style={{
                                marginTop: 16,
                                padding: '12px 14px',
                                borderRadius: 10,
                                background: 'var(--ds-og-wash)',
                                border: '1px solid var(--ds-og-border)',
                                display: 'flex', gap: 10, alignItems: 'flex-start',
                            }}>
                                <span style={{
                                    flex: 'none', marginTop: 1,
                                    color: OG,
                                }}>
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
                                        Your queued <strong style={{ fontWeight: 700 }}>{queuedShiftPreview.name}</strong> will start one day later — moves from{' '}
                                        <span style={{ color: S.fgMuted, textDecoration: 'line-through' }}>
                                            {formatLongDate(queuedShiftPreview.oldStart)}
                                        </span>{' '}
                                        to <strong style={{ fontWeight: 700 }}>{formatLongDate(queuedShiftPreview.newStart)}</strong>.
                                    </div>
                                </div>
                            </div>
                        )}

                        {mode === 'pick-then-skip' && availableDates.length > 0 && (
                            <div style={{ marginTop: 18 }}>
                                <div style={{
                                    fontFamily: BODY, fontSize: 11, fontWeight: 700,
                                    letterSpacing: '0.12em', textTransform: 'uppercase',
                                    color: S.fgSub, marginBottom: 8,
                                }}>
                                    Pick a day to skip
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

                        {mode === 'pick-then-skip' && availableDates.length === 0 && (
                            <div style={{
                                marginTop: 18, padding: 14, borderRadius: 10,
                                background: 'var(--ds-skeleton-base)',
                                fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.55,
                            }}>
                                No eligible future working days in your current cycle.
                            </div>
                        )}

                        {!isUnskip && (
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
                                    Skips remaining:
                                </span>
                                <span style={{ fontFeatureSettings: '"tnum"' }}>{skipsLeft}</span>
                                <span style={{ color: S.fgFaint }}>of</span>
                                <span style={{ fontFeatureSettings: '"tnum"' }}>{maxSkips}</span>
                            </div>
                        )}

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
                                onClick={onConfirm}
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
                                {isUnskip
                                    ? <RotateCcw size={14} strokeWidth={2.4} />
                                    : <SkipForward size={14} strokeWidth={2.4} />}
                                {ctaText}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
