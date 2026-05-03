'use client'

import Link from 'next/link'
import { OG, OG3, NV, BODY, S, TIER2, cleanPlanName } from './_shared/tokens'
import { Eyebrow } from './_shared/Eyebrow'
import { PlanGlyph } from './_shared/PlanGlyph'
import { fmt } from './_shared/format'
import { btnStyle } from './_shared/buttons'
import type { Subscription } from './_shared/types'

/**
 * Plan progress card — span-12. Shows the plan eyebrow + meals-left
 * big number + segmented per-meal progress bar (delivered vs skipped
 * vs remaining) + start→end timeline + days-left + renew CTA.
 *
 * Was 161 inline LOC in ClientDashboard.tsx.
 */
export function PlanProgress({ sub }: { sub: Subscription }) {
    const isMax = sub.plan_name.includes('Monthly Max')
    const mealsPerDelivery = isMax ? 2 : 1
    const total = sub.total_meals
    const totalDeliveries = Math.max(1, Math.ceil(total / mealsPerDelivery))
    const deliveriesDone = Math.floor(sub.delivered_meals / mealsPerDelivery)
    const skippedDeliveries = Math.floor(sub.skipped_meals_count / mealsPerDelivery)
    const left = Math.max(0, totalDeliveries - deliveriesDone - skippedDeliveries)
    const mealsLeft = left * mealsPerDelivery

    const daysLeft = Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
    const startsInFuture = new Date(sub.start_date).getTime() > Date.now()
    const renewEligible = !startsInFuture && daysLeft <= 7
    const daysUntilRenewUnlock = Math.max(0, daysLeft - 7)

    return (
        <div style={{
            ...TIER2,
            gridColumn: 'span 12',
            padding: 28, borderRadius: 'var(--radius-md)',
            display: 'flex', flexDirection: 'column', gap: 0,
        }} className="plan-progress-card">

            {/* 1 — Plan identity (neutral glyph; orange reserved for hero/CTAs) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <PlanGlyph planName={sub.plan_name} size={14} color={S.fg} />
                <Eyebrow>{cleanPlanName(sub.plan_name)}</Eyebrow>
            </div>

            {/* 2 — Meals remaining (section metric, not page hero) */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
                <span style={{ fontFamily: BODY, fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1, color: NV, fontFeatureSettings: '"tnum"' }}>
                    {mealsLeft}
                </span>
                <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 500, color: S.fgMuted, lineHeight: 1.5 }}>
                    of {total} meals remaining
                </span>
            </div>

            {/* 3 — Segmented progress bar — one cell per meal in the cycle.
                  Delivered meals fill from the left in orange; skipped meals follow
                  in hatched gray; remaining meals stay neutral. */}
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={sub.delivered_meals}
                aria-label={`${sub.delivered_meals} of ${total} meals delivered`}
                style={{ display: 'flex', gap: 3, height: 10 }}
            >
                {Array.from({ length: total }).map((_, i) => {
                    const isDelivered = i < sub.delivered_meals
                    const isSkipped = !isDelivered && i < sub.delivered_meals + sub.skipped_meals_count
                    // Always use the backgroundColor + backgroundImage longhand pair —
                    // never mix with the `background` shorthand. React converts
                    // `backgroundImage: undefined` to '' which clears any image set via
                    // the shorthand, silently making delivered cells invisible.
                    const backgroundColor = isDelivered
                        ? OG
                        : isSkipped
                            ? 'rgba(9,24,37,0.40)'
                            : 'rgba(9,24,37,0.08)'
                    const backgroundImage = isDelivered
                        ? `linear-gradient(180deg, ${OG} 0%, ${OG3} 100%)`
                        : isSkipped
                            ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 2px, transparent 2px, transparent 5px)'
                            : 'none'
                    return (
                        <div
                            key={i}
                            style={{
                                flex: 1,
                                minWidth: 3,
                                borderRadius: 'var(--radius-pill)',
                                backgroundColor,
                                backgroundImage,
                                transition: 'background-color 200ms, background-image 200ms',
                            }}
                        />
                    )
                })}
            </div>
            <div style={{ marginTop: 8, fontFamily: BODY, fontSize: 12, color: S.fgMuted, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: OG, display: 'inline-block' }} />
                    <strong style={{ color: NV, fontFeatureSettings: '"tnum"' }}>{sub.delivered_meals}</strong> delivered
                </span>
                {sub.skipped_meals_count > 0 && (
                    <>
                        <span style={{ color: S.fgFaint }}>·</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 2, background: 'rgba(9,24,37,0.40)', display: 'inline-block' }} />
                            <strong style={{ color: NV, fontFeatureSettings: '"tnum"' }}>{sub.skipped_meals_count}</strong> skipped
                        </span>
                    </>
                )}
            </div>

            {/* 4 — Timeline */}
            <div style={{ marginTop: 'auto', paddingTop: 18, borderTop: `1px solid ${S.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub, lineHeight: 1.2 }}>
                            Started
                        </div>
                        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: NV, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                            {fmt(sub.start_date)}
                        </div>
                    </div>
                    <span style={{ color: S.fgFaint, fontSize: 14 }} aria-hidden>→</span>
                    <div>
                        <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub, lineHeight: 1.2 }}>
                            Ending
                        </div>
                        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: NV, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                            {fmt(sub.end_date)}
                        </div>
                    </div>
                    {!startsInFuture && (
                        <div style={{ marginLeft: 'auto' }}>
                            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub, lineHeight: 1.2 }}>
                                Days left
                            </div>
                            <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 900, color: NV, marginTop: 4, fontFeatureSettings: '"tnum"', lineHeight: 1 }}>
                                {daysLeft}
                            </div>
                        </div>
                    )}
                </div>

                {/* 5 — Action */}
                {mealsLeft === 0 ? (
                    <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)', background: 'rgba(245,127,32,0.08)', border: '1px solid rgba(245,127,32,0.20)' }}>
                        <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: NV }}>Plan ended</div>
                        <div style={{ fontFamily: BODY, fontSize: 12, color: S.fgMuted, marginTop: 4, lineHeight: 1.5 }}>Renew to keep meals coming.</div>
                        <Link href="/dashboard/plan" className="btn-primary" style={{ ...btnStyle('primary-tight'), marginTop: 12, width: '100%' }}>
                            Renew plan →
                        </Link>
                    </div>
                ) : renewEligible ? (
                    <Link href="/dashboard/plan" className="btn-primary" style={{ ...btnStyle('primary-tight'), width: '100%' }}>
                        Renew plan →
                    </Link>
                ) : (
                    <div style={{
                        padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                        background: 'rgba(9,24,37,0.04)', border: `1px solid ${S.border}`,
                        fontFamily: BODY, fontSize: 12, color: S.fgMuted, lineHeight: 1.5,
                    }}>
                        {startsInFuture
                            ? <>Plan begins on <strong style={{ color: NV }}>{fmt(sub.start_date)}</strong>.</>
                            : <>Renewal opens in <strong style={{ color: NV }}>{daysUntilRenewUnlock} day{daysUntilRenewUnlock === 1 ? '' : 's'}</strong>.</>}
                    </div>
                )}
            </div>
        </div>
    )
}
