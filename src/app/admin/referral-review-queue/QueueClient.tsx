'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, X, AlertTriangle, Phone, Mail, Coins } from 'lucide-react'
import { approveReferralReview, rejectReferralReview } from './actions'
import { useAdminTheme } from '../_components/AdminThemeProvider'

export interface PendingReferralRow {
    queueId:            string
    queueReason:        string
    queueFlags:         Record<string, unknown> | null
    queueCreatedAt:     string
    queueAlertedAt:     string | null
    referralId:         string
    inviteeFirstName:   string | null
    inviteePhone:       string | null
    inviteeEmail:       string | null
    inviteeConvertedAt: string | null
    inviteeGiftClaimedAt: string | null
    inviterCid:         string | null
    inviterUserId:      string | null
    inviterName:        string | null
    inviterEmail:       string | null
    creditAed:          number
}

function useColors() {
    const { isLight } = useAdminTheme()
    return {
        GOLD:       '#f57f20',
        GREEN:      isLight ? '#1d8a30' : '#5fb479',
        RED:        isLight ? '#c0392b' : '#e0716e',
        GOLD_LITE:  '#ffaa00',
        TEXT:       isLight ? '#091825' : '#ede8da',
        MIST:       isLight ? 'rgba(9,24,37,0.55)' : 'rgba(237,232,218,0.55)',
        MIST_DIM:   isLight ? 'rgba(9,24,37,0.30)' : 'rgba(237,232,218,0.30)',
        MIST_FAINT: isLight ? 'rgba(9,24,37,0.08)' : 'rgba(237,232,218,0.12)',
        CARD_BG:    isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
        CODE_BG:    isLight ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.4)',
    }
}

const BODY = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

type RowState =
    | { state: 'idle' }
    | { state: 'pending' }
    | { state: 'done'; outcome: 'approved' | 'rejected' }
    | { state: 'error'; message: string }

export default function QueueClient({
    rows,
    focusId,
}: {
    rows: PendingReferralRow[]
    focusId: string | null
}) {
    const c = useColors()
    return (
        <div style={{ fontFamily: BODY, color: c.TEXT }}>
            <header style={{ marginBottom: 28 }}>
                <h1 style={{
                    fontFamily: BODY, fontSize: 20, fontWeight: 900,
                    letterSpacing: '-0.01em', margin: 0,
                }}>
                    Referral review queue
                </h1>
                <p style={{
                    fontFamily: BODY, fontSize: 13, fontWeight: 500, color: c.MIST,
                    margin: '6px 0 0', lineHeight: 1.5,
                }}>
                    Soft-flagged referrals awaiting approval. AED stays pending in the
                    inviter&rsquo;s wallet until you decide. {rows.length} row{rows.length === 1 ? '' : 's'}.
                </p>
            </header>

            {rows.length === 0 ? (
                <EmptyState />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {rows.map(row => (
                        <Row key={row.queueId} row={row} isFocused={row.queueId === focusId} />
                    ))}
                </div>
            )}
        </div>
    )
}

function EmptyState() {
    const c = useColors()
    return (
        <div style={{
            padding: '40px 24px',
            borderRadius: 14,
            border: `1px dashed ${c.MIST_FAINT}`,
            textAlign: 'center',
        }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 800, color: c.TEXT, marginBottom: 4 }}>
                Queue is clear
            </div>
            <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: c.MIST }}>
                No flagged referrals to review right now.
            </div>
        </div>
    )
}

