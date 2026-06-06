'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, PauseCircle } from 'lucide-react'
import { BODY, OG, S, cleanPlanName } from './tokens'
import { MobileSheet } from './MobileSheet'
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
 * Presented through {@link MobileSheet} — a centered dialog ≥768 (the original
 * look) and a bottom sheet <768 with a scrollable body + a bottom-pinned CTA
 * band in the thumb zone, so on small phones the primary action is always
 * tappable above Safari's toolbar (the old centered-overflow layout buried it).
 */
export function PlanPauseModal({
    open, onClose, sub, queuedSub, isPending, onConfirm,
}: Props) {
    const [selectedDate, setSelectedDate] = useState<string>('')

    useEffect(() => {
        if (!open) setSelectedDate('')
    }, [open])

    // Split future working days into two buckets so the picker can show
    // make-up days as disabled chips — silently dropping them used to leave
    // the customer guessing why their cycle's tail wasn't selectable.
    //
    //   • pickable   — strictly > today AE, ≤ end_date, working day, and
    //                  position ≤ totalDeliveries (i.e. NOT a make-up day).
    //   • makeupDays — same filters EXCEPT position > totalDeliveries.
    const { pickable, makeupDays } = useMemo(() => {
        if (!open) return { pickable: [] as string[], makeupDays: [] as string[] }
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

        const pickable: string[] = []
        const makeupDays: string[] = []
        const cursor = new Date(sub.start_date + 'T00:00:00')
        let position = 0
        while (cursor.getTime() <= end.getTime()) {
            if (isWorkingDay(cursor, weekType)) {
                position++
                if (cursor.getTime() >= tomorrow.getTime()) {
                    const iso = isoOf(cursor)
                    if (position <= totalDeliveries) pickable.push(iso)
                    else makeupDays.push(iso)
                }
            }
            cursor.setDate(cursor.getDate() + 1)
        }
        return { pickable, makeupDays }
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
                onClick={onConfirmClick}
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
                    // Grow to fill the thumb-zone band on mobile; natural width sits
                    // inline-end on desktop (the band right-aligns there).
                    flex: '1 1 auto',
                }}
            >
                <PauseCircle size={14} strokeWidth={2.4} />
                {selectedDate ? 'Plan this pause' : 'Pick a date'}
            </button>
        </>
    )

    return (
        <MobileSheet
            open={open}
            onClose={onClose}
            maxWidth={460}
            ariaLabelledby="plan-pause-headline"
            footer={footer}
        >
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

            {(pickable.length > 0 || makeupDays.length > 0) && (
                <div style={{ marginTop: 18 }}>
                    <div style={{
                        fontFamily: BODY, fontSize: 11, fontWeight: 700,
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: S.fgSub, marginBottom: 8,
                    }}>
                        Pause should start on
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
                                    title="Make-up day · can't start a pause here"
                                    aria-label={`${label} — make-up day, can't start a pause here`}
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
                            Greyed-out dates are make-up days — bonus catch-up meals at the tail of your cycle that replace earlier skips. A pause can&rsquo;t start on one.
                        </div>
                    )}
                </div>
            )}

            {pickable.length === 0 && makeupDays.length === 0 && (
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
        </MobileSheet>
    )
}
