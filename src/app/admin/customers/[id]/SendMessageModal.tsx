'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Send, ChevronLeft, Check, AlertTriangle, X } from 'lucide-react'
import { useAdminTheme } from '../../_components/AdminThemeProvider'
import { AdminModal } from '../../_components/AdminModal'
import { AdminButton } from '../../_components/AdminButton'
import { sendCustomerEmail } from '../../reviews/email-actions'
import type { AdminEmailLogEntry } from '@/infra/supabase/reviews-repo'

interface Props {
    customerId: string
    toEmail: string | null
    recentEmails: AdminEmailLogEntry[]
}

export function SendMessageButton({ customerId, toEmail, recentEmails }: Props) {
    const { t } = useAdminTheme()
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                type="button"
                onClick={() => toEmail && setOpen(true)}
                disabled={!toEmail}
                title={toEmail ? `Email ${toEmail}` : 'No email on file'}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-[0.04em] border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${t.card} ${t.accent} ring-1 ring-[#f57f20]/20 hover:ring-[#f57f20]/40`}
            >
                <Mail size={14} strokeWidth={2.2} /> Send message
            </button>
            {open && toEmail && (
                <Composer customerId={customerId} toEmail={toEmail} recentEmails={recentEmails} onClose={() => setOpen(false)} />
            )}
        </>
    )
}

