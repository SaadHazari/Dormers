'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Gift, Pencil } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import {
    updateIntakeCopy,
    updateIntakeCredits,
    setReopenTarget,
} from './actions'
import type { IntakeSettingsRow, WaitlistMember } from './page'
import type { SeasonPageData } from './season-data'
import { SeasonPlanner } from './SeasonPlanner'
import { ConfirmDialog, Section } from './season-ui'
import { formatShortDay } from '@/contexts/season/domain/season-dates'
import { OG, OG_DEEP, BODY } from '@/app/dashboard/_shared/tokens'

interface Props {
    settings: IntakeSettingsRow
    /** The CURRENT cycle's early-access list, oldest join first. */
    members: WaitlistMember[]
    season: SeasonPageData
}

const HEADLINE_MAX = 120
const BODY_MAX = 400

export function SeasonClient({ settings, members, season }: Props) {
    return (
        <div className="mx-auto w-full max-w-[1200px]">
            <SeasonPlanner
                data={season}
                members={members}
                waiting={<SavedSpots members={members} settings={settings} />}
                customerView={<CustomerView settings={settings} />}
            />
        </div>
    )
}

// ── Saved spots ──────────────────────────────────────────────────────────
// Everyone who saved a spot in the current pause: exactly the audience a
// season-reopen broadcast reaches. The restart decision is read from where
// they live, so the dorm split leads and the names follow.

