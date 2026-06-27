'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChefHat, HeartHandshake, Search, Truck, Package, MessageSquareQuote, ArrowUpRight, Check } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { TONE, renewalLabel, recommendLabel } from './labels'
import { ReviewTriage } from './ReviewTriage'
import type { OverviewWeekly, OverviewMonthly, ReviewAdminStatus } from '@/infra/supabase/reviews-repo'

type FeedType = 'weekly' | 'monthly'
type TypeFilter = 'all' | FeedType
type StatusFilter = 'all' | 'open' | 'addressed'

interface FeedItem {
    id: string
    type: FeedType
    customerId: string | null
    customerName: string | null
    submittedAt: string
    rating: number | null
    weekNumber: number | null
    favoritesCount: number
    missesCount: number
    deliveryDown: boolean
    packagingDown: boolean
    kitchenNote: string | null
    renewalIntent: string | null
    recommend: string | null
    hasStory: boolean
    adminStatus: ReviewAdminStatus | null
    adminNote: string | null
}

function fromWeekly(w: OverviewWeekly): FeedItem {
    return {
        id: w.id, type: 'weekly', customerId: w.customerId, customerName: w.customerName, submittedAt: w.submittedAt,
        rating: w.rating, weekNumber: w.weekNumber, favoritesCount: w.favorites.length, missesCount: w.misses.length,
        deliveryDown: w.deliveryThumbs === 'down', packagingDown: w.packagingThumbs === 'down', kitchenNote: w.kitchenNote,
        renewalIntent: null, recommend: null, hasStory: false, adminStatus: w.adminStatus, adminNote: w.adminNote,
    }
}
function fromMonthly(m: OverviewMonthly): FeedItem {
    return {
        id: m.id, type: 'monthly', customerId: m.customerId, customerName: m.customerName, submittedAt: m.submittedAt,
        rating: null, weekNumber: null, favoritesCount: 0, missesCount: 0, deliveryDown: false, packagingDown: false, kitchenNote: null,
        renewalIntent: m.renewalIntent, recommend: m.recommend, hasStory: Boolean(m.bestMoment || m.frictionMoment),
        adminStatus: m.adminStatus, adminNote: m.adminNote,
    }
}

