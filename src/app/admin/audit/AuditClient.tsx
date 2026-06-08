'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminTheme } from '../_components/AdminThemeProvider'

interface Entry {
    id: string
    admin_email: string
    action: string
    entity_type: string | null
    entity_id: string | null
    payload: Record<string, unknown>
    created_at: string
}

interface Props {
    entries: Entry[]
}

const ACTION_COLORS: Record<string, string> = {
    comp_meal: '#f57f20',
    issue_credit: '#f57f20',
    adjust_skips: '#ffaa00',
    pause_subscription: '#e0716e',
    resume_subscription: '#5fb479',
    referral_approved: '#5fb479',
    referral_rejected: '#e0716e',
    create_pricing: '#60a5fa',
}

export function AuditClient({ entries }: Props) {
    const { t, isLight } = useAdminTheme()
    const router = useRouter()
    const [filter, setFilter] = useState('')

    const filtered = filter
        ? entries.filter(e =>
            e.action.includes(filter) ||
            e.entity_type?.includes(filter) ||
            e.admin_email.includes(filter)
        )
        : entries

    const actionTypes = Array.from(new Set(entries.map(e => e.action)))

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Audit Log</h1>
            <p className={`text-[13px] font-medium mb-4 ${t.muted}`}>
                {entries.length} actions recorded
            </p>

            {/* Filter by action type */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
                <button
                    type="button"
                    onClick={() => setFilter('')}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border whitespace-nowrap ${
                        !filter ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                    }`}
                >
                    All
                </button>
                {actionTypes.map(a => (
                    <button
                        key={a}
                        type="button"
                        onClick={() => setFilter(a)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border whitespace-nowrap ${
                            filter === a ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                        }`}
                    >
                        {a.replace(/_/g, ' ')}
                    </button>
                ))}
            </div>

            {/* Timeline */}
            <div className="relative pl-6">
                <div className={`absolute left-[9px] top-2 bottom-2 w-px ${isLight ? 'bg-[#091825]/[0.08]' : 'bg-white/[0.06]'}`} />

                {filtered.length === 0 && (
                    <div className={`text-center py-12 text-sm font-semibold ${t.faint}`}>No audit entries</div>
                )}

                {filtered.map(entry => {
                    const color = ACTION_COLORS[entry.action] ?? (isLight ? '#091825' : '#ede8da')
                    const entityLink = entry.entity_type === 'customer' || entry.entity_type === 'subscription'
                        ? `/admin/customers/${entry.entity_id}`
                        : null

                    return (
                        <div key={entry.id} className="relative flex gap-3 py-3">
                            <div
                                className="absolute -left-6 top-4 w-[18px] h-[18px] rounded-full"
                                style={{ backgroundColor: `${color}20`, border: `2px solid ${color}` }}
                            />

                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className={`text-[13px] font-bold ${t.heading}`}>
                                        {entry.action.replace(/_/g, ' ')}
                                    </span>
                                    {entry.entity_type && (
                                        <span className={`text-[10px] font-bold tracking-[0.08em] uppercase ${t.faint}`}>
                                            {entry.entity_type}
                                        </span>
                                    )}
                                </div>

                                <div className={`text-[11px] font-medium mt-0.5 ${t.muted}`}>
                                    by {entry.admin_email}
                                    {entry.entity_id && entityLink && (
                                        <>
                                            {' · '}
                                            <button
                                                type="button"
                                                onClick={() => router.push(entityLink)}
                                                className={`${t.accent} underline underline-offset-2`}
                                            >
                                                View entity
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* Payload */}
                                {Object.keys(entry.payload).length > 0 && (
                                    <details className="mt-1.5">
                                        <summary className={`text-[10px] font-bold tracking-[0.06em] uppercase cursor-pointer ${t.faint}`}>
                                            Details
                                        </summary>
                                        <pre className={`mt-1 px-3 py-2 rounded-lg text-[10px] font-medium whitespace-pre-wrap break-all ${
                                            isLight ? 'bg-[#091825]/[0.04]' : 'bg-white/[0.03]'
                                        } ${t.body}`} style={{ fontFamily: 'var(--font-jetbrains), ui-monospace, monospace' }}>
                                            {JSON.stringify(entry.payload, null, 2)}
                                        </pre>
                                    </details>
                                )}
                            </div>

                            <div className={`text-[10px] font-semibold tabular-nums shrink-0 pt-0.5 ${t.faint}`}>
                                {formatTimestamp(entry.created_at)}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function formatTimestamp(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60_000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    return d.toLocaleString('en-AE', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Dubai',
    })
}
