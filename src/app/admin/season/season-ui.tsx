'use client'

/**
 * The Season page's small shared pieces. One section title, one panel, one
 * row list and one confirm dialog, so every phase of the page is built from
 * the same parts (docs/superpowers/specs/2026-09-16-season-page-redesign.md).
 */

import type { ReactNode } from 'react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminButton } from '../_components/AdminButton'
import type { SeasonPhase } from '@/contexts/season/domain/season-phase'

export function plural(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`
}

/** A section: an eyebrow title, an optional count and aside, then its body. */
export function Section({ title, count, aside, children, className = '', testId }: {
    title: string
    count?: number
    aside?: ReactNode
    children: ReactNode
    className?: string
    testId?: string
}) {
    const { t } = useAdminTheme()
    return (
        <section data-testid={testId} className={`min-w-0 ${className}`}>
            <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className={`text-[11px] font-black uppercase tracking-[0.12em] ${t.muted}`}>
                    {title}
                    {count != null && <span className={`ml-2 tabular-nums ${t.faint}`}>{count}</span>}
                </h2>
                {aside}
            </div>
            {children}
        </section>
    )
}

/** The page's one card surface. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
    const { t } = useAdminTheme()
    return <div className={`rounded-xl ${t.card} ${className}`}>{children}</div>
}

const RAIL: Array<{ phase: SeasonPhase; label: string }> = [
    { phase: 'open', label: 'Open' },
    { phase: 'winding_down', label: 'Ending soon' },
    { phase: 'break', label: 'Closed for the break' },
]

/** Where the season is: three stops, the current one lit, the past ones filled. */
export function PhaseRail({ phase }: { phase: SeasonPhase }) {
    const { t, isLight } = useAdminTheme()
    const at = RAIL.findIndex((s) => s.phase === phase)
    const line = isLight ? 'bg-[#091825]/[0.12]' : 'bg-white/[0.12]'
    return (
        <ol aria-label="Season phase" className="flex items-center gap-2 flex-wrap">
            {RAIL.map((step, i) => {
                const current = i === at
                const done = i < at
                return (
                    <li key={step.phase} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
                        {i > 0 && <span aria-hidden className={`h-px w-4 sm:w-8 ${done || current ? 'bg-[#f57f20]/50' : line}`} />}
                        <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-bold ${
                                current ? `${t.accentBg} border ${t.accent}` : done ? t.body : t.faint
                            }`}
                        >
                            <span
                                aria-hidden
                                className={`h-2 w-2 rounded-full ${current ? 'bg-[#f57f20]' : done ? 'bg-[#f57f20]/50' : isLight ? 'bg-[#091825]/20' : 'bg-white/20'}`}
                            />
                            {step.label}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}

/**
 * Every button on the Season page that changes something opens one of these
 * first: what happens, in plain words, and whether it can be undone. Lines
 * may carry **bold** runs.
 */
export function ConfirmDialog({ title, lines, undo, cta, danger, pending, error, onCancel, onConfirm, confirmDisabled, children, confirmId }: {
    title: string
    lines: string[]
    /** Answers "Can I undo this?" in one or two sentences. */
    undo?: string
    cta: string
    danger?: boolean
    pending: boolean
    error: string | null
    onCancel: () => void
    onConfirm: () => void
    confirmDisabled?: boolean
    children?: ReactNode
    confirmId?: string
}) {
    const { t } = useAdminTheme()
    return (
        <AdminModal label={title} maxW="max-w-[520px]" onBackdrop={() => { if (!pending) onCancel() }}>
            <div className="px-6 pt-6">
                <div className={`text-[20px] font-black tracking-tight ${t.heading}`}>{title}</div>
            </div>
            <div className="min-h-0 overflow-y-auto">
            <div className={`px-6 pt-4 text-[12px] font-bold ${t.muted}`}>What happens</div>
            <ul className="px-6 pt-2 flex flex-col gap-2">
                {lines.map((line) => (
                    <li key={line} className={`flex gap-3 text-[13px] leading-relaxed ${t.body}`}>
                        <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#f57f20]" />
                        <span><Bolded text={line} /></span>
                    </li>
                ))}
            </ul>
            {undo && (
                <div className="px-6 pt-4">
                    <div className={`text-[12px] font-bold ${t.muted}`}>Can I undo this?</div>
                    <p className={`mt-1 text-[13px] leading-relaxed ${t.body}`}><Bolded text={undo} /></p>
                </div>
            )}
            {(children || error) && (
                <div className="px-6 pt-4 flex flex-col gap-2">
                    {children}
                    {error && <p role="alert" className={`text-[12px] font-bold ${t.danger}`}>{error}</p>}
                </div>
            )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 px-6 py-6">
                <AdminButton variant="ghost" onClick={onCancel} disabled={pending}>Cancel</AdminButton>
                <AdminButton id={confirmId} variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={pending} disabled={confirmDisabled}>
                    {cta}
                </AdminButton>
            </div>
        </AdminModal>
    )
}

function Bolded({ text }: { text: string }) {
    const { t } = useAdminTheme()
    const parts = text.split('**')
    return <>{parts.map((p, i) => (i % 2 ? <strong key={i} className={`font-bold ${t.heading}`}>{p}</strong> : p))}</>
}

/**
 * A list that reads as a table on a wide screen and as stacked rows on a
 * phone. `columns` is the desktop grid template; each row passes its cells in
 * the same order, and the first cell leads the stacked row.
 */
export function RowList<T extends { id: string }>({ rows, columns, headers, cells, empty, testId }: {
    rows: T[]
    columns: string
    headers: string[]
    cells: (row: T) => ReactNode[]
    empty: string
    testId?: string
}) {
    const { t } = useAdminTheme()
    if (rows.length === 0) {
        return (
            <p data-testid={testId} className={`rounded-xl border border-dashed px-4 py-6 text-center text-[13px] ${t.border} ${t.muted}`}>
                {empty}
            </p>
        )
    }
    return (
        <div data-testid={testId} className={`rounded-xl ${t.card}`}>
            <div
                role="row"
                className={`hidden md:grid gap-4 px-4 py-2 border-b text-[11px] font-bold ${t.border} ${t.muted}`}
                style={{ gridTemplateColumns: columns }}
            >
                {headers.map((h, i) => <span key={`${h}-${i}`} role="columnheader">{h}</span>)}
            </div>
            <ul>
                {rows.map((row) => (
                    <li
                        key={row.id}
                        className={`grid grid-cols-2 md:[grid-template-columns:var(--cols)] gap-x-4 gap-y-1 px-4 py-3 border-b last:border-b-0 text-[13px] md:items-center ${t.border}`}
                        style={{ ['--cols' as string]: columns }}
                    >
                        {cells(row).map((cell, i) => (
                            <div key={i} className={`min-w-0 ${i === 0 ? 'col-span-2 md:col-span-1' : ''}`}>{cell}</div>
                        ))}
                    </li>
                ))}
            </ul>
        </div>
    )
}

/** A small word chip. `held` is the one coloured tone: food kept for next semester. */
export function Chip({ tone = 'quiet', children }: { tone?: 'quiet' | 'held' | 'wait' | 'done'; children: ReactNode }) {
    const { t, isLight } = useAdminTheme()
    const cls =
        tone === 'held' ? `border-dashed border-[#f57f20]/60 ${t.accent}`
        : tone === 'wait' ? `${t.warningBg} ${t.warning}`
        : tone === 'done' ? `${t.border} ${t.success}`
        : `${t.border} ${isLight ? 'text-[#091825]/70' : 'text-[#ede8da]/70'}`
    return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>
}
