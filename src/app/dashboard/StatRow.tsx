import type { CSSProperties } from 'react'
import { Truck, CalendarDays } from 'lucide-react'
import { OG, BODY, S } from './_shared/tokens'
import type { Subscription } from './_shared/types'

/**
 * Two decision-relevant stat tiles below PlanProgress:
 *   1. Deliveries left  (orange — most decision-relevant number)
 *   2. Days left        (red below 4 days, neutral otherwise)
 *
 * Other metrics (Meals delivered, Skips used) intentionally live in
 * PlanProgress's legend to avoid duplication. Was 117 inline LOC in
 * ClientDashboard.tsx.
 */

type TileColor = 'orange' | 'red' | 'default'

const TILE_SURFACES: Record<TileColor, CSSProperties> = {
    orange:  { background: 'var(--ds-surface-tier2)', border: '1px solid var(--ds-og-border)',     boxShadow: 'var(--ds-shadow-tier2)' },
    red:     { background: 'var(--ds-surface-tier2)', border: '1px solid var(--ds-danger-border)', boxShadow: 'var(--ds-shadow-tier2)' },
    default: { background: 'var(--ds-surface-tier2)', border: '1px solid var(--ds-border-tier2)',  boxShadow: 'var(--ds-shadow-tier2)' },
}

function StatTile({ glyph, label, value, sub, color = 'default' }: {
    glyph: React.ReactNode
    label: string
    value: string | number
    sub: string
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

export function StatRow({ sub, isPaused = false }: { sub: Subscription; isPaused?: boolean }) {
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

    // Red urgency only for active subs nearing their end — a scheduled sub
    // starting in 2 days is *good* news, not urgent. Don't paint it red.
    const daysColor: TileColor = !startsInFuture && daysToEnd <= 3 ? 'red' : 'default'

    return (
        <div style={{
            gridColumn: 'span 12',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
        }} className="stat-row">
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

            <style jsx>{`
                @media (max-width: 900px) {
                    :global(.stat-row) { grid-template-columns: 1fr !important; }
                }
            `}</style>
        </div>
    )
}
