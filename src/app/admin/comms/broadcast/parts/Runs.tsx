'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Mail, MessageCircle, RefreshCw } from 'lucide-react'
import { useAdminTheme } from '../../../_components/AdminThemeProvider'
import { AdminModal } from '../../../_components/AdminModal'
import { AdminButton } from '../../../_components/AdminButton'
import { AdminBadge } from '../../../_components/AdminBadge'
import { cancelBroadcast, getBroadcastProgress, retryBroadcastFailures } from '../actions'
import type { BroadcastRow } from '../page'
import { AUDIENCE_LABELS } from './audiences'

const POLL_MS = 3000
const fmt = (n: number) => n.toLocaleString('en-US')
type Progress = { ok: boolean; status: string; total: number; sent: number; failedParked: number }

/**
 * The send in flight, and the ones before it.
 *
 * The polling, stop and retry logic is unchanged from the previous composer —
 * it worked. What changed is that it is its own panel below the steps rather
 * than wedged into the compose column, so the question "is it going?" has one
 * place to look.
 */
export function Runs({
    broadcasts, parked, trackedId, onTrack,
}: {
    broadcasts: BroadcastRow[]
    parked: Record<string, number>
    trackedId: string | null
    onTrack: (id: string | null) => void
}) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [progress, setProgress] = useState<Progress | null>(null)
    const [pollNonce, setPollNonce] = useState(0)
    const [cancelOpen, setCancelOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [pending, startAction] = useTransition()
    const tracked = broadcasts.find(b => b.id === trackedId) ?? null

    // Pinned so the poll effect never restarts on an unrelated render.
    const refresh = useRef(router.refresh)
    refresh.current = router.refresh

    useEffect(() => {
        if (!trackedId) return
        let stale = false
        let timer: ReturnType<typeof setTimeout> | undefined
        async function tick() {
            try {
                const res = await getBroadcastProgress(trackedId as string)
                if (stale) return
                setProgress(res)
                if (res.ok && res.status === 'sending') timer = setTimeout(tick, POLL_MS)
                else refresh.current()
            } catch {
                // A stale deploy is handled by the shell's reloader; a network
                // blip is simply retried on the next tick.
                if (!stale) timer = setTimeout(tick, POLL_MS * 2)
            }
        }
        tick()
        return () => { stale = true; if (timer) clearTimeout(timer) }
    }, [trackedId, pollNonce])

    function handleCancel() {
        setError(null); setNotice(null)
        startAction(async () => {
            const res = await cancelBroadcast(trackedId as string)
            if (!res.ok) { setError(res.message); return }
            setCancelOpen(false)
            setNotice(res.message)
            setPollNonce(n => n + 1)
            router.refresh()
        })
    }

    const handleRetry = useCallback((id: string) => {
        setError(null); setNotice(null)
        onTrack(id)
        startAction(async () => {
            const res = await retryBroadcastFailures(id)
            if (!res.ok) { setError(res.message); return }
            setNotice(res.message)
            setPollNonce(n => n + 1)
            router.refresh()
        })
    }, [router, onTrack])

    const trackedParked = trackedId ? (progress?.failedParked || parked[trackedId] || 0) : 0
    const total = progress?.total ?? tracked?.recipient_count ?? 0
    const sent = progress?.sent ?? 0
    const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0
    const live = (progress?.status ?? tracked?.status) === 'sending'

    return (
        <div className="flex flex-col gap-8">
            {tracked && (
                <section className={`rounded-2xl border px-5 py-5 ${t.card}`}>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                            <div className={`text-[11px] font-black uppercase tracking-[0.12em] ${t.faint}`}>
                                {live ? 'Sending now' : 'Last send'}
                            </div>
                            <div className={`text-[15px] font-bold mt-1 truncate ${t.heading}`}>{tracked.subject}</div>
                        </div>
                        <StatusBadge status={progress?.status ?? tracked.status} />
                    </div>

                    {/* The headcount again, counting down. */}
                    <div className="flex items-baseline gap-2 mt-4">
                        <span className={`text-[32px] font-black tabular-nums leading-none ${t.heading}`}>{fmt(sent)}</span>
                        <span className={`text-[14px] font-bold ${t.muted}`}>of {fmt(total)} sent</span>
                    </div>
                    <div className={`h-2 rounded-full mt-3 overflow-hidden ${t.tableHeader}`}>
                        <div className="h-full rounded-full bg-[#f57f20] transition-[width] duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    {trackedParked > 0 && (
                        <p className={`text-[13px] font-bold mt-3 ${t.warning}`}>
                            {fmt(trackedParked)} couldn’t be delivered after three tries.
                        </p>
                    )}

                    {(error || notice) && (
                        <p className={`text-[13px] font-bold mt-3 ${error ? t.danger : t.success}`}>{error ?? notice}</p>
                    )}

                    <div className="flex gap-2 mt-4 flex-wrap">
                        {live && (
                            <AdminButton variant="danger" icon={<Ban size={14} strokeWidth={2.5} />} onClick={() => setCancelOpen(true)}>
                                Stop sending
                            </AdminButton>
                        )}
                        {trackedParked > 0 && (
                            <AdminButton variant="ghost" icon={<RefreshCw size={14} strokeWidth={2.5} />} onClick={() => handleRetry(trackedId as string)} loading={pending}>
                                Retry failures
                            </AdminButton>
                        )}
                    </div>
                </section>
            )}

            <section>
                <h2 className={`text-[11px] font-black uppercase tracking-[0.12em] mb-3 ${t.faint}`}>Past sends</h2>
                {broadcasts.length === 0 ? (
                    <p className={`text-[14px] font-medium py-8 text-center ${t.faint}`}>Nothing sent yet.</p>
                ) : (
                    <div className={`rounded-2xl border overflow-hidden ${t.card}`}>
                        {broadcasts.map(b => {
                            const rowParked = b.id === trackedId ? trackedParked : (parked[b.id] ?? 0)
                            const Icon = b.channel === 'whatsapp' ? MessageCircle : Mail
                            return (
                                <div key={b.id} className={`flex items-center gap-4 px-5 py-3.5 ${t.tableRow}`}>
                                    <Icon size={16} strokeWidth={2.2} className={`shrink-0 ${t.faint}`} />
                                    <div className="min-w-0 flex-1">
                                        <div className={`text-[14px] font-bold truncate ${t.heading}`}>{b.subject}</div>
                                        <div className={`text-[12px] font-medium ${t.muted}`}>
                                            {AUDIENCE_LABELS[b.audience] ?? b.audience}
                                            {b.dorm_name ? ` · ${b.dorm_name}` : ''} · {formatTime(b.created_at)}
                                        </div>
                                    </div>
                                    <div className={`text-right text-[15px] font-black tabular-nums shrink-0 ${t.heading}`}>
                                        {fmt(b.recipient_count)}
                                    </div>
                                    <div className="shrink-0 hidden sm:block"><StatusBadge status={b.status} /></div>
                                    {rowParked > 0 && b.status !== 'cancelled' && (
                                        <button
                                            type="button"
                                            onClick={() => handleRetry(b.id)}
                                            className={`shrink-0 text-[12px] font-bold ${t.accent} hover:underline underline-offset-4`}
                                        >
                                            Retry {fmt(rowParked)}
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>

            {cancelOpen && (
                <AdminModal label="Stop this send" onBackdrop={() => { if (!pending) setCancelOpen(false) }}>
                    <div className={`px-5 py-4 border-b ${t.border}`}>
                        <div className={`text-[15px] font-black ${t.heading}`}>Stop sending?</div>
                    </div>
                    <p className={`px-5 py-4 text-[14px] font-medium leading-relaxed ${t.body}`}>
                        Messages already sent stay sent. Nobody else in this audience will get it.
                    </p>
                    <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
                        <AdminButton variant="ghost" onClick={() => setCancelOpen(false)} disabled={pending}>Keep sending</AdminButton>
                        <AdminButton variant="danger" icon={<Ban size={14} strokeWidth={2.5} />} onClick={handleCancel} loading={pending}>
                            Stop it
                        </AdminButton>
                    </div>
                </AdminModal>
            )}
        </div>
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
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai',
    })
}
