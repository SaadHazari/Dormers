'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Clock, Search, Sunrise, Trash2, User } from 'lucide-react'
import type { CustomerRow } from './page'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'
import { CUSTOMER_PAGE_SIZE, MAX_DELETE_BATCH } from './constants'
import { loadMoreCustomers } from './actions'
import { previewCustomerDeletion } from './delete-actions'
import { DeleteCustomersModal } from '../_components/DeleteCustomersModal'
import { isStaleActionError, STALE_ACTION_MESSAGE } from '@/ui-system/observability/stale-action'
import type { DeleteImpactRow } from '@/contexts/admin/domain/deletion-plan'
import {
    getAttention, matchesFilter, sortCustomers, todayDubai, waitlistNote,
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
 *  the rest only render when at least one loaded customer matches.
 *
 *  'waitlist' and 'early signup' sit after 'No plan' on purpose: they split
 *  that bucket, so reading left to right goes from the whole group to the two
 *  halves of it. They overlap 'No plan' and 'Ended' by design — the chips are
 *  filters, not a partition. */
const STATUS_CHIPS: Array<{ key: FilterKey; label: string }> = [
    { key: 'Active', label: 'Active' },
    { key: 'Scheduled', label: 'Scheduled' },
    { key: 'Paused', label: 'Paused' },
    { key: 'Skipped', label: 'Skipped' },
    { key: 'Ended', label: 'Ended' },
    { key: 'none', label: 'No plan' },
    { key: 'waitlist', label: 'Waitlist' },
    { key: 'early_signup', label: 'Early signup' },
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

    // ── Selection, for deleting test accounts ────────────────────────────
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [pendingRows, setPendingRows] = useState<DeleteImpactRow[] | null>(null)
    const [previewing, setPreviewing] = useState(false)
    const [deleteNote, setDeleteNote] = useState<string | null>(null)
    const [deleteError, setDeleteError] = useState<string | null>(null)

    function toggle(id: string) {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }

    async function openDeleteReview() {
        setPreviewing(true)
        setDeleteError(null)
        try {
            const res = await previewCustomerDeletion([...selected])
            if (!res.ok) { setDeleteError(res.message ?? 'Could not work out what this would delete.'); return }
            setPendingRows(res.rows)
        } catch (err) {
            // Without this the button sat on "Checking…" for ever and the page
            // looked like it had ignored the click.
            if (isStaleActionError(err)) {
                setDeleteError(STALE_ACTION_MESSAGE)
                setTimeout(() => window.location.reload(), 900)
                return
            }
            console.error('previewCustomerDeletion failed', err)
            setDeleteError('Could not reach the server. Check your connection and try again.')
        } finally {
            setPreviewing(false)
        }
    }

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

            {deleteNote && (
                <p className={`mb-3 text-[12px] font-bold ${t.accent}`}>{deleteNote}</p>
            )}

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
                            <th className="w-9 px-3 py-2.5">
                                <input
                                    type="checkbox"
                                    aria-label="Select every customer shown"
                                    checked={shown.length > 0 && shown.every(c => selected.has(c.id))}
                                    onChange={e => setSelected(prev => {
                                        const next = new Set(prev)
                                        // Only what is on screen: ticking this must never
                                        // silently select rows the filter is hiding.
                                        for (const c of shown) { if (e.target.checked) next.add(c.id); else next.delete(c.id) }
                                        return next
                                    })}
                                />
                            </th>
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
                            const waiting = waitlistNote(c)
                            return (
                                <tr
                                    key={c.id}
                                    className={`${t.tableRow} cursor-pointer transition-colors duration-100`}
                                    onClick={() => router.push(`/admin/customers/${c.id}`)}
                                >
                                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            aria-label={`Select ${c.name || c.email || c.cid}`}
                                            checked={selected.has(c.id)}
                                            onChange={() => toggle(c.id)}
                                        />
                                    </td>
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
                                    {/* The waitlist tag lives with the status badges rather than
                                        beside the name: for someone with no plan this cell was an
                                        em dash, and "holding a pause credit" is exactly the state
                                        a reader is looking for here. */}
                                    <td className="px-3 py-2.5">
                                        {c.sub_status || waiting ? (
                                            <div className="inline-flex items-center gap-1.5 flex-wrap">
                                                {attention && !attention.redundantWithStatus && <AttentionPill attention={attention} />}
                                                {c.sub_status && (
                                                    <AdminBadge variant={STATUS_VARIANT[c.sub_status] ?? 'neutral'}>
                                                        {c.sub_status}
                                                    </AdminBadge>
                                                )}
                                                {waiting && <AdminBadge variant="neutral">{waiting}</AdminBadge>}
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
                    const waiting = waitlistNote(c)
                    return (
                        <div
                            key={c.id}
                            className={`${t.card} rounded-xl p-3.5 cursor-pointer active:scale-[0.99] transition-all duration-100`}
                            style={attention ? { borderLeftWidth: 3, borderLeftColor: toneHex(attention.tone, isLight) } : undefined}
                            onClick={() => router.push(`/admin/customers/${c.id}`)}
                            role="link"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5 min-w-0">
                                    <input
                                        type="checkbox"
                                        aria-label={`Select ${c.name || c.email || c.cid}`}
                                        checked={selected.has(c.id)}
                                        onClick={e => e.stopPropagation()}
                                        onChange={() => toggle(c.id)}
                                        className="mt-1 shrink-0"
                                    />
                                <div className="min-w-0">
                                    <div className={`text-[14px] font-bold truncate ${t.heading}`}>
                                        {c.name || '(no name)'}
                                    </div>
                                    <div className={`text-[11px] font-medium ${t.faint} truncate`}>
                                        {c.dorm_name || 'No dorm'} · {c.email || c.whatsapp_number || c.cid}
                                    </div>
                                </div>
                                </div>
                                {(c.sub_status || waiting) && (
                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                        {c.sub_status && (
                                            <AdminBadge variant={STATUS_VARIANT[c.sub_status] ?? 'neutral'}>
                                                {c.sub_status}
                                            </AdminBadge>
                                        )}
                                        {waiting && <AdminBadge variant="neutral">{waiting}</AdminBadge>}
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

            {/* Selection bar. Fixed to the bottom so it stays reachable while
                scrolling a long list, and only exists while something is
                selected — a delete button that is always on screen is one that
                eventually gets pressed by accident. */}
            {selected.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 lg:left-[220px] z-[120] px-4 pb-4 pointer-events-none">
                    <div className={`pointer-events-auto mx-auto max-w-2xl rounded-2xl border px-4 py-3 ${t.overlay}`}>
                    {/* Anything that goes wrong is said HERE, beside the button
                        that was pressed. It used to render at the top of the
                        page, which on a long list is off-screen — the refusal
                        was invisible and the click looked ignored. */}
                    {deleteError && (
                        <p className={`mb-2 text-[12px] font-bold ${t.danger}`}>{deleteError}</p>
                    )}
                    {selected.size > MAX_DELETE_BATCH && (
                        <p className={`mb-2 text-[12px] font-bold ${t.warning}`}>
                            {selected.size} selected — that is more than {MAX_DELETE_BATCH} at once.
                            Untick some so the list stays reviewable.
                        </p>
                    )}
                    <div className="flex items-center gap-3">
                        <span className={`text-[13px] font-bold ${t.heading}`}>
                            {selected.size} selected
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelected(new Set())}
                            className={`text-[11px] font-bold tracking-[0.06em] uppercase ${t.muted}`}
                        >
                            Clear
                        </button>
                        <div className="flex-1" />
                        <button
                            type="button"
                            onClick={openDeleteReview}
                            disabled={previewing || selected.size > MAX_DELETE_BATCH}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold ${t.dangerBg} ${t.danger} disabled:opacity-50`}
                        >
                            <Trash2 size={13} strokeWidth={2.4} />
                            {previewing ? 'Checking…' : 'Review and delete'}
                        </button>
                    </div>
                    </div>
                </div>
            )}

            {pendingRows && (
                <DeleteCustomersModal
                    rows={pendingRows}
                    onClose={() => setPendingRows(null)}
                    onDone={(message, deletedIds) => {
                        setPendingRows(null)
                        setSelected(new Set())
                        setDeleteNote(message)
                        // Drop them from OUR state. router.refresh() updates the
                        // props, but `rows` was seeded from those props with
                        // useState and never re-reads them — which is why the
                        // deleted people used to sit there until a full reload.
                        const gone = new Set(deletedIds)
                        setRows(prev => prev.filter(r => !gone.has(r.id)))
                        router.refresh()
                    }}
                />
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