function SavedSpots({ members, settings }: { members: WaitlistMember[]; settings: IntakeSettingsRow }) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const count = members.length
    const target = settings.reopenTarget

    const dormSplit = useMemo(() => {
        const counts = new Map<string, number>()
        for (const m of members) {
            const key = m.dormName ?? 'No dorm set'
            counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    }, [members])

    // The target is a note to self, never a trigger: reaching it does not reopen sales.
    const [editingTarget, setEditingTarget] = useState(false)
    const [targetDraft, setTargetDraft] = useState(target == null ? '' : String(target))
    const [targetPending, startTarget] = useTransition()
    const [targetError, setTargetError] = useState<string | null>(null)

    function saveTarget() {
        setTargetError(null)
        const raw = targetDraft.trim()
        const next = raw === '' ? null : Number(raw)
        if (next !== null && !Number.isInteger(next)) {
            setTargetError('Enter a whole number, or leave the box empty for no goal.')
            return
        }
        startTarget(async () => {
            const result = await setReopenTarget(next)
            if ('error' in result) { setTargetError(result.error); return }
            setEditingTarget(false)
            router.refresh()
        })
    }

    const pct = target && target > 0 ? Math.min(100, Math.round((count / target) * 100)) : null
    const [showAll, setShowAll] = useState(false)
    const shown = showAll ? members : members.slice(0, 6)

    return (
        <Section title="Waiting list" count={count}>
            <div className={`rounded-xl p-4 ${t.card}`}>
                <div className="flex items-baseline justify-between gap-3">
                    <div className={`text-[28px] font-black tracking-tight tabular-nums ${count >= (target ?? Infinity) ? t.success : t.heading}`}>
                        {count}
                        <span className={`ml-1 text-[14px] font-bold ${t.muted}`}>{target != null ? `of your goal of ${target}` : 'people waiting'}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setTargetDraft(target == null ? '' : String(target)); setTargetError(null); setEditingTarget(true) }}
                        className={`inline-flex items-center gap-1 text-[12px] font-bold ${t.muted} hover:opacity-70`}
                    >
                        <Pencil size={12} aria-hidden /> {target == null ? 'Set a goal' : 'Change the goal'}
                    </button>
                </div>
                {pct != null && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(128,128,128,0.2)]">
                        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${OG_DEEP} 0%, ${OG} 100%)` }} />
                    </div>
                )}
                {editingTarget && (
                    <ConfirmDialog
                        title={target == null ? 'Set a goal for reopening' : 'Change the goal for reopening'}
                        lines={[
                            'Write how many people you want on the waiting list before you reopen the kitchen.',
                            'The bar above fills up as people join, so you can see how close you are.',
                            '**It is only a note for you.** Reaching it does not reopen anything or send any message.',
                        ]}
                        undo="Yes. Change it or empty the box to remove it, any time."
                        cta="Save the goal"
                        pending={targetPending}
                        error={targetError}
                        onCancel={() => { setEditingTarget(false); setTargetError(null) }}
                        onConfirm={saveTarget}
                    >
                        <label className="flex flex-col gap-2">
                            <span className={`text-[12px] font-bold ${t.muted}`}>People on the waiting list</span>
                            <input
                                type="number"
                                min={1}
                                max={1000}
                                step={1}
                                value={targetDraft}
                                placeholder="No goal"
                                autoFocus
                                onChange={(e) => setTargetDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveTarget() }}
                                className={`w-32 rounded-lg border px-3 py-2 text-[13px] font-bold tabular-nums ${t.input} ${t.inputFocus}`}
                            />
                        </label>
                    </ConfirmDialog>
                )}

                {count === 0 ? (
                    <p className={`mt-4 text-[13px] ${t.muted}`}>
                        {settings.paused
                            ? 'Nobody yet. People join when they open a plan page and tap Save my spot.'
                            : 'Nobody yet. People can only join while new orders are paused.'}
                    </p>
                ) : (
                    <>
                        <div className={`mt-4 text-[12px] font-bold ${t.muted}`}>Where they live</div>
                        <ul aria-label="Where they live" className="mt-2 flex flex-col gap-2">
                            {dormSplit.map(([dorm, n]) => (
                                <li key={dorm} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                                    <span className={`truncate text-[12px] font-bold ${dorm === 'No dorm set' ? t.faint : t.body}`}>{dorm}</span>
                                    <span className={`text-[12px] font-bold tabular-nums ${t.muted}`}>{n}</span>
                                    <span className="col-span-2 h-1 overflow-hidden rounded-full bg-[rgba(128,128,128,0.15)]">
                                        <span className="block h-full rounded-full bg-[#f57f20]/60" style={{ width: `${Math.round((n / count) * 100)}%` }} />
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <ul className={`mt-4 border-t ${t.border}`}>
                            {shown.map((m) => (
                                <li key={m.id} className={`flex items-center justify-between gap-3 py-2 border-b last:border-b-0 ${t.border}`}>
                                    <div className="min-w-0">
                                        <div className={`truncate text-[13px] font-bold ${t.heading}`}>{m.name}</div>
                                        <div className={`truncate text-[12px] ${t.muted}`}>
                                            {m.dormName ?? 'No dorm'} · joined {formatShortDay(m.joinedAt.slice(0, 10))}
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        {m.creditAed == null
                                            ? <div className={`text-[12px] font-bold ${t.danger}`}>No credit given</div>
                                            : <div className={`text-[12px] font-bold tabular-nums ${t.body}`}>AED {m.creditAed}</div>}
                                        {m.notifiedAt && <div className={`text-[11px] font-bold ${t.success}`}>Told we are open</div>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {members.length > 6 && (
                            <button type="button" onClick={() => setShowAll((v) => !v)} className={`mt-2 text-[12px] font-bold ${t.accent} hover:underline underline-offset-4`}>
                                {showAll ? 'Show fewer' : `Show all ${members.length}`}
                            </button>
                        )}
                    </>
                )}
            </div>
        </Section>
    )
}

// ── What customers see ───────────────────────────────────────────────────
// The break card a customer meets while sales are stopped, and the credit it
// promises. Folded to one line; opened, the edits and a live preview sit
// side by side with one Save.

function CustomerView({ settings }: { settings: IntakeSettingsRow }) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [headline, setHeadline] = useState(settings.headline)
    const [body, setBody] = useState(settings.body)
    const [nonveg, setNonveg] = useState(String(settings.creditNonvegAed))
    const [veg, setVeg] = useState(String(settings.creditVegAed))
    const [religious, setReligious] = useState(String(settings.creditReligiousAed))
    const [pending, startSave] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [confirming, setConfirming] = useState(false)

    const copyDirty = headline !== settings.headline || body !== settings.body
    const creditsDirty =
        nonveg !== String(settings.creditNonvegAed) ||
        veg !== String(settings.creditVegAed) ||
        religious !== String(settings.creditReligiousAed)
    const dirty = copyDirty || creditsDirty

    const low = Math.min(settings.creditVegAed, settings.creditNonvegAed, settings.creditReligiousAed)
    const high = Math.max(settings.creditVegAed, settings.creditNonvegAed, settings.creditReligiousAed)

    function touch() { setSaved(false); setError(null) }

    function save() {
        touch()
        const amounts = [Number(nonveg), Number(veg), Number(religious)]
        if (creditsDirty && !amounts.every(Number.isFinite)) {
            setError('Enter a number for each credit amount.')
            return
        }
        startSave(async () => {
            if (copyDirty) {
                const r = await updateIntakeCopy(headline, body)
                if ('error' in r) { setError(r.error); return }
            }
            if (creditsDirty) {
                const r = await updateIntakeCredits(amounts[0], amounts[1], amounts[2])
                if ('error' in r) { setError(r.error); return }
            }
            setSaved(true)
            setConfirming(false)
            router.refresh()
        })
    }

    function reset() {
        setHeadline(settings.headline); setBody(settings.body)
        setNonveg(String(settings.creditNonvegAed)); setVeg(String(settings.creditVegAed)); setReligious(String(settings.creditReligiousAed))
        touch()
    }

    // The non-veg figure is the one most customers see.
    const previewCredit = Number(nonveg)

    return (
        <details className={`group rounded-xl ${t.card}`}>
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[11px] font-black uppercase tracking-[0.12em] ${t.muted}`}>Message customers see while orders are paused</span>
                        {settings.paused && (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${t.accentBg} ${t.accent}`}>
                                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#f57f20]" /> Showing now
                            </span>
                        )}
                    </div>
                    <div className={`mt-1 truncate text-[13px] ${t.body}`}>
                        &ldquo;{settings.headline}&rdquo; <span className={t.muted}>· AED {low === high ? low : `${low} to ${high}`} credit for joining the waiting list</span>
                    </div>
                </div>
                <span className={`hidden sm:inline text-[12px] font-bold ${t.muted} group-open:hidden`}>Edit</span>
                <ChevronDown size={16} className={`shrink-0 transition-transform group-open:rotate-180 ${t.muted}`} aria-hidden />
            </summary>

            <div className={`grid gap-6 border-t px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] ${t.border}`}>
                <div className="flex flex-col gap-4 min-w-0">
                    <Field label="Headline" count={`${headline.length}/${HEADLINE_MAX}`}>
                        <input
                            type="text"
                            value={headline}
                            maxLength={HEADLINE_MAX}
                            onChange={(e) => { setHeadline(e.target.value); touch() }}
                            className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold ${t.input} ${t.inputFocus}`}
                        />
                    </Field>
                    <Field label="Message" count={`${body.length}/${BODY_MAX}`}>
                        <textarea
                            value={body}
                            maxLength={BODY_MAX}
                            rows={4}
                            onChange={(e) => { setBody(e.target.value); touch() }}
                            className={`w-full resize-none rounded-lg border px-3 py-2 text-[13px] leading-relaxed ${t.input} ${t.inputFocus}`}
                        />
                    </Field>
                    <fieldset>
                        <legend className={`text-[12px] font-bold ${t.muted}`}>Credit for joining the waiting list (AED)</legend>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            <CreditField label="Non-veg" value={nonveg} onChange={(v) => { setNonveg(v); touch() }} />
                            <CreditField label="Veg" value={veg} onChange={(v) => { setVeg(v); touch() }} />
                            <CreditField label="Religious" value={religious} onChange={(v) => { setReligious(v); touch() }} />
                        </div>
                    </fieldset>

                    <div className="flex flex-wrap items-center gap-3">
                        <AdminButton onClick={() => { touch(); setConfirming(true) }} disabled={!dirty || pending}>Update the message</AdminButton>
                        {dirty && !pending && (
                            <button type="button" onClick={reset} className={`text-[12px] font-bold ${t.muted} hover:underline underline-offset-4`}>Undo my edits</button>
                        )}
                        {saved && !dirty && <span role="status" className={`text-[12px] font-bold ${t.success}`}>{settings.paused ? 'Updated. Customers see it now.' : 'Updated.'}</span>}
                        {error && !confirming && <span role="alert" className={`text-[12px] font-bold ${t.danger}`}>{error}</span>}
                    </div>
                    {confirming && (
                        <ConfirmDialog
                            title="Update what customers see?"
                            lines={[
                                ...(copyDirty ? [`The card now reads **${headline.trim() || '(empty headline)'}**, with the message you wrote below it.`] : []),
                                ...(creditsDirty ? [`People who join the waiting list from now on get **AED ${nonveg}** (non-veg), **AED ${veg}** (veg) or **AED ${religious}** (religious). People already on the list keep what they got.`] : []),
                                settings.paused
                                    ? 'New orders are paused, so customers see this **straight away**.'
                                    : 'New orders are open, so **nobody sees this right now**. It shows the next time you pause new orders.',
                            ]}
                            undo="Yes. Change it again whenever you like."
                            cta="Yes, update it"
                            pending={pending}
                            error={error}
                            onCancel={() => setConfirming(false)}
                            onConfirm={save}
                        />
                    )}
                </div>

                <div className="min-w-0">
                    <div className={`mb-2 text-[12px] font-bold ${t.muted}`}>How it looks to customers</div>
                    <PreviewCard headline={headline} body={body} creditAed={Number.isFinite(previewCredit) ? previewCredit : 0} />
                </div>
            </div>
        </details>
    )
}

