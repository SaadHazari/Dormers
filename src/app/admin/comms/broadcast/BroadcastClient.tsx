'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, Ban, RefreshCw, Send } from 'lucide-react'
import { useAdminTheme } from '../../_components/AdminThemeProvider'
import { AdminModal } from '../../_components/AdminModal'
import { AdminButton } from '../../_components/AdminButton'
import { AdminBadge } from '../../_components/AdminBadge'
import { buildBroadcastEmailHtml, reasonLineFor } from '@/infra/zeptomail/broadcast-shell'
import {
    previewAudience, launchBroadcast, getBroadcastProgress,
    cancelBroadcast, retryBroadcastFailures,
} from './actions'
import type { BroadcastRow } from './page'
import type { AdminTokens } from '@/ui-system/tokens/admin-theme'

interface Props {
    broadcasts: BroadcastRow[]
    dorms: string[]
    /** broadcast id to recipients parked after 3 failed attempts, from the server. */
    parked: Record<string, number>
}

type Mode = 'custom' | 'season_reopen'
type Progress = { ok: boolean; status: string; total: number; sent: number; failedParked: number }

const SUBJECT_MAX = 200
const BODY_MAX = 8000
const POLL_MS = 3000

const AUDIENCES: Array<{ value: string; label: string }> = [
    { value: 'everyone',          label: 'Everyone with an account' },
    { value: 'active_plans',      label: 'Customers on a plan' },
    { value: 'early_access',      label: 'Early access list' },
    { value: 'ended_not_renewed', label: 'Ended and not renewed' },
    { value: 'dorm',              label: 'One dorm' },
]

const AUDIENCE_LABELS: Record<string, string> = {
    ...Object.fromEntries(AUDIENCES.map(a => [a.value, a.label])),
    reopen: 'Reopening list',
}

