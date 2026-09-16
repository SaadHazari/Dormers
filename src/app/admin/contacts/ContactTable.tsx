'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BellOff, Mail, MessageCircle, Search } from 'lucide-react'
import type { ContactRow } from './page'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'
import { CONTACT_PAGE_SIZE } from './constants'
import { loadMoreContacts } from './actions'
import {
    isOptedOut, matchesFilter, reachabilityGap, sortContacts, sourceLabel,
    type FilterKey, type SortMode,
} from './filters'

interface Props {
    contacts: ContactRow[]
    initialQuery: string
    /** Total matching the search across the whole table, null if the count failed. */
    totalCount: number | null
}

/** Chips in the order they appear. 'all' is pinned; the rest only render when
 *  at least one loaded contact matches, so the row stays short on a phone. */
const CHIPS: Array<{ key: FilterKey; label: string }> = [
    { key: 'customers', label: 'Customers' },
    { key: 'never_customers', label: 'Never customers' },
    { key: 'imported', label: 'Imported' },
    { key: 'waitlist', label: 'Waitlist' },
    { key: 'unsubscribed', label: 'Opted out' },
    { key: 'no_email', label: 'No email' },
    { key: 'no_phone', label: 'No phone' },
]

const SORT_OPTIONS: Array<{ key: SortMode; label: string }> = [
    { key: 'newest', label: 'Newest' },
    { key: 'name', label: 'Name' },
]

const WINDOW_STEP = 30

