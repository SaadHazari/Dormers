import type { CSSProperties } from 'react'
import { Truck, CalendarDays } from 'lucide-react'
import { OG, NV, BODY, S } from './_shared/tokens'
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
    orange:  { background: '#f8f3e6', border: '1px solid rgba(245,127,32,0.18)', boxShadow: '0 1px 3px rgba(9,24,37,0.035)' },
    red:     { background: '#f8f3e6', border: '1px solid rgba(239,68,68,0.18)',  boxShadow: '0 1px 3px rgba(9,24,37,0.035)' },
    default: { background: '#f8f3e6', border: '1px solid rgba(9,24,37,0.07)',    boxShadow: '0 1px 3px rgba(9,24,37,0.035)' },
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
                    color: NV,
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

export function StatRow({ sub }: { sub: Subscription }) {
    const isMax = sub.plan_name.includes('Monthly Max')
    const mealsPerDelivery = isMax ? 2 : 1
    const total = sub.total_meals
    const totalDeliveries = Math.max(1, Math.ceil(total / mealsPerDelivery))
    const deliveriesDone = Math.floor(sub.delivered_meals / mealsPerDelivery)
    const skippedDeliveries = Math.floor(sub.skipped_meals_count / mealsPerDelivery)
    const deliveriesLeft = Math.max(0, totalDeliveries - deliveriesDone - skippedDeliveries)

    const startsInFuture = new Date(sub.start_date).getTime() > Date.now()
    const daysLeft = Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
    const endLabel = new Date(sub.end_date).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
    const startLabel = new Date(sub.start_date).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })

    const daysColor: TileColor = daysLeft <= 3 ? 'red' : 'default'

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
                        background: 'rgba(245,127,32,0.10)',
                        border: '1.5px solid rgba(245,127,32,0.22)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Truck size={20} strokeWidth={1.7} color={OG} />
                    </div>
                }
                label="Deliveries left"
                value={deliveriesLeft}
                sub={`of ${totalDeliveries} total`}
            />

            {/* 2 — Days left (urgency: red < 4 days, neutral otherwise) */}
            <StatTile
                color={daysColor}
                glyph={
                    <div style={{
                        width: 44, height: 44, borderRadius: 16,
                        background: daysLeft <= 3 ? 'rgba(239,68,68,0.09)' : 'rgba(9,24,37,0.04)',
                        border: daysLeft <= 3 ? '1.5px solid rgba(239,68,68,0.20)' : '1.5px solid rgba(9,24,37,0.10)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CalendarDays size={20} strokeWidth={1.9} color={daysLeft <= 3 ? '#b91c1c' : NV} />
                    </div>
                }
                label="Days left"
                value={daysLeft}
                sub={startsInFuture ? `starts ${startLabel}` : `ends ${endLabel}`}
            />

            <style jsx>{`
                @media (max-width: 900px) {
                    :global(.stat-row) { grid-template-columns: 1fr !important; }
                }
            `}</style>
        </div>
    )
}
