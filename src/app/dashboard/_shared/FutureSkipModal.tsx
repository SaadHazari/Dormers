'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, RotateCcw, SkipForward } from 'lucide-react'
import { BODY, OG, S, cleanPlanName } from './tokens'
import { MobileSheet } from './MobileSheet'
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
 * Presented through {@link MobileSheet} — a centered dialog ≥768 (unchanged) and
 * a bottom sheet <768 with a scrollable body + bottom-pinned CTA band, so the
 * confirm action stays in the thumb zone above Safari's toolbar even when the
 * date-picker grid makes the body taller than the phone viewport.
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

    // Picker mode: split future working days into two buckets.
    //   • pickable    — strictly > today AE, ≤ end_date, working day, not
    //                   already skipped, not in planned-pause window, and
    //                   position ≤ totalDeliveries (i.e. NOT a make-up day).
    //   • makeupDays  — same filters EXCEPT position > totalDeliveries.
    //
    // Make-up days are rendered as disabled chips so the customer can see
    // why their cycle's tail isn't selectable (otherwise the picker silently
    // ends earlier than they'd expect and they're left guessing).
    const { pickable, makeupDays } = useMemo(() => {
        if (mode !== 'pick-then-skip') {
            return { pickable: [] as string[], makeupDays: [] as string[] }
        }
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
        const plannedPauseStart = sub.planned_pause_start ?? null

        const pickable: string[] = []
        const makeupDays: string[] = []
        const cursor = new Date(sub.start_date + 'T00:00:00')
        let position = 0
        while (cursor.getTime() <= end.getTime()) {
            if (isWorkingDay(cursor, weekType)) {
                position++
                const iso = isoOf(cursor)
                const insidePlannedPause = !!plannedPauseStart && iso >= plannedPauseStart
                const eligible =
                    cursor.getTime() >= tomorrow.getTime()
                    && !skippedSet.has(iso)
                    && !insidePlannedPause
                if (eligible) {
                    if (position <= totalDeliveries) pickable.push(iso)
                    else makeupDays.push(iso)
                }
            }
            cursor.setDate(cursor.getDate() + 1)
        }
        return { pickable, makeupDays }
    }, [mode, sub.week_type, sub.end_date, sub.start_date, sub.total_meals, sub.skipped_dates, sub.plan_name, sub.planned_pause_start])

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
    // Short CTA label — the full date already lives in the headline, so a long
    // label here would wrap in the bottom-pinned band on a narrow phone.
    const ctaText = isUnskip
        ? 'Un-skip this day'
        : (selectedDate ? 'Skip this day' : 'Pick a date')

    const onConfirm = () => {
        if (!selectedDate || isPending) return
        if (isUnskip) onConfirmUnskip(selectedDate)
        else onConfirmSkip(selectedDate)
    }

    const footer = (
        <>
            <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                style={{
                    padding: '12px 18px', borderRadius: 999,
                    background: 'transparent',
                    border: `1px solid ${S.border2}`,
                    color: S.fg,
                    fontFamily: BODY, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', flex: 'none',
                }}
            >
                Cancel
            </button>
            <button
                type="button"
                onClick={onConfirm}
                disabled={!selectedDate || isPending}
                style={{
                    padding: '12px 20px', borderRadius: 999,
                    background: OG, color: '#fff',
                    border: 'none',
                    fontFamily: BODY, fontSize: 13, fontWeight: 700,
                    cursor: selectedDate && !isPending ? 'pointer' : 'not-allowed',
                    opacity: selectedDate && !isPending ? 1 : 0.55,
                    boxShadow: '0 4px 16px rgba(245,127,32,0.30)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    flex: '1 1 auto',
                }}
            >
                {isUnskip
                    ? <RotateCcw size={14} strokeWidth={2.4} />
                    : <SkipForward size={14} strokeWidth={2.4} />}
                {ctaText}
            </button>
        </>
    )

    return (
        <MobileSheet
            open={open}
            onClose={onClose}
            maxWidth={460}
            ariaLabelledby="future-skip-headline"
            footer={footer}
        >
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

            {mode === 'pick-then-skip' && (pickable.length > 0 || makeupDays.length > 0) && (
                <div style={{ marginTop: 18 }}>
                    <div style={{
                        fontFamily: BODY, fontSize: 11, fontWeight: 700,
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: S.fgSub, marginBottom: 8,
                    }}>
                        Pick a day to skip
                    </div>
                    <div
                        className="mobile-sheet-scroll"
                        style={{
                            display: 'flex', flexWrap: 'wrap', gap: 6,
                            maxHeight: 168, overflowY: 'auto', overscrollBehavior: 'contain',
                        }}
                    >
                        {pickable.map(iso => {
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
                        {makeupDays.map(iso => {
                            const d = new Date(iso + 'T00:00:00')
                            const label = d.toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
                            return (
                                <button
                                    key={iso}
                                    type="button"
                                    disabled
                                    title="Make-up day · can't skip"
                                    aria-label={`${label} — make-up day, can't skip`}
                                    style={{
                                        padding: '8px 12px', borderRadius: 8,
                                        border: `1px dashed var(--ds-border)`,
                                        background: 'transparent',
                                        color: S.fgMuted,
                                        fontFamily: BODY, fontSize: 12, fontWeight: 700,
                                        cursor: 'not-allowed', whiteSpace: 'nowrap',
                                        fontFeatureSettings: '"tnum"',
                                        opacity: 0.7,
                                    }}
                                >
                                    {label}
                                </button>
                            )
                        })}
                    </div>
                    {makeupDays.length > 0 && (
                        <div style={{
                            marginTop: 8,
                            fontFamily: BODY, fontSize: 11.5,
                            color: S.fgMuted, lineHeight: 1.5,
                        }}>
                            Greyed-out dates are make-up days — bonus catch-up meals at the tail of your cycle that replace earlier skips. They can&rsquo;t be skipped themselves.
                        </div>
                    )}
                </div>
            )}

            {mode === 'pick-then-skip' && pickable.length === 0 && makeupDays.length === 0 && (
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
        </MobileSheet>
    )
}
