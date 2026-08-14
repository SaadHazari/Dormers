'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Clock, Search, Sunrise, User } from 'lucide-react'
import type { CustomerRow } from './page'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'
import { CUSTOMER_PAGE_SIZE } from './constants'
import { loadMoreCustomers } from './actions'
import {
    getAttention, matchesFilter, sortCustomers, todayDubai,
    type Attention, type AttentionTone, type FilterKey, type SortMode,
} from './priority'

interface Props {
    customers: CustomerRow[]
    initialQuery: string
    /** Total matching the search across the whole table, null if the count failed. */
    totalCount: number | null
}

const STATUS_VARIANT: Record<string, 'active' | 'pending' | 'ended' | 'warning' | 'neutral'> = {
    Active: 'active',
    Paused: 'warning',
    Skipped: 'warning',
    Scheduled: 'pending',
    Ended: 'ended',
}

const TONE_VARIANT: Record<AttentionTone, 'rejected' | 'warning' | 'active'> = {
    danger: 'rejected',
    warning: 'warning',
    accent: 'active',
}

/** Status chips, in the order they appear. 'attention' and 'all' are pinned;
 *  the rest only render when at least one loaded customer matches. */
const STATUS_CHIPS: Array<{ key: FilterKey; label: string }> = [
    { key: 'Active', label: 'Active' },
    { key: 'Scheduled', label: 'Scheduled' },
    { key: 'Paused', label: 'Paused' },
    { key: 'Skipped', label: 'Skipped' },
    { key: 'Ended', label: 'Ended' },
    { key: 'none', label: 'No plan' },
]

const SORT_OPTIONS: Array<{ key: SortMode; label: string }> = [
    { key: 'urgency', label: 'Urgency' },
    { key: 'newest', label: 'Newest' },
    { key: 'name', label: 'Name' },
]

const WINDOW_STEP = 30

