'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Moon } from 'lucide-react'
import { OG, OG3, NV, BODY, S, TIER2, TIER_POP_TEXT, cleanPlanName } from './_shared/tokens'
import { Eyebrow } from './_shared/Eyebrow'
import { PlanGlyph } from './_shared/PlanGlyph'
import { fmt } from './_shared/format'
import { btnStyle } from './_shared/buttons'
import type { Subscription } from './_shared/types'
import { groupPauseRanges, buildPauseLookup } from './_shared/pause-ranges'

// ── Calendar-bar helpers ──────────────────────────────────────────────────────
// The bar is a true date-pegged timeline: one pill per working day from
// start_date through end_date. Each pill has stable identity — its calendar
// date never changes. State is derived by membership tests:
//   • date ∈ skipped_dates                  → skipped
//   • date < today AE (and not skipped)     → delivered
//   • date === today AE                     → today (pulsing) / today-delivered / today-skipped
//   • date > today AE, index >= totalDeliveries  → make-up (earned by a skip)
//   • date > today AE, index <  totalDeliveries  → remaining
//   • isPaused AND date >= pause_date AE    → paused (overlays the above)

type WeekType = '5DAYS' | '6DAYS'

function isWorkingDay(d: Date, weekType: WeekType): boolean {
    const js = d.getDay()                 // 0=Sun..6=Sat
    const isoDow = js === 0 ? 7 : js      // 1=Mon..7=Sun
    if (weekType === '5DAYS') return isoDow !== 6 && isoDow !== 7
    return isoDow !== 7
}

// Local YYYY-MM-DD — never UTC. `.toISOString().slice(0,10)` would shift a
// midnight-local Date back a day in any positive offset (AE is UTC+4 →
// local midnight is UTC 20:00 the previous day).
function isoOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// All working days in [startIso, endIso] inclusive. Length = the bar's pill
// count. Grows naturally with skip-extensions (since end_date is pushed out
// by skipped_meals_count) and pause-extensions (paused_days).
function buildPillDays(startIso: string, endIso: string, weekType: WeekType): Date[] {
    const days: Date[] = []
    const end = new Date(endIso + 'T00:00:00')
    const d = new Date(startIso + 'T00:00:00')
    while (d.getTime() <= end.getTime()) {
        if (isWorkingDay(d, weekType)) days.push(new Date(d))
        d.setDate(d.getDate() + 1)
    }
    return days
}

// AE = UTC+4 year-round (no DST). Returns AE wall date + hour as plain values
// so the component can render off them and the 60s tick can compare for
// changes without re-instantiating Dates.
function getAENow(): { iso: string; hour: number } {
    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000)
    return {
        iso: `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`,
        hour: ae.getUTCHours(),
    }
}

// Convert a timestamptz (e.g. sub.pause_date) to its AE wall date YYYY-MM-DD.
function aeDateOfTimestamp(ts: string | null | undefined): string | null {
    if (!ts) return null
    const ae = new Date(new Date(ts).getTime() + 4 * 60 * 60 * 1000)
    return `${ae.getUTCFullYear()}-${String(ae.getUTCMonth() + 1).padStart(2, '0')}-${String(ae.getUTCDate()).padStart(2, '0')}`
}

// Pill-date wording for tooltips. "Today" / "Yesterday" / "Tomorrow" for the
// adjacent-3 day range; full "Mon, 12 May" otherwise.
function formatPillDate(d: Date, todayIso: string): string {
    const dIso = isoOf(d)
    if (dIso === todayIso) return 'Today'
    const td = new Date(todayIso + 'T00:00:00')
    const pd = new Date(dIso + 'T00:00:00')
    const diff = Math.round((pd.getTime() - td.getTime()) / 86400000)
    if (diff === -1) return 'Yesterday'
    if (diff === 1) return 'Tomorrow'
    return d.toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
}