function Composer({ customerId, toEmail, recentEmails, onClose }: { customerId: string; toEmail: string; recentEmails: AdminEmailLogEntry[]; onClose: () => void }) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [step, setStep] = useState<'compose' | 'confirm' | 'sent'>('compose')
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [includeSupport, setIncludeSupport] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useTransition()

    const canSend = subject.trim().length > 0 && body.trim().length > 0

    function send() {
        setError(null)
        start(async () => {
            const res = await sendCustomerEmail(customerId, subject, body, includeSupport)
            if (res.ok) {
                setStep('sent')
                router.refresh() // pull the updated sent-history on next render
            } else {
                setError(res.message)
                setStep('compose')
            }
        })
    }

    return (
        <AdminModal label="Send message to customer" maxW="max-w-[560px]" onBackdrop={onClose}>
            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${t.border}`}>
                <div className="flex items-center gap-2">
                    <Mail size={16} strokeWidth={2.2} className={t.accent} />
                    <span className={`text-[14px] font-black tracking-tight ${t.heading}`}>Send a message</span>
                </div>
                <button type="button" onClick={onClose} className={`w-7 h-7 flex items-center justify-center rounded-lg ${t.muted} hover:${t.heading}`} aria-label="Close">
                    <X size={16} strokeWidth={2.2} />
                </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto">
                {step === 'sent' ? (
                    <div className="flex flex-col items-center text-center py-6">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${t.successBg} ${t.success}`}>
                            <Check size={24} strokeWidth={2.6} />
                        </div>
                        <div className={`text-[15px] font-black ${t.heading}`}>Email sent</div>
                        <div className={`text-[12px] font-semibold mt-1 ${t.muted}`}>Delivered to {toEmail} as an on-brand Dormers email.</div>
                        <div className="mt-5"><AdminButton variant="ghost" onClick={onClose}>Done</AdminButton></div>
                    </div>
                ) : step === 'confirm' ? (
                    <div>
                        <div className={`flex items-start gap-2 p-3 rounded-lg mb-4 ${t.warningBg} ${t.warning}`}>
                            <AlertTriangle size={15} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                            <span className="text-[12px] font-bold">This sends a real email to the customer right now. Double-check before sending.</span>
                        </div>
                        <Field label="To"><span className={`text-[13px] font-bold ${t.heading}`}>{toEmail}</span></Field>
                        <Field label="Subject"><span className={`text-[13px] font-bold ${t.heading}`}>{subject.trim()}</span></Field>
                        <Field label="Message">
                            <p className={`text-[12px] leading-relaxed whitespace-pre-wrap ${t.body} max-h-[180px] overflow-y-auto`}>{body.trim()}</p>
                        </Field>
                        <div className={`text-[11px] font-semibold ${t.faint} mt-1`}>
                            {includeSupport ? 'Includes the “Chat with Support” box.' : 'No support box.'} Renders inside the branded Dormers email shell.
                        </div>
                        {error && <div className={`mt-3 text-[12px] font-bold ${t.danger}`}>{error}</div>}
                        <div className="flex items-center justify-between mt-5">
                            <AdminButton variant="ghost" icon={<ChevronLeft size={14} />} onClick={() => setStep('compose')} disabled={pending}>Back</AdminButton>
                            <AdminButton variant="primary" icon={<Send size={14} />} loading={pending} onClick={send}>Send now</AdminButton>
                        </div>
                    </div>
                ) : (
                    <div>
                        <Field label="To"><span className={`text-[13px] font-bold ${t.heading}`}>{toEmail}</span></Field>
                        <Field label="Subject">
                            <input
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                maxLength={200}
                                placeholder="e.g. A quick note about your delivery"
                                className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold outline-none ${t.input} ${t.inputFocus}`}
                            />
                        </Field>
                        <Field label="Message">
                            <textarea
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                rows={8}
                                maxLength={5000}
                                placeholder="Write your message… Blank lines start new paragraphs. It's wrapped in the branded Dormers email automatically."
                                className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold leading-relaxed outline-none ${t.input} ${t.inputFocus}`}
                            />
                        </Field>
                        <button
                            type="button"
                            onClick={() => setIncludeSupport(v => !v)}
                            className="flex items-center gap-2 mt-1"
                        >
                            <span className={`w-4 h-4 rounded flex items-center justify-center border ${includeSupport ? 'bg-[#f57f20] border-[#f57f20]' : t.border}`}>
                                {includeSupport && <Check size={11} strokeWidth={3} className="text-white" />}
                            </span>
                            <span className={`text-[12px] font-semibold ${t.body}`}>Include the “Chat with Support” box</span>
                        </button>
                        <div className={`text-[11px] font-semibold ${t.faint} mt-2`}>
                            Sends as an on-brand Dormers email — orange header, your message, “Team Dormers” sign-off.
                        </div>
                        {error && <div className={`mt-3 text-[12px] font-bold ${t.danger}`}>{error}</div>}

                        {recentEmails.length > 0 && (
                            <div className={`mt-4 pt-3 border-t ${t.border}`}>
                                <div className={`text-[9px] font-black uppercase tracking-[0.12em] mb-2 ${t.faint}`}>Recently sent</div>
                                <div className="flex flex-col gap-1.5">
                                    {recentEmails.slice(0, 4).map(e => (
                                        <div key={e.id} className="flex items-center justify-between gap-2">
                                            <span className={`text-[12px] font-semibold truncate ${t.body}`}>{e.subject}</span>
                                            <span className="flex items-center gap-2 shrink-0">
                                                {e.status === 'failed'
                                                    ? <span className={`text-[10px] font-black uppercase ${t.danger}`}>Failed</span>
                                                    : <span className={`text-[10px] font-black uppercase ${t.success}`}>Sent</span>}
                                                <span className={`text-[10px] tabular-nums ${t.faint}`}>{shortDate(e.createdAt)}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between mt-5">
                            <AdminButton variant="ghost" onClick={onClose}>Cancel</AdminButton>
                            <AdminButton variant="primary" icon={<Send size={14} />} onClick={() => { setError(null); setStep('confirm') }} disabled={!canSend}>Review &amp; send</AdminButton>
                        </div>
                    </div>
                )}
            </div>
        </AdminModal>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    const { t } = useAdminTheme()
    return (
        <div className="mb-3">
            <div className={`text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>{label}</div>
            {children}
        </div>
    )
}

function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' })
}