function Field({ label, count, children }: { label: string; count: string; children: React.ReactNode }) {
    const { t } = useAdminTheme()
    return (
        <label className="flex flex-col gap-2">
            <span className={`flex justify-between text-[12px] font-bold ${t.muted}`}>
                {label}
                <span className={`font-medium tabular-nums ${t.faint}`}>{count}</span>
            </span>
            {children}
        </label>
    )
}

function CreditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    const { t } = useAdminTheme()
    return (
        <label className="flex flex-col gap-1">
            <span className={`text-[12px] ${t.muted}`}>{label}</span>
            <input
                type="number"
                min={0}
                max={200}
                step="any"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-[13px] font-bold tabular-nums ${t.input} ${t.inputFocus}`}
            />
        </label>
    )
}

// A read-only replica of IntakePausedGate's not-joined card, the surface this
// copy feeds. Always in the dashboard's light palette, because that is what
// customers see whatever the admin theme.
function PreviewCard({ headline, body, creditAed }: { headline: string; body: string; creditAed: number }) {
    const headlineDot = !/[.!?…]$/.test(headline.trim())
    return (
        <div style={{
            background: 'linear-gradient(180deg, #fdfbf6 0%, #fdfbf6 58%, #fdf1e3 100%)',
            border: '1px solid rgba(245,127,32,0.40)',
            borderRadius: 20,
            padding: 24,
            display: 'flex', flexDirection: 'column', gap: 16,
            fontFamily: BODY,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(245,127,32,0.12)', color: OG, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Gift size={14} strokeWidth={2.4} />
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(9,24,37,0.45)' }}>Seasonal break</span>
            </div>
            <div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#091825', lineHeight: 1.25 }}>
                    {headline.trim() || 'Headline goes here'}{headlineDot && <span style={{ color: OG }}>.</span>}
                </div>
                <div style={{ margin: '8px 0 0', fontSize: 13, color: 'rgba(9,24,37,0.65)', lineHeight: 1.55 }}>
                    {body.trim() || 'Message goes here.'}
                </div>
            </div>
            <div>
                <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: OG_DEEP, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>AED {creditAed}</span>
                <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(9,24,37,0.55)' }}>yours if you save your spot</div>
            </div>
            <div aria-hidden style={{
                minHeight: 44, width: '100%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '12px 16px',
                background: OG, color: '#fff',
                borderRadius: 999,
                fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
                Save my spot
            </div>
        </div>
    )
}

