import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Truck, CalendarDays, PiggyBank, ChevronRight, Pencil } from 'lucide-react'
import { OG, BODY, S } from './_shared/tokens'
import type { Subscription } from './_shared/types'
import { formatSavedAmount, type CycleSavings } from '@/contexts/subscriptions/domain/savings'
import { CompactMetricStrip, type CompactMetric } from './_shared/CompactMetricStrip'

const SAVINGS_LAST_SEEN_KEY = 'dormers:last-seen-savings'

/**
 * Three decision-relevant stat tiles below PlanProgress:
 *   1. Deliveries left   (orange — most decision-relevant number)
 *   2. Days left         (red below 4 days, neutral otherwise)
 *   3. Saved this cycle  (default neutral + gold ink on the figure)
 *
 * Other metrics (Meals delivered, Skips used) intentionally live in
 * PlanProgress's legend to avoid duplication.
 *
 * Tile 3 doubles as the capture surface for the customer's takeout-cost
 * benchmark — when no benchmark is set yet, the value area becomes a CTA
 * that opens the SavingsBenchmarkModal. Once set, it renders the proper
 * "AED X saved · N evenings without cooking" composition.
 */

type TileColor = 'orange' | 'red' | 'default'

const TILE_SURFACES: Record<TileColor, CSSProperties> = {
    orange:  { background: 'var(--ds-surface-tier2)', border: '1px solid var(--ds-og-border)',     boxShadow: 'var(--ds-shadow-tier2)' },
    red:     { background: 'var(--ds-surface-tier2)', border: '1px solid var(--ds-danger-border)', boxShadow: 'var(--ds-shadow-tier2)' },
    default: { background: 'var(--ds-surface-tier2)', border: '1px solid var(--ds-border-tier2)',  boxShadow: 'var(--ds-shadow-tier2)' },
}

function StatTile({ glyph, label, value, sub, color = 'default' }: {
    glyph: ReactNode
    label: string
    value: ReactNode
    sub: ReactNode
    color?: TileColor
}) {
    const surface = TILE_SURFACES[color]
    return (
        <div style={{
            ...surface,
            padding: 20, borderRadius: 'var(--radius-md)',
            display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
        }}>
            <div style={{ flexShrink: 0 }}>{glyph}</div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgFaint, marginBottom: 6 }}>
                    {label}
                </div>
                <div style={{
                    fontFamily: BODY, fontSize: 28, fontWeight: 900,
                    lineHeight: 1, letterSpacing: '-0.02em',
                    color: S.fg,
                    fontFeatureSettings: '"tnum"',
                }}>
                    {value}
                </div>
                <div style={{ fontFamily: BODY, fontSize: 12, color: S.fgMuted, marginTop: 6, lineHeight: 1.5 }}>
                    {sub}
                </div>
            </div>
        </div>
    )
}

