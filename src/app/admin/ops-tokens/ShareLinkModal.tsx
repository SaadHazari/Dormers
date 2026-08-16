'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Download, Send, ExternalLink, MessageCircle } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminButton } from '../_components/AdminButton'
import { sendOpsLink } from './actions'
import { prettyPhone, TEAM_LABEL, TEAM_DESCRIPTION } from './format'
import type { OpsToken, CrewMember } from './page'

/** Per-person send outcome, so one failure doesn't wipe another's success. */
interface SendState {
    status: 'sending' | 'sent' | 'failed'
    message: string
    fallbackHref?: string
}

/**
 * The one place a link is handed to a human.
 *
 * Three exits, always the same three, whether you got here from creating a
 * link, rotating one, or pressing Share on an existing row: send it to one
 * named person on WhatsApp, copy it, or take the QR code. Nothing here is
 * behind a tab — an admin holding a phone in one hand should not have to
 * hunt.
 */
export function ShareLinkModal({ token, crew, onClose, headline }: {
    token: OpsToken
    crew: CrewMember[]
    onClose: () => void
    headline?: string
}) {
    const { t } = useAdminTheme()
    const [copied, setCopied] = useState(false)
    const [qr, setQr] = useState<string | null>(null)
    const [qrFailed, setQrFailed] = useState(false)
    const [showAll, setShowAll] = useState(false)
    const [sends, setSends] = useState<Record<string, SendState>>({})

    // The QR is the whole answer for a kitchen tablet, so it renders on open
    // rather than waiting behind a "generate" press. Generated in the browser,
    // matching /admin/qr-codes — no server round trip for a pure transform.
    useEffect(() => {
        let alive = true
        QRCode.toDataURL(token.url, {
            width: 512,
            margin: 2,
            errorCorrectionLevel: 'M',
            color: { dark: '#091825', light: '#ffffff' },
        })
            .then(url => { if (alive) setQr(url) })
            .catch(() => { if (alive) setQrFailed(true) })
        return () => { alive = false }
    }, [token.url])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const sameTeam = crew.filter(c => c.team === token.role)
    // Nobody on this link's team yet: show everyone rather than an empty list,
    // and say why, so a kitchen link listing riders does not look like a bug.
    const noTeamMatch = sameTeam.length === 0 && crew.length > 0
    const visible = showAll || noTeamMatch ? crew : sameTeam

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(token.url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
        } catch {
            // Clipboard blocked (rare on an https admin page) — the URL is
            // already on screen and selectable, so there is nothing to rescue.
        }
    }

    async function handleSend(person: CrewMember) {
        setSends(s => ({ ...s, [person.id]: { status: 'sending', message: '' } }))
        const res = await sendOpsLink(token.id, person.id)
        setSends(s => ({
            ...s,
            [person.id]: {
                status: res.ok ? 'sent' : 'failed',
                message: res.message,
                fallbackHref: res.fallbackHref,
            },
        }))
    }

    return (
        <AdminModal label={`Share ${token.label}`} maxW="max-w-[540px]" onBackdrop={onClose}>
            {/* flex-1 + min-h-0 so the panel scrolls INSIDE and the Done button
                below stays pinned. Without min-h-0 a flex child refuses to
                shrink and the footer gets pushed off the bottom of the modal. */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="p-6">
                    {headline && (
                        <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 mb-5 ${t.successBg}`}>
                            <Check size={15} strokeWidth={2.5} className={`${t.success} mt-px shrink-0`} />
                            <p className={`text-[13px] font-semibold leading-snug ${t.success}`}>{headline}</p>
                        </div>
                    )}

                    <h2 className={`text-[20px] font-extrabold tracking-tight ${t.heading}`}>{token.label}</h2>
                    <p className={`text-[13px] mt-1 mb-5 ${t.muted}`}>
                        {TEAM_LABEL[token.role]} link. {TEAM_DESCRIPTION[token.role]}
                    </p>

                    {/* ── The link itself ─────────────────────────────────── */}
                    <div className={`rounded-xl border px-3.5 py-3 mb-2 ${t.border} ${t.tableHeader}`}>
                        <p className={`font-mono text-[12px] leading-relaxed break-all ${t.heading}`}>{token.url}</p>
                    </div>
                    <AdminButton
                        variant="ghost"
                        icon={copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={2.5} />}
                        onClick={handleCopy}
                        className="w-full mb-7"
                    >
                        {copied ? 'Copied' : 'Copy link'}
                    </AdminButton>

                    {/* ── Send to one person ──────────────────────────────── */}
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                        <h3 className={`text-[11px] font-bold uppercase tracking-[0.12em] ${t.muted}`}>
                            Send on WhatsApp
                        </h3>
                        {sameTeam.length > 0 && crew.length > sameTeam.length && (
                            <button
                                type="button"
                                onClick={() => setShowAll(v => !v)}
                                className={`text-[12px] font-semibold ${t.accent} hover:underline`}
                            >
                                {showAll ? `Only ${TEAM_LABEL[token.role].toLowerCase()} crew` : 'Show everyone'}
                            </button>
                        )}
                    </div>
                    <p className={`text-[12px] mb-3 ${t.faint}`}>
                        {noTeamMatch
                            ? `Goes to one person only. Nobody is on the ${TEAM_LABEL[token.role].toLowerCase()} team yet, so everyone is listed.`
                            : 'Goes to one person only.'}
                    </p>

                    {visible.length === 0 ? (
                        <div className={`rounded-xl border border-dashed px-4 py-5 text-center mb-7 ${t.border}`}>
                            <p className={`text-[13px] font-semibold ${t.muted}`}>Nobody on the crew list yet.</p>
                            <p className={`text-[12px] mt-1 ${t.faint}`}>Add people further down the page, then send from here.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 mb-7">
                            {visible.map(person => {
                                const state = sends[person.id]
                                return (
                                    <div key={person.id} className={`rounded-xl border px-3.5 py-3 ${t.border}`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className={`text-[14px] font-bold truncate ${t.heading}`}>{person.name}</p>
                                                <p className={`font-mono text-[12px] ${t.muted}`}>{prettyPhone(person.phone_digits)}</p>
                                            </div>
                                            <AdminButton
                                                variant={state?.status === 'sent' ? 'ghost' : 'primary'}
                                                loading={state?.status === 'sending'}
                                                disabled={state?.status === 'sending'}
                                                icon={state?.status === 'sent'
                                                    ? <Check size={14} strokeWidth={2.5} />
                                                    : <Send size={14} strokeWidth={2.5} />}
                                                onClick={() => handleSend(person)}
                                                className="shrink-0"
                                            >
                                                {state?.status === 'sent' ? 'Sent' : state?.status === 'failed' ? 'Retry' : 'Send'}
                                            </AdminButton>
                                        </div>

                                        {state?.status === 'failed' && (
                                            <div className={`mt-3 rounded-lg border px-3 py-2.5 ${t.warningBg}`}>
                                                <p className={`text-[12px] font-semibold leading-snug ${t.warning}`}>{state.message}</p>
                                                {state.fallbackHref && (
                                                    <a
                                                        href={state.fallbackHref}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={`inline-flex items-center gap-1.5 mt-2 text-[12px] font-bold ${t.accent} hover:underline`}
                                                    >
                                                        <MessageCircle size={13} strokeWidth={2.5} />
                                                        Open WhatsApp with the message ready
                                                        <ExternalLink size={11} strokeWidth={2.5} />
                                                    </a>
                                                )}
                                            </div>
                                        )}

                                        {state?.status === 'sent' && (
                                            <p className={`mt-2 text-[12px] font-semibold ${t.success}`}>{state.message}</p>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* ── QR ──────────────────────────────────────────────── */}
                    <h3 className={`text-[11px] font-bold uppercase tracking-[0.12em] mb-1 ${t.muted}`}>Scan or print</h3>
                    <p className={`text-[12px] mb-3 ${t.faint}`}>
                        {token.role === 'kitchen'
                            ? 'Hold this up to the kitchen tablet, then have them add it to the home screen.'
                            : 'Have the rider scan this from your screen, then add it to their home screen.'}
                    </p>

                    <div className={`rounded-xl border p-4 flex flex-col items-center gap-3 ${t.border}`}>
                        {qr ? (
                            /* eslint-disable-next-line @next/next/no-img-element -- data: URL generated at runtime, next/image cannot optimise it */
                            <img src={qr} alt={`QR code for ${token.label}`} className="w-[180px] h-[180px] rounded-lg" />
                        ) : qrFailed ? (
                            <p className={`text-[13px] font-semibold py-10 ${t.muted}`}>QR code could not be generated. Copy the link instead.</p>
                        ) : (
                            <div className={`w-[180px] h-[180px] rounded-lg animate-pulse ${t.tableHeader}`} />
                        )}

                        {qr && (
                            <a
                                href={qr}
                                download={`dormers-${token.role}-${token.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`}
                                className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold tracking-[0.04em] uppercase transition-all duration-150 ${t.sidebarItem} border ${t.border}`}
                            >
                                <Download size={14} strokeWidth={2.5} />
                                Download
                            </a>
                        )}
                    </div>
                </div>
            </div>

            <div className={`shrink-0 px-6 py-4 border-t ${t.border}`}>
                <AdminButton variant="ghost" onClick={onClose} className="w-full">Done</AdminButton>
            </div>
        </AdminModal>
    )
}