export function ContactTable({ contacts, initialQuery, totalCount }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [query, setQuery] = useState(initialQuery)
    const [isSearching, startSearch] = useTransition()

    const [rows, setRows] = useState<ContactRow[]>(contacts)
    const [loadingMore, setLoadingMore] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)

    const [filter, setFilter] = useState<FilterKey>('all')
    const [sort, setSort] = useState<SortMode>('newest')
    const [visible, setVisible] = useState(WINDOW_STEP)

    useEffect(() => { setVisible(WINDOW_STEP) }, [filter, sort])

    const counts = useMemo(() => {
        const map = new Map<FilterKey, number>()
        for (const chip of CHIPS) {
            map.set(chip.key, rows.filter(c => matchesFilter(c, chip.key)).length)
        }
        return map
    }, [rows])

    const filtered = useMemo(
        () => sortContacts(rows.filter(c => matchesFilter(c, filter)), sort),
        [rows, filter, sort],
    )

    const shown = filtered.slice(0, visible)
    const hasMoreOnServer = totalCount != null && rows.length < totalCount
    const activeChipLabel = filter === 'all'
        ? ''
        : CHIPS.find(c => c.key === filter)?.label.toLowerCase() ?? ''

    function handleSearch(e: React.FormEvent) {
        e.preventDefault()
        startSearch(() => {
            const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
            router.push(`/admin/contacts${params}`)
        })
    }

    async function handleLoadMore() {
        setLoadingMore(true)
        setLoadError(null)
        const res = await loadMoreContacts(initialQuery, rows.length)
        setLoadingMore(false)
        if (!res.ok) {
            setLoadError(res.message ?? 'Could not load more contacts')
            return
        }
        // De-dupe defensively: a contact created between page fetches shifts
        // the offset and can repeat a row.
        setRows(prev => {
            const seen = new Set(prev.map(r => r.id))
            return [...prev, ...res.rows.filter(r => !seen.has(r.id))]
        })
    }

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>
                Contacts
            </h1>
            <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                {totalCount != null && totalCount > rows.length
                    ? `${rows.length} of ${totalCount} contacts loaded`
                    : `${totalCount ?? rows.length} contact${(totalCount ?? rows.length) !== 1 ? 's' : ''}`}
                {initialQuery ? ` matching "${initialQuery}"` : ''}
                {filter !== 'all' ? ` · showing ${filtered.length} ${activeChipLabel}` : ''}
            </p>

            <form onSubmit={handleSearch} className="mb-3">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${t.input} ${t.inputFocus} transition-colors`}>
                    <Search size={15} strokeWidth={2.2} className={t.faint} />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search by name, email, phone, or tag..."
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
                        label="All"
                        count={rows.length}
                        active={filter === 'all'}
                        onClick={() => setFilter('all')}
                    />
                    {CHIPS.map(chip => {
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
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Contact</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Phone</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Source</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Reach</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">First seen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map(c => (
                            <tr
                                key={c.id}
                                className={`${t.tableRow} ${c.customer_id ? 'cursor-pointer' : ''} transition-colors duration-100`}
                                // A contact with an account has a customer page worth opening.
                                // One without has nothing to open yet, so the row stays inert
                                // rather than offering a click that goes nowhere.
                                onClick={c.customer_id ? () => router.push(`/admin/customers/${c.customer_id}`) : undefined}
                            >
                                <td className="px-3 py-2.5">
                                    <div className={`font-bold ${t.heading}`}>{c.name || '(no name)'}</div>
                                    <div className={`text-[11px] ${t.faint}`}>{c.email || '—'}</div>
                                </td>
                                <td className={`px-3 py-2.5 tabular-nums ${t.body}`}>{c.phone_e164 || '—'}</td>
                                <td className="px-3 py-2.5">
                                    <div className="inline-flex items-center gap-1.5 flex-wrap">
                                        <AdminBadge variant={c.customer_id ? 'active' : 'neutral'}>
                                            {sourceLabel(c.source)}
                                        </AdminBadge>
                                        {c.on_waitlist && <AdminBadge variant="neutral">Waitlist</AdminBadge>}
                                    </div>
                                </td>
                                <td className="px-3 py-2.5">
                                    <ReachCell contact={c} />
                                </td>
                                <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${t.faint}`}>
                                    {formatDate(c.first_seen_at)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-2.5">
                {shown.map(c => (
                    <div
                        key={c.id}
                        className={`${t.card} rounded-xl p-3.5 transition-all duration-100 ${c.customer_id ? 'cursor-pointer active:scale-[0.99]' : ''}`}
                        onClick={c.customer_id ? () => router.push(`/admin/customers/${c.customer_id}`) : undefined}
                        role={c.customer_id ? 'link' : undefined}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className={`text-[14px] font-bold truncate ${t.heading}`}>
                                    {c.name || '(no name)'}
                                </div>
                                <div className={`text-[11px] font-medium ${t.faint} truncate`}>
                                    {c.email || c.phone_e164 || 'No way to reach them'}
                                </div>
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1">
                                <AdminBadge variant={c.customer_id ? 'active' : 'neutral'}>
                                    {sourceLabel(c.source)}
                                </AdminBadge>
                                {c.on_waitlist && <AdminBadge variant="neutral">Waitlist</AdminBadge>}
                            </div>
                        </div>
                        <div className="mt-2">
                            <ReachCell contact={c} />
                        </div>
                    </div>
                ))}
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
                        {rows.length} of {totalCount} contacts loaded. Counts above cover the loaded ones only.
                    </p>
                    <button
                        type="button"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className={`px-4 py-2 rounded-xl border text-[12px] font-bold ${t.card} ${t.cardHover} ${t.body} transition-colors disabled:opacity-50`}
                    >
                        {loadingMore ? 'Loading…' : `Load ${Math.min(CONTACT_PAGE_SIZE, totalCount - rows.length)} more`}
                    </button>
                    {loadError && (
                        <p className={`text-[11px] font-bold ${t.danger}`}>{loadError}</p>
                    )}
                </div>
            )}

            {shown.length === 0 && (
                <div className={`text-center py-10 ${t.muted}`}>
                    <div className="text-sm font-bold">No contacts here</div>
                    {filter !== 'all' ? (
                        <button
                            type="button"
                            onClick={() => setFilter('all')}
                            className={`text-xs font-bold mt-2 ${t.accent}`}
                        >
                            Show all contacts
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

/**
 * Whether a send would actually reach this person. Says nothing when both
 * channels are open and nobody has opted out — the common case should be
 * quiet, so the rows that need care are the ones that stand out.
 */
function ReachCell({ contact }: { contact: ContactRow }) {
    const { t } = useAdminTheme()
    const gap = reachabilityGap(contact)
    const optedOut = isOptedOut(contact)

    if (!gap && !optedOut) return <span className={t.faint}>—</span>

    return (
        <div className="inline-flex items-center gap-1.5 flex-wrap">
            {optedOut && (
                <AdminBadge variant="rejected">
                    <BellOff size={10} strokeWidth={2.6} />
                    {contact.email_status !== 'subscribed' ? contact.email_status : 'opted out'}
                </AdminBadge>
            )}
            {gap && (
                <AdminBadge variant="warning">
                    {gap === 'No email' ? <Mail size={10} strokeWidth={2.6} /> : <MessageCircle size={10} strokeWidth={2.6} />}
                    {gap}
                </AdminBadge>
            )}
        </div>
    )
}

function Chip({ label, count, active, onClick }: {
    label: string
    count: number
    active: boolean
    onClick: () => void
}) {
    const { t } = useAdminTheme()
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border whitespace-nowrap ${
                active ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
            }`}
        >
            {label} <span className="tabular-nums">{count}</span>
        </button>
    )
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', {
        day: 'numeric', month: 'short', year: '2-digit',
        timeZone: 'Asia/Dubai',
    })
}
