'use client'

import { Send } from 'lucide-react'
import { useAdminTheme } from '../../../_components/AdminThemeProvider'
import { AdminButton } from '../../../_components/AdminButton'
import type { Readiness } from '../readiness'

const fmt = (n: number) => n.toLocaleString('en-US')

export interface NumberHealth {
    quality: string | undefined
    verdict: 'ok' | 'warn' | 'block'
    remaining: number
    sentToday: number
    rate: number
}

/**
 * Step 3: the send, as a service ticket.
 *
 * A kitchen reads its covers off the ticket before it cooks. This is the same
 * glance: how many people, on what channel, what it costs, whether the number
 * is healthy — all at once, all before the button, none of it sprung in a
 * dialog afterwards.
 */
export function SendSlip({
    channel, audienceLabel, count, health, readiness, confirmText, onConfirmText,
    onSend, sending, error,
}: {
    channel: 'email' | 'whatsapp'
    audienceLabel: string
    count: number
    health: NumberHealth | null
    readiness: Readiness
    confirmText: string
    onConfirmText: (v: string) => void
    onSend: () => void
    sending: boolean
    error: string | null
}) {
    const { t } = useAdminTheme()
    const whatsapp = channel === 'whatsapp'
    const cost = whatsapp && health ? Math.round(count * health.rate * 100) / 100 : 0
    const typed = confirmText.trim().toUpperCase() === 'SEND'

    return (
        <div className="flex flex-col gap-5">
            {/* The ticket. */}
            <div className={`rounded-xl border overflow-hidden ${t.borderStrong}`}>
                <div className="grid sm:grid-cols-[1.2fr_1fr]">
                    <div className="px-5 py-5 flex flex-col justify-center">
                        <div className={`text-[11px] font-black uppercase tracking-[0.12em] ${t.faint}`}>
                            {whatsapp ? 'WhatsApp to' : 'Email to'}
                        </div>
                        <div className={`text-[44px] font-black tabular-nums leading-none mt-2 ${t.heading}`}>
                            {fmt(count)}
                        </div>
                        <div className={`text-[14px] font-bold mt-2 ${t.body}`}>
                            {count === 1 ? 'person' : 'people'} · {audienceLabel}
                        </div>
                    </div>

                    {whatsapp && (
                        <dl className={`grid grid-cols-2 sm:grid-cols-1 border-t sm:border-t-0 sm:border-l ${t.border} ${t.tableHeader}`}>
                            <Stat label="Costs about" value={health ? `AED ${cost.toFixed(2)}` : '…'} note={health ? `AED ${health.rate} each` : undefined} />
                            <Stat
                                label="Number health"
                                value={health ? (health.quality ?? 'Unknown') : '…'}
                                tone={health?.verdict}
                                note={health ? `${fmt(health.remaining)} more today` : undefined}
                            />
                        </dl>
                    )}
                </div>
            </div>

            {readiness.warning && (
                <p className={`rounded-xl border px-4 py-3 text-[13px] font-bold ${t.warningBg} ${t.warning}`}>
                    {readiness.warning}
                </p>
            )}

            {readiness.ready ? (
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <label className="flex flex-col gap-1.5 flex-1 max-w-xs">
                        <span className={`text-[13px] font-bold ${t.heading}`}>
                            Type SEND to confirm
                        </span>
                        <input
                            value={confirmText}
                            onChange={e => onConfirmText(e.target.value)}
                            placeholder="SEND"
                            autoComplete="off"
                            aria-label="Type SEND to confirm"
                            className={`rounded-lg border px-3 py-2.5 text-[15px] font-black tracking-[0.14em] uppercase ${t.input} ${t.inputFocus}`}
                        />
                    </label>
                    <AdminButton
                        icon={<Send size={15} strokeWidth={2.5} />}
                        onClick={onSend}
                        loading={sending}
                        disabled={!typed}
                    >
                        Send to {fmt(count)}
                    </AdminButton>
                </div>
            ) : readiness.blocker ? (
                <p className={`text-[13px] font-medium ${t.muted}`}>
                    Not ready yet — {readiness.blocker}
                </p>
            ) : null}

            {whatsapp && (
                <p className={`text-[12px] font-medium leading-relaxed ${t.faint}`}>
                    This goes from the same number your signup codes come from. It can’t be recalled once
                    sent, and a batch you start can be stopped from the panel below.
                </p>
            )}

            {error && <p className={`text-[13px] font-bold ${t.danger}`}>{error}</p>}
        </div>
    )
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'ok' | 'warn' | 'block' }) {
    const { t } = useAdminTheme()
    const color = tone === 'block' ? t.danger : tone === 'warn' ? t.warning : tone === 'ok' ? t.success : t.heading
    return (
        <div className="px-5 py-4">
            <dt className={`text-[11px] font-black uppercase tracking-[0.12em] ${t.faint}`}>{label}</dt>
            <dd className={`text-[18px] font-black tabular-nums mt-1 ${color}`}>{value}</dd>
            {note && <dd className={`text-[12px] font-medium ${t.muted}`}>{note}</dd>}
        </div>
    )
}
