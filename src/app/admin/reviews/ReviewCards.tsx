'use client'

import Link from 'next/link'
import { ArrowUpRight, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { TONE, triggerLabel, jobLabel, altLabel, costLabel, renewalLabel, recommendLabel } from './labels'
import { ReviewTriage } from './ReviewTriage'
import type { CustomerWeeklyReview, CustomerMonthlyReview } from '@/infra/supabase/reviews-repo'

export interface CardCustomer { id: string | null; name: string | null }

/** Customer name header — a link to the detail page when we have an id. Shown
 *  in the dashboard drill-downs/feed, omitted on the customer's own page. */
function CustomerHeader({ customer }: { customer: CardCustomer }) {
    const { t } = useAdminTheme()
    const name = customer.name || 'Customer'
    if (!customer.id) return <div className={`text-[12px] font-black ${t.heading} mb-1.5`}>{name}</div>
    return (
        <Link href={`/admin/customers/${customer.id}`} className={`inline-flex items-center gap-1 text-[12px] font-black mb-1.5 ${t.heading} hover:underline`}>
            {name}<ArrowUpRight size={12} strokeWidth={2.4} className={t.faint} />
        </Link>
    )
}

export function WeeklyReviewCard({ review: w, customer }: { review: CustomerWeeklyReview; customer?: CardCustomer }) {
    const { t } = useAdminTheme()
    return (
        <div className={`${t.card} rounded-xl p-4`}>
            {customer && <CustomerHeader customer={customer} />}
            <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className={`text-[13px] font-bold ${t.heading}`}>
                    Week {w.weekNumber ?? '–'}
                    {w.weekStart && <span className={`ml-2 text-[11px] font-semibold ${t.faint}`}>{dateRange(w.weekStart, w.weekEnd)}</span>}
                </div>
                <div className="flex items-center gap-2">
                    <Stars value={w.rating} />
                    <RewardChip pct={w.rewardPct} />
                </div>
            </div>

            {w.favorites.length > 0 && <ChipRow label="Loved" color={TONE.good} items={w.favorites.map(f => f.name)} />}
            {w.misses.length > 0 && (
                <div className="mt-1.5">
                    <span className="text-[9px] font-black uppercase tracking-[0.1em]" style={{ color: TONE.bad }}>Missed</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        {w.misses.map(m => (
                            <span key={m.id} className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: TONE.bad, borderColor: `${TONE.bad}55` }}>
                                {m.name}{m.reasons.length > 0 && <span className={`ml-1 font-medium ${t.faint}`}>· {m.reasons.join(', ')}</span>}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[11px] font-semibold">
                <Thumb label="Delivery" up={w.deliveryThumbs === 'up'} down={w.deliveryThumbs === 'down'} reasons={w.deliveryReasons} />
                <Thumb label="Packaging" up={w.packagingThumbs === 'up'} down={w.packagingThumbs === 'down'} reasons={w.packagingReasons} />
            </div>

            {w.kitchenNote && (
                <p className={`mt-2.5 text-[12px] leading-relaxed ${t.body} border-l-2 pl-2.5`} style={{ borderColor: `${TONE.ok}66` }}>“{w.kitchenNote}”</p>
            )}
            <div className={`mt-2 text-[10px] tabular-nums ${t.faint}`}>Submitted {fullDate(w.submittedAt)}</div>
            <ReviewTriage reviewType="weekly" reviewId={w.id} initialStatus={w.adminStatus} initialNote={w.adminNote} />
        </div>
    )
}

export function MonthlyReviewCard({ review: m, customer }: { review: CustomerMonthlyReview; customer?: CardCustomer }) {
    const { t } = useAdminTheme()
    const triggers = [...m.signupTriggers.map(id => triggerLabel.get(id) ?? id), ...(m.signupTriggersOther ? [m.signupTriggersOther] : [])]
    const jobs = [...m.jobs.map(id => jobLabel.get(id) ?? id), ...(m.jobsOther ? [m.jobsOther] : [])]
    const altText = [m.alternative ? (altLabel.get(m.alternative) ?? m.alternative) : null, m.alternativeOther].filter(Boolean).join(' · ')
    const cost = m.alternativeCostAed ? costLabel.get(m.alternativeCostAed) ?? m.alternativeCostAed : null

    return (
        <div className={`${t.card} rounded-xl p-4`}>
            {customer && <CustomerHeader customer={customer} />}
            <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className={`text-[13px] font-bold ${t.heading}`}>Monthly wrap</div>
                <div className="flex items-center gap-2">
                    <RewardChip pct={m.rewardPct} />
                    <span className={`text-[10px] tabular-nums ${t.faint}`}>{fullDate(m.submittedAt)}</span>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                {triggers.length > 0 && <QA label="Why they joined" value={triggers.join(' · ')} />}
                {jobs.length > 0 && <QA label="What Dormers does for them" value={jobs.join(' · ')} />}
                {altText && <QA label="Would do instead" value={cost ? `${altText} (${cost})` : altText} />}
                <QA label="Renewal intent" value={m.renewalReason ? `${renewalLabel(m.renewalIntent)} — ${m.renewalReason}` : renewalLabel(m.renewalIntent)} tone={renewalToneColor(m.renewalIntent)} />
                <QA label="Would recommend" value={m.recommendText ? `${recommendLabel(m.recommend)} — ${m.recommendText}` : recommendLabel(m.recommend)} />
                {m.bestMoment && <QA label="Best moment" value={m.bestMoment} tone={TONE.good} />}
                {m.frictionMoment && <QA label="Friction" value={m.frictionMoment} tone={TONE.warn} />}
            </div>
            <ReviewTriage reviewType="monthly" reviewId={m.id} initialStatus={m.adminStatus} initialNote={m.adminNote} />
        </div>
    )
}

// ── shared bits ──────────────────────────────────────────────────────────────

function QA({ label, value, tone }: { label: string; value: string; tone?: string }) {
    const { t } = useAdminTheme()
    return (
        <div className="grid grid-cols-[130px_1fr] gap-2 items-baseline">
            <span className={`text-[10px] font-bold tracking-[0.06em] uppercase ${t.faint}`}>{label}</span>
            <span className="text-[12px] font-semibold leading-relaxed" style={tone ? { color: tone } : undefined}>
                <span className={tone ? '' : t.body}>{value}</span>
            </span>
        </div>
    )
}

function ChipRow({ label, color, items }: { label: string; color: string; items: string[] }) {
    return (
        <div>
            <span className="text-[9px] font-black uppercase tracking-[0.1em]" style={{ color }}>{label}</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
                {items.map((it, i) => (
                    <span key={i} className="text-[11px] font-semibold px-2 py-0.5 rounded-full border" style={{ color, borderColor: `${color}55` }}>{it}</span>
                ))}
            </div>
        </div>
    )
}

function Thumb({ label, up, down, reasons }: { label: string; up: boolean; down: boolean; reasons: string[] }) {
    const { t } = useAdminTheme()
    if (!up && !down) return null
    return (
        <span className="inline-flex items-center gap-1" style={{ color: down ? TONE.warn : TONE.good }}>
            {up ? <ThumbsUp size={12} strokeWidth={2.4} /> : <ThumbsDown size={12} strokeWidth={2.4} />}
            <span className={t.body}>{label}</span>
            {down && reasons.length > 0 && <span className={`font-medium ${t.faint}`}>· {reasons.join(', ')}</span>}
        </span>
    )
}

function Stars({ value }: { value: number }) {
    return (
        <span className="text-[12px] tracking-tight tabular-nums" style={{ color: TONE.ok }} title={`${value} / 5`}>
            {'★'.repeat(value)}<span style={{ opacity: 0.3 }}>{'★'.repeat(Math.max(0, 5 - value))}</span>
        </span>
    )
}

function RewardChip({ pct }: { pct: number | null }) {
    const { t } = useAdminTheme()
    if (pct == null) return null
    return (
        <span className={`text-[9px] font-black uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${t.tableHeader}`}>
            {pct === 100 ? 'On-time' : 'Late'}
        </span>
    )
}

function renewalToneColor(intent: string | null): string | undefined {
    switch (intent) {
        case 'definitely': return TONE.good
        case 'probably_not': return TONE.warn
        case 'no': return TONE.bad
        default: return undefined
    }
}

function dateRange(start: string, end: string | null): string {
    const s = new Date(start).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' })
    if (!end) return s
    const e = new Date(end).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' })
    return `${s} – ${e}`
}

function fullDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' })
}
