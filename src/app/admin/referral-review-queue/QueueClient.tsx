'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, X, AlertTriangle, Phone, Mail, Coins } from 'lucide-react'
import { approveReferralReview, rejectReferralReview } from './actions'

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

// Brand tokens — match /admin/layer4-queue for visual consistency.
const BG_DEEP   = '#091825'
const GOLD      = '#f57f20'
const CREAM     = '#ede8da'
const GREEN     = '#5fb479'
const RED       = '#e0716e'
const GOLD_LITE = '#ffaa00'
const MIST      = 'rgba(237,232,218,0.55)'
const MIST_DIM  = 'rgba(237,232,218,0.30)'
const MIST_FAINT = 'rgba(237,232,218,0.12)'
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
    return (
        <main style={{
            backgroundColor: BG_DEEP,
            minHeight: '100vh',
            padding: '32px 24px',
            fontFamily: BODY,
            color: CREAM,
        }}>
            <div style={{ maxWidth: 960, margin: '0 auto' }}>
                <header style={{ marginBottom: 28 }}>
                    <h1 style={{
                        fontFamily: BODY, fontSize: 24, fontWeight: 900,
                        letterSpacing: '-0.01em', margin: 0,
                    }}>
                        Referral review queue
                    </h1>
                    <p style={{
                        fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
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
        </main>
    )
}

function EmptyState() {
    return (
        <div style={{
            padding: '40px 24px',
            borderRadius: 14,
            border: `1px dashed ${MIST_FAINT}`,
            textAlign: 'center',
        }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 800, color: CREAM, marginBottom: 4 }}>
                Queue is clear
            </div>
            <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: MIST }}>
                No flagged referrals to review right now.
            </div>
        </div>
    )
}

function Row({ row, isFocused }: { row: PendingReferralRow; isFocused: boolean }) {
    const [state, setState] = useState<RowState>({ state: 'idle' })
    const [isPending, startTransition] = useTransition()
    const ref = useRef<HTMLDivElement>(null)

    // Scroll the focused row into view on mount (deep-linked from the
    // WhatsApp alert message via ?focus=<queue_id>).
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
                backgroundColor: isFocused ? `${GOLD}10` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isFocused ? `${GOLD}88` : MIST_FAINT}`,
                opacity: isDone ? 0.5 : 1,
                transition: 'opacity 240ms ease, border-color 240ms ease, background-color 240ms ease',
            }}
        >
            {/* Top row: invitee + reason chip + days-old */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 900, color: CREAM, marginBottom: 4 }}>
                        {row.inviteeFirstName || 'Unnamed invitee'} joined via{' '}
                        <span style={{ color: GOLD_LITE }}>{row.inviterName || row.inviterCid || 'unknown'}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, fontWeight: 600, color: MIST }}>
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
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: GOLD_LITE, fontWeight: 800 }}>
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
                        color: isStale ? RED : GOLD_LITE,
                        backgroundColor: isStale ? `${RED}1a` : `${GOLD_LITE}1a`,
                        border: `1px solid ${isStale ? `${RED}55` : `${GOLD_LITE}55`}`,
                    }}>
                        {isStale && <AlertTriangle size={10} strokeWidth={2.6} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                        {daysOld === 0 ? '<1 day old' : `${daysOld}d old`}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: MIST_DIM, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {row.queueReason}
                    </span>
                </div>
            </div>

            {/* Flags — JSON dump for debugging. Collapsed by default visually
                but always present in the markup so admins can copy-paste. */}
            {row.queueFlags && Object.keys(row.queueFlags).length > 0 && (
                <details style={{ marginBottom: 12 }}>
                    <summary style={{
                        fontSize: 10, fontWeight: 800, color: MIST, cursor: 'pointer',
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}>
                        Flags
                    </summary>
                    <pre style={{
                        marginTop: 8,
                        padding: 10,
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        border: `1px solid ${MIST_FAINT}`,
                        borderRadius: 8,
                        fontSize: 11, fontFamily: 'ui-monospace, monospace',
                        color: MIST, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                        {JSON.stringify(row.queueFlags, null, 2)}
                    </pre>
                </details>
            )}

            {/* Action footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: MIST_DIM, fontFeatureSettings: '"tnum"' }}>
                    Created {new Date(row.queueCreatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {state.state === 'done' ? (
                        <span style={{
                            padding: '8px 16px', borderRadius: 8,
                            backgroundColor: state.outcome === 'approved' ? `${GREEN}1a` : `${RED}1a`,
                            border: `1px solid ${state.outcome === 'approved' ? `${GREEN}66` : `${RED}66`}`,
                            color: state.outcome === 'approved' ? GREEN : RED,
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
                                    backgroundColor: `${RED}14`,
                                    border: `1px solid ${RED}55`,
                                    color: RED,
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
                                    backgroundColor: GREEN,
                                    border: `1px solid ${GREEN}`,
                                    color: BG_DEEP,
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
                    backgroundColor: `${RED}1a`,
                    border: `1px solid ${RED}66`,
                    color: RED, fontSize: 12, fontWeight: 700,
                }}>
                    Error: {state.message}
                </div>
            )}
        </div>
    )
}
