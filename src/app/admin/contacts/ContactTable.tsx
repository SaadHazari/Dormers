'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BellOff, Mail, MessageCircle, Search, Trash2, Upload } from 'lucide-react'
import type { ContactRow } from './page'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminBadge } from '../_components/AdminBadge'
import { CONTACT_PAGE_SIZE } from './constants'
import { MAX_DELETE_BATCH } from '../customers/constants'
import { loadMoreContacts } from './actions'
import { deleteContacts } from '../customers/delete-actions'
import { isStaleActionError, STALE_ACTION_MESSAGE } from '../_components/stale-action'
import { AdminModal } from '../_components/AdminModal'
import { AdminButton } from '../_components/AdminButton'
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
    { key: 'emailable', label: 'Emailable' },
    { key: 'whatsapp_only', label: 'WhatsApp only' },
    { key: 'unreachable', label: 'Unreachable' },
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

    // ── Selection, for clearing out imported or test contacts ────────────
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [confirmText, setConfirmText] = useState('')
    const [deleting, setDeleting] = useState(false)
    const [note, setNote] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    function toggle(id: string) {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }

    // A contact with an account is refused by the action, so say so here
    // rather than letting the count in the button turn out to be a lie.
    const selectedRows = useMemo(() => rows.filter(c => selected.has(c.id)), [rows, selected])
    const linkedCount = selectedRows.filter(c => c.customer_id !== null).length
    const freeCount = selectedRows.length - linkedCount

    async function handleDelete() {
        setDeleting(true)
        setError(null)
        try {
            const res = await deleteContacts([...selected])
            if (!res.ok) { setError(res.message); return }
            setConfirmOpen(false)
            setConfirmText('')
            setSelected(new Set())
            setNote(res.message)
            // Same as the customers list: our own copy of the rows has to lose
            // them, or they linger on screen until a reload.
            const gone = new Set(res.deletedIds)
            setRows(prev => prev.filter(r => !gone.has(r.id)))
            router.refresh()
        } catch (err) {
            // A thrown action used to leave the button spinning with nothing said.
            if (isStaleActionError(err)) {
                setError(STALE_ACTION_MESSAGE)
                setTimeout(() => window.location.reload(), 900)
                return
            }
            console.error('deleteContacts failed', err)
            setError('Could not reach the server. Check your connection and try again.')
        } finally {
            setDeleting(false)
        }
    }

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
            <div className="flex items-start justify-between gap-3 mb-1">
                <h1 className={`text-xl font-black tracking-tight ${t.heading}`}>
                    Contacts
                </h1>
                <Link
                    href="/admin/contacts/import"
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold ${t.accentBg} ${t.accent}`}
                >
                    <Upload size={13} strokeWidth={2.4} />
                    Import
                </Link>
            </div>
            <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                {totalCount != null && totalCount > rows.length
                    ? `${rows.length} of ${totalCount} contacts loaded`
                    : `${totalCount ?? rows.length} contact${(totalCount ?? rows.length) !== 1 ? 's' : ''}`}
                {initialQuery ? ` matching "${initialQuery}"` : ''}
                {filter !== 'all' ? ` · showing ${filtered.length} ${activeChipLabel}` : ''}
            </p>

            {note && <p className={`mb-3 text-[12px] font-bold ${t.accent}`}>{note}</p>}

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
                            <th className="w-9 px-3 py-2.5">
                                <input
                                    type="checkbox"
                                    aria-label="Select every contact shown"
                                    checked={shown.length > 0 && shown.every(c => selected.has(c.id))}
                                    onChange={e => setSelected(prev => {
                                        const next = new Set(prev)
                                        for (const c of shown) { if (e.target.checked) next.add(c.id); else next.delete(c.id) }
                                        return next
                                    })}
                                />
                            </th>
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
                                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        aria-label={`Select ${c.name || c.email || c.phone_e164}`}
                                        checked={selected.has(c.id)}
                                        onChange={() => toggle(c.id)}
                                    />
                                </td>
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
                            <div className="flex items-start gap-2.5 min-w-0">
                                <input
                                    type="checkbox"
                                    aria-label={`Select ${c.name || c.email || c.phone_e164}`}
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
                                    {c.email || c.phone_e164 || 'No way to reach them'}
                                </div>
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

            {selected.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 lg:left-[220px] z-[120] px-4 pb-4 pointer-events-none">
                    <div className={`pointer-events-auto mx-auto max-w-2xl flex items-center gap-3 rounded-2xl border px-4 py-3 ${t.overlay}`}>
                        <span className={`text-[13px] font-bold ${t.heading}`}>
                            {selected.size} selected
                            {selected.size > MAX_DELETE_BATCH && (
                                <span className={`ml-2 font-medium ${t.warning}`}>
                                    — more than {MAX_DELETE_BATCH} at once; untick some
                                </span>
                            )}
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
                            onClick={() => { setError(null); setConfirmText(''); setConfirmOpen(true) }}
                            disabled={selected.size > MAX_DELETE_BATCH}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold ${t.dangerBg} ${t.danger} disabled:opacity-50`}
                        >
                            <Trash2 size={13} strokeWidth={2.4} />
                            Delete
                        </button>
                    </div>
                </div>
            )}

            {confirmOpen && (
                <AdminModal label="Confirm contact deletion" onBackdrop={() => { if (!deleting) setConfirmOpen(false) }}>
                    <div className={`px-5 py-4 border-b ${t.border}`}>
                        <div className={`text-[15px] font-black ${t.heading}`}>
                            {freeCount === 0
                                ? 'None of these can be deleted here'
                                : `Delete ${freeCount} contact${freeCount === 1 ? '' : 's'}?`}
                        </div>
                    </div>
                    <div className="px-5 py-4">
                        {/* Said plainly rather than discovered afterwards: a contact
                            with an account is refused, and the customers trigger would
                            just recreate it anyway. */}
                        {linkedCount > 0 && (
                            <p className={`text-[12px] font-bold mb-3 ${t.warning}`}>
                                {linkedCount} of these {linkedCount === 1 ? 'has' : 'have'} an account and will be skipped.
                                Delete those from Customers, which removes the person and their contact together.
                            </p>
                        )}
                        {freeCount > 0 && (
                            <>
                                <p className={`text-[13px] font-medium leading-relaxed ${t.body}`}>
                                    This removes them from the contact book for good. Their broadcast history goes
                                    with them. Type DELETE to confirm.
                                </p>
                                <input
                                    type="text"
                                    value={confirmText}
                                    autoFocus
                                    onChange={e => setConfirmText(e.target.value)}
                                    placeholder="DELETE"
                                    aria-label="Type DELETE to confirm"
                                    className={`w-full mt-3 rounded-lg border px-3 py-2 text-[13px] font-black tracking-[0.12em] uppercase transition-colors ${t.input} ${t.inputFocus}`}
                                />
                            </>
                        )}
                        {error && (
                            <p className={`mt-3 text-[12px] font-bold flex items-start gap-1.5 ${t.danger}`}>
                                <AlertTriangle size={13} strokeWidth={2.4} className="mt-px shrink-0" />
                                {error}
                            </p>
                        )}
                    </div>
                    <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
                        <AdminButton variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>Cancel</AdminButton>
                        <AdminButton
                            variant="danger"
                            icon={<Trash2 size={14} strokeWidth={2.5} />}
                            onClick={handleDelete}
                            loading={deleting}
                            disabled={freeCount === 0 || confirmText.trim().toUpperCase() !== 'DELETE'}
                        >
                            Delete for good
                        </AdminButton>
                    </div>
                </AdminModal>
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