export function StatRow({
    sub,
    isPaused = false,
    cycleSavings = null,
    benchmarkAed = null,
    hasQueuedRenewal = false,
    onSetBenchmark,
}: {
    sub: Subscription
    isPaused?: boolean
    /** Computed savings for the current cycle. Null when the customer hasn't
     *  set their takeout benchmark yet — tile renders the capture CTA. */
    cycleSavings?: CycleSavings | null
    /** The customer's stored takeout benchmark (AED). Surfaced in the savings
     *  tile sub-copy as "vs AED X/meal" so the displayed savings number
     *  always carries provenance back to the customer's own input — they're
     *  never wondering "where did this number come from?" */
    benchmarkAed?: number | null
    /** True when the customer already has a Scheduled follow-up sub queued.
     *  Suppresses the cycle-ending "renew to keep saving" nudge — same rule
     *  the end-of-cycle banner + PlanProgress's renew CTA already follow.
     *  When queued, the tile stays in the steady "N evenings won back" state. */
    hasQueuedRenewal?: boolean
    /** Click handler that opens the SavingsBenchmarkModal. Used for both the
     *  empty-state capture flow AND for re-editing the existing benchmark
     *  (the populated tile becomes clickable to reopen the modal). When
     *  omitted, the savings tile stays read-only. */
    onSetBenchmark?: () => void
}) {
    const isMax = sub.plan_name.includes('Monthly Max')
    const mealsPerDelivery = isMax ? 2 : 1
    const total = sub.total_meals
    const totalDeliveries = Math.max(1, Math.ceil(total / mealsPerDelivery))
    const deliveriesDone = Math.floor(sub.delivered_meals / mealsPerDelivery)
    // Skips don't reduce the deliveries-owed count — each skip extends the
    // cycle by one make-up day so the user still receives all paid-for
    // deliveries, just shifted later. (Matches PlanProgress's bar math.)
    const deliveriesLeft = Math.max(0, totalDeliveries - deliveriesDone)

    const startsInFuture = new Date(sub.start_date).getTime() > Date.now()
    const daysToEnd = Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
    const daysToStart = Math.max(0, Math.ceil((new Date(sub.start_date).getTime() - Date.now()) / 86400000))
    // While the plan is still in the future, surface days-until-start (the
    // burning question is "when does this begin?"). After it starts, switch
    // to days-left-in-plan. Mirrors the /plan ActivePlanCallout pattern.
    const daysLeft = startsInFuture ? daysToStart : daysToEnd
    const endLabel = new Date(sub.end_date).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
    const startLabel = new Date(sub.start_date).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
    // Short variants (no weekday) for the compact mobile strip's tight cells.
    const endLabelShort = new Date(sub.end_date).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
    const startLabelShort = new Date(sub.start_date).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })

    // Red urgency only for active subs nearing their end — a scheduled sub
    // starting in 2 days is *good* news, not urgent. Don't paint it red.
    const daysColor: TileColor = !startsInFuture && daysToEnd <= 3 ? 'red' : 'default'

    // Savings tile state. When cycleSavings is null the user hasn't set their
    // benchmark — render an empty-state CTA that opens the capture modal. When
    // it's set, render the proper money figure + evenings sub-copy.
    const hasBenchmark = cycleSavings != null

    // Delta pill — momentarily floats "+AED 14" next to the savings number when
    // the value has increased since the last visit (i.e., a new meal landed).
    // Persisted in localStorage so the celebration fires once per delta, not on
    // every page render. Suppressed for first-ever populate (lastSeen=0) — the
    // benchmark-set moment already celebrates that via the tile materialising.
    const [deltaPill, setDeltaPill] = useState<number | null>(null)
    const prefersReducedMotion = useReducedMotion()
    useEffect(() => {
        if (!cycleSavings || cycleSavings.saved <= 0) return
        const saved = cycleSavings.saved
        let lastSeen = 0
        try {
            const raw = window.localStorage.getItem(SAVINGS_LAST_SEEN_KEY)
            lastSeen = raw ? Number(raw) : 0
            if (!Number.isFinite(lastSeen) || lastSeen < 0) lastSeen = 0
        } catch {
            // localStorage access can fail (privacy mode / sandboxed iframes) —
            // silent fallback; we just don't animate this visit.
        }
        if (!prefersReducedMotion && lastSeen > 0 && saved > lastSeen) {
            setDeltaPill(saved - lastSeen)
            try { window.localStorage.setItem(SAVINGS_LAST_SEEN_KEY, String(saved)) } catch { /* see above */ }
            const t = window.setTimeout(() => setDeltaPill(null), 2600)
            return () => window.clearTimeout(t)
        }
        try { window.localStorage.setItem(SAVINGS_LAST_SEEN_KEY, String(saved)) } catch { /* see above */ }
    }, [cycleSavings, prefersReducedMotion])

    // Sub-copy laddered by state for the savings tile. Provenance ("vs AED X/meal")
    // is always present once the benchmark is set AND at least one meal has been
    // delivered — that's the user's own input, and it's the only way to keep the
    // displayed AED savings figure honest and traceable. The renewal nudge in the
    // last 7 days replaces the evenings count (not the provenance) — provenance
    // never drops out.
    //   • no benchmark yet                                   → CTA
    //   • benchmark set, no deliveries yet                   → "Saving starts with your first meal"
    //   • benchmark set, saved = 0 (close to Dormers cost)   → "AED X/meal benchmark · close to Dormers cost"
    //   • benchmark set, saved > 0, > 7d OR queued           → "vs AED X/meal · N evenings won back"
    //   • benchmark set, saved > 0, ≤ 7d, no queue           → "vs AED X/meal · renew to keep saving" (gold)
    const isCycleEndingSoon = !startsInFuture && !isPaused && daysToEnd <= 7
    const showRenewNudge = isCycleEndingSoon && !hasQueuedRenewal
    const savedAmount = cycleSavings?.saved ?? 0
    const evenings = cycleSavings?.evenings ?? 0
    const noDeliveriesYet = sub.delivered_meals === 0
    const savingsSub: ReactNode = !hasBenchmark
        ? <span style={{ color: OG, fontWeight: 700 }}>Set your dinner spend <ChevronRight size={11} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: '-1px' }} /></span>
        : noDeliveriesYet
            ? <>Saving starts with your first meal</>
            : savedAmount === 0
                ? <>AED {benchmarkAed}/meal benchmark · close to Dormers cost</>
                : showRenewNudge
                    ? <>vs AED {benchmarkAed}/meal · <span style={{ color: OG, fontWeight: 700 }}>renew to keep saving</span></>
                    : <>vs AED {benchmarkAed}/meal · {evenings} evening{evenings === 1 ? '' : 's'} won back</>

    // Compact strip (mobile ≤768) — same figures as the cards below, rebuilt as
    // a 3-across band so three KPIs ride one line instead of three tall cards.
    // CSS toggles cards↔strip; both share the values computed above (no drift).
    const compactMetrics: CompactMetric[] = [
        {
            label: 'Deliveries',
            value: deliveriesLeft,
            sub: `of ${totalDeliveries}`,
            accent: true,
        },
        {
            label: isPaused ? 'Plan paused' : startsInFuture ? 'Days to start' : 'Days left',
            value: isPaused ? '—' : daysLeft,
            sub: isPaused ? 'resumes later' : startsInFuture ? `starts ${startLabelShort}` : `ends ${endLabelShort}`,
            danger: daysColor === 'red',
        },
        {
            label: 'Saved',
            value: hasBenchmark ? `AED ${formatSavedAmount(savedAmount)}` : 'Set',
            sub: hasBenchmark ? `vs AED ${benchmarkAed}` : 'Tap to set',
            onClick: onSetBenchmark,
            ariaLabel: hasBenchmark ? 'Edit your usual dinner spend' : 'Set your usual dinner spend',
        },
    ]

    return (
        <div style={{ gridColumn: 'span 12' }}>
        <div className="stat-row stat-row-cards" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
        }}>
            {/* 1 — Deliveries left (the page's most decision-relevant number) */}
            <StatTile
                color="orange"
                glyph={
                    <div style={{
                        width: 44, height: 44, borderRadius: 16,
                        background: 'var(--ds-og-wash-strong)',
                        border: '1.5px solid var(--ds-og-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Truck size={20} strokeWidth={1.7} color={OG} />
                    </div>
                }
                label="Deliveries left"
                value={deliveriesLeft}
                sub={`of ${totalDeliveries} total`}
            />

            {/* 2 — Days left (urgency: red < 4 days, neutral otherwise).
                    When paused the end date is indeterminate — it extends by
                    one delivery day each paused night — so we swap the tile to
                    a "Plan paused" holding state rather than showing a number
                    that will silently be wrong tomorrow. */}
            <StatTile
                color={isPaused ? 'default' : daysColor}
                glyph={
                    <div style={{
                        width: 44, height: 44, borderRadius: 16,
                        background: !isPaused && daysLeft <= 3 ? 'var(--ds-danger-wash)' : 'var(--ds-skeleton-base)',
                        border: !isPaused && daysLeft <= 3 ? '1.5px solid var(--ds-danger-border)' : '1.5px solid var(--ds-border-tier1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CalendarDays size={20} strokeWidth={1.9} color={!isPaused && daysLeft <= 3 ? 'var(--ds-danger-fg)' : 'var(--ds-fg)'} style={{ opacity: isPaused ? 0.45 : 1 }} />
                    </div>
                }
                label={isPaused ? 'Plan paused' : startsInFuture ? 'Days to start' : 'Days left'}
                value={isPaused ? '—' : daysLeft}
                sub={isPaused ? 'resumes from where you left off' : startsInFuture ? `starts ${startLabel}` : `ends ${endLabel}`}
            />

            {/* 3 — Saved this cycle. Populated and empty states share the same
                    button-shell so the populated tile is also re-editable: a
                    click reopens the SavingsBenchmarkModal in edit mode. The
                    empty state carries a dashed border to signal "needs input";
                    the populated state uses the solid neutral border like the
                    other tiles. */}
            <button
                type="button"
                onClick={onSetBenchmark}
                disabled={!onSetBenchmark}
                className="stat-row-cta"
                aria-label={hasBenchmark ? 'Edit your usual dinner spend' : 'Set your usual dinner spend'}
                style={{
                    ...TILE_SURFACES.default,
                    position: 'relative',
                    padding: 20, borderRadius: 'var(--radius-md)',
                    display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
                    textAlign: 'left',
                    cursor: onSetBenchmark ? 'pointer' : 'default',
                    fontFamily: BODY, color: 'inherit',
                    // Dashed border on the empty state signals "this is a seat
                    // waiting for input" without abandoning the TILE_SURFACES
                    // contract. Solid border on the populated state matches
                    // the other tiles in the row.
                    borderStyle: hasBenchmark ? 'solid' : 'dashed',
                }}
            >
                {/* Edit hint — only on the populated tile, only on hover/focus.
                    Aria-hidden because the wrapping button already exposes
                    aria-label="Edit your takeout benchmark" to screen readers. */}
                {hasBenchmark && onSetBenchmark && (
                    <span
                        className="savings-edit-hint"
                        aria-hidden
                        style={{
                            position: 'absolute',
                            top: 14, right: 14,
                            opacity: 0,
                            transition: 'opacity 150ms',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            color: S.fgMuted,
                            fontFamily: BODY, fontSize: 9.5, fontWeight: 700,
                            letterSpacing: '0.10em', textTransform: 'uppercase',
                            pointerEvents: 'none',
                        }}
                    >
                        <Pencil size={11} strokeWidth={2.2} />
                        Edit
                    </span>
                )}
                {hasBenchmark ? (
                    <>
                        <div style={{
                            width: 44, height: 44, borderRadius: 16,
                            background: 'var(--ds-skeleton-base)',
                            border: '1.5px solid var(--ds-border-tier1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <PiggyBank size={20} strokeWidth={1.7} color={S.fg} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{
                                fontFamily: BODY, fontSize: 11, fontWeight: 700,
                                letterSpacing: '0.18em', textTransform: 'uppercase',
                                color: S.fgFaint, marginBottom: 6,
                            }}>
                                Saved this cycle
                            </div>
                            <div style={{
                                position: 'relative',
                                fontFamily: BODY, fontSize: 28, fontWeight: 900,
                                lineHeight: 1, letterSpacing: '-0.02em',
                                color: S.fg,
                                fontFeatureSettings: '"tnum"',
                                display: 'inline-block',
                            }}>
                                <span style={{
                                    fontSize: 14, color: S.fgFaint, fontWeight: 700,
                                    marginRight: 4, letterSpacing: 0,
                                }}>AED</span>
                                {formatSavedAmount(savedAmount)}
                                {/* Delta pill — fades in/out next to the number when
                                    the value has increased since last visit. ~2.6s
                                    total lifespan: 0.3s in, 2s hold, 0.3s out. */}
                                <AnimatePresence>
                                    {deltaPill != null && (
                                        <motion.span
                                            initial={{ opacity: 0, x: -8, scale: 0.85 }}
                                            animate={{ opacity: 1, x: 0, scale: 1 }}
                                            exit={{ opacity: 0, x: -8, scale: 0.92 }}
                                            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                                            aria-live="polite"
                                            style={{
                                                position: 'absolute',
                                                left: '100%', top: '50%',
                                                transform: 'translateY(-50%)',
                                                marginLeft: 10,
                                                padding: '4px 10px',
                                                borderRadius: 999,
                                                background: OG, color: '#fff',
                                                fontFamily: BODY, fontSize: 11, fontWeight: 800,
                                                letterSpacing: '0.04em',
                                                whiteSpace: 'nowrap',
                                                boxShadow: '0 6px 16px rgba(245,127,32,0.45)',
                                                pointerEvents: 'none',
                                            }}
                                        >
                                            +AED {deltaPill}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </div>
                            <div style={{
                                fontFamily: BODY, fontSize: 12, color: S.fgMuted,
                                marginTop: 6, lineHeight: 1.5,
                            }}>
                                {savingsSub}
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{
                            width: 44, height: 44, borderRadius: 16,
                            background: 'var(--ds-og-wash)',
                            border: '1.5px solid var(--ds-og-border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <PiggyBank size={20} strokeWidth={1.7} color={OG} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{
                                fontFamily: BODY, fontSize: 11, fontWeight: 700,
                                letterSpacing: '0.18em', textTransform: 'uppercase',
                                color: S.fgFaint, marginBottom: 6,
                            }}>
                                Saved this cycle
                            </div>
                            <div style={{
                                fontFamily: BODY, fontSize: 16, fontWeight: 800,
                                lineHeight: 1.25, letterSpacing: '-0.01em',
                                color: S.fg,
                            }}>
                                See how much you&apos;re saving
                            </div>
                            <div style={{
                                fontFamily: BODY, fontSize: 12, color: OG,
                                marginTop: 6, lineHeight: 1.5, fontWeight: 700,
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                                Set your dinner spend
                                <ChevronRight size={12} strokeWidth={2.5} />
                            </div>
                        </div>
                    </>
                )}
            </button>
        </div>

        <CompactMetricStrip
            className="stat-row-strip"
            ariaLabel="Plan stats"
            metrics={compactMetrics}
        />

        <style jsx>{`
                /* Mobile (≤768) shows the compact strip; the cards take over
                   above. !important beats the strip's inline display:grid. */
                :global(.stat-row-strip) { display: none !important; }
                @media (max-width: 768px) {
                    :global(.stat-row-cards) { display: none !important; }
                    :global(.stat-row-strip) { display: grid !important; }
                }
                /* Canonical scale (640/768/1024) — applies to the desktop/tablet
                   cards only (strip owns ≤768). */
                @media (max-width: 640px) {
                    :global(.stat-row) { grid-template-columns: 1fr !important; }
                }
                /* Tablet + the full-width zone below the desktop sidebar:
                   three tiles get tight, so collapse to 2-up. The savings tile
                   spans both columns on its second row so it doesn't sit
                   orphaned next to an empty cell. Operational metrics share
                   row 1; the reflective metric owns row 2. */
                @media (max-width: 1024px) and (min-width: 641px) {
                    :global(.stat-row) { grid-template-columns: repeat(2, 1fr) !important; }
                    :global(.stat-row) > :nth-child(3) { grid-column: 1 / -1 !important; }
                }
                :global(.stat-row-cta) { transition: transform 150ms, box-shadow 150ms, border-color 150ms; }
                :global(.stat-row-cta:hover:not(:disabled)) {
                    transform: translateY(-1px);
                    border-color: var(--ds-og-border-strong) !important;
                }
                /* Reveal the "EDIT" hint on hover and on keyboard focus —
                   discoverability that doesn't compete with the static tile
                   chrome. Touch users don't get the hint but still benefit
                   from the whole-tile tap target. */
                :global(.stat-row-cta:hover .savings-edit-hint),
                :global(.stat-row-cta:focus-visible .savings-edit-hint) {
                    opacity: 1 !important;
                }
                /* Respect users with reduced-motion preferences — disable the
                   hover lift on the savings tile (the rest of the row matches). */
                @media (prefers-reduced-motion: reduce) {
                    :global(.stat-row-cta:hover:not(:disabled)) { transform: none; }
                }
            `}</style>
        </div>
    )
}
