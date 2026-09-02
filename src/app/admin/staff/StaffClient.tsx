'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Copy, Check, RotateCw, Ban, ThumbsUp, ThumbsDown, UserMinus, Mail, MessageCircle } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { AdminBadge } from '../_components/AdminBadge'
import { AdminModal } from '../_components/AdminModal'
import {
    addStaffMember, regenerateStaffCode, revokeStaffInvite,
    approveStaffRenewal, declineStaffRenewal, offboardStaffMember,
    sendStaffInvite,
} from './actions'
import { COUNTRIES } from '@/app/onboarding/countries'

export interface StaffRow {
    id: string
    name: string
    email: string
    whatsapp_number: string
    status: 'invited' | 'active' | 'ended'
    code_expires_at: string
    claimed_at: string | null
    customer_id: string | null
    created_at: string
    ended_at: string | null
}

/** A staff renewal waiting at the approval gate. */
export interface PendingRenewal {
    subscriptionId: string
    staffName: string
    weekType: '5DAYS' | '6DAYS'
    queuedAt: string
    /** AED prepaid for the cycle (0 on free 5-day renewals). */
    paidAed: number
}

export function StaffClient({ rows, pendingRenewals }: { rows: StaffRow[]; pendingRenewals: PendingRenewal[] }) {
    const { t } = useAdminTheme()
    const [showAdd, setShowAdd] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
    // Code reveal — shown exactly once after add/regenerate; closing it is final.
    const [reveal, setReveal] = useState<{ name: string; code: string } | null>(null)

    const invited = rows.filter(r => r.status === 'invited')
    const active = rows.filter(r => r.status === 'active')
    const ended = rows.filter(r => r.status === 'ended')

    return (
        <div>
            <div className="flex items-start justify-between gap-3 mb-1">
                <h1 className={`text-xl font-black tracking-tight ${t.heading}`}>Staff</h1>
                <AdminButton icon={<Plus size={13} />} onClick={() => { setResult(null); setShowAdd(true) }}>
                    Add Intern
                </AdminButton>
            </div>
            <p className={`text-[13px] font-medium mb-5 ${t.muted}`}>
                Interns paid in meals. Register them here, send the one-time code over WhatsApp — they claim it, onboard themselves, and pick their plan.
            </p>

            {result && (
                <div className={`mb-4 px-3 py-2 rounded-lg text-[12px] font-bold border ${result.ok ? t.successBg : t.dangerBg} ${result.ok ? t.success : t.danger}`}>
                    {result.message}
                </div>
            )}

            {rows.length === 0 && (
                <div className={`${t.card} rounded-xl p-8 text-center`}>
                    <p className={`text-[13px] font-bold ${t.body}`}>No staff yet</p>
                    <p className={`text-[12px] mt-1 ${t.muted}`}>Add your first intern — you&apos;ll get a one-time claim code to send them.</p>
                </div>
            )}

            {pendingRenewals.length > 0 && (
                <Section title="Renewals awaiting your approval" t={t}>
                    {pendingRenewals.map(p => (
                        <RenewalCard key={p.subscriptionId} renewal={p} t={t} onResult={setResult} />
                    ))}
                </Section>
            )}

            {invited.length > 0 && (
                <Section title="Invited — waiting to claim" t={t}>
                    {invited.map(r => (
                        <StaffCard key={r.id} row={r} t={t} onResult={setResult} onReveal={setReveal} />
                    ))}
                </Section>
            )}

            {active.length > 0 && (
                <Section title="Active staff" t={t}>
                    {active.map(r => (
                        <StaffCard key={r.id} row={r} t={t} onResult={setResult} onReveal={setReveal} />
                    ))}
                </Section>
            )}

            {ended.length > 0 && (
                <Section title="Ended" t={t}>
                    {ended.map(r => (
                        <StaffCard key={r.id} row={r} t={t} onResult={setResult} onReveal={setReveal} />
                    ))}
                </Section>
            )}

            {showAdd && (
                <AddStaffModal
                    onClose={() => setShowAdd(false)}
                    onDone={(r, code, name) => {
                        setShowAdd(false)
                        setResult(r)
                        if (r.ok && code) setReveal({ name, code })
                    }}
                />
            )}

            {reveal && <CodeRevealModal name={reveal.name} code={reveal.code} onClose={() => setReveal(null)} />}
        </div>
    )
}

