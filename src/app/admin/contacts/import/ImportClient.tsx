'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, FileUp, Upload, Users } from 'lucide-react'
import { useAdminTheme } from '../../_components/AdminThemeProvider'
import { AdminBadge } from '../../_components/AdminBadge'
import { parseCsv } from '@/contexts/contacts/domain/csv'
import { guessColumnMapping, type ColumnMapping } from '@/contexts/contacts/domain/column-mapping'
import type { Bucket, PlannedRow, RawRow } from '@/contexts/contacts/domain/import-plan'
import { commitImport, previewImport, type ImportSource, type PreviewResult } from './actions'
import { MAX_IMPORT_ROWS } from './constants'
import type { ImportBatch } from './page'

const SOURCES: Array<{ key: ImportSource; label: string; hint: string }> = [
    { key: 'zoho_import', label: 'Zoho', hint: 'Exported from Zoho' },
    { key: 'website', label: 'Website', hint: 'Signed up on the site' },
    { key: 'referral', label: 'Referral', hint: 'Came through someone else' },
    { key: 'free_signup', label: 'Free signup', hint: 'Took a free meal or trial' },
    { key: 'manual', label: 'Added by hand', hint: 'Anything else' },
]

/** Bucket order, labels, and how each should read in the preview. */
const BUCKETS: Array<{ key: Bucket; label: string; note: string; tone: 'good' | 'known' | 'skip' }> = [
    { key: 'new', label: 'New', note: 'Will be added', tone: 'good' },
    { key: 'existing_contact', label: 'Already a contact', note: 'Left alone', tone: 'known' },
    { key: 'existing_customer', label: 'Already a customer', note: 'Left alone', tone: 'known' },
    { key: 'duplicate_in_file', label: 'Repeated in this file', note: 'Only the first is used', tone: 'skip' },
    { key: 'invalid', label: 'Unusable', note: 'No email or phone we can use', tone: 'skip' },
]

type Stage = 'pick' | 'map' | 'preview' | 'done'