export function SubmissionsFeed({ weekly, monthly }: { weekly: OverviewWeekly[]; monthly: OverviewMonthly[] }) {
    const { t } = useAdminTheme()
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [query, setQuery] = useState('')

    const all = useMemo(
        () => [...weekly.map(fromWeekly), ...monthly.map(fromMonthly)].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
        [weekly, monthly],
    )

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return all.filter(s => {
            if (typeFilter !== 'all' && s.type !== typeFilter) return false
            if (statusFilter === 'open' && s.adminStatus === 'addressed') return false
            if (statusFilter === 'addressed' && s.adminStatus !== 'addressed') return false
            if (q && !(s.customerName ?? '').toLowerCase().includes(q)) return false
            return true
        })
    }, [all, typeFilter, statusFilter, query])

    const openCount = all.filter(s => s.adminStatus !== 'addressed').length
    const weeklyItems = filtered.filter(s => s.type === 'weekly')
    const monthlyItems = filtered.filter(s => s.type === 'monthly')

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <Pills value={typeFilter} onChange={setTypeFilter} options={[['all', 'All'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]} />
                <span className={`w-px h-5 ${t.border} border-l`} />
                <Pills value={statusFilter} onChange={setStatusFilter} options={[['all', 'Any'], ['open', `Open (${openCount})`], ['addressed', 'Addressed']]} />
                <div className={`flex-1 min-w-[180px] flex items-center gap-2 px-3 py-1.5 rounded-lg border ${t.input} ${t.inputFocus}`}>
                    <Search size={14} strokeWidth={2.2} className={t.faint} />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by customer name…" className="flex-1 bg-transparent outline-none text-[12px] font-semibold" />
                </div>
                <span className={`text-[11px] font-bold tabular-nums ${t.faint}`}>{filtered.length} of {all.length}</span>
            </div>

            {filtered.length === 0 ? (
                <div className={`text-center py-12 text-sm font-semibold ${t.faint}`}>No submissions match this filter</div>
            ) : typeFilter === 'all' ? (
                <div className="flex flex-col gap-5">
                    {weeklyItems.length > 0 && (
                        <Group icon={<ChefHat size={13} strokeWidth={2.2} />} title="Weekly reviews" count={weeklyItems.length} items={weeklyItems} />
                    )}
                    {monthlyItems.length > 0 && (
                        <Group icon={<HeartHandshake size={13} strokeWidth={2.2} />} title="Monthly wraps" count={monthlyItems.length} items={monthlyItems} />
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {filtered.map(s => <Row key={`${s.type}-${s.id}`} s={s} />)}
                </div>
            )}
        </div>
    )
}

function Group({ icon, title, count, items }: { icon: React.ReactNode; title: string; count: number; items: FeedItem[] }) {
    const { t } = useAdminTheme()
    return (
        <div>
            <div className={`flex items-center gap-1.5 text-[10px] font-black tracking-[0.14em] uppercase mb-2 ${t.muted}`}>
                <span className={t.accent}>{icon}</span>{title}<span className={t.faint}>· {count}</span>
            </div>
            <div className="flex flex-col gap-2">
                {items.map(s => <Row key={`${s.type}-${s.id}`} s={s} />)}
            </div>
        </div>
    )
}

function Pills<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<readonly [T, string]> }) {
    const { t } = useAdminTheme()
    return (
        <div className="flex gap-1.5">
            {options.map(([key, label]) => (
                <button key={key} type="button" onClick={() => onChange(key)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border whitespace-nowrap ${
                        value === key ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                    }`}>
                    {label}
                </button>
            ))}
        </div>
    )
}

function Row({ s }: { s: FeedItem }) {
    const { t } = useAdminTheme()
    const isWeekly = s.type === 'weekly'
    const addressed = s.adminStatus === 'addressed'

    return (
        <div className={`rounded-xl p-3 border ${t.border} ${addressed ? 'opacity-70' : ''}`}>
            <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 ${t.accent}`}>
                    {isWeekly ? <ChefHat size={15} strokeWidth={2.2} /> : <HeartHandshake size={15} strokeWidth={2.2} />}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            {s.customerId ? (
                                <Link href={`/admin/customers/${s.customerId}`} className={`text-[13px] font-bold truncate ${t.heading} inline-flex items-center gap-1 hover:underline`}>
                                    {s.customerName || 'Customer'}<ArrowUpRight size={12} strokeWidth={2.4} className={t.faint} />
                                </Link>
                            ) : (
                                <span className={`text-[13px] font-bold truncate ${t.heading}`}>{s.customerName || 'Customer'}</span>
                            )}
                            {addressed && (
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${t.successBg} ${t.success}`}>
                                    <Check size={10} strokeWidth={3} /> Done
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[9px] font-black uppercase tracking-[0.1em] px-1.5 py-0.5 rounded ${t.tableHeader}`}>
                                {isWeekly ? `Week ${s.weekNumber ?? '–'}` : 'Wrap'}
                            </span>
                            <span className={`text-[10px] tabular-nums ${t.faint}`}>{shortDate(s.submittedAt)}</span>
                        </div>
                    </div>

                    <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold ${t.muted}`}>
                        {isWeekly ? (
                            <>
                                {s.rating != null && <span className="font-black" style={{ color: TONE.ok }}>{s.rating}★</span>}
                                {s.favoritesCount > 0 && <span style={{ color: TONE.good }}>{s.favoritesCount} loved</span>}
                                {s.missesCount > 0 && <span style={{ color: TONE.bad }}>{s.missesCount} missed</span>}
                                {s.deliveryDown && <span className="inline-flex items-center gap-0.5" style={{ color: TONE.warn }}><Truck size={11} strokeWidth={2.4} /> issue</span>}
                                {s.packagingDown && <span className="inline-flex items-center gap-0.5" style={{ color: TONE.warn }}><Package size={11} strokeWidth={2.4} /> issue</span>}
                            </>
                        ) : (
                            <>
                                <span>Renewing: <span className={t.body}>{renewalLabel(s.renewalIntent)}</span></span>
                                <span>· Recommend: <span className={t.body}>{recommendLabel(s.recommend)}</span></span>
                                {s.hasStory && <span className="inline-flex items-center gap-0.5" style={{ color: TONE.ok }}><MessageSquareQuote size={11} strokeWidth={2.4} /> story</span>}
                            </>
                        )}
                    </div>

                    {isWeekly && s.kitchenNote && (
                        <p className={`mt-1 text-[11px] leading-relaxed ${t.body} line-clamp-2`}>“{s.kitchenNote}”</p>
                    )}

                    <ReviewTriage reviewType={s.type} reviewId={s.id} initialStatus={s.adminStatus} initialNote={s.adminNote} />
                </div>
            </div>
        </div>
    )
}

function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' })
}