function Section({ title, t, children }: { title: string; t: ReturnType<typeof useAdminTheme>['t']; children: React.ReactNode }) {
    return (
        <div className="mb-5">
            <h2 className={`text-[10px] font-black tracking-[0.14em] uppercase mb-2 ${t.muted}`}>{title}</h2>
            <div className="flex flex-col gap-2">{children}</div>
        </div>
    )
}

/** Plain-English wait, so the oldest renewal is obvious at a glance. */
function waitedFor(queuedAtIso: string): string {
    const days = Math.floor((Date.now() - new Date(queuedAtIso).getTime()) / 86400000)
    if (days <= 0) return 'queued today'
    if (days === 1) return 'waiting since yesterday'
    return `waiting ${days} days`
}

function RenewalCard({ renewal, t, onResult }: {
    renewal: PendingRenewal
    t: ReturnType<typeof useAdminTheme>['t']
    onResult: (r: { ok: boolean; message: string }) => void
}) {
    const [isPending, startTransition] = useTransition()

    const approve = () => {
        startTransition(async () => onResult(await approveStaffRenewal(renewal.subscriptionId)))
    }
    const decline = () => {
        const warn = renewal.paidAed > 0
            ? `Decline ${renewal.staffName}'s renewal? Their AED ${renewal.paidAed} Saturday payment is refunded in full first.`
            : `Decline ${renewal.staffName}'s renewal? The queued cycle is cancelled.`
        if (!window.confirm(warn)) return
        startTransition(async () => onResult(await declineStaffRenewal(renewal.subscriptionId)))
    }

    return (
        <div className={`${t.card} rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-[#f57f20]`}>
            <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[13px] font-bold ${t.heading}`}>{renewal.staffName}</span>
                    <AdminBadge variant="pending">Awaiting approval</AdminBadge>
                </div>
                <div className={`text-[12px] mt-1 ${t.muted}`}>
                    {renewal.weekType === '6DAYS' ? `6 days · prepaid AED ${renewal.paidAed}` : '5 days · free'}
                    {/* How long they've been waiting, not a start date. A pending
                        renewal's start_date is only a guess at when you'd get to
                        it — approving is what creates the real one, and the
                        confirmation toast names it. */}
                    {` · ${waitedFor(renewal.queuedAt)}`}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <AdminButton loading={isPending} icon={<ThumbsUp size={13} />} onClick={approve}>
                    Approve
                </AdminButton>
                <AdminButton variant="danger" loading={isPending} icon={<ThumbsDown size={13} />} onClick={decline}>
                    Decline
                </AdminButton>
            </div>
        </div>
    )
}

function StaffCard({ row, t, onResult, onReveal }: {
    row: StaffRow
    t: ReturnType<typeof useAdminTheme>['t']
    onResult: (r: { ok: boolean; message: string }) => void
    onReveal: (r: { name: string; code: string }) => void
}) {
    const [isPending, startTransition] = useTransition()
    const codeExpired = row.status === 'invited' && new Date(row.code_expires_at) < new Date()

    const handleRegenerate = () => {
        if (!window.confirm(`Issue a new code for ${row.name}? The old one stops working immediately.`)) return
        startTransition(async () => {
            const res = await regenerateStaffCode(row.id)
            onResult(res)
            if (res.ok && res.code) onReveal({ name: row.name, code: res.code })
        })
    }

    const handleRevoke = () => {
        if (!window.confirm(`Revoke the invite for ${row.name}? Their code dies and they can't join unless you re-add them.`)) return
        startTransition(async () => onResult(await revokeStaffInvite(row.id)))
    }

    const handleOffboard = () => {
        if (!window.confirm(`Offboard ${row.name}? Their plan ends TODAY and any unused prepaid Saturdays are refunded to their card. This can't be undone.`)) return
        startTransition(async () => onResult(await offboardStaffMember(row.id)))
    }

    return (
        <div className={`${t.card} rounded-xl p-4 flex flex-wrap items-center justify-between gap-3`}>
            <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[13px] font-bold ${t.heading}`}>{row.name}</span>
                    <AdminBadge variant={row.status === 'active' ? 'active' : row.status === 'invited' ? (codeExpired ? 'warning' : 'pending') : 'ended'}>
                        {row.status === 'invited' ? (codeExpired ? 'Code expired' : 'Invited') : row.status === 'active' ? 'Active' : 'Ended'}
                    </AdminBadge>
                </div>
                <div className={`text-[12px] mt-1 ${t.muted}`}>
                    {row.email} · {row.whatsapp_number}
                    {row.status === 'invited' && !codeExpired && (
                        <span className={t.faint}> · code valid until {new Date(row.code_expires_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}</span>
                    )}
                    {row.claimed_at && (
                        <span className={t.faint}> · joined {new Date(row.claimed_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}</span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {row.status === 'active' && row.customer_id && (
                    <Link
                        href={`/admin/customers/${row.customer_id}`}
                        className={`text-[12px] font-bold underline underline-offset-2 ${t.body}`}
                    >
                        View customer →
                    </Link>
                )}
                {row.status === 'active' && (
                    <AdminButton variant="danger" loading={isPending} icon={<UserMinus size={13} />} onClick={handleOffboard}>
                        Offboard
                    </AdminButton>
                )}
                {row.status === 'invited' && (
                    <>
                        {/* Each send mints a FRESH code server-side and fires it
                            directly — nothing to copy, older codes die. */}
                        <AdminButton loading={isPending} icon={<Mail size={13} />} onClick={() => {
                            startTransition(async () => onResult(await sendStaffInvite(row.id, 'email')))
                        }}>
                            Email code
                        </AdminButton>
                        <AdminButton loading={isPending} icon={<MessageCircle size={13} />} onClick={() => {
                            startTransition(async () => onResult(await sendStaffInvite(row.id, 'whatsapp')))
                        }}>
                            WhatsApp code
                        </AdminButton>
                        <AdminButton variant="ghost" loading={isPending} icon={<RotateCw size={13} />} onClick={handleRegenerate}>
                            Show new code
                        </AdminButton>
                        <AdminButton variant="danger" loading={isPending} icon={<Ban size={13} />} onClick={handleRevoke}>
                            Revoke
                        </AdminButton>
                    </>
                )}
            </div>
        </div>
    )
}

function AddStaffModal({ onClose, onDone }: {
    onClose: () => void
    onDone: (r: { ok: boolean; message: string }, code: string | undefined, name: string) => void
}) {
    const { t } = useAdminTheme()
    const [isPending, startTransition] = useTransition()
    // Most interns are UAE residents — +971 is the default, everything else
    // is one dropdown away (full ISO list shared with onboarding's picker).
    const [dial, setDial] = useState('+971')

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const name = (fd.get('name') as string).trim()
        // Compose E.164: dial code + local digits, trunk zero stripped
        // ("050 123 4567" with +971 → +971501234567).
        const local = (fd.get('whatsapp_local') as string).replace(/\D/g, '').replace(/^0+/, '')
        startTransition(async () => {
            const res = await addStaffMember(name, fd.get('email') as string, `${dial}${local}`)
            onDone(res, res.code, name)
        })
    }

    const fieldCls = `w-full px-3 py-2 rounded-lg border text-[13px] font-medium ${t.input} ${t.inputFocus}`

    return (
        <AdminModal label="Add intern" maxW="max-w-[440px]" onBackdrop={onClose}>
            <form onSubmit={handleSubmit} className="p-4">
                <h3 className={`text-[15px] font-black mb-1 ${t.heading}`}>Add intern</h3>
                <p className={`text-[12px] mb-4 ${t.muted}`}>
                    The code only works with this exact email and WhatsApp number — their OTP at onboarding enforces the phone.
                </p>
                <div className="flex flex-col gap-3 mb-4">
                    <div>
                        <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>Full name</label>
                        <input name="name" required className={fieldCls} placeholder="Aman Verma" />
                    </div>
                    <div>
                        <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>Email (their real, personal one)</label>
                        <input name="email" type="email" required className={fieldCls} placeholder="aman@gmail.com" />
                    </div>
                    <div>
                        <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>WhatsApp number</label>
                        <div className="flex gap-2">
                            <DialCodeCombobox dial={dial} onSelect={setDial} />
                            <input
                                name="whatsapp_local"
                                required
                                inputMode="tel"
                                className={fieldCls}
                                placeholder="50 123 4567"
                            />
                        </div>
                        <p className={`mt-1 text-[11px] ${t.faint}`}>Saved as {dial} + the number (leading 0 dropped automatically).</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <AdminButton type="submit" loading={isPending}>Register &amp; get code</AdminButton>
                    <AdminButton variant="ghost" type="button" onClick={onClose}>Cancel</AdminButton>
                </div>
            </form>
        </AdminModal>
    )
}

// Searchable dial-code picker — type a country name ("pakistan") or the
// code itself ("92" / "+92") and pick from the filtered list. Closed state
// shows the flag + dial; opening swaps it for a search input in place.
function DialCodeCombobox({ dial, onSelect }: { dial: string; onSelect: (dial: string) => void }) {
    const { t } = useAdminTheme()
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const wrapRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const selected = COUNTRIES.find(c => c.dial === dial)

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return COUNTRIES
        const digits = q.replace(/[^\d]/g, '')
        return COUNTRIES.filter(c =>
            c.name.toLowerCase().includes(q)
            || (digits.length > 0 && c.dial.slice(1).startsWith(digits)),
        )
    }, [query])

    useEffect(() => {
        if (!open) return
        inputRef.current?.focus()
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false); setQuery('')
            }
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [open])

    const pick = (d: string) => { onSelect(d); setOpen(false); setQuery('') }

    return (
        <div ref={wrapRef} className="relative shrink-0 w-[118px]">
            {open ? (
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) pick(matches[0].dial) }
                        if (e.key === 'Escape') { setOpen(false); setQuery('') }
                    }}
                    placeholder="Search…"
                    aria-label="Search country or code"
                    className={`w-full px-2 py-2 rounded-lg border text-[13px] font-medium ${t.input} ${t.inputFocus}`}
                />
            ) : (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label={`Country code ${dial} — click to search`}
                    className={`w-full px-2 py-2 rounded-lg border text-[13px] font-medium text-left ${t.input} ${t.inputFocus}`}
                >
                    {selected ? `${selected.flag} ${selected.dial}` : dial}
                </button>
            )}
            {open && (
                <ul
                    role="listbox"
                    className={`absolute z-20 mt-1 left-0 w-[240px] max-h-[200px] overflow-y-auto rounded-lg border shadow-lg ${t.card}`}
                >
                    {matches.length === 0 && (
                        <li className={`px-3 py-2 text-[12px] ${t.faint}`}>No match — try the dial code</li>
                    )}
                    {matches.slice(0, 60).map(c => (
                        <li key={c.code}>
                            <button
                                type="button"
                                onClick={() => pick(c.dial)}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] font-medium ${t.body} hover:opacity-70`}
                            >
                                <span className="truncate">{c.flag} {c.name}</span>
                                <span className={`shrink-0 tabular-nums font-bold ${t.heading}`}>{c.dial}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

function CodeRevealModal({ name, code, onClose }: { name: string; code: string; onClose: () => void }) {
    const { t } = useAdminTheme()
    const [copied, setCopied] = useState(false)

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
        } catch { /* clipboard blocked — code is visible to copy by hand */ }
    }

    return (
        <AdminModal label="Claim code" maxW="max-w-[420px]" onBackdrop={() => { /* force the button — accidental backdrop tap loses the code forever */ }}>
            <div className="p-5 text-center">
                <h3 className={`text-[15px] font-black ${t.heading}`}>Code for {name}</h3>
                <p className={`text-[12px] mt-1 mb-4 ${t.muted}`}>
                    Shown <strong>once</strong> — send it to them on WhatsApp now. If it&apos;s lost, issue a new one.
                </p>
                <button
                    type="button"
                    onClick={copy}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl border text-[22px] font-black tracking-[0.2em] tabular-nums ${t.card} ${t.heading}`}
                >
                    {code}
                    {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} className="opacity-50" />}
                </button>
                <p className={`text-[11px] mt-2 ${t.faint}`}>Tap to copy · valid 7 days · claim link: dormers.ae/staff/claim</p>
                <div className="mt-4">
                    <AdminButton onClick={onClose}>I&apos;ve sent it — close</AdminButton>
                </div>
            </div>
        </AdminModal>
    )
}
