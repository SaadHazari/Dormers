'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChefHat, HeartHandshake, Star, Truck, Package, MessageSquareQuote, Inbox, X } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminEmptyState } from '../_components/AdminEmptyState'
import { AdminModal } from '../_components/AdminModal'
import { ALTERNATIVE_COST_OPTIONS } from '@/contexts/subscriptions/domain/monthly-review'
import { TONE, RENEWAL_ORDER, RECOMMEND_ORDER, triggerLabel, jobLabel, altLabel, costLabel } from './labels'
import { computeKitchen, computeRetention, type KitchenAgg, type RetentionAgg, type DishStat } from './aggregate'
import { SubmissionsFeed } from './SubmissionsFeed'
import { WeeklyReviewCard, MonthlyReviewCard } from './ReviewCards'
import type { ReviewsOverview, OverviewWeekly, OverviewMonthly } from '@/infra/supabase/reviews-repo'

type Lens = 'kitchen' | 'retention' | 'submissions'
type Drill =
    | { kind: 'weekly'; title: string; items: OverviewWeekly[] }
    | { kind: 'monthly'; title: string; items: OverviewMonthly[] }

export function ReviewsClient({ overview }: { overview: ReviewsOverview }) {
    const { t } = useAdminTheme()
    const [lens, setLens] = useState<Lens>('kitchen')
    const [drill, setDrill] = useState<Drill | null>(null)

    const kitchen = useMemo(() => computeKitchen(overview.weekly), [overview.weekly])
    const retention = useMemo(() => computeRetention(overview.monthly), [overview.monthly])

    return (
        <div>
            {/* Header */}
            <div className="mb-4">
                <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Reviews &amp; Feedback</h1>
                <p className={`text-[13px] font-medium ${t.muted}`}>
                    {kitchen.total} weekly review{kitchen.total === 1 ? '' : 's'} · {retention.total} monthly wrap{retention.total === 1 ? '' : 's'}
                    {kitchen.avgRating != null && <> · {kitchen.avgRating.toFixed(2)}★ avg</>}
                </p>
            </div>

            {/* Lens tabs */}
            <div className="flex flex-wrap gap-1.5 mb-5">
                <LensTab active={lens === 'kitchen'} onClick={() => setLens('kitchen')} icon={<ChefHat size={14} strokeWidth={2.2} />} label="Kitchen Performance" />
                <LensTab active={lens === 'retention'} onClick={() => setLens('retention')} icon={<HeartHandshake size={14} strokeWidth={2.2} />} label="Retention & Sentiment" />
                <LensTab active={lens === 'submissions'} onClick={() => setLens('submissions')} icon={<Inbox size={14} strokeWidth={2.2} />} label="All Submissions" />
            </div>

            {lens === 'kitchen' ? <KitchenView k={kitchen} weekly={overview.weekly} onDrill={setDrill} />
                : lens === 'retention' ? <RetentionView r={retention} monthly={overview.monthly} onDrill={setDrill} />
                    : <SubmissionsFeed weekly={overview.weekly} monthly={overview.monthly} />}

            {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
        </div>
    )
}

// ── Kitchen performance lens ─────────────────────────────────────────────────

function KitchenView({ k, weekly, onDrill }: { k: KitchenAgg; weekly: OverviewWeekly[]; onDrill: (d: Drill) => void }) {
    const { t } = useAdminTheme()

    if (k.total === 0) {
        return <AdminEmptyState icon={<ChefHat size={30} strokeWidth={1.8} />} title="No weekly reviews yet" description="Kitchen performance fills in as customers submit their weekly feedback." />
    }

    const weeklyDrill = (title: string, items: OverviewWeekly[]) => onDrill({ kind: 'weekly', title, items })
    const maxBucket = Math.max(...k.distribution.map(b => b.count), 1)
    const notes = weekly.filter(w => w.kitchenNote)

    return (
        <div className="flex flex-col gap-5">
            {/* Stat strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Avg rating" value={k.avgRating != null ? `${k.avgRating.toFixed(2)}★` : '—'} accent onClick={() => weeklyDrill('All weekly reviews', weekly)} />
                <StatCard label="Weekly reviews" value={String(k.total)} onClick={() => weeklyDrill('All weekly reviews', weekly)} />
                <StatCard label="Delivery issues" value={`${k.deliveryDownRate}%`} tone={k.deliveryDownRate > 0 ? 'warn' : 'good'} sub={`${k.deliveryDownCount} flagged`} onClick={k.deliveryDownCount ? () => weeklyDrill('Delivery issues', weekly.filter(w => w.deliveryThumbs === 'down')) : undefined} />
                <StatCard label="Packaging issues" value={`${k.packagingDownRate}%`} tone={k.packagingDownRate > 0 ? 'warn' : 'good'} sub={`${k.packagingDownCount} flagged`} onClick={k.packagingDownCount ? () => weeklyDrill('Packaging issues', weekly.filter(w => w.packagingThumbs === 'down')) : undefined} />
            </div>

            {/* Rating distribution + trend */}
            <div className="grid md:grid-cols-2 gap-5">
                <Panel title="Rating distribution" icon={<Star size={14} strokeWidth={2.2} />} hint="tap a row">
                    <div className="flex flex-col gap-2">
                        {[...k.distribution].reverse().map(b => (
                            <BarRow key={b.rating} label={`${b.rating}★`} labelW="w-9" count={b.count} pct={(b.count / maxBucket) * 100} color={TONE.ok}
                                onClick={b.count ? () => weeklyDrill(`${b.rating}★ reviews`, weekly.filter(w => w.rating === b.rating)) : undefined} />
                        ))}
                    </div>
                </Panel>

                <Panel title="Rating trend by week" icon={<Star size={14} strokeWidth={2.2} />} hint="tap a bar">
                    {k.trend.length === 0 ? (
                        <p className={`text-[12px] font-semibold ${t.faint}`}>No dated reviews yet.</p>
                    ) : (
                        <div className="flex items-end gap-1.5 h-[120px] pt-2">
                            {k.trend.map(p => (
                                <button key={p.weekStart} type="button"
                                    onClick={() => weeklyDrill(`Week of ${shortDate(p.weekStart)}`, weekly.filter(w => w.weekStart === p.weekStart))}
                                    className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0 group"
                                    title={`Week of ${shortDate(p.weekStart)} · ${p.avgRating.toFixed(2)}★ · ${p.count} review${p.count === 1 ? '' : 's'}`}>
                                    <div className={`text-[10px] font-black tabular-nums ${t.muted}`}>{p.avgRating.toFixed(1)}</div>
                                    <div className="w-full rounded-t transition-opacity group-hover:opacity-80" style={{ height: `${(p.avgRating / 5) * 90}px`, minHeight: 4, backgroundColor: TONE.ok }} />
                                    <div className={`text-[9px] font-bold tabular-nums ${t.faint} truncate w-full text-center`}>{shortDate(p.weekStart)}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            {/* Dish leaderboard */}
            <div className="grid md:grid-cols-2 gap-5">
                <Panel title="Most loved dishes" icon={<Star size={14} strokeWidth={2.2} />}>
                    <DishList dishes={k.topLoved} metric="favorites" color={TONE.good} emptyLabel="No favorites picked yet."
                        onPick={d => weeklyDrill(`Loved: ${d.name}`, weekly.filter(w => w.favorites.some(f => f.id === d.id)))} />
                </Panel>
                <Panel title="Needs attention" icon={<ChefHat size={14} strokeWidth={2.2} />} hint="Most-missed dishes + why">
                    <DishList dishes={k.topMissed} metric="misses" color={TONE.bad} emptyLabel="No misses flagged yet." showReasons
                        onPick={d => weeklyDrill(`Missed: ${d.name}`, weekly.filter(w => w.misses.some(m => m.id === d.id)))} />
                </Panel>
            </div>

            {/* Delivery / packaging reason breakdown */}
            {(Object.keys(k.deliveryReasonCounts).length > 0 || Object.keys(k.packagingReasonCounts).length > 0) && (
                <div className="grid md:grid-cols-2 gap-5">
                    <Panel title="Delivery issues" icon={<Truck size={14} strokeWidth={2.2} />}>
                        <ReasonList counts={k.deliveryReasonCounts} color={TONE.warn} emptyLabel="No delivery issues flagged."
                            onPick={reason => weeklyDrill(`Delivery: ${reason}`, weekly.filter(w => w.deliveryThumbs === 'down' && w.deliveryReasons.includes(reason)))} />
                    </Panel>
                    <Panel title="Packaging issues" icon={<Package size={14} strokeWidth={2.2} />}>
                        <ReasonList counts={k.packagingReasonCounts} color={TONE.warn} emptyLabel="No packaging issues flagged."
                            onPick={reason => weeklyDrill(`Packaging: ${reason}`, weekly.filter(w => w.packagingThumbs === 'down' && w.packagingReasons.includes(reason)))} />
                    </Panel>
                </div>
            )}

            {/* Kitchen notes feed */}
            <Panel title="Kitchen notes" icon={<MessageSquareQuote size={14} strokeWidth={2.2} />} hint={`${notes.length} note${notes.length === 1 ? '' : 's'}`}>
                {notes.length === 0 ? (
                    <p className={`text-[12px] font-semibold ${t.faint}`}>No written notes yet.</p>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {notes.map(n => <NoteCard key={n.id} note={n} />)}
                    </div>
                )}
            </Panel>
        </div>
    )
}

// ── Retention & sentiment lens ───────────────────────────────────────────────

function RetentionView({ r, monthly, onDrill }: { r: RetentionAgg; monthly: OverviewMonthly[]; onDrill: (d: Drill) => void }) {
    const { t } = useAdminTheme()

    if (r.total === 0) {
        return <AdminEmptyState icon={<HeartHandshake size={30} strokeWidth={1.8} />} title="No monthly wraps yet" description="Retention signal fills in when customers complete their end-of-cycle wrap." />
    }

    const monthlyDrill = (title: string, items: OverviewMonthly[]) => onDrill({ kind: 'monthly', title, items })
    const total = r.total
    const renewPositive = (r.renewalIntentCounts['definitely'] ?? 0) + (r.renewalIntentCounts['probably'] ?? 0)
    const promoters = (r.recommendCounts['yes_specific'] ?? 0) + (r.recommendCounts['yes_general'] ?? 0)
    const stories = monthly.filter(m => m.bestMoment || m.frictionMoment)

    return (
        <div className="flex flex-col gap-5">
            {/* Stat strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Monthly wraps" value={String(total)} onClick={() => monthlyDrill('All monthly wraps', monthly)} />
                <StatCard label="Renewing" value={`${pct(renewPositive, total)}%`} tone={pct(renewPositive, total) >= 50 ? 'good' : 'warn'} sub={`${renewPositive} of ${total}`} accent
                    onClick={() => monthlyDrill('Renewing (definitely + probably)', monthly.filter(m => m.renewalIntent === 'definitely' || m.renewalIntent === 'probably'))} />
                <StatCard label="Would recommend" value={`${pct(promoters, total)}%`} tone={pct(promoters, total) >= 50 ? 'good' : 'warn'} sub={`${promoters} of ${total}`}
                    onClick={() => monthlyDrill('Would recommend', monthly.filter(m => m.recommend === 'yes_specific' || m.recommend === 'yes_general'))} />
                <StatCard label="Stories shared" value={String(stories.length)} onClick={stories.length ? () => monthlyDrill('Wraps with a story', stories) : undefined} />
            </div>

            <div className="grid md:grid-cols-2 gap-5">
                <Panel title="Renewal intent" icon={<HeartHandshake size={14} strokeWidth={2.2} />}>
                    <OrderedBars order={RENEWAL_ORDER} counts={r.renewalIntentCounts} total={total}
                        onPick={id => monthlyDrill(`Renewal: ${labelOf(RENEWAL_ORDER, id)}`, monthly.filter(m => m.renewalIntent === id))} />
                </Panel>
                <Panel title="Would recommend" icon={<HeartHandshake size={14} strokeWidth={2.2} />}>
                    <OrderedBars order={RECOMMEND_ORDER} counts={r.recommendCounts} total={total}
                        onPick={id => monthlyDrill(`Recommend: ${labelOf(RECOMMEND_ORDER, id)}`, monthly.filter(m => m.recommend === id))} />
                </Panel>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
                <Panel title="What they'd do instead" icon={<HeartHandshake size={14} strokeWidth={2.2} />} hint="If Dormers didn't exist">
                    <LabeledBars labels={altLabel} counts={r.alternativeCounts} total={total} color={TONE.neutral}
                        onPick={id => monthlyDrill(`Instead: ${altLabel.get(id) ?? id}`, monthly.filter(m => m.alternative === id))} />
                </Panel>
                <Panel title="What that would cost them" icon={<HeartHandshake size={14} strokeWidth={2.2} />} hint="Willingness to pay / meal">
                    <LabeledBars labels={costLabel} counts={r.costCounts} total={total} color={TONE.ok} order={ALTERNATIVE_COST_OPTIONS.map(o => o.id)}
                        onPick={id => monthlyDrill(`Cost: ${costLabel.get(id) ?? id}`, monthly.filter(m => m.alternativeCostAed === id))} />
                </Panel>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
                <Panel title="Why they joined" icon={<HeartHandshake size={14} strokeWidth={2.2} />}>
                    <LabeledBars labels={triggerLabel} counts={r.signupTriggerCounts} total={total} color={TONE.ok} emptyLabel="No signup reasons captured yet."
                        onPick={id => monthlyDrill(`Joined because: ${triggerLabel.get(id) ?? id}`, monthly.filter(m => m.signupTriggers.includes(id)))} />
                </Panel>
                <Panel title="What Dormers does for them" icon={<HeartHandshake size={14} strokeWidth={2.2} />} hint="Jobs-to-be-done">
                    <LabeledBars labels={jobLabel} counts={r.jobCounts} total={total} color={TONE.good} emptyLabel="No jobs captured yet."
                        onPick={id => monthlyDrill(`Job: ${jobLabel.get(id) ?? id}`, monthly.filter(m => m.jobs.includes(id)))} />
                </Panel>
            </div>

            {/* Stories */}
            <Panel title="In their words" icon={<MessageSquareQuote size={14} strokeWidth={2.2} />} hint={`${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}`}>
                {stories.length === 0 ? (
                    <p className={`text-[12px] font-semibold ${t.faint}`}>No best- or friction-moment stories yet.</p>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {stories.map(s => <StoryCard key={s.id} story={s} />)}
                    </div>
                )}
            </Panel>
        </div>
    )
}

// ── Drill-down modal ─────────────────────────────────────────────────────────

function DrillModal({ drill, onClose }: { drill: Drill; onClose: () => void }) {
    const { t } = useAdminTheme()
    const count = drill.items.length
    return (
        <AdminModal label={drill.title} maxW="max-w-[640px]" onBackdrop={onClose}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${t.border}`}>
                <div>
                    <div className={`text-[15px] font-black tracking-[-0.01em] ${t.heading}`}>{drill.title}</div>
                    <div className={`text-[11px] font-bold uppercase tracking-[0.08em] ${t.faint} mt-0.5`}>{count} {drill.kind === 'weekly' ? 'weekly review' : 'monthly wrap'}{count === 1 ? '' : 's'}</div>
                </div>
                <button type="button" onClick={onClose} className={`w-8 h-8 flex items-center justify-center rounded-lg ${t.sidebarItem}`} aria-label="Close"><X size={16} strokeWidth={2.2} /></button>
            </div>
            <div className="px-5 py-4 overflow-y-auto flex flex-col gap-3">
                {count === 0 ? (
                    <p className={`text-center py-8 text-sm font-semibold ${t.faint}`}>No matching reviews.</p>
                ) : drill.kind === 'weekly' ? (
                    drill.items.map(w => <WeeklyReviewCard key={w.id} review={w} customer={{ id: w.customerId, name: w.customerName }} />)
                ) : (
                    drill.items.map(m => <MonthlyReviewCard key={m.id} review={m} customer={{ id: m.customerId, name: m.customerName }} />)
                )}
            </div>
        </AdminModal>
    )
}

// ── Building blocks ──────────────────────────────────────────────────────────

function LensTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    const { t } = useAdminTheme()
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-[0.05em] border transition-colors ${
                active ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
            }`}
        >
            {icon}
            <span>{label}</span>
        </button>
    )
}

function Panel({ title, icon, hint, children }: { title: string; icon?: React.ReactNode; hint?: string; children: React.ReactNode }) {
    const { t } = useAdminTheme()
    return (
        <div className={`rounded-xl p-4 ${t.card}`}>
            <div className="flex items-center justify-between gap-2 mb-3">
                <div className={`flex items-center gap-1.5 text-[11px] font-black tracking-[0.08em] uppercase ${t.heading}`}>
                    {icon && <span className={t.accent}>{icon}</span>}
                    <span>{title}</span>
                </div>
                {hint && <span className={`text-[10px] font-bold ${t.faint}`}>{hint}</span>}
            </div>
            {children}
        </div>
    )
}

function StatCard({ label, value, sub, accent, tone, onClick }: { label: string; value: string; sub?: string; accent?: boolean; tone?: keyof typeof TONE; onClick?: () => void }) {
    const { t } = useAdminTheme()
    const inner = (
        <>
            <div className={`text-[9px] font-bold tracking-[0.12em] uppercase ${t.faint}`}>{label}</div>
            <div
                className={`text-[18px] font-black tabular-nums ${accent && !tone ? t.accent : !tone ? t.heading : ''}`}
                style={tone ? { color: TONE[tone] } : undefined}
            >
                {value}
            </div>
            {sub && <div className={`text-[10px] font-semibold ${t.faint}`}>{sub}</div>}
        </>
    )
    if (!onClick) return <div className={`${t.card} rounded-xl px-3 py-2.5`}>{inner}</div>
    return (
        <button type="button" onClick={onClick} className={`${t.card} ${t.cardHover} rounded-xl px-3 py-2.5 text-left transition-all cursor-pointer`}>{inner}</button>
    )
}

function Track({ pct, color }: { pct: number; color: string }) {
    const { t } = useAdminTheme()
    return (
        <div className={`h-2.5 rounded-full overflow-hidden ${t.tableHeader}`}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }} />
        </div>
    )
}

/** One clickable metric row: label + bar + count. */
function BarRow({ label, labelW = 'w-[140px]', count, pct, color, suffix, onClick, title }: { label: string; labelW?: string; count: number; pct: number; color: string; suffix?: string; onClick?: () => void; title?: string }) {
    const { t } = useAdminTheme()
    const body = (
        <>
            <div className={`${labelW} shrink-0 text-[11px] font-semibold truncate ${t.body}`} title={title ?? label}>{label}</div>
            <div className="flex-1"><Track pct={pct} color={color} /></div>
            <div className={`text-right text-[11px] font-black tabular-nums ${t.heading} ${suffix ? 'w-12' : 'w-6'}`}>{count}{suffix}</div>
        </>
    )
    if (!onClick) return <div className="flex items-center gap-2.5">{body}</div>
    return (
        <button type="button" onClick={onClick} className={`flex items-center gap-2.5 -mx-1 px-1 py-0.5 rounded-md ${t.cardHover} transition-colors cursor-pointer`}>{body}</button>
    )
}

function OrderedBars({ order, counts, total, onPick }: { order: ReadonlyArray<{ id: string; label: string; tone: keyof typeof TONE }>; counts: Record<string, number>; total: number; onPick: (id: string) => void }) {
    return (
        <div className="flex flex-col gap-2.5">
            {order.map(o => {
                const count = counts[o.id] ?? 0
                return <BarRow key={o.id} label={o.label} labelW="w-[140px]" count={count} pct={pct(count, total)} color={TONE[o.tone]} suffix={` · ${pct(count, total)}%`} onClick={count ? () => onPick(o.id) : undefined} />
            })}
        </div>
    )
}

function LabeledBars({ labels, counts, total, color, order, emptyLabel, onPick }: { labels: Map<string, string>; counts: Record<string, number>; total: number; color: string; order?: readonly string[]; emptyLabel?: string; onPick: (id: string) => void }) {
    const { t } = useAdminTheme()
    const visible = order ? [...order] : Object.keys(counts).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
    if (visible.every(k => (counts[k] ?? 0) === 0)) {
        return <p className={`text-[12px] font-semibold ${t.faint}`}>{emptyLabel ?? 'Nothing captured yet.'}</p>
    }
    return (
        <div className="flex flex-col gap-2.5">
            {visible.map(k => {
                const count = counts[k] ?? 0
                return <BarRow key={k} label={labels.get(k) ?? k} labelW="w-[150px]" count={count} pct={pct(count, total)} color={color} suffix={` · ${pct(count, total)}%`} onClick={count ? () => onPick(k) : undefined} />
            })}
        </div>
    )
}

function ReasonList({ counts, color, emptyLabel, onPick }: { counts: Record<string, number>; color: string; emptyLabel: string; onPick: (reason: string) => void }) {
    const { t } = useAdminTheme()
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const max = Math.max(...entries.map(([, c]) => c), 1)
    if (entries.length === 0) return <p className={`text-[12px] font-semibold ${t.faint}`}>{emptyLabel}</p>
    return (
        <div className="flex flex-col gap-2.5">
            {entries.map(([reason, count]) => (
                <BarRow key={reason} label={reason.charAt(0).toUpperCase() + reason.slice(1)} labelW="w-[140px]" count={count} pct={(count / max) * 100} color={color} onClick={() => onPick(reason)} />
            ))}
        </div>
    )
}

function DishList({ dishes, metric, color, emptyLabel, showReasons, onPick }: { dishes: DishStat[]; metric: 'favorites' | 'misses'; color: string; emptyLabel: string; showReasons?: boolean; onPick: (d: DishStat) => void }) {
    const { t } = useAdminTheme()
    if (dishes.length === 0) return <p className={`text-[12px] font-semibold ${t.faint}`}>{emptyLabel}</p>
    const max = Math.max(...dishes.map(d => d[metric]), 1)
    return (
        <div className="flex flex-col gap-3">
            {dishes.map(d => {
                const topReasons = Object.entries(d.missReasons).sort((a, b) => b[1] - a[1]).slice(0, 3)
                return (
                    <button key={d.id} type="button" onClick={() => onPick(d)} className={`text-left -mx-1 px-1 py-1 rounded-md ${t.cardHover} transition-colors cursor-pointer`}>
                        <div className="flex items-center gap-2.5">
                            <div className={`flex-1 min-w-0 text-[12px] font-bold truncate ${t.heading}`} title={d.name}>{d.name}</div>
                            <div className="w-20 shrink-0"><Track pct={(d[metric] / max) * 100} color={color} /></div>
                            <div className={`w-5 text-right text-[12px] font-black tabular-nums ${t.heading}`}>{d[metric]}</div>
                        </div>
                        {showReasons && topReasons.length > 0 && (
                            <div className={`mt-0.5 text-[10px] font-semibold ${t.faint}`}>{topReasons.map(([reason, c]) => `${reason} (${c})`).join(' · ')}</div>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

function NoteCard({ note }: { note: OverviewWeekly }) {
    const { t } = useAdminTheme()
    const body = (
        <div className={`rounded-lg p-3 border ${t.border}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
                <div className={`text-[12px] font-bold ${t.heading} truncate`}>{note.customerName || 'Customer'}</div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-black tabular-nums" style={{ color: TONE.ok }}>{note.rating}★</span>
                    <span className={`text-[10px] tabular-nums ${t.faint}`}>{shortDate(note.submittedAt)}</span>
                </div>
            </div>
            <p className={`text-[12px] leading-relaxed ${t.body}`}>{note.kitchenNote}</p>
        </div>
    )
    return note.customerId
        ? <Link href={`/admin/customers/${note.customerId}`} className="block hover:opacity-90 transition-opacity">{body}</Link>
        : body
}

function StoryCard({ story }: { story: OverviewMonthly }) {
    const { t } = useAdminTheme()
    const body = (
        <div className={`rounded-lg p-3 border ${t.border}`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className={`text-[12px] font-bold ${t.heading} truncate`}>{story.customerName || 'Customer'}</div>
                <span className={`text-[10px] tabular-nums ${t.faint} shrink-0`}>{shortDate(story.submittedAt)}</span>
            </div>
            {story.bestMoment && (
                <div className="mb-1.5">
                    <span className="text-[9px] font-black uppercase tracking-[0.1em]" style={{ color: TONE.good }}>Best moment</span>
                    <p className={`text-[12px] leading-relaxed ${t.body}`}>{story.bestMoment}</p>
                </div>
            )}
            {story.frictionMoment && (
                <div>
                    <span className="text-[9px] font-black uppercase tracking-[0.1em]" style={{ color: TONE.warn }}>Friction</span>
                    <p className={`text-[12px] leading-relaxed ${t.body}`}>{story.frictionMoment}</p>
                </div>
            )}
        </div>
    )
    return story.customerId
        ? <Link href={`/admin/customers/${story.customerId}`} className="block hover:opacity-90 transition-opacity">{body}</Link>
        : body
}

// ── pure helpers ─────────────────────────────────────────────────────────────

function pct(part: number, total: number): number {
    return total ? Math.round((part / total) * 100) : 0
}

function labelOf(order: ReadonlyArray<{ id: string; label: string }>, id: string): string {
    return order.find(o => o.id === id)?.label ?? id
}

function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' })
}