type PillState =
    | 'delivered'
    | 'skipped'
    | 'today-pre'        // today, awaiting delivery (kitchen prep ongoing)
    | 'today-delivered'  // today, kitchen cron has run (>=20:00 AE)
    | 'today-skipped'    // today, customer pressed Skip
    | 'remaining'
    | 'makeup'           // remaining, but earned by a skip (post-original-end)
    | 'paused'           // overrides above for paused subs on/after pause_date

/**
 * Plan progress card — span-12. Calendar-driven progress bar: each pill is
 * a specific working day in the cycle with stable date identity. Hover any
 * pill → see the exact date + state. The today pill pulses to anchor the
 * "you are here" reference point. Make-up days (earned by skipping) carry
 * a subtle dotted top edge.
 */
export function PlanProgress({
    sub,
    isPaused = false,
    maxSkips = 0,
    hasQueuedRenewal = false,
    onPillSkip,
    onPillUnskip,
    onCancelPlannedPause,
}: {
    sub: Subscription
    isPaused?: boolean
    // Plan's skip allowance — drives the "credits remaining" gate on
    // future-remaining pill clickability. Defaults to 0 so the bar stays
    // read-only when this prop isn't supplied (legacy / preview usage).
    maxSkips?: number
    // True when the customer already has a Scheduled follow-up sub queued.
    // Suppresses the Renew CTAs below so a committed customer isn't nudged
    // to renew again (double-sub risk + the end-of-cycle banner above
    // already hides itself on the same condition).
    hasQueuedRenewal?: boolean
    // Pill click callbacks. When absent, pills stay read-only.
    // (A queued renewal no longer blocks future-skip — the DB trigger
    //  shifts the queued start_date automatically and the modal surfaces
    //  the cascade as a warning banner.)
    onPillSkip?: (dateIso: string) => void
    onPillUnskip?: (dateIso: string) => void
    // Triggered by the planned-pause banner's Cancel button. Opens the
    // cancel-planned-pause confirm modal owned by ActiveDashboard.
    onCancelPlannedPause?: () => void
}) {
    const isMax = sub.plan_name.includes('Monthly Max')
    const mealsPerDelivery = isMax ? 2 : 1
    const total = sub.total_meals
    // Planned deliveries = total meals ÷ meals/delivery. What the user paid
    // for. Stays constant. Pills at index >= totalDeliveries are make-up.
    const totalDeliveries = Math.max(1, Math.ceil(total / mealsPerDelivery))
    const deliveriesDone = Math.floor(sub.delivered_meals / mealsPerDelivery)
    const skippedDeliveries = Math.max(0, sub.skipped_meals_count)

    const weekType: WeekType = sub.week_type === '5DAYS' ? '5DAYS' : '6DAYS'

    // Every working day in [start_date, end_date] gets one pill. Stable
    // identity across re-renders (memoised on the date range + cadence).
    const pillDays = useMemo(
        () => buildPillDays(sub.start_date, sub.end_date, weekType),
        [sub.start_date, sub.end_date, weekType],
    )

    // O(1) lookup for "is this date a skip?" / "was this date paused?"
    const skipDateSet = useMemo(
        () => new Set(sub.skipped_dates ?? []),
        [sub.skipped_dates],
    )
    const pausedDateSet = useMemo(
        () => new Set(sub.paused_dates ?? []),
        [sub.paused_dates],
    )
    const pauseRanges = useMemo(
        () => groupPauseRanges(sub.paused_dates ?? [], weekType, skipDateSet),
        [sub.paused_dates, weekType, skipDateSet],
    )
    const pauseLookup = useMemo(() => buildPauseLookup(pauseRanges), [pauseRanges])

    // AE clock — ticks every 60s so the today pill flips at midnight (date
    // roll) and at 20:00 (pre-delivery → delivered) without a refresh.
    const [aeNow, setAENow] = useState(getAENow)
    useEffect(() => {
        const tick = () => {
            const next = getAENow()
            setAENow(prev => (prev.iso === next.iso && prev.hour === next.hour ? prev : next))
        }
        const t = setInterval(tick, 60_000)
        return () => clearInterval(t)
    }, [])

    // Pause cutoff (AE date). For paused subs, pills on/after this date
    // render as 'paused' regardless of position. Past pills classify
    // normally — those days were delivered (or skipped) before the pause.
    const pauseCutoffIso = useMemo(
        () => aeDateOfTimestamp(sub.pause_date),
        [sub.pause_date],
    )

    const [hoveredPill, setHoveredPill] = useState<number | null>(null)
    const prefersReducedMotion = useReducedMotion()

    // Headline + timeline counters (unchanged from the prior version).
    const left = Math.max(0, totalDeliveries - deliveriesDone)
    const mealsLeft = left * mealsPerDelivery
    const daysLeft = Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
    const startsInFuture = new Date(sub.start_date).getTime() > Date.now()
    // Suppress the Renew CTA when a follow-up sub is already queued — the
    // user has already committed, so re-nudging them invites a duplicate
    // purchase (and disagrees with the end-of-cycle banner one row above,
    // which already hides on the same condition).
    const renewEligible = !startsInFuture && daysLeft <= 7 && !hasQueuedRenewal

    // Untraced skip count — legacy subs created before the skipped_dates
    // column may have skipped_meals_count > skipped_dates.length. Surface a
    // small note below the bar so the customer isn't confused by a count
    // that doesn't match the visible hatched pills.
    const knownSkips = sub.skipped_dates?.length ?? 0
    const untracedSkips = Math.max(0, skippedDeliveries - knownSkips)

    return (
        <div style={{
            ...TIER2,
            gridColumn: 'span 12',
            padding: 28, borderRadius: 'var(--radius-md)',
            display: 'flex', flexDirection: 'column', gap: 0,
        }} className="plan-progress-card">

            {/* 1 — Plan identity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <PlanGlyph planName={sub.plan_name} size={14} color={S.fg} />
                <Eyebrow>{cleanPlanName(sub.plan_name)}</Eyebrow>
            </div>

            {/* 2 — Meals remaining */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
                <span style={{ fontFamily: BODY, fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1, color: S.fg, fontFeatureSettings: '"tnum"' }}>
                    {mealsLeft}
                </span>
                <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 500, color: S.fgMuted, lineHeight: 1.5 }}>
                    of {total} meals remaining
                </span>
            </div>

            {/* Planned-pause banner — discrete callout that carries the
                date + Cancel button without painting a misleading multi-
                day zone on the bar. Hidden when the sub is currently
                paused (the dim-bar treatment below handles that case). */}
            {sub.planned_pause_start && !isPaused && (
                <div style={{
                    marginBottom: 14,
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'rgba(30,58,79,0.08)',
                    border: '1px solid rgba(30,58,79,0.22)',
                    display: 'flex', alignItems: 'center', gap: 10,
                    fontFamily: BODY, fontSize: 13, color: S.fg, lineHeight: 1.4,
                }}>
                    <span style={{ flex: 'none', color: NV, display: 'inline-flex' }}>
                        <Moon size={15} strokeWidth={2} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                        Pause planned for{' '}
                        <strong style={{ fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                            {new Date(sub.planned_pause_start + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </strong>
                    </span>
                    {onCancelPlannedPause && (
                        <button
                            type="button"
                            onClick={onCancelPlannedPause}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '4px 8px',
                                fontFamily: BODY, fontSize: 12, fontWeight: 700,
                                color: NV,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                textUnderlineOffset: '2px',
                                textDecorationThickness: '1px',
                            }}
                        >
                            Cancel
                        </button>
                    )}
                </div>
            )}

            {/* 3 — Calendar progress bar. Dimmed when the sub is currently
                paused — communicates "cycle frozen" at the macro level
                instead of per-pill, keeping the constrained palette intact. */}
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={pillDays.length}
                aria-valuenow={deliveriesDone}
                aria-label={`${deliveriesDone} of ${totalDeliveries} ${mealsPerDelivery > 1 ? 'delivery days' : 'meals'} delivered`}
                style={{
                    display: 'flex', gap: 3, height: 10,
                    opacity: isPaused ? 0.45 : 1,
                    transition: 'opacity 300ms ease',
                }}
            >
                {pillDays.map((pillDate, i) => {
                    const pillIso = isoOf(pillDate)

                    // Collapse multi-day pause ranges: skip non-start dates
                    const pillRange = pauseLookup.get(pillIso)
                    const isCollapsedRange = pillRange != null && pillRange.count >= 2
                    if (isCollapsedRange && pillIso !== pillRange.startIso) return null

                    // Classify
                    const isPillSkipped = skipDateSet.has(pillIso)
                    const isPillPaused = pausedDateSet.has(pillIso)
                    const isToday = pillIso === aeNow.iso
                    const isPast = pillIso < aeNow.iso
                    const isMakeup = i >= totalDeliveries

                    // Pause overrides everything from pause_date forward (live pause).
                    const isPausedOverlay = isPaused && pauseCutoffIso != null && pillIso >= pauseCutoffIso

                    let state: PillState
                    if (isPausedOverlay && !isPast) {
                        state = 'paused'
                    } else if (isPillSkipped) {
                        state = isToday ? 'today-skipped' : 'skipped'
                    } else if (isPillPaused || isCollapsedRange) {
                        state = 'paused'
                    } else if (isPast) {
                        state = 'delivered'
                    } else if (isToday) {
                        // Pre-20:00 AE → kitchen still prepping; post-20:00 → delivered
                        state = aeNow.hour >= 20 ? 'today-delivered' : 'today-pre'
                    } else if (isMakeup) {
                        state = 'makeup'
                    } else {
                        state = 'remaining'
                    }

                    // Planned-pause start flag
                    const isPlannedPauseStart =
                        !!sub.planned_pause_start
                        && pillIso === sub.planned_pause_start

                    // Historical pause boundary markers — vertical lines
                    // bracket each pause range (start left + end right).
                    const isPauseRangeStart = pauseRanges.some(r => pillIso === r.startIso)
                    const isPauseRangeEnd = pauseRanges.some(r => pillIso === r.endIso)

                    // Visual treatment — constrained to 4 states:
                    //   • Orange gradient → delivered (today or past)
                    //   • Hatched gray    → skipped (today or past)
                    //   • Plain gray      → upcoming / make-up / planned-pause range
                    //   • + orange ring   → today (overlay)
                    // Make-up days, planned-pause-range, and currently-paused
                    // all collapse into "plain gray pill" — their meaning
                    // surfaces via banners and text, not via more pill colors.
                    const isSkipHatch = state === 'skipped' || state === 'today-skipped'
                    const isPausePill = state === 'paused'
                    const isMakeupPill = state === 'makeup'
                    const backgroundColor =
                        state === 'delivered' || state === 'today-delivered'
                            ? OG
                            : isSkipHatch
                                ? 'var(--ds-fg-tint)'
                                : isPausePill
                                    ? 'rgba(9,24,37,0.12)'
                                    : 'var(--ds-skeleton-base)'
                    const backgroundImage =
                        state === 'delivered' || state === 'today-delivered'
                            ? `linear-gradient(180deg, ${OG} 0%, ${OG3} 100%)`
                            : isSkipHatch
                                ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.22) 0px, rgba(255,255,255,0.22) 2px, transparent 2px, transparent 5px)'
                                : isPausePill
                                    ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 2px, transparent 2px, transparent 5px)'
                                    : 'none'

                    const opacity = 1
                    // Today (pre-delivery) gets a static orange ring instead
                    // of a pulse — anchors the "you are here" reference
                    // without yelling. inset box-shadow keeps the pill's
                    // box model untouched so no layout shift vs neighbours.
                    const todayRing = state === 'today-pre'
                        ? `inset 0 0 0 1.5px ${OG}`
                        : undefined

                    // Click affordance — future remaining pills become
                    // skip-targets when the customer has credits and no
                    // structural blockers; future skipped pills become
                    // un-skip targets. Past + today + makeup + paused stay
                    // read-only.
                    const isFuture = pillIso > aeNow.iso
                    const hasCredits = (maxSkips - skippedDeliveries) > 0
                    // Skip is still blocked for dates inside the (invisible)
                    // planned-pause window — the structural marker shows
                    // the boundary; the rule is enforced by checking the
                    // start date directly.
                    const isInsidePlannedPauseWindow =
                        !!sub.planned_pause_start
                        && pillIso >= sub.planned_pause_start
                    // Pre-start plans can't queue skips — `skipFutureDate`
                    // rejects non-Active subs to keep the end_date stable
                    // across the Scheduled → Active promotion. Mirror that
                    // here so the pill stops promising an action the server
                    // will refuse.
                    const futureRemainingClickable =
                        state === 'remaining'
                        && isFuture
                        && hasCredits
                        && !isPaused
                        && !startsInFuture
                        && !isInsidePlannedPauseWindow
                        && !!onPillSkip
                    const futureSkippedClickable =
                        state === 'skipped'
                        && isFuture
                        && !isPaused
                        && !startsInFuture
                        && !!onPillUnskip
                    // Cancellation for a planned pause moved to a dedicated
                    // banner above the bar (cleaner discoverability + the
                    // banner has space for an explicit "Cancel" button).
                    // The bar marks the boundary structurally — clicks on
                    // the pill don't trigger anything anymore.
                    const clickable =
                        futureRemainingClickable
                        || futureSkippedClickable
                    const isHovered = hoveredPill === i
                    // Hover ring for clickable pills — same vocabulary as
                    // today's static ring, only on hover. todayRing wins
                    // when both could apply (today is never clickable here).
                    const hoverRing = clickable && isHovered
                        ? `inset 0 0 0 1.5px ${OG}`
                        : undefined
                    // Planned-pause start no longer carries a per-pill ring —
                    // a 1px navy line marker (rendered below as a child span)
                    // sits in the gap before the pill, communicating the
                    // boundary structurally without consuming pill color.
                    const finalBoxShadow = todayRing ?? hoverRing

                    // Tooltip copy matrix
                    const dateLabel = formatPillDate(pillDate, aeNow.iso)
                    let statusLabel: string
                    let dateCopy: string
                    let footnote: string | null = null
                    let statusColor: string

                    switch (state) {
                        case 'delivered':
                            statusLabel = 'Delivered'
                            dateCopy = dateLabel
                            statusColor = OG3
                            break
                        case 'skipped':
                            statusLabel = 'Skipped'
                            dateCopy = dateLabel
                            footnote = 'Added 1 day to your cycle'
                            statusColor = 'rgba(245,240,232,0.55)'
                            break
                        case 'today-pre':
                            statusLabel = 'Today'
                            dateCopy = 'Arriving 7–8 PM'
                            statusColor = OG3
                            break
                        case 'today-delivered':
                            statusLabel = 'Today'
                            dateCopy = 'Delivered'
                            statusColor = OG3
                            break
                        case 'today-skipped':
                            statusLabel = 'Today'
                            dateCopy = 'Skipped'
                            footnote = 'Added 1 day to your cycle'
                            statusColor = 'rgba(245,240,232,0.55)'
                            break
                        case 'remaining':
                            statusLabel = 'Upcoming'
                            dateCopy = dateLabel
                            statusColor = TIER_POP_TEXT.muted
                            break
                        case 'makeup':
                            statusLabel = 'Make-up day'
                            dateCopy = dateLabel
                            footnote = 'Earned from a skip'
                            statusColor = TIER_POP_TEXT.muted
                            break
                        case 'paused':
                            if (isCollapsedRange && pillRange) {
                                statusLabel = 'Paused'
                                dateCopy = `${formatPillDate(new Date(pillRange.startIso + 'T00:00:00'), aeNow.iso)} – ${formatPillDate(new Date(pillRange.endIso + 'T00:00:00'), aeNow.iso)}`
                                footnote = `${pillRange.count} delivery day${pillRange.count > 1 ? 's' : ''}`
                            } else {
                                statusLabel = 'On hold'
                                dateCopy = dateLabel
                                footnote = 'Deliveries paused — resume to keep them coming'
                            }
                            statusColor = TIER_POP_TEXT.faint
                            break
                    }

                    // Click hint footnote (overrides/extends the default
                    // footnote when the pill is clickable). Refactoring UI:
                    // surface affordance copy directly in the tooltip rather
                    // than relying on hover ring + cursor alone.
                    const clickHint = futureRemainingClickable
                        ? 'Click to skip this meal'
                        : futureSkippedClickable
                            ? 'Click to un-skip'
                            : null
                    let finalFootnote = clickHint ?? footnote
                    let finalStatusLabel = statusLabel
                    // Planned-pause start override — surface the special role
                    // of this day in the tooltip. Date stays as-is so the
                    // customer can confirm what they scheduled.
                    if (isPlannedPauseStart) {
                        finalStatusLabel = 'Pause begins'
                        finalFootnote = 'Your planned pause starts here'
                    }
                    const ariaLabel = `${finalStatusLabel} — ${dateCopy}${finalFootnote ? ` · ${finalFootnote}` : ''}`

                    return (
                        <button
                            key={i}
                            type="button"
                            aria-label={ariaLabel}
                            onMouseEnter={() => setHoveredPill(i)}
                            onMouseLeave={() => setHoveredPill(prev => (prev === i ? null : prev))}
                            onFocus={() => setHoveredPill(i)}
                            onBlur={() => setHoveredPill(prev => (prev === i ? null : prev))}
                            onClick={() => {
                                if (futureRemainingClickable) onPillSkip?.(pillIso)
                                else if (futureSkippedClickable) onPillUnskip?.(pillIso)
                            }}
                            style={{
                                position: 'relative',
                                flex: isCollapsedRange ? 1.5 : 1,
                                minWidth: 3,
                                height: 10,
                                padding: 0,
                                border: isMakeupPill ? '1px solid rgba(9,24,37,0.18)' : 'none',
                                borderRadius: 'var(--radius-pill)',
                                backgroundColor,
                                backgroundImage,
                                boxShadow: finalBoxShadow,
                                opacity,
                                cursor: clickable ? 'pointer' : 'default',
                                transition: 'background-color 200ms, background-image 200ms, opacity 300ms, box-shadow 200ms',
                            }}
                        >
                            {/* Hit-area extender — adjacent pills can't fire
                                concurrently (single pointer), so we widen
                                vertically without conflict. */}
                            <span
                                aria-hidden
                                style={{
                                    position: 'absolute',
                                    top: -8, left: -1.5, right: -1.5, bottom: -4,
                                }}
                            />
                            {/* Planned-pause boundary marker — 1px navy
                                vertical line in the gap before this pill.
                                Communicates "pause begins here" structurally
                                without painting a multi-day color zone. */}
                            {(isPlannedPauseStart || isPauseRangeStart) && (
                                <span
                                    aria-hidden
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: -4,
                                        bottom: -4,
                                        width: 1,
                                        background: NV,
                                        pointerEvents: 'none',
                                        borderRadius: 1,
                                        transform: 'translateX(calc(-50% - 1.5px))',
                                    }}
                                />
                            )}
                            {isPauseRangeEnd && (
                                <span
                                    aria-hidden
                                    style={{
                                        position: 'absolute',
                                        right: 0,
                                        top: -4,
                                        bottom: -4,
                                        width: 1,
                                        background: NV,
                                        pointerEvents: 'none',
                                        borderRadius: 1,
                                        transform: 'translateX(calc(50% + 1.5px))',
                                    }}
                                />
                            )}

                            <AnimatePresence>
                                {hoveredPill === i && (
                                    <motion.span
                                        role="tooltip"
                                        initial={{ opacity: 0, x: '-50%', y: prefersReducedMotion ? 0 : 4 }}
                                        animate={{ opacity: 1, x: '-50%', y: 0 }}
                                        exit={{ opacity: 0, x: '-50%', y: prefersReducedMotion ? 0 : 4 }}
                                        transition={{ duration: prefersReducedMotion ? 0 : 0.14, ease: [0.16, 1, 0.3, 1] }}
                                        style={{
                                            position: 'absolute',
                                            bottom: 'calc(100% + 10px)',
                                            left: '50%',
                                            zIndex: 50,
                                            pointerEvents: 'none',
                                            padding: '9px 13px',
                                            borderRadius: 10,
                                            background: 'linear-gradient(135deg, #1a3e4f 0%, #091825 100%)',
                                            boxShadow: 'var(--ds-shadow-modal)',
                                            whiteSpace: 'nowrap',
                                            display: 'inline-flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: 4,
                                        }}
                                    >
                                        <span style={{
                                            fontFamily: BODY,
                                            fontSize: 10,
                                            fontWeight: 700,
                                            letterSpacing: '0.10em',
                                            textTransform: 'uppercase',
                                            color: statusColor,
                                        }}>
                                            {finalStatusLabel}
                                        </span>
                                        <span style={{
                                            fontFamily: BODY,
                                            fontSize: 12.5,
                                            fontWeight: 700,
                                            color: TIER_POP_TEXT.primary,
                                            fontFeatureSettings: '"tnum"',
                                            lineHeight: 1.2,
                                        }}>
                                            {dateCopy}
                                        </span>
                                        {finalFootnote && (
                                            <span style={{
                                                fontFamily: BODY,
                                                fontSize: 10.5,
                                                fontWeight: 500,
                                                color: TIER_POP_TEXT.faint,
                                                lineHeight: 1.3,
                                                marginTop: 1,
                                                maxWidth: 220,
                                                whiteSpace: 'normal',
                                                textAlign: 'center',
                                            }}>
                                                {finalFootnote}
                                            </span>
                                        )}
                                        <span
                                            aria-hidden
                                            style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                width: 0,
                                                height: 0,
                                                borderLeft: '5px solid transparent',
                                                borderRight: '5px solid transparent',
                                                borderTop: '5px solid #091825',
                                            }}
                                        />
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </button>
                    )
                })}
            </div>

            {/* Stats line — count-only. With the bar pared back to 4
                states, the visual is self-documenting and a multi-item
                legend would be redundant chrome. Untraced-skip caption
                stays as a small footnote for legacy multi-skip subs. */}
            <div style={{ marginTop: 8, fontFamily: BODY, fontSize: 12, color: S.fgMuted, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', opacity: isPaused ? 0.55 : 1, transition: 'opacity 300ms ease' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: OG, display: 'inline-block' }} />
                    <strong style={{ color: S.fg, fontFeatureSettings: '"tnum"' }}>{sub.delivered_meals}</strong> delivered
                </span>
                {sub.skipped_meals_count > 0 && (
                    <>
                        <span style={{ color: S.fgFaint }}>·</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--ds-fg-tint)', display: 'inline-block' }} />
                            <strong style={{ color: S.fg, fontFeatureSettings: '"tnum"' }}>{sub.skipped_meals_count}</strong> skipped
                        </span>
                    </>
                )}
                {untracedSkips > 0 && (
                    <span style={{ color: S.fgFaint, fontSize: 11 }}>
                        · {untracedSkips} earlier skip{untracedSkips === 1 ? '' : 's'} not date-traced
                    </span>
                )}
                {(() => {
                    if (pauseRanges.length === 0) return null
                    const r = pauseRanges[pauseRanges.length - 1]
                    const label = r.count === 1 ? `Paused ${fmt(r.startIso)}` : `Paused ${fmt(r.startIso)}–${fmt(r.endIso)}`
                    return (
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, color: S.fgFaint, fontSize: 11 }}>
                            <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: 'rgba(9,24,37,0.12)', backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 2px, transparent 2px, transparent 3px)', display: 'inline-block' }} />
                            {label}
                        </span>
                    )
                })()}
            </div>

            {/* 4 — Timeline */}
            <div style={{ marginTop: 'auto', paddingTop: 18, borderTop: `1px solid ${S.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: startsInFuture ? OG : S.fgSub, lineHeight: 1.2 }}>
                            {startsInFuture ? 'Starting' : 'Started'}
                        </div>
                        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                            {fmt(sub.start_date)}
                        </div>
                    </div>
                    <span style={{ color: S.fgFaint, fontSize: 14 }} aria-hidden>→</span>
                    <div>
                        <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isPaused ? 'Est. ending' : 'Ending'}
                            {isPaused && (
                                <span style={{
                                    fontFamily: BODY, fontSize: 9, fontWeight: 700,
                                    letterSpacing: '0.12em', textTransform: 'uppercase',
                                    padding: '2px 6px', borderRadius: 999,
                                    background: 'var(--ds-skeleton-base)',
                                    color: S.fgMuted,
                                }}>
                                    paused
                                </span>
                            )}
                        </div>
                        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: isPaused ? S.fgMuted : S.fg, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                            {fmt(sub.end_date)}
                        </div>
                    </div>
                    {!startsInFuture && (
                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                            {isPaused ? (
                                <div style={{ fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, lineHeight: 1.55, maxWidth: 160 }}>
                                    Extends by 1 day<br />per delivery day paused.
                                </div>
                            ) : (
                                <>
                                    <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub, lineHeight: 1.2 }}>
                                        Days left
                                    </div>
                                    <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 900, color: S.fg, marginTop: 4, fontFeatureSettings: '"tnum"', lineHeight: 1 }}>
                                        {daysLeft}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* 5 — Action */}
                {mealsLeft === 0 && !hasQueuedRenewal ? (
                    <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-og-wash)', border: '1px solid var(--ds-og-border)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                        <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: S.fg }}>Plan ended</div>
                        <div style={{ fontFamily: BODY, fontSize: 12, color: S.fgMuted, lineHeight: 1.5 }}>Renew to keep meals coming.</div>
                        <Link href="/dashboard/plan" className="btn-primary" style={{ ...btnStyle('primary-tight'), marginTop: 8, padding: '10px 18px' }}>
                            Renew →
                        </Link>
                    </div>
                ) : renewEligible ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <Link href="/dashboard/plan" className="btn-primary" style={{ ...btnStyle('primary-tight'), padding: '10px 20px' }}>
                            Renew →
                        </Link>
                    </div>
                ) : (startsInFuture || isPaused) ? (
                    <div style={{
                        fontFamily: BODY, fontSize: 11.5, color: S.fgFaint, lineHeight: 1.5,
                    }}>
                        {startsInFuture
                            ? <>Plan begins on <span style={{ color: S.fgMuted, fontWeight: 600 }}>{fmt(sub.start_date)}</span>.</>
                            : <>Resume any time — your <span style={{ color: S.fgMuted, fontWeight: 600 }}>{mealsLeft} remaining meal{mealsLeft === 1 ? '' : 's'}</span> will be waiting.</>}
                    </div>
                ) : null}
            </div>

        </div>
    )
}