function Row({ row, isFocused }: { row: PendingReferralRow; isFocused: boolean }) {
    const c = useColors()
    const [state, setState] = useState<RowState>({ state: 'idle' })
    const [isPending, startTransition] = useTransition()
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (isFocused && ref.current) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }, [isFocused])

    function onApprove() {
        if (state.state === 'pending' || state.state === 'done') return
        setState({ state: 'pending' })
        startTransition(async () => {
            const result = await approveReferralReview(row.queueId, null)
            if ('ok' in result) {
                setState({ state: 'done', outcome: 'approved' })
            } else {
                setState({ state: 'error', message: result.error })
            }
        })
    }

    function onReject() {
        if (state.state === 'pending' || state.state === 'done') return
        const reason = window.prompt('Reject reason (optional):') ?? undefined
        setState({ state: 'pending' })
        startTransition(async () => {
            const result = await rejectReferralReview(row.queueId, null, reason)
            if ('ok' in result) {
                setState({ state: 'done', outcome: 'rejected' })
            } else {
                setState({ state: 'error', message: result.error })
            }
        })
    }

    const isDone = state.state === 'done'
    const daysOld = Math.floor((Date.now() - new Date(row.queueCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
    const isStale = daysOld >= 1

    return (
        <div
            ref={ref}
            style={{
                position: 'relative',
                padding: '18px 18px',
                borderRadius: 12,
                backgroundColor: isFocused ? `${c.GOLD}10` : c.CARD_BG,
                border: `1px solid ${isFocused ? `${c.GOLD}88` : c.MIST_FAINT}`,
                opacity: isDone ? 0.5 : 1,
                transition: 'opacity 240ms ease, border-color 240ms ease, background-color 240ms ease',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 900, color: c.TEXT, marginBottom: 4 }}>
                        {row.inviteeFirstName || 'Unnamed invitee'} joined via{' '}
                        <span style={{ color: c.GOLD_LITE }}>{row.inviterName || row.inviterCid || 'unknown'}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, fontWeight: 600, color: c.MIST }}>
                        {row.inviteePhone && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Phone size={11} strokeWidth={2.4} /> {row.inviteePhone}
                            </span>
                        )}
                        {row.inviteeEmail && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Mail size={11} strokeWidth={2.4} /> {row.inviteeEmail}
                            </span>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: c.GOLD_LITE, fontWeight: 800 }}>
                            <Coins size={11} strokeWidth={2.4} /> AED {row.creditAed} locked
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <span style={{
                        padding: '3px 9px',
                        borderRadius: 999,
                        fontSize: 10, fontWeight: 900,
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: isStale ? c.RED : c.GOLD_LITE,
                        backgroundColor: isStale ? `${c.RED}1a` : `${c.GOLD_LITE}1a`,
                        border: `1px solid ${isStale ? `${c.RED}55` : `${c.GOLD_LITE}55`}`,
                    }}>
                        {isStale && <AlertTriangle size={10} strokeWidth={2.6} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                        {daysOld === 0 ? '<1 day old' : `${daysOld}d old`}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: c.MIST_DIM, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {row.queueReason}
                    </span>
                </div>
            </div>

            {row.queueFlags && Object.keys(row.queueFlags).length > 0 && (
                <details style={{ marginBottom: 12 }}>
                    <summary style={{
                        fontSize: 10, fontWeight: 800, color: c.MIST, cursor: 'pointer',
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}>
                        Flags
                    </summary>
                    <pre style={{
                        marginTop: 8,
                        padding: 10,
                        backgroundColor: c.CODE_BG,
                        border: `1px solid ${c.MIST_FAINT}`,
                        borderRadius: 8,
                        fontSize: 11, fontFamily: 'ui-monospace, monospace',
                        color: c.MIST, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                        {JSON.stringify(row.queueFlags, null, 2)}
                    </pre>
                </details>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: c.MIST_DIM, fontFeatureSettings: '"tnum"' }}>
                    Created {new Date(row.queueCreatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {state.state === 'done' ? (
                        <span style={{
                            padding: '8px 16px', borderRadius: 8,
                            backgroundColor: state.outcome === 'approved' ? `${c.GREEN}1a` : `${c.RED}1a`,
                            border: `1px solid ${state.outcome === 'approved' ? `${c.GREEN}66` : `${c.RED}66`}`,
                            color: state.outcome === 'approved' ? c.GREEN : c.RED,
                            fontSize: 12, fontWeight: 800,
                        }}>
                            {state.outcome === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={onReject}
                                disabled={isPending}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '8px 14px', borderRadius: 8,
                                    backgroundColor: `${c.RED}14`,
                                    border: `1px solid ${c.RED}55`,
                                    color: c.RED,
                                    fontFamily: BODY, fontSize: 12, fontWeight: 800,
                                    cursor: isPending ? 'wait' : 'pointer',
                                    opacity: isPending ? 0.5 : 1,
                                }}
                            >
                                <X size={13} strokeWidth={2.6} /> Reject
                            </button>
                            <button
                                type="button"
                                onClick={onApprove}
                                disabled={isPending}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '8px 16px', borderRadius: 8,
                                    backgroundColor: c.GREEN,
                                    border: `1px solid ${c.GREEN}`,
                                    color: c.TEXT,
                                    fontFamily: BODY, fontSize: 12, fontWeight: 900,
                                    cursor: isPending ? 'wait' : 'pointer',
                                    opacity: isPending ? 0.5 : 1,
                                }}
                            >
                                <Check size={13} strokeWidth={2.8} /> Approve
                            </button>
                        </>
                    )}
                </div>
            </div>

            {state.state === 'error' && (
                <div style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    backgroundColor: `${c.RED}1a`,
                    border: `1px solid ${c.RED}66`,
                    color: c.RED, fontSize: 12, fontWeight: 700,
                }}>
                    Error: {state.message}
                </div>
            )}
        </div>
    )
}
