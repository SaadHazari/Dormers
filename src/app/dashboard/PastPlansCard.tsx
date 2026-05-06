'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { NV, BODY, S, TIER2, cleanPlanName } from './_shared/tokens'
import { Eyebrow } from './_shared/Eyebrow'
import { PlanGlyph } from './_shared/PlanGlyph'
import { fmt } from './_shared/format'
import type { Subscription } from './_shared/types'

/**
 * Past-plans companion card — sits alongside PlanProgress at span 6 in the
 * dashboard grid so the "how is my plan going?" row reads as a 50/50 split:
 * current cycle on the left, history on the right. Compact rows (date range
 * + plan name + delivered count) keep the tile readable without crowding
 * the live progress card.
 *
 * If no past plans exist, renders an empty-state placeholder so the grid
 * column doesn't collapse and unbalance the live card on its own.
 */
export function PastPlansCard({ endedPlans }: { endedPlans: Subscription[] }) {
    const sorted = [...endedPlans].sort(
        (a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime(),
    )
    const visible = sorted.slice(0, 4)
    const overflow = sorted.length - visible.length

    return (
        <div style={{
            ...TIER2,
            gridColumn: 'span 6',
            padding: 28, borderRadius: 'var(--radius-md)',
            display: 'flex', flexDirection: 'column', gap: 0,
        }} className="past-plans-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
                <Eyebrow>Past plans</Eyebrow>
                {sorted.length > 0 && (
                    <Link
                        href="/dashboard/history"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontFamily: BODY, fontSize: 11, fontWeight: 700,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            color: S.fgMuted, textDecoration: 'none',
                        }}
                    >
                        View all <ChevronRight size={11} strokeWidth={2.4} />
                    </Link>
                )}
            </div>

            {sorted.length === 0 ? (
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    padding: '24px 8px',
                    fontFamily: BODY, fontSize: 12.5, color: S.fgFaint, lineHeight: 1.5,
                    textAlign: 'left',
                }}>
                    Your finished plans will appear here. Each one is a record of how
                    many dinners we&rsquo;ve made for you so far.
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {visible.map((s, i) => (
                            <div
                                key={s.id}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr) auto',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '10px 0',
                                    borderTop: i === 0 ? 'none' : `1px solid ${S.border}`,
                                }}
                            >
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 8,
                                    minWidth: 0,
                                    fontFamily: BODY, fontSize: 13, fontWeight: 700,
                                    color: NV, lineHeight: 1.2,
                                }}>
                                    <PlanGlyph planName={s.plan_name} size={13} color={S.fgMuted} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {cleanPlanName(s.plan_name)}
                                    </span>
                                </div>
                                <div style={{
                                    fontFamily: BODY, fontSize: 11.5, fontWeight: 500,
                                    color: S.fgMuted,
                                    fontFeatureSettings: '"tnum"',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {fmt(s.start_date)} → {fmt(s.end_date)}
                                </div>
                                <div style={{
                                    fontFamily: BODY, fontSize: 11.5, fontWeight: 700,
                                    color: NV,
                                    fontFeatureSettings: '"tnum"',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {s.delivered_meals}/{s.total_meals}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{
                        marginTop: 'auto', paddingTop: 14,
                        borderTop: `1px solid ${S.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 8,
                    }}>
                        <span style={{ fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, fontFeatureSettings: '"tnum"' }}>
                            <strong style={{ color: NV, fontWeight: 700 }}>{sorted.length}</strong> total plan{sorted.length === 1 ? '' : 's'}
                            {overflow > 0 && <> · {overflow} more</>}
                        </span>
                        <span style={{ fontFamily: BODY, fontSize: 11.5, color: S.fgFaint, fontFeatureSettings: '"tnum"' }}>
                            <strong style={{ color: NV, fontWeight: 700 }}>{sorted.reduce((a, x) => a + (x.delivered_meals ?? 0), 0)}</strong> meals delivered
                        </span>
                    </div>
                </>
            )}
        </div>
    )
}
