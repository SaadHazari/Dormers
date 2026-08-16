'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    Plus, Share2, RotateCw, PowerOff, Trash2, AlertTriangle,
    ChefHat, Bike, KeyRound, Check,
} from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminButton } from '../_components/AdminButton'
import { AdminEmptyState } from '../_components/AdminEmptyState'
import { ShareLinkModal } from './ShareLinkModal'
import {
    createOpsToken, rotateOpsToken, revokeOpsToken,
    addCrewMember, toggleCrewConfirm, removeCrewMember,
} from './actions'
import { shortLink, timeAgo, shortDate, prettyPhone, TEAM_LABEL, TEAM_DESCRIPTION } from './format'
import type { OpsRole } from '@/contexts/ops/domain/ops-token'
import type { OpsToken, CrewMember } from './page'

const TEAM_ICON: Record<OpsRole, React.ReactNode> = {
    kitchen: <ChefHat size={13} strokeWidth={2.5} />,
    rider: <Bike size={13} strokeWidth={2.5} />,
}

/** Rotate and switch-off both lock people out, so both stop and ask first. */
interface Confirming {
    kind: 'rotate' | 'revoke'
    token: OpsToken
}

export function OpsTokensClient({ tokens, crew }: { tokens: OpsToken[]; crew: CrewMember[] }) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [, startTransition] = useTransition()

    const [busyId, setBusyId] = useState<string | null>(null)
    const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

    const [creating, setCreating] = useState(false)
    const [confirming, setConfirming] = useState<Confirming | null>(null)
    const [sharing, setSharing] = useState<{ token: OpsToken; headline?: string } | null>(null)

    const kitchen = tokens.filter(k => k.role === 'kitchen')
    const riders = tokens.filter(k => k.role === 'rider')

    /**
     * After a create or rotate the server has a URL we will never be able to
     * show again from the list without another round trip, so we hand it
     * straight to the share panel rather than making the admin go find it.
     */
    function openShareForNewUrl(url: string, id: string, role: OpsRole, label: string, headline: string) {
        setSharing({
            token: { id, role, label, url, created_at: new Date().toISOString(), last_used_at: null },
            headline,
        })
    }

    function handleConfirm() {
        if (!confirming) return
        const { kind, token } = confirming
        setBusyId(token.id)
        setNotice(null)
        startTransition(async () => {
            try {
                if (kind === 'rotate') {
                    const res = await rotateOpsToken(token.id)
                    setConfirming(null)
                    if (res.ok && res.newUrl && res.newId) {
                        openShareForNewUrl(res.newUrl, res.newId, token.role, token.label, res.message)
                    } else {
                        setNotice({ tone: 'bad', text: res.message })
                    }
                } else {
                    const res = await revokeOpsToken(token.id)
                    setConfirming(null)
                    setNotice({ tone: res.ok ? 'ok' : 'bad', text: res.message })
                }
                router.refresh()
            } finally {
                setBusyId(null)
            }
        })
    }

    return (
        <div>
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                    <h1 className={`text-[20px] font-extrabold tracking-tight ${t.heading}`}>Access Links</h1>
                    <p className={`text-[13px] mt-1 max-w-[52ch] ${t.muted}`}>
                        One link per kitchen station or rider. Share it, and they are in.
                    </p>
                </div>
                <AdminButton icon={<Plus size={15} strokeWidth={2.5} />} onClick={() => setCreating(true)}>
                    New link
                </AdminButton>
            </div>

            <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 mb-8 ${t.warningBg}`}>
                <AlertTriangle size={15} strokeWidth={2.5} className={`${t.warning} mt-px shrink-0`} />
                <p className={`text-[12px] font-semibold leading-relaxed ${t.warning}`}>
                    These links have no password. Anyone holding one can open it. Rotate a link when
                    someone leaves, and switch off any link nobody is using.
                </p>
            </div>

            {notice && (
                <div className={`rounded-xl border px-3.5 py-3 mb-6 ${notice.tone === 'ok' ? t.successBg : t.dangerBg}`}>
                    <p className={`text-[13px] font-semibold leading-snug ${notice.tone === 'ok' ? t.success : t.danger}`}>
                        {notice.text}
                    </p>
                </div>
            )}

            {/* ── Links ───────────────────────────────────────────────────── */}
            {tokens.length === 0 ? (
                <AdminEmptyState
                    icon={<KeyRound size={26} strokeWidth={2} className={t.faint} />}
                    title="No links yet"
                    description="Create one for the kitchen display, then one for each rider."
                    action={<AdminButton icon={<Plus size={15} strokeWidth={2.5} />} onClick={() => setCreating(true)}>New link</AdminButton>}
                />
            ) : (
                <div className="flex flex-col gap-8">
                    {kitchen.length > 0 && (
                        <LinkGroup
                            title="Kitchen"
                            tokens={kitchen}
                            busyId={busyId}
                            onShare={tok => setSharing({ token: tok })}
                            onRotate={tok => setConfirming({ kind: 'rotate', token: tok })}
                            onRevoke={tok => setConfirming({ kind: 'revoke', token: tok })}
                        />
                    )}
                    {riders.length > 0 && (
                        <LinkGroup
                            title="Riders"
                            tokens={riders}
                            busyId={busyId}
                            onShare={tok => setSharing({ token: tok })}
                            onRotate={tok => setConfirming({ kind: 'rotate', token: tok })}
                            onRevoke={tok => setConfirming({ kind: 'revoke', token: tok })}
                        />
                    )}
                </div>
            )}

            {/* ── Crew ────────────────────────────────────────────────────── */}
            <CrewSection crew={crew} />

            {/* ── Overlays ────────────────────────────────────────────────── */}
            {creating && (
                <NewLinkModal
                    onClose={() => setCreating(false)}
                    onCreated={(url, id, role, label, msg) => {
                        setCreating(false)
                        openShareForNewUrl(url, id, role, label, msg)
                        router.refresh()
                    }}
                />
            )}

            {confirming && (
                <AdminModal label="Confirm" onBackdrop={() => setConfirming(null)}>
                    <div className="p-6">
                        <h2 className={`text-[17px] font-extrabold mb-2 ${t.heading}`}>
                            {confirming.kind === 'rotate' ? `Replace the ${confirming.token.label} link?` : `Switch off ${confirming.token.label}?`}
                        </h2>
                        <p className={`text-[13px] leading-relaxed mb-6 ${t.muted}`}>
                            {confirming.kind === 'rotate'
                                ? 'The current link stops working straight away. Anyone using it is locked out until you send them the new one, and any printed QR code for it is dead.'
                                : 'The link stops working straight away and disappears from this page. There is no undo. Create a new link if you need one later.'}
                        </p>
                        <div className="flex gap-3">
                            <AdminButton variant="ghost" onClick={() => setConfirming(null)} className="flex-1">
                                Cancel
                            </AdminButton>
                            <AdminButton
                                variant={confirming.kind === 'rotate' ? 'primary' : 'danger'}
                                loading={busyId === confirming.token.id}
                                onClick={handleConfirm}
                                className="flex-1"
                            >
                                {confirming.kind === 'rotate' ? 'Replace link' : 'Switch off'}
                            </AdminButton>
                        </div>
                    </div>
                </AdminModal>
            )}

            {sharing && (
                <ShareLinkModal
                    token={sharing.token}
                    crew={crew}
                    headline={sharing.headline}
                    onClose={() => setSharing(null)}
                />
            )}
        </div>
    )
}

// ── Link group ──────────────────────────────────────────────────────────────

function LinkGroup({ title, tokens, busyId, onShare, onRotate, onRevoke }: {
    title: string
    tokens: OpsToken[]
    busyId: string | null
    onShare: (t: OpsToken) => void
    onRotate: (t: OpsToken) => void
    onRevoke: (t: OpsToken) => void
}) {
    const { t } = useAdminTheme()

    return (
        <section>
            <h2 className={`text-[11px] font-bold uppercase tracking-[0.12em] mb-3 ${t.muted}`}>{title}</h2>
            <div className="flex flex-col gap-3">
                {tokens.map(tok => (
                    <div key={tok.id} className={`rounded-xl p-5 ${t.card}`}>
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full border ${t.accentBg} ${t.accent}`}>
                                        {TEAM_ICON[tok.role]}
                                        {TEAM_LABEL[tok.role]}
                                    </span>
                                </div>
                                <p className={`text-[16px] font-extrabold tracking-tight ${t.heading}`}>{tok.label}</p>
                                <p className={`font-mono text-[12px] mt-1.5 ${t.muted}`}>{shortLink(tok.url)}</p>
                                <p className={`text-[12px] mt-2 ${t.faint}`}>
                                    {timeAgo(tok.last_used_at)} · Created {shortDate(tok.created_at)}
                                </p>
                            </div>

                            {/* Three tiers, not three equal buttons. Share is what
                                you came for; rotate is occasional; switching a
                                link off for good sits quietly underneath so it
                                stays findable without shouting on every row. */}
                            <div className="flex flex-col items-start sm:items-end gap-2.5 shrink-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <AdminButton icon={<Share2 size={14} strokeWidth={2.5} />} onClick={() => onShare(tok)}>
                                        Share
                                    </AdminButton>
                                    <AdminButton
                                        variant="ghost"
                                        icon={<RotateCw size={14} strokeWidth={2.5} />}
                                        disabled={busyId === tok.id}
                                        onClick={() => onRotate(tok)}
                                    >
                                        Rotate
                                    </AdminButton>
                                </div>
                                <button
                                    type="button"
                                    disabled={busyId === tok.id}
                                    onClick={() => onRevoke(tok)}
                                    className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-1 py-0.5 rounded transition-opacity duration-150 opacity-70 hover:opacity-100 hover:underline disabled:opacity-40 ${t.danger}`}
                                >
                                    <PowerOff size={12} strokeWidth={2.5} />
                                    Switch off for good
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

// ── New link ────────────────────────────────────────────────────────────────

function NewLinkModal({ onClose, onCreated }: {
    onClose: () => void
    onCreated: (url: string, id: string, role: OpsRole, label: string, message: string) => void
}) {
    const { t } = useAdminTheme()
    const [role, setRole] = useState<OpsRole>('rider')
    const [label, setLabel] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    async function submit() {
        setSaving(true)
        setError(null)
        const res = await createOpsToken(role, label)
        setSaving(false)
        if (res.ok && res.newUrl && res.newId) onCreated(res.newUrl, res.newId, role, label.trim(), res.message)
        else setError(res.message)
    }

    return (
        <AdminModal label="New access link" onBackdrop={onClose}>
            <div className="p-6">
                <h2 className={`text-[17px] font-extrabold mb-5 ${t.heading}`}>New access link</h2>

                <p className={`text-[11px] font-bold uppercase tracking-[0.12em] mb-2 ${t.muted}`}>What does it open</p>
                <div className="grid grid-cols-2 gap-2 mb-5">
                    {(['kitchen', 'rider'] as OpsRole[]).map(r => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => setRole(r)}
                            className={`text-left rounded-xl border p-3.5 transition-all duration-150 ${role === r ? t.cardActive : `${t.card} ${t.cardHover}`}`}
                        >
                            <span className={`inline-flex items-center gap-1.5 text-[13px] font-extrabold ${role === r ? t.accent : t.heading}`}>
                                {TEAM_ICON[r]}
                                {TEAM_LABEL[r]}
                            </span>
                            <span className={`block text-[11px] leading-snug mt-1 ${t.faint}`}>{TEAM_DESCRIPTION[r]}</span>
                        </button>
                    ))}
                </div>

                <label className={`block text-[11px] font-bold uppercase tracking-[0.12em] mb-2 ${t.muted}`}>
                    Name it
                </label>
                <input
                    autoFocus
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && label.trim()) submit() }}
                    placeholder={role === 'kitchen' ? 'Main kitchen' : 'Ali'}
                    className={`w-full text-[14px] px-3.5 py-2.5 rounded-xl border mb-1 ${t.input} ${t.inputFocus}`}
                />
                <p className={`text-[12px] mb-5 ${t.faint}`}>Only you see this. It is how you tell links apart.</p>

                {error && (
                    <div className={`rounded-xl border px-3.5 py-2.5 mb-4 ${t.dangerBg}`}>
                        <p className={`text-[12px] font-semibold ${t.danger}`}>{error}</p>
                    </div>
                )}

                <div className="flex gap-3">
                    <AdminButton variant="ghost" onClick={onClose} className="flex-1">Cancel</AdminButton>
                    <AdminButton loading={saving} disabled={!label.trim()} onClick={submit} className="flex-1">
                        Create
                    </AdminButton>
                </div>
            </div>
        </AdminModal>
    )
}

// ── Crew ────────────────────────────────────────────────────────────────────

function CrewSection({ crew }: { crew: CrewMember[] }) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [phone, setPhone] = useState('')
    const [name, setName] = useState('')
    const [team, setTeam] = useState<OpsRole>('rider')
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [removing, setRemoving] = useState<CrewMember | null>(null)

    async function add() {
        setSaving(true)
        setError(null)
        const res = await addCrewMember(phone, name, team)
        setSaving(false)
        if (res.ok) {
            setPhone('')
            setName('')
            router.refresh()
        } else {
            setError(res.message)
        }
    }

    async function toggle(person: CrewMember) {
        setBusyId(person.id)
        await toggleCrewConfirm(person.id, !person.can_confirm)
        setBusyId(null)
        router.refresh()
    }

    async function remove() {
        if (!removing) return
        setBusyId(removing.id)
        await removeCrewMember(removing.id)
        setBusyId(null)
        setRemoving(null)
        router.refresh()
    }

    return (
        <section className="mt-14">
            <h2 className={`text-[16px] font-extrabold tracking-tight ${t.heading}`}>Ops Crew</h2>
            <p className={`text-[13px] mt-1 mb-5 max-w-[58ch] ${t.muted}`}>
                Everyone you send links to. Riders can also confirm a delivery by texting the dorm
                name to the Dormers WhatsApp number, which is the fallback for when the automatic
                notification does not land.
            </p>

            {/* Add form — its own surface so it stops reading as a search bar. */}
            <div className={`rounded-xl p-4 mb-5 ${t.card}`}>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Name"
                        className={`sm:w-[150px] text-[13px] px-3 py-2.5 rounded-xl border ${t.input} ${t.inputFocus}`}
                    />
                    <input
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && phone.trim() && name.trim()) add() }}
                        placeholder="WhatsApp number, e.g. 971504619384"
                        inputMode="tel"
                        className={`flex-1 text-[13px] px-3 py-2.5 rounded-xl border ${t.input} ${t.inputFocus}`}
                    />
                    {/* Full width on a phone so the two halves fill the row;
                        content-width on desktop where it sits inline. */}
                    <div className={`flex rounded-xl border overflow-hidden shrink-0 ${t.borderStrong}`}>
                        {(['kitchen', 'rider'] as OpsRole[]).map(r => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => setTeam(r)}
                                className={`flex-1 sm:flex-none px-3.5 py-2.5 text-[12px] font-bold transition-colors duration-150 ${team === r ? 'bg-[#f57f20] text-white' : t.sidebarItem}`}
                            >
                                {TEAM_LABEL[r]}
                            </button>
                        ))}
                    </div>
                    <AdminButton
                        loading={saving}
                        disabled={!phone.trim() || !name.trim()}
                        icon={<Plus size={15} strokeWidth={2.5} />}
                        onClick={add}
                        className="shrink-0"
                    >
                        Add
                    </AdminButton>
                </div>

                {error && <p className={`text-[12px] font-semibold mt-3 ${t.danger}`}>{error}</p>}
                {team === 'kitchen' && (
                    <p className={`text-[12px] mt-3 ${t.faint}`}>
                        Kitchen crew are added without delivery confirmation rights. Turn it on per person below if you need it.
                    </p>
                )}
            </div>

            {crew.length === 0 ? (
                <AdminEmptyState
                    title="No crew yet"
                    description="Add the kitchen lead and your riders so you can send links straight to them."
                />
            ) : (
                <div className="flex flex-col gap-2">
                    {crew.map(person => (
                        <div key={person.id} className={`rounded-xl px-4 py-3 ${t.card}`}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className={`text-[14px] font-bold truncate ${t.heading}`}>{person.name}</p>
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full border ${t.border} ${t.muted}`}>
                                            {TEAM_ICON[person.team]}
                                            {TEAM_LABEL[person.team]}
                                        </span>
                                    </div>
                                    <p className={`font-mono text-[12px] mt-0.5 ${t.muted}`}>{prettyPhone(person.phone_digits)}</p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={busyId === person.id}
                                        onClick={() => toggle(person)}
                                        className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-all duration-150 disabled:opacity-50 ${person.can_confirm ? `${t.successBg} ${t.success}` : `${t.border} ${t.muted}`}`}
                                        title="Whether this number may confirm a delivery by texting the Dormers WhatsApp number"
                                    >
                                        {person.can_confirm && <Check size={12} strokeWidth={3} />}
                                        Can confirm deliveries
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busyId === person.id}
                                        onClick={() => setRemoving(person)}
                                        aria-label={`Remove ${person.name}`}
                                        className={`p-2 rounded-full transition-colors duration-150 disabled:opacity-50 ${t.sidebarItem}`}
                                    >
                                        <Trash2 size={15} strokeWidth={2.2} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {removing && (
                <AdminModal label="Remove crew member" onBackdrop={() => setRemoving(null)}>
                    <div className="p-6">
                        <h2 className={`text-[17px] font-extrabold mb-2 ${t.heading}`}>Remove {removing.name}?</h2>
                        <p className={`text-[13px] leading-relaxed mb-6 ${t.muted}`}>
                            They come off the crew list and can no longer confirm deliveries by text. Any
                            access link already sent to them keeps working, so rotate it as well.
                        </p>
                        <div className="flex gap-3">
                            <AdminButton variant="ghost" onClick={() => setRemoving(null)} className="flex-1">Cancel</AdminButton>
                            <AdminButton variant="danger" loading={busyId === removing.id} onClick={remove} className="flex-1">
                                Remove
                            </AdminButton>
                        </div>
                    </div>
                </AdminModal>
            )}
        </section>
    )
}