export function ImportClient({ recent }: { recent: ImportBatch[] }) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const fileInput = useRef<HTMLInputElement>(null)

    const [stage, setStage] = useState<Stage>('pick')
    const [filename, setFilename] = useState('')
    const [headers, setHeaders] = useState<string[]>([])
    const [body, setBody] = useState<string[][]>([])
    const [mapping, setMapping] = useState<ColumnMapping>({ name: null, email: null, phone: null })
    const [source, setSource] = useState<ImportSource>('zoho_import')
    const [sourceDetail, setSourceDetail] = useState('')
    const [preview, setPreview] = useState<PreviewResult | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<string | null>(null)

    // The rows as the server will see them. Recomputed whenever the mapping
    // changes, so the preview always describes the mapping on screen.
    const rows: RawRow[] = useMemo(() => body.map((cells, i) => ({
        rowNumber: i + 2, // +1 for the header, +1 because spreadsheets start at 1
        name: mapping.name !== null ? cells[mapping.name] ?? null : null,
        email: mapping.email !== null ? cells[mapping.email] ?? null : null,
        phone: mapping.phone !== null ? cells[mapping.phone] ?? null : null,
    })), [body, mapping])

    const nothingMapped = mapping.email === null && mapping.phone === null

    async function handleFile(file: File) {
        setError(null); setResult(null); setPreview(null)
        const text = await file.text()
        const table = parseCsv(text)
        if (table.length < 2) {
            setError('That file has a header but no rows, or is not a CSV.')
            return
        }
        if (table.length - 1 > MAX_IMPORT_ROWS) {
            setError(`That file has ${(table.length - 1).toLocaleString()} rows. Split it into files of ${MAX_IMPORT_ROWS.toLocaleString()} or fewer.`)
            return
        }
        const [head, ...rest] = table
        setFilename(file.name)
        setHeaders(head)
        setBody(rest)
        setMapping(guessColumnMapping(head))
        setStage('map')
    }

    async function handlePreview() {
        setBusy(true); setError(null)
        const res = await previewImport(rows)
        setBusy(false)
        if (!res.ok) { setError(res.message ?? 'Could not read the file.'); return }
        setPreview(res)
        setStage('preview')
    }

    async function handleCommit() {
        setBusy(true); setError(null)
        const res = await commitImport(rows, source, filename, sourceDetail)
        setBusy(false)
        if (!res.ok) { setError(res.message); return }
        setResult(res.message)
        setStage('done')
        router.refresh()
    }

    function reset() {
        setStage('pick'); setFilename(''); setHeaders([]); setBody([])
        setMapping({ name: null, email: null, phone: null })
        setPreview(null); setError(null); setResult(null)
        if (fileInput.current) fileInput.current.value = ''
    }

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Import contacts</h1>
            <p className={`text-[13px] font-medium mb-5 ${t.muted}`}>
                Drop a CSV. Nothing is written until you have seen what it would do.
            </p>

            {error && (
                <div className={`mb-4 px-3.5 py-2.5 rounded-xl border ${t.dangerBg} ${t.danger} text-[12px] font-bold flex items-start gap-2`}>
                    <AlertTriangle size={14} strokeWidth={2.4} className="mt-px shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* 1 — the file */}
            {stage === 'pick' && (
                <label
                    className={`${t.card} block rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer ${t.cardHover} transition-colors`}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                        e.preventDefault()
                        const file = e.dataTransfer.files?.[0]
                        if (file) void handleFile(file)
                    }}
                >
                    <FileUp size={26} strokeWidth={1.8} className={`mx-auto mb-2 ${t.faint}`} />
                    <div className={`text-[14px] font-bold ${t.heading}`}>Drop a CSV here, or choose a file</div>
                    <div className={`text-[11px] font-medium mt-1 ${t.faint}`}>
                        Up to {MAX_IMPORT_ROWS.toLocaleString()} rows. Needs an email or a phone column.
                    </div>
                    <input
                        ref={fileInput}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) void handleFile(file)
                        }}
                    />
                </label>
            )}

            {/* 2 — the columns */}
            {stage === 'map' && (
                <div className={`${t.card} rounded-2xl p-4 sm:p-5`}>
                    <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                        <div className={`text-[14px] font-bold ${t.heading}`}>{filename}</div>
                        <div className={`text-[11px] font-medium ${t.faint}`}>
                            {body.length.toLocaleString()} rows · {headers.length} columns
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 mb-4">
                        {(['name', 'email', 'phone'] as const).map(field => (
                            <label key={field} className="block">
                                <span className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.muted}`}>
                                    {field}
                                </span>
                                <select
                                    value={mapping[field] ?? ''}
                                    onChange={e => setMapping(m => ({
                                        ...m,
                                        [field]: e.target.value === '' ? null : Number(e.target.value),
                                    }))}
                                    className={`w-full px-2.5 py-2 rounded-lg border text-[13px] font-medium ${t.input} ${t.heading}`}
                                >
                                    <option value="">— not in this file —</option>
                                    {headers.map((h, i) => (
                                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                                    ))}
                                </select>
                            </label>
                        ))}
                    </div>

                    <div className={`text-[10px] font-bold tracking-[0.08em] uppercase mb-1.5 ${t.muted}`}>
                        Where these came from
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {SOURCES.map(s => (
                            <button
                                key={s.key}
                                type="button"
                                onClick={() => setSource(s.key)}
                                aria-pressed={source === s.key}
                                title={s.hint}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase border transition-colors ${
                                    source === s.key ? `${t.accentBg} ${t.accent}` : `${t.muted}`
                                }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        value={sourceDetail}
                        onChange={e => setSourceDetail(e.target.value)}
                        placeholder="Optional note — which list, which campaign"
                        className={`w-full px-2.5 py-2 rounded-lg border text-[13px] font-medium mb-4 ${t.input} ${t.heading}`}
                    />

                    {/* A few real rows as they will be read, not as they sit in the file. */}
                    <div className={`text-[10px] font-bold tracking-[0.08em] uppercase mb-1.5 ${t.muted}`}>
                        First rows, read through that mapping
                    </div>
                    <div className="overflow-x-auto mb-4">
                        <table className="w-full text-[12px]">
                            <thead>
                                <tr className={t.tableHeader}>
                                    <th className="text-left px-2 py-1.5 text-[10px] font-bold uppercase">Name</th>
                                    <th className="text-left px-2 py-1.5 text-[10px] font-bold uppercase">Email</th>
                                    <th className="text-left px-2 py-1.5 text-[10px] font-bold uppercase">Phone</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(0, 5).map(r => (
                                    <tr key={r.rowNumber} className={t.tableRow}>
                                        <td className={`px-2 py-1.5 ${t.body}`}>{r.name || '—'}</td>
                                        <td className={`px-2 py-1.5 ${t.body}`}>{r.email || '—'}</td>
                                        <td className={`px-2 py-1.5 tabular-nums ${t.body}`}>{r.phone || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {nothingMapped && (
                        <p className={`text-[11px] font-bold mb-3 ${t.danger}`}>
                            Map an email or a phone column — without one there is no way to reach anybody.
                        </p>
                    )}

                    <div className="flex gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={handlePreview}
                            disabled={busy || nothingMapped}
                            className={`px-4 py-2 rounded-xl text-[12px] font-bold ${t.accentBg} ${t.accent} disabled:opacity-40 transition-opacity`}
                        >
                            {busy ? 'Checking…' : 'Check what this would do'}
                        </button>
                        <button type="button" onClick={reset} className={`px-4 py-2 rounded-xl border text-[12px] font-bold ${t.card} ${t.body}`}>
                            Start over
                        </button>
                    </div>
                </div>
            )}

            {/* 3 — the preview */}
            {stage === 'preview' && preview && (
                <div className={`${t.card} rounded-2xl p-4 sm:p-5`}>
                    <div className={`text-[14px] font-bold mb-3 ${t.heading}`}>
                        {preview.total.toLocaleString()} rows in {filename}
                    </div>

                    <div className="flex flex-col gap-2 mb-4">
                        {BUCKETS.map(b => {
                            const count = preview.tally[b.key]
                            if (count === 0) return null
                            return (
                                <details key={b.key} className={`rounded-xl border ${t.border} overflow-hidden`}>
                                    <summary className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <AdminBadge variant={b.tone === 'good' ? 'active' : b.tone === 'known' ? 'neutral' : 'warning'}>
                                                {count}
                                            </AdminBadge>
                                            <span className={`text-[13px] font-bold truncate ${t.heading}`}>{b.label}</span>
                                        </span>
                                        <span className={`text-[11px] font-medium shrink-0 ${t.faint}`}>{b.note}</span>
                                    </summary>
                                    <div className={`px-3 pb-2.5 pt-0.5 border-t ${t.border}`}>
                                        {preview.samples[b.key].map((r: PlannedRow) => (
                                            <div key={r.rowNumber} className={`text-[11px] font-medium py-0.5 ${t.muted}`}>
                                                <span className={`tabular-nums ${t.faint}`}>row {r.rowNumber}</span>
                                                {' · '}{r.name || '(no name)'}{' · '}{r.email || r.phone || '—'}
                                                {r.reason ? <span className={t.faint}> · {r.reason}</span> : null}
                                            </div>
                                        ))}
                                        {count > preview.samples[b.key].length && (
                                            <div className={`text-[11px] font-medium pt-1 ${t.faint}`}>
                                                and {(count - preview.samples[b.key].length).toLocaleString()} more
                                            </div>
                                        )}
                                    </div>
                                </details>
                            )
                        })}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={handleCommit}
                            disabled={busy || preview.tally.new === 0}
                            className={`px-4 py-2 rounded-xl text-[12px] font-bold ${t.accentBg} ${t.accent} disabled:opacity-40 transition-opacity`}
                        >
                            {busy
                                ? 'Importing…'
                                : preview.tally.new === 0
                                    ? 'Nothing new to add'
                                    : `Add ${preview.tally.new.toLocaleString()} contact${preview.tally.new === 1 ? '' : 's'}`}
                        </button>
                        <button type="button" onClick={() => setStage('map')} className={`px-4 py-2 rounded-xl border text-[12px] font-bold ${t.card} ${t.body}`}>
                            Back to the columns
                        </button>
                    </div>
                </div>
            )}

            {/* 4 — done */}
            {stage === 'done' && (
                <div className={`${t.card} rounded-2xl p-5 text-center`}>
                    <CheckCircle2 size={26} strokeWidth={1.8} className={`mx-auto mb-2 ${t.accent}`} />
                    <div className={`text-[14px] font-bold ${t.heading}`}>{result}</div>
                    <div className="flex gap-2 justify-center mt-4 flex-wrap">
                        <button
                            type="button"
                            onClick={() => router.push('/admin/contacts')}
                            className={`px-4 py-2 rounded-xl text-[12px] font-bold ${t.accentBg} ${t.accent}`}
                        >
                            <Users size={13} strokeWidth={2.4} className="inline mr-1.5 -mt-px" />
                            See the contact book
                        </button>
                        <button type="button" onClick={reset} className={`px-4 py-2 rounded-xl border text-[12px] font-bold ${t.card} ${t.body}`}>
                            <Upload size={13} strokeWidth={2.4} className="inline mr-1.5 -mt-px" />
                            Import another file
                        </button>
                    </div>
                </div>
            )}

            {/* Every import that has run, so a bad one can be found again. */}
            {recent.length > 0 && (
                <div className="mt-8">
                    <h2 className={`text-[10px] font-bold tracking-[0.08em] uppercase mb-2 ${t.muted}`}>Recent imports</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                            <thead>
                                <tr className={t.tableHeader}>
                                    <th className="text-left px-2 py-1.5 text-[10px] font-bold uppercase">File</th>
                                    <th className="text-left px-2 py-1.5 text-[10px] font-bold uppercase">Source</th>
                                    <th className="text-right px-2 py-1.5 text-[10px] font-bold uppercase">Added</th>
                                    <th className="text-right px-2 py-1.5 text-[10px] font-bold uppercase">Known</th>
                                    <th className="text-right px-2 py-1.5 text-[10px] font-bold uppercase">Skipped</th>
                                    <th className="text-right px-2 py-1.5 text-[10px] font-bold uppercase">When</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recent.map(b => (
                                    <tr key={b.id} className={t.tableRow}>
                                        <td className={`px-2 py-1.5 font-bold ${t.heading}`}>{b.filename}</td>
                                        <td className={`px-2 py-1.5 ${t.body}`}>{b.source}</td>
                                        <td className={`px-2 py-1.5 text-right tabular-nums ${t.body}`}>{b.created}</td>
                                        <td className={`px-2 py-1.5 text-right tabular-nums ${t.faint}`}>{b.matched}</td>
                                        <td className={`px-2 py-1.5 text-right tabular-nums ${t.faint}`}>{b.skipped}</td>
                                        <td className={`px-2 py-1.5 text-right tabular-nums text-[11px] ${t.faint}`}>
                                            {new Date(b.created_at).toLocaleDateString('en-AE', {
                                                day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Dubai',
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