export function BroadcastClient({ broadcasts, dorms, parked }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const preset = useSearchParams().get('preset')

    // ── Composer ─────────────────────────────────────────────────────────
    const [mode, setMode] = useState<Mode>(preset === 'reopen' ? 'season_reopen' : 'custom')
    const [subject, setSubject] = useState('')
    const [heading, setHeading] = useState('')
    const [body, setBody] = useState('')
    const [ctaLabel, setCtaLabel] = useState('')
    const [ctaUrl, setCtaUrl] = useState('')
    const [customAudience, setCustomAudience] = useState('everyone')
    const [dormName, setDormName] = useState(dorms[0] ?? '')

    const audience = mode === 'season_reopen' ? 'reopen' : customAudience

    // ── Live recipient count ─────────────────────────────────────────────
    const [count, setCount] = useState<number | null>(null)
    const [countError, setCountError] = useState<string | null>(null)
    const [countLoading, setCountLoading] = useState(false)

    useEffect(() => {
        let stale = false
        setCountLoading(true)
        setCountError(null)
        previewAudience(audience, audience === 'dorm' ? dormName : undefined).then(res => {
            if (stale) return
            setCountLoading(false)
            if (!res.ok) { setCount(null); setCountError(res.message ?? 'Could not resolve the audience.'); return }
            setCount(res.count)
        })
        return () => { stale = true }
    }, [audience, dormName])

    // ── Live preview ─────────────────────────────────────────────────────
    const previewHtml = useMemo(() => buildBroadcastEmailHtml({
        firstName: 'Ahmed',
        heading: heading.trim() || 'Your heading goes here',
        bodyText: body.trim() || 'Your message goes here. Leave a blank line between paragraphs.',
        ctaLabel: ctaLabel.trim() || undefined,
        ctaUrl: ctaUrl.trim() || undefined,
        reasonLine: reasonLineFor(audience),
    }), [heading, body, ctaLabel, ctaUrl, audience])

    // ── Launch ───────────────────────────────────────────────────────────
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [confirmText, setConfirmText] = useState('')
    const [launchError, setLaunchError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [launching, startLaunch] = useTransition()

    const readyToSend = mode === 'season_reopen'
        ? (count ?? 0) > 0
        : Boolean(subject.trim() && heading.trim() && body.trim()) && (count ?? 0) > 0

    function openConfirm() {
        setLaunchError(null)
        setNotice(null)
        setConfirmText('')
        setConfirmOpen(true)
    }

    function handleLaunch() {
        setLaunchError(null)
        startLaunch(async () => {
            const res = await launchBroadcast({
                kind: mode,
                subject,
                heading,
                body,
                ctaLabel: ctaLabel.trim() || undefined,
                ctaUrl: ctaUrl.trim() || undefined,
                audience,
                dormName: audience === 'dorm' ? dormName : undefined,
            })
            if (!res.ok || !res.id) { setLaunchError(res.message); return }
            setConfirmOpen(false)
            setNotice(res.message)
            setTrackedId(res.id)
            setProgress({ ok: true, status: 'sending', total: res.count ?? 0, sent: 0, failedParked: 0 })
            router.refresh()
        })
    }

    // ── Progress tracking ────────────────────────────────────────────────
    // One broadcast is watched at a time: whatever was just launched, or the
    // most recent row still sending when the page loaded.
    const [trackedId, setTrackedId] = useState<string | null>(
        () => broadcasts.find(b => b.status === 'sending')?.id ?? null
    )
    const [progress, setProgress] = useState<Progress | null>(null)
    const [pollNonce, setPollNonce] = useState(0)
    const tracked = broadcasts.find(b => b.id === trackedId) ?? null

    // router.refresh identity is stable, but pin it so the poll effect never
    // restarts on an unrelated render and double-schedules itself.
    const refresh = useRef(router.refresh)
    refresh.current = router.refresh

    useEffect(() => {
        if (!trackedId) return
        let stale = false
        let timer: ReturnType<typeof setTimeout> | undefined

        async function tick() {
            const res = await getBroadcastProgress(trackedId as string)
            if (stale) return
            setProgress(res)
            if (res.ok && res.status === 'sending') {
                timer = setTimeout(tick, POLL_MS)
            } else {
                // The run settled: pull the history table back in step with it.
                refresh.current()
            }
        }
        tick()

        return () => { stale = true; if (timer) clearTimeout(timer) }
    }, [trackedId, pollNonce])

    // ── Cancel / retry ───────────────────────────────────────────────────
    const [cancelOpen, setCancelOpen] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const [actionNotice, setActionNotice] = useState<string | null>(null)
    const [actionPending, startAction] = useTransition()

    function handleCancel() {
        setActionError(null)
        setActionNotice(null)
        startAction(async () => {
            const res = await cancelBroadcast(trackedId as string)
            if (!res.ok) { setActionError(res.message); return }
            setCancelOpen(false)
            setActionNotice(res.message)
            setPollNonce(n => n + 1)
            router.refresh()
        })
    }

    const handleRetry = useCallback((id: string) => {
        setActionError(null)
        setActionNotice(null)
        // Track it first, so the progress panel is on screen to carry whatever
        // this retry has to say — including a failure message.
        setTrackedId(id)
        startAction(async () => {
            const res = await retryBroadcastFailures(id)
            if (!res.ok) { setActionError(res.message); return }
            setActionNotice(res.message)
            setPollNonce(n => n + 1)
            router.refresh()
        })
    }, [router])

    const liveParked = progress?.failedParked ?? 0
    const trackedParked = trackedId ? (liveParked || parked[trackedId] || 0) : 0
    const pct = progress && progress.total > 0
        ? Math.min(100, Math.round((progress.sent / progress.total) * 100))
        : 0

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Broadcast</h1>
            <p className={`text-[13px] font-medium mb-5 ${t.muted}`}>
                One email to a whole audience. Every recipient is logged, and a send in flight can be stopped.
            </p>

            {/* Mode toggle */}
            <div className="flex gap-1.5 mb-5">
                {([
                    ['custom', 'Custom email'],
                    ['season_reopen', 'Season reopening notice'],
                ] as const).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => { setMode(key); setNotice(null); setLaunchError(null) }}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase transition-colors border ${
                            mode === key ? `${t.accentBg} ${t.accent}` : `${t.card} ${t.muted}`
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-5 items-start">
                {/* ── Composer column ───────────────────────────────────── */}
                <div className="flex flex-col gap-5 min-w-0">
                    {mode === 'custom' && (
                        <div className={`rounded-xl border p-5 ${t.card}`}>
                            <div className={`text-[11px] font-black uppercase tracking-[0.1em] ${t.muted}`}>The email</div>

                            <Field label={`Subject (${subject.length}/${SUBJECT_MAX})`} t={t}>
                                <input
                                    type="text"
                                    value={subject}
                                    maxLength={SUBJECT_MAX}
                                    onChange={e => setSubject(e.target.value)}
                                    placeholder="What lands in the inbox list"
                                    className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${t.input} ${t.inputFocus}`}
                                />
                            </Field>

                            <Field label="Heading" t={t}>
                                <input
                                    type="text"
                                    value={heading}
                                    maxLength={200}
                                    onChange={e => setHeading(e.target.value)}
                                    placeholder="The big line at the top of the email"
                                    className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${t.input} ${t.inputFocus}`}
                                />
                            </Field>

                            <Field label={`Body (${body.length}/${BODY_MAX})`} t={t}>
                                <textarea
                                    value={body}
                                    maxLength={BODY_MAX}
                                    rows={9}
                                    onChange={e => setBody(e.target.value)}
                                    placeholder="Write the message here."
                                    className={`w-full rounded-lg border px-3 py-2 text-[13px] font-medium leading-relaxed transition-colors resize-y ${t.input} ${t.inputFocus}`}
                                />
                            </Field>
                            <p className={`text-[11px] font-medium mt-1.5 ${t.faint}`}>
                                A blank line starts a new paragraph. Write {'{{first_name}}'} anywhere in the heading or body
                                to drop in the customer first name. The preview fills it in as Ahmed.
                            </p>

                            <div className={`mt-4 pt-4 border-t ${t.border}`}>
                                <div className={`text-[11px] font-black uppercase tracking-[0.1em] ${t.muted}`}>Button (optional)</div>
                                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                                    <label className="flex flex-col gap-1.5 min-w-0">
                                        <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>Label</span>
                                        <input
                                            type="text"
                                            value={ctaLabel}
                                            maxLength={40}
                                            onChange={e => setCtaLabel(e.target.value)}
                                            placeholder="See the menu"
                                            className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${t.input} ${t.inputFocus}`}
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1.5 min-w-0">
                                        <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>Link</span>
                                        <input
                                            type="url"
                                            value={ctaUrl}
                                            onChange={e => setCtaUrl(e.target.value)}
                                            placeholder="https://dormers.ae/menu"
                                            className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${t.input} ${t.inputFocus}`}
                                        />
                                    </label>
                                </div>
                                <p className={`text-[11px] font-medium mt-1.5 ${t.faint}`}>
                                    Leave both blank for no button. A button needs both, and the link must start with https.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Audience */}
                    <div className={`rounded-xl border p-5 ${t.card}`}>
                        <div className={`text-[11px] font-black uppercase tracking-[0.1em] ${t.muted}`}>Who gets it</div>

                        {mode === 'custom' ? (
                            <div className="grid sm:grid-cols-2 gap-3 mt-3">
                                <label className="flex flex-col gap-1.5 min-w-0">
                                    <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>Audience</span>
                                    <select
                                        value={customAudience}
                                        onChange={e => setCustomAudience(e.target.value)}
                                        className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${t.input} ${t.inputFocus}`}
                                    >
                                        {AUDIENCES.map(a => (
                                            <option key={a.value} value={a.value}>{a.label}</option>
                                        ))}
                                    </select>
                                </label>
                                {customAudience === 'dorm' && (
                                    <label className="flex flex-col gap-1.5 min-w-0">
                                        <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>Dorm</span>
                                        <select
                                            value={dormName}
                                            onChange={e => setDormName(e.target.value)}
                                            className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${t.input} ${t.inputFocus}`}
                                        >
                                            {dorms.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </label>
                                )}
                            </div>
                        ) : (
                            <p className={`text-[13px] font-medium leading-relaxed mt-3 ${t.body}`}>
                                The early access list plus everyone whose plan ended and has not come back.
                            </p>
                        )}

                        <div className={`mt-4 flex items-center gap-2 text-[13px] font-bold ${countError ? t.danger : t.heading}`}>
                            {countError ? (
                                <>
                                    <AlertTriangle size={14} strokeWidth={2.4} />
                                    <span>{countError}</span>
                                </>
                            ) : countLoading || count === null ? (
                                <span className={t.faint}>Counting the audience.</span>
                            ) : (
                                <span className="tabular-nums">
                                    Will reach {count} {count === 1 ? 'customer' : 'customers'}.
                                </span>
                            )}
                        </div>

                        {launchError && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{launchError}</p>}
                        {notice && !launchError && <p className={`mt-3 text-[12px] font-bold ${t.success}`}>{notice}</p>}

                        <div className="mt-4">
                            <AdminButton
                                icon={<Send size={14} strokeWidth={2.5} />}
                                onClick={openConfirm}
                                disabled={!readyToSend || launching}
                            >
                                Review and Send
                            </AdminButton>
                        </div>
                    </div>

                    {/* Progress */}
                    {trackedId && progress && (
                        <div className={`rounded-xl border p-5 ${t.card}`}>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className={`text-[11px] font-black uppercase tracking-[0.1em] ${t.muted}`}>
                                    {progress.status === 'sending' ? 'Sending now' : 'Last run'}
                                </div>
                                <StatusBadge status={progress.status} />
                            </div>

                            {tracked && (
                                <div className={`text-[13px] font-bold mt-2 ${t.heading}`}>{tracked.subject}</div>
                            )}

                            <div className={`mt-3 h-2 rounded-full overflow-hidden ${t.tableHeader}`}>
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #f9a962 0%, #f57f20 100%)' }}
                                />
                            </div>

                            <div className={`mt-2 text-[12px] font-bold tabular-nums ${t.body}`}>
                                {progress.sent} of {progress.total} sent
                                {trackedParked > 0 && (
                                    <span className={t.danger}>. {trackedParked} parked after 3 attempts</span>
                                )}
                            </div>

                            {actionError && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{actionError}</p>}
                            {actionNotice && !actionError && <p className={`mt-3 text-[12px] font-bold ${t.success}`}>{actionNotice}</p>}

                            <div className="flex flex-wrap gap-2.5 mt-4">
                                {progress.status === 'sending' && (
                                    <AdminButton
                                        variant="danger"
                                        icon={<Ban size={14} strokeWidth={2.5} />}
                                        onClick={() => { setActionError(null); setCancelOpen(true) }}
                                        disabled={actionPending}
                                    >
                                        Stop Sending
                                    </AdminButton>
                                )}
                                {trackedParked > 0 && (
                                    <AdminButton
                                        variant="ghost"
                                        icon={<RefreshCw size={14} strokeWidth={2.5} />}
                                        onClick={() => handleRetry(trackedId)}
                                        loading={actionPending}
                                    >
                                        Retry Failures
                                    </AdminButton>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Preview column ────────────────────────────────────── */}
                <div className="lg:sticky lg:top-5 self-start min-w-0">
                    <div className={`text-[10px] font-black tracking-[0.12em] uppercase mb-2 ${t.faint}`}>
                        {mode === 'custom' ? 'Live preview. What lands in the inbox' : 'What this sends'}
                    </div>
                    {mode === 'custom' ? (
                        // No background of our own: the email carries a dark-mode block, so
                        // the frame's own canvas is what makes the preview match what a
                        // recipient on this colour scheme actually sees.
                        <iframe
                            title="Email preview"
                            srcDoc={previewHtml}
                            className={`w-full h-[560px] lg:h-[calc(100vh-140px)] rounded-xl border ${t.border}`}
                        />
                    ) : (
                        <div className={`rounded-xl border p-5 ${t.card}`}>
                            <p className={`text-[13px] font-medium leading-relaxed ${t.body}`}>
                                The season reopening template, rendered by ZeptoMail one version per customer. Credit
                                holders see their amount and a Use my credit button. Everyone else sees the plain we are
                                back version with Restart my plan.
                            </p>
                            <p className={`text-[12px] font-medium leading-relaxed mt-3 ${t.muted}`}>
                                Nothing here is editable. The wording lives in the template so the credit block and the
                                button label stay in step with what each customer actually has. Send yourself a test from
                                ZeptoMail if you want to see the artwork before this goes out.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── History ───────────────────────────────────────────────── */}
            <div className="mt-8">
                <div className={`text-[11px] font-black uppercase tracking-[0.1em] mb-3 ${t.muted}`}>Recent broadcasts</div>

                {broadcasts.length === 0 ? (
                    <div className={`text-center py-12 text-sm font-semibold ${t.faint}`}>No broadcasts yet</div>
                ) : (
                    <>
                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className={t.tableHeader}>
                                        <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Subject</th>
                                        <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Audience</th>
                                        <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Recipients</th>
                                        <th className="text-center px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Status</th>
                                        <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">Sent by</th>
                                        <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase">When</th>
                                        <th className="text-right px-3 py-2.5 text-[10px] font-bold tracking-[0.06em] uppercase" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {broadcasts.map(b => {
                                        const rowParked = b.id === trackedId ? trackedParked : (parked[b.id] ?? 0)
                                        return (
                                            <tr key={b.id} className={`${t.tableRow} ${b.id === trackedId ? t.tableRowSelected : ''} transition-colors`}>
                                                <td className={`px-3 py-2.5 font-bold ${t.heading}`}>{b.subject}</td>
                                                <td className={`px-3 py-2.5 ${t.body}`}>
                                                    {AUDIENCE_LABELS[b.audience] ?? b.audience}
                                                    {b.dorm_name ? ` (${b.dorm_name})` : ''}
                                                </td>
                                                <td className={`px-3 py-2.5 text-right tabular-nums ${t.body}`}>{b.recipient_count}</td>
                                                <td className="px-3 py-2.5 text-center"><StatusBadge status={b.status} /></td>
                                                <td className={`px-3 py-2.5 text-[11px] ${t.faint}`}>{b.created_by.split('@')[0]}</td>
                                                <td className={`px-3 py-2.5 text-right tabular-nums text-[11px] ${t.faint}`}>{formatTime(b.created_at)}</td>
                                                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                    {rowParked > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRetry(b.id)}
                                                            disabled={actionPending}
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase border transition-colors ${t.dangerBg} ${t.danger} disabled:opacity-50`}
                                                        >
                                                            <RefreshCw size={11} strokeWidth={2.5} />
                                                            Retry {rowParked}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden flex flex-col gap-2">
                            {broadcasts.map(b => {
                                const rowParked = b.id === trackedId ? trackedParked : (parked[b.id] ?? 0)
                                return (
                                    <div key={b.id} className={`${t.card} rounded-xl p-3`}>
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <span className={`text-[13px] font-bold ${t.heading}`}>{b.subject}</span>
                                            <StatusBadge status={b.status} />
                                        </div>
                                        <div className={`text-[11px] ${t.faint}`}>
                                            {AUDIENCE_LABELS[b.audience] ?? b.audience}
                                            {b.dorm_name ? ` (${b.dorm_name})` : ''} · {b.recipient_count} recipients · {formatTime(b.created_at)}
                                        </div>
                                        {rowParked > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRetry(b.id)}
                                                disabled={actionPending}
                                                className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em] uppercase border transition-colors ${t.dangerBg} ${t.danger} disabled:opacity-50`}
                                            >
                                                <RefreshCw size={11} strokeWidth={2.5} />
                                                Retry {rowParked}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* ── Confirm send ──────────────────────────────────────────── */}
            {confirmOpen && (
                <AdminModal
                    label="Confirm broadcast"
                    maxW="max-w-[460px]"
                    onBackdrop={() => { if (!launching) setConfirmOpen(false) }}
                >
                    <div className={`px-5 py-4 border-b ${t.border}`}>
                        <div className={`text-[15px] font-black ${t.heading}`}>Send to {count ?? 0} {count === 1 ? 'person' : 'people'}?</div>
                    </div>
                    <div className="px-5 py-4">
                        <p className={`text-[13px] font-medium leading-relaxed ${t.body}`}>
                            This emails <b className={t.heading}>{count ?? 0}</b> {count === 1 ? 'person' : 'people'} and cannot be
                            recalled once sent. Type SEND to confirm.
                        </p>
                        <input
                            type="text"
                            value={confirmText}
                            autoFocus
                            onChange={e => setConfirmText(e.target.value)}
                            placeholder="SEND"
                            aria-label="Type SEND to confirm"
                            className={`w-full mt-3 rounded-lg border px-3 py-2 text-[13px] font-black tracking-[0.12em] uppercase transition-colors ${t.input} ${t.inputFocus}`}
                        />
                        {launchError && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{launchError}</p>}
                    </div>
                    <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
                        <AdminButton variant="ghost" onClick={() => setConfirmOpen(false)} disabled={launching}>
                            Cancel
                        </AdminButton>
                        <AdminButton
                            icon={<Send size={14} strokeWidth={2.5} />}
                            onClick={handleLaunch}
                            loading={launching}
                            disabled={confirmText.trim() !== 'SEND'}
                        >
                            Send Now
                        </AdminButton>
                    </div>
                </AdminModal>
            )}

            {/* ── Confirm stop ──────────────────────────────────────────── */}
            {cancelOpen && (
                <AdminModal
                    label="Confirm stop"
                    maxW="max-w-[440px]"
                    onBackdrop={() => { if (!actionPending) setCancelOpen(false) }}
                >
                    <div className={`px-5 py-4 border-b ${t.border}`}>
                        <div className={`text-[15px] font-black ${t.heading}`}>Stop this broadcast?</div>
                    </div>
                    <div className="px-5 py-4">
                        <p className={`text-[13px] font-medium leading-relaxed ${t.body}`}>
                            Stops new sends within a few seconds. Already sent emails stay sent.
                        </p>
                        {actionError && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{actionError}</p>}
                    </div>
                    <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
                        <AdminButton variant="ghost" onClick={() => setCancelOpen(false)} disabled={actionPending}>
                            Keep Sending
                        </AdminButton>
                        <AdminButton variant="danger" icon={<Ban size={14} strokeWidth={2.5} />} onClick={handleCancel} loading={actionPending}>
                            Yes, Stop It
                        </AdminButton>
                    </div>
                </AdminModal>
            )}
        </div>
    )
}

// ── Bits ─────────────────────────────────────────────────────────────────

function Field({ label, t, children }: { label: string; t: AdminTokens; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5 mt-3">
            <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>{label}</span>
            {children}
        </label>
    )
}

function StatusBadge({ status }: { status: string }) {
    if (status === 'sending') return <AdminBadge variant="pending">Sending</AdminBadge>
    if (status === 'done') return <AdminBadge variant="approved">Done</AdminBadge>
    if (status === 'cancelled') return <AdminBadge variant="rejected">Stopped</AdminBadge>
    return <AdminBadge variant="neutral">{status}</AdminBadge>
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-AE', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Dubai',
    })
}