export function CustomerTable({ customers, initialQuery, totalCount }: Props) {
    const { t, isLight } = useAdminTheme()
    const router = useRouter()
    const [query, setQuery] = useState(initialQuery)
    const [isSearching, startSearch] = useTransition()

    // Rows grow as "Load more" pulls further pages of the same search.
    const [rows, setRows] = useState<CustomerRow[]>(customers)
    const [loadingMore, setLoadingMore] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)

    const today = useMemo(() => todayDubai(), [])

    const attentionCount = useMemo(
        () => rows.filter(c => getAttention(c, today) !== null).length,
        [rows, today],
    )

    // Lead with what needs acting on today, but never when a search is running:
    // searching for a specific person must not land on a view that hides them.
    const [filter, setFilter] = useState<FilterKey>(
        () => (!initialQuery && customers.some(c => getAttention(c) !== null) ? 'attention' : 'all'),
    )
    const [sort, setSort] = useState<SortMode>('urgency')
    const [visible, setVisible] = useState(WINDOW_STEP)

    useEffect(() => { setVisible(WINDOW_STEP) }, [filter, sort])

    const counts = useMemo(() => {
        const map = new Map<FilterKey, number>()
        for (const chip of STATUS_CHIPS) {
            map.set(chip.key, rows.filter(c => matchesFilter(c, chip.key, today)).length)
        }
        return map
    }, [rows, today])

    const filtered = useMemo(
        () => sortCustomers(rows.filter(c => matchesFilter(c, filter, today)), sort, today),
        [rows, filter, sort, today],
    )

    const shown = filtered.slice(0, visible)
    const hasMoreOnServer = totalCount != null && rows.length < totalCount
    const activeChipLabel = filter === 'attention'
        ? 'needing attention'
        : filter === 'all' ? '' : STATUS_CHIPS.find(c => c.key === filter)?.label.toLowerCase() ?? ''

    function handleSearch(e: React.FormEvent) {
        e.preventDefault()
        startSearch(() => {
            const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
            router.push(`/admin/customers${params}`)
        })
    }

    async function handleLoadMore() {
        setLoadingMore(true)
        setLoadError(null)
        const res = await loadMoreCustomers(initialQuery, rows.length)
        setLoadingMore(false)
        if (!res.ok) {
            setLoadError(res.message ?? 'Could not load more customers')
            return
        }
        // De-dupe defensively: a customer created between page fetches shifts
        // the created_at ordering and can push a row into two pages.
        setRows(prev => {
            const seen = new Set(prev.map(r => r.id))
            return [...prev, ...res.rows.filter(r => !seen.has(r.id))]
        })
    }

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>
                Customers
            </h1>
            <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                {totalCount != null && totalCount > rows.length
                    ? `${rows.length} of ${totalCount} customers loaded`
                    : `${totalCount ?? rows.length} customer${(totalCount ?? rows.length) !== 1 ? 's' : ''}`}
                {initialQuery ? ` matching "${initialQuery}"` : ''}
                {filter !== 'all' ? ` · showing ${filtered.length} ${activeChipLabel}` : ''}
            </p>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="mb-3">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${t.input} ${t.inputFocus} transition-colors`}>
                    <Search size={15} strokeWidth={2.2} className={t.faint} />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search by name, email, phone, CID, or dorm..."
                        className={`flex-1 bg-transparent text-[13px] font-medium outline-none ${t.heading}`}
                    />
                    {isSearching && (
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" />
                    )}
                </div>
            </form>

            {/* Filter chips + sort. Chips scroll sideways on a phone so the whole
                set stays reachable one-handed without squashing the labels. */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-4">
                <div className="flex gap-1.5 overflow-x-auto flex-1 min-w-0 -mx-0.5 px-0.5 pb-0.5">
                    <Chip
                        label="Needs attention"
                        count={attentionCount}
                        active={filter === 'attention'}
                        alert={attentionCount > 0}
                        onClick={() => setFilter('attention')}
                    />
                    <Chip
                        label="All"
                        count={rows.length}
                        active={filter === 'all'}
                        onClick={() => setFilter('all')}
                    />
                    {STATUS_CHIPS.map(chip => {
                        const count = counts.get(chip.key) ?? 0
                        if (count === 0 && filter !== chip.key) return null
                        return (
                            <Chip
                                key={chip.key}
                                label={chip.label}
                                count={count}
                                active={filter === chip.key}
                                onClick={() => setFilter(chip.key)}
                            />
                        )
                    })}
                </div>

                <div className={`inline-flex shrink-0 self-start rounded-lg border ${t.border} overflow-hidden`}>
                    {SORT_OPTIONS.map(opt => (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() => setSort(opt.key)}
                            aria-pressed={sort === opt.key}
                            className={`px-2.5 py-1 text-[10px] font-bold tracking-[0.06em] uppercase transition-colors ${
                                sort === opt.key ? `${t.accentBg} ${t.accent}` : `${t.muted}`
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className={t.tableHeader}>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Customer</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Dorm</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Plan</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Status</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Progress</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Joined</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map(c => {
                            const attention = getAttention(c, today)
                            return (
                                <tr
                                    key={c.id}
                                    className={`${t.tableRow} cursor-pointer transition-colors duration-100`}
                                    onClick={() => router.push(`/admin/customers/${c.id}`)}
                                >
                                    <td
                                        className="px-3 py-2.5"
                                        style={attention ? { borderLeft: `3px solid ${toneHex(attention.tone, isLight)}` } : undefined}
                                    >
                                        <div className={`font-bold ${t.heading}`}>{c.name || '(no name)'}</div>
                                        <div className={`text-[11px] ${t.faint}`}>
                                            {c.email || c.whatsapp_number || c.cid}
                                        </div>
                                    </td>
                                    <td className={`px-3 py-2.5 ${t.body}`}>{c.dorm_name || '—'}</td>
                                    <td className={`px-3 py-2.5 ${t.body}`}>
                                        {c.active_plan?.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) || '—'}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        {c.sub_status ? (
                                            <div className="inline-flex items-center gap-1.5 flex-wrap">
                                                {attention && !attention.redundantWithStatus && <AttentionPill attention={attention} />}
                                                <AdminBadge variant={STATUS_VARIANT[c.sub_status] ?? 'neutral'}>
                                                    {c.sub_status}
                                                </AdminBadge>
                                            </div>
                                        ) : (
                                            <span className={t.faint}>—</span>
                                        )}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right tabular-nums ${t.body}`}>
                                        {c.delivered_meals != null && c.total_meals != null
                                            ? `${c.delivered_meals}/${c.total_meals}`
                                            : '—'}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${t.faint}`}>
                                        {formatDate(c.created_at)}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-2.5">
                {shown.map(c => {
                    const attention = getAttention(c, today)
                    return (
                        <div
                            key={c.id}
                            className={`${t.card} rounded-xl p-3.5 cursor-pointer active:scale-[0.99] transition-all duration-100`}
                            style={attention ? { borderLeftWidth: 3, borderLeftColor: toneHex(attention.tone, isLight) } : undefined}
                            onClick={() => router.push(`/admin/customers/${c.id}`)}
                            role="link"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className={`text-[14px] font-bold truncate ${t.heading}`}>
                                        {c.name || '(no name)'}
                                    </div>
                                    <div className={`text-[11px] font-medium ${t.faint} truncate`}>
                                        {c.dorm_name || 'No dorm'} · {c.email || c.whatsapp_number || c.cid}
                                    </div>
                                </div>
                                {c.sub_status && (
                                    <div className="shrink-0">
                                        <AdminBadge variant={STATUS_VARIANT[c.sub_status] ?? 'neutral'}>
                                            {c.sub_status}
                                        </AdminBadge>
                                    </div>
                                )}
                            </div>

                            {attention && !attention.redundantWithStatus && (
                                <div className="mt-2">
                                    <AttentionPill attention={attention} />
                                </div>
                            )}

                            {c.active_plan && (
                                <div className="flex items-center justify-between gap-2 mt-2">
                                    <span className={`text-[11px] font-semibold truncate ${t.muted}`}>
                                        {c.active_plan.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}
                                    </span>
                                    {c.delivered_meals != null && c.total_meals != null && (
                                        <span className={`text-[11px] font-bold tabular-nums shrink-0 ${t.body}`}>
                                            {c.delivered_meals}/{c.total_meals} meals
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Render window: keeps the phone DOM small on long lists. */}
            {filtered.length > shown.length && (
                <div className="flex justify-center mt-4">
                    <button
                        type="button"
                        onClick={() => setVisible(v => v + WINDOW_STEP)}
                        className={`px-4 py-2 rounded-xl border text-[12px] font-bold ${t.card} ${t.cardHover} ${t.body} transition-colors`}
                    >
                        Show {Math.min(WINDOW_STEP, filtered.length - shown.length)} more
                        <span className={`ml-1.5 font-medium ${t.faint}`}>
                            ({filtered.length - shown.length} left)
                        </span>
                    </button>
                </div>
            )}

            {/* Everything rendered, but more pages exist in the database. */}
            {filtered.length === shown.length && hasMoreOnServer && (
                <div className="flex flex-col items-center gap-2 mt-5">
                    <p className={`text-[11px] font-medium text-center ${t.faint}`}>
                        {rows.length} of {totalCount} customers loaded. Counts above cover the loaded ones only.
                    </p>
                    <button
                        type="button"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className={`px-4 py-2 rounded-xl border text-[12px] font-bold ${t.card} ${t.cardHover} ${t.body} transition-colors disabled:opacity-50`}
                    >
                        {loadingMore
                            ? 'Loading...'
                            : `Load ${Math.min(CUSTOMER_PAGE_SIZE, totalCount! - rows.length)} more`}
                    </button>
                    {loadError && (
                        <p className={`text-[11px] font-semibold ${t.danger}`}>{loadError}</p>
                    )}
                </div>
            )}

            {filtered.length === 0 && (
                <div className={`flex flex-col items-center py-16 ${t.muted}`}>
                    <User size={32} strokeWidth={1.5} className="mb-3 opacity-40" />
                    <div className="text-sm font-bold">
                        {filter === 'attention' ? 'Nothing needs attention' : 'No customers found'}
                    </div>
                    {filter !== 'all' ? (
                        <button
                            type="button"
                            onClick={() => setFilter('all')}
                            className={`text-xs font-bold mt-2 ${t.accent}`}
                        >
                            Show all customers
                        </button>
                    ) : initialQuery ? (
                        <div className={`text-xs font-medium mt-1 ${t.faint}`}>
                            Try a different search term
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    )
}

function Chip({ label, count, active, alert, onClick }: {
    label: string
    count: number
    active: boolean
    alert?: boolean
    onClick: () => void
}) {
    const { t } = useAdminTheme()
    const idle = alert && count > 0 ? `${t.dangerBg} ${t.danger}` : `${t.card} ${t.muted}`
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border whitespace-nowrap ${
                active ? `${t.accentBg} ${t.accent}` : idle
            }`}
        >
            {label} <span className="tabular-nums">{count}</span>
        </button>
    )
}

function AttentionPill({ attention }: { attention: Attention }) {
    const Icon = attention.tone === 'danger' ? AlertTriangle : attention.tone === 'accent' ? Sunrise : Clock
    return (
        <AdminBadge variant={TONE_VARIANT[attention.tone]}>
            <Icon size={10} strokeWidth={2.6} />
            {attention.label}
        </AdminBadge>
    )
}

/** Left-edge accent colour, matched to the admin status tokens. */
function toneHex(tone: AttentionTone, isLight: boolean): string {
    if (tone === 'accent') return '#f57f20'
    if (tone === 'danger') return isLight ? '#c0392b' : '#e0716e'
    return isLight ? '#b8860b' : '#ffaa00'
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', {
        day: 'numeric', month: 'short', year: '2-digit',
        timeZone: 'Asia/Dubai',
    })
}
