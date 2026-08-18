'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pause, Play, Gift, AlertTriangle, Send, CalendarClock } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminButton } from '../_components/AdminButton'
import {
    setIntakePaused,
    updateIntakeCopy,
    updateIntakeCredits,
    scheduleIntakePause,
    clearScheduledIntakePause,
} from './actions'
import type { IntakeSettingsRow } from './page'
import { prettySeasonDate } from '@/contexts/subscriptions/domain/season-horizon'
import { OG, OG_DEEP, BODY } from '@/app/dashboard/_shared/tokens'
import type { AdminTokens } from '@/ui-system/tokens/admin-theme'

interface Props {
    settings: IntakeSettingsRow
    waitlistCount: number
    overhangCount: number
}

const HEADLINE_MAX = 120
const BODY_MAX = 400

export function SeasonClient({ settings, waitlistCount, overhangCount }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()

    // ── Pause / resume toggle ────────────────────────────────────────────
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [togglePending, startToggle] = useTransition()
    const [toggleError, setToggleError] = useState<string | null>(null)

    function handleResume() {
        setToggleError(null)
        startToggle(async () => {
            const result = await setIntakePaused(false)
            if ('error' in result) { setToggleError(result.error); return }
            router.refresh()
        })
    }

    function handleConfirmPause() {
        setToggleError(null)
        startToggle(async () => {
            const result = await setIntakePaused(true)
            if ('error' in result) { setToggleError(result.error); return }
            setConfirmOpen(false)
            router.refresh()
        })
    }

    // ── Scheduled pause ──────────────────────────────────────────────────
    const [dateDraft, setDateDraft] = useState('')
    const [scheduleConfirmOpen, setScheduleConfirmOpen] = useState(false)
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
    const [schedulePending, startSchedule] = useTransition()
    const [scheduleError, setScheduleError] = useState<string | null>(null)

    // Earliest pickable day: tomorrow in Asia/Dubai. The +4h shift is the
    // same one the server action validates with, so the input's floor and
    // the action's "must be a future date" check agree on which day it is
    // regardless of the admin's own machine timezone.
    const minScheduleDate = useMemo(() => {
        const d = new Date(Date.now() + 4 * 60 * 60 * 1000)
        d.setUTCDate(d.getUTCDate() + 1)
        return d.toISOString().slice(0, 10)
    }, [])

    function handleConfirmSchedule() {
        setScheduleError(null)
        startSchedule(async () => {
            const result = await scheduleIntakePause(dateDraft)
            if ('error' in result) { setScheduleError(result.error); return }
            setScheduleConfirmOpen(false)
            router.refresh()
        })
    }

    function handleConfirmClear() {
        setScheduleError(null)
        startSchedule(async () => {
            const result = await clearScheduledIntakePause()
            if ('error' in result) { setScheduleError(result.error); return }
            setClearConfirmOpen(false)
            setDateDraft('')
            router.refresh()
        })
    }

    // ── Customer-facing copy ─────────────────────────────────────────────
    const [headlineDraft, setHeadlineDraft] = useState(settings.headline)
    const [bodyDraft, setBodyDraft] = useState(settings.body)
    const [copyPending, startCopy] = useTransition()
    const [copyError, setCopyError] = useState<string | null>(null)
    const [copySaved, setCopySaved] = useState(false)
    const copyDirty = headlineDraft !== settings.headline || bodyDraft !== settings.body

    function handleSaveCopy() {
        setCopyError(null)
        setCopySaved(false)
        startCopy(async () => {
            const result = await updateIntakeCopy(headlineDraft, bodyDraft)
            if ('error' in result) { setCopyError(result.error); return }
            setCopySaved(true)
            router.refresh()
        })
    }

    // ── Credit amounts ───────────────────────────────────────────────────
    const [nonvegDraft, setNonvegDraft] = useState(String(settings.creditNonvegAed))
    const [vegDraft, setVegDraft] = useState(String(settings.creditVegAed))
    const [religiousDraft, setReligiousDraft] = useState(String(settings.creditReligiousAed))
    const [creditsPending, startCredits] = useTransition()
    const [creditsError, setCreditsError] = useState<string | null>(null)
    const [creditsSaved, setCreditsSaved] = useState(false)
    const creditsDirty =
        nonvegDraft !== String(settings.creditNonvegAed) ||
        vegDraft !== String(settings.creditVegAed) ||
        religiousDraft !== String(settings.creditReligiousAed)

    function handleSaveCredits() {
        setCreditsError(null)
        setCreditsSaved(false)
        const nonveg = Number(nonvegDraft)
        const veg = Number(vegDraft)
        const religious = Number(religiousDraft)
        if (![nonveg, veg, religious].every(Number.isFinite)) {
            setCreditsError('Enter a valid number for each credit amount.')
            return
        }
        startCredits(async () => {
            const result = await updateIntakeCredits(nonveg, veg, religious)
            if ('error' in result) { setCreditsError(result.error); return }
            setCreditsSaved(true)
            router.refresh()
        })
    }

    // Preview uses the non-veg figure — the default figure most customers
    // will see, since Non Veg is the majority meal preference. Live, not
    // saved: it reflects whatever is currently typed in the drafts above.
    const previewCreditAed = Number(nonvegDraft)

    return (
        <div>
            <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                    <h1 className={`text-xl font-black tracking-tight ${t.heading}`}>Season</h1>
                    <p className={`text-[13px] font-medium mt-0.5 ${t.muted}`}>
                        Pause new plan purchases between semesters, and set the credit customers earn for joining the early-access list.
                    </p>
                </div>
            </div>

            {settings.paused && (
                <div className={`mt-4 flex items-center gap-2.5 px-4 py-3 rounded-xl border ${t.dangerBg}`}>
                    <AlertTriangle size={16} strokeWidth={2.2} className={t.danger} />
                    <span className={`text-[13px] font-bold ${t.danger}`}>
                        New intake is PAUSED. No new plan purchases or renewals are going through.
                        {settings.pausedBy ? ` Paused by ${settings.pausedBy.split('@')[0]}.` : ''}
                    </span>
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                <KPI label="Status" value={settings.paused ? 'Paused' : 'Open'} t={t} tone={settings.paused ? 'danger' : 'success'} />
                <KPI label="Early access list" value={waitlistCount} t={t} />
                <KPI label="Credit range (AED)" value={`${Math.min(settings.creditVegAed, settings.creditNonvegAed, settings.creditReligiousAed)} to ${Math.max(settings.creditVegAed, settings.creditNonvegAed, settings.creditReligiousAed)}`} t={t} />
            </div>

            {/* Pause / resume */}
            <div className={`mt-6 rounded-xl border p-5 ${t.card}`}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <div className={`text-[15px] font-black ${t.heading}`}>
                            {settings.paused ? 'New plans are paused' : 'New plans are open'}
                        </div>
                        <div className={`text-[12px] font-medium mt-0.5 max-w-[46ch] ${t.muted}`}>
                            {settings.paused
                                ? 'Every existing subscription keeps running on schedule. Only new purchases and renewals are blocked.'
                                : 'Customers can buy and renew plans normally.'}
                        </div>
                    </div>
                    {settings.paused ? (
                        <AdminButton
                            icon={<Play size={14} strokeWidth={2.5} />}
                            onClick={handleResume}
                            loading={togglePending}
                        >
                            Resume Intake
                        </AdminButton>
                    ) : (
                        <AdminButton
                            variant="danger"
                            icon={<Pause size={14} strokeWidth={2.5} />}
                            onClick={() => setConfirmOpen(true)}
                            disabled={togglePending}
                        >
                            Pause New Plans
                        </AdminButton>
                    )}
                </div>
                {toggleError && !confirmOpen && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{toggleError}</p>}

                {/* Schedule the pause */}
                <div className={`mt-4 pt-4 border-t ${t.border}`}>
                    <div className={`text-[11px] font-black uppercase tracking-[0.1em] ${t.muted}`}>Schedule the pause</div>

                    {settings.paused ? (
                        <p className={`text-[12px] font-medium mt-2 max-w-[52ch] ${t.muted}`}>
                            Scheduling a last delivery day becomes available once intake is open again.
                        </p>
                    ) : settings.pauseScheduledFor ? (
                        <>
                            <div className={`mt-3 flex items-center gap-2.5 px-4 py-3 rounded-xl border ${t.accentBg}`}>
                                <CalendarClock size={16} strokeWidth={2.2} className={t.accent} />
                                <span className={`text-[13px] font-bold ${t.accent}`}>
                                    Last delivery day: {prettySeasonDate(settings.pauseScheduledFor)}
                                </span>
                            </div>
                            <p className={`text-[12px] font-medium mt-3 max-w-[52ch] ${t.muted}`}>
                                Monthly plans stop selling about four weeks before this date, weekly about a week before, and the pause turns itself on the day after.
                            </p>
                            {overhangCount > 0 && (
                                <p className={`text-[12px] font-medium mt-1.5 max-w-[52ch] ${t.muted}`}>
                                    {overhangCount === 1
                                        ? '1 current journey already ends after this date. It rides to completion.'
                                        : `${overhangCount} current journeys already end after this date. They ride to completion.`}
                                </p>
                            )}
                            <div className="mt-3">
                                <AdminButton
                                    variant="ghost"
                                    onClick={() => setClearConfirmOpen(true)}
                                    disabled={schedulePending}
                                >
                                    Clear schedule
                                </AdminButton>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className={`text-[12px] font-medium mt-2 max-w-[52ch] ${t.muted}`}>
                                Pick the last delivery day of the season and new plans taper off by themselves before it. Nothing changes for customers already on a plan.
                            </p>
                            <div className="mt-3 flex items-end gap-3 flex-wrap">
                                <label className="flex flex-col gap-1.5">
                                    <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>
                                        Last delivery day
                                    </span>
                                    <input
                                        type="date"
                                        value={dateDraft}
                                        min={minScheduleDate}
                                        onChange={(e) => { setDateDraft(e.target.value); setScheduleError(null) }}
                                        className={`rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${t.input} ${t.inputFocus}`}
                                    />
                                </label>
                                <AdminButton
                                    icon={<CalendarClock size={14} strokeWidth={2.5} />}
                                    onClick={() => setScheduleConfirmOpen(true)}
                                    disabled={!dateDraft || schedulePending}
                                >
                                    Schedule
                                </AdminButton>
                            </div>
                        </>
                    )}

                    {scheduleError && !scheduleConfirmOpen && !clearConfirmOpen && (
                        <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{scheduleError}</p>
                    )}
                </div>

                {!settings.paused && (
                    <div className={`mt-4 pt-4 border-t ${t.border}`}>
                        <p className={`text-[12px] font-medium max-w-[52ch] ${t.muted}`}>
                            Reopening after a pause? The reopening notice tells the early access list their credit is ready, and lapsed customers that plans are back.
                        </p>
                        <Link
                            href="/admin/comms/broadcast?preset=reopen"
                            className={`mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-[0.04em] ring-1 ring-[#f57f20]/30 ${t.card} ${t.accent} transition-all hover:ring-[#f57f20]/50`}
                        >
                            <Send size={14} strokeWidth={2.2} />
                            Send the reopening notice
                        </Link>
                    </div>
                )}
            </div>

            <div className="grid lg:grid-cols-2 gap-5 mt-5">
                <div className="flex flex-col gap-5 min-w-0">
                    {/* Copy editor */}
                    <div className={`rounded-xl border p-5 ${t.card}`}>
                        <div className={`text-[11px] font-black uppercase tracking-[0.1em] ${t.muted}`}>Customer-facing copy</div>

                        <label className="flex flex-col gap-1.5 mt-4">
                            <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>
                                Headline ({headlineDraft.length}/{HEADLINE_MAX})
                            </span>
                            <input
                                type="text"
                                value={headlineDraft}
                                maxLength={HEADLINE_MAX}
                                onChange={(e) => { setHeadlineDraft(e.target.value); setCopySaved(false) }}
                                className={`w-full rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${t.input} ${t.inputFocus}`}
                            />
                        </label>

                        <label className="flex flex-col gap-1.5 mt-3">
                            <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>
                                Body ({bodyDraft.length}/{BODY_MAX})
                            </span>
                            <textarea
                                value={bodyDraft}
                                maxLength={BODY_MAX}
                                rows={4}
                                onChange={(e) => { setBodyDraft(e.target.value); setCopySaved(false) }}
                                className={`w-full rounded-lg border px-3 py-2 text-[13px] font-medium leading-relaxed transition-colors resize-none ${t.input} ${t.inputFocus}`}
                            />
                        </label>

                        {copyError && <p className={`mt-2 text-[12px] font-bold ${t.danger}`}>{copyError}</p>}
                        {copySaved && !copyError && <p className={`mt-2 text-[12px] font-bold ${t.success}`}>Saved.</p>}

                        <div className="mt-3">
                            <AdminButton onClick={handleSaveCopy} loading={copyPending} disabled={!copyDirty}>
                                Save Copy
                            </AdminButton>
                        </div>
                    </div>

                    {/* Credit editor */}
                    <div className={`rounded-xl border p-5 ${t.card}`}>
                        <div className={`text-[11px] font-black uppercase tracking-[0.1em] ${t.muted}`}>Early-access credit (AED)</div>
                        <div className="grid grid-cols-3 gap-3 mt-4">
                            <CreditField label="Non-veg" t={t} value={nonvegDraft} onChange={(v) => { setNonvegDraft(v); setCreditsSaved(false) }} />
                            <CreditField label="Veg" t={t} value={vegDraft} onChange={(v) => { setVegDraft(v); setCreditsSaved(false) }} />
                            <CreditField label="Religious" t={t} value={religiousDraft} onChange={(v) => { setReligiousDraft(v); setCreditsSaved(false) }} />
                        </div>

                        {creditsError && <p className={`mt-2 text-[12px] font-bold ${t.danger}`}>{creditsError}</p>}
                        {creditsSaved && !creditsError && <p className={`mt-2 text-[12px] font-bold ${t.success}`}>Saved.</p>}

                        <div className="mt-3">
                            <AdminButton onClick={handleSaveCredits} loading={creditsPending} disabled={!creditsDirty}>
                                Save Credits
                            </AdminButton>
                        </div>
                    </div>
                </div>

                {/* Live preview */}
                <div className="lg:sticky lg:top-5 self-start min-w-0">
                    <div className={`text-[10px] font-black tracking-[0.12em] uppercase mb-2 ${t.faint}`}>
                        Live preview. What a customer sees
                    </div>
                    <PreviewCard headline={headlineDraft} body={bodyDraft} creditAed={Number.isFinite(previewCreditAed) ? previewCreditAed : 0} />
                </div>
            </div>

            {confirmOpen && (
                <AdminModal label="Confirm pause" maxW="max-w-[440px]" onBackdrop={() => { if (!togglePending) setConfirmOpen(false) }}>
                    <div className={`px-5 py-4 border-b ${t.border}`}>
                        <div className={`text-[15px] font-black ${t.heading}`}>Pause new intake?</div>
                    </div>
                    <div className="px-5 py-4">
                        <p className={`text-[13px] font-medium leading-relaxed ${t.body}`}>
                            This stops every new plan purchase, including renewals. Existing subscriptions are unaffected.
                        </p>
                        {toggleError && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{toggleError}</p>}
                    </div>
                    <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
                        <AdminButton variant="ghost" onClick={() => setConfirmOpen(false)} disabled={togglePending}>
                            Cancel
                        </AdminButton>
                        <AdminButton variant="danger" onClick={handleConfirmPause} loading={togglePending}>
                            Yes, Pause New Plans
                        </AdminButton>
                    </div>
                </AdminModal>
            )}

            {scheduleConfirmOpen && (
                <AdminModal label="Confirm scheduled pause" maxW="max-w-[460px]" onBackdrop={() => { if (!schedulePending) setScheduleConfirmOpen(false) }}>
                    <div className={`px-5 py-4 border-b ${t.border}`}>
                        <div className={`text-[15px] font-black ${t.heading}`}>Schedule the last delivery day?</div>
                    </div>
                    <div className="px-5 py-4">
                        <p className={`text-[13px] font-medium leading-relaxed ${t.body}`}>
                            New plans stop being sellable as soon as their journey would cross {dateDraft ? prettySeasonDate(dateDraft) : 'that day'}. Monthly plans stop selling about four weeks before it, weekly about a week before, and the pause turns itself on the day after. Existing customers are not affected.
                        </p>
                        {scheduleError && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{scheduleError}</p>}
                    </div>
                    <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
                        <AdminButton variant="ghost" onClick={() => setScheduleConfirmOpen(false)} disabled={schedulePending}>
                            Cancel
                        </AdminButton>
                        <AdminButton onClick={handleConfirmSchedule} loading={schedulePending}>
                            Yes, Schedule It
                        </AdminButton>
                    </div>
                </AdminModal>
            )}

            {clearConfirmOpen && (
                <AdminModal label="Confirm clear schedule" maxW="max-w-[440px]" onBackdrop={() => { if (!schedulePending) setClearConfirmOpen(false) }}>
                    <div className={`px-5 py-4 border-b ${t.border}`}>
                        <div className={`text-[15px] font-black ${t.heading}`}>Clear the scheduled pause?</div>
                    </div>
                    <div className="px-5 py-4">
                        <p className={`text-[13px] font-medium leading-relaxed ${t.body}`}>
                            Every plan goes back on sale at full length straight away, and nothing will pause on its own. You can schedule a new last delivery day whenever you want.
                        </p>
                        {scheduleError && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{scheduleError}</p>}
                    </div>
                    <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
                        <AdminButton variant="ghost" onClick={() => setClearConfirmOpen(false)} disabled={schedulePending}>
                            Cancel
                        </AdminButton>
                        <AdminButton onClick={handleConfirmClear} loading={schedulePending}>
                            Yes, Clear It
                        </AdminButton>
                    </div>
                </AdminModal>
            )}
        </div>
    )
}

// ── KPI ──────────────────────────────────────────────────────────────────

function KPI({ label, value, t, tone }: {
    label: string
    value: string | number
    t: AdminTokens
    tone?: 'success' | 'danger'
}) {
    const valueColor = tone === 'success' ? t.success : tone === 'danger' ? t.danger : t.heading
    return (
        <div className={`rounded-xl border px-4 py-3 ${t.card}`}>
            <div className={`text-[10px] font-bold tracking-[0.08em] uppercase ${t.muted}`}>{label}</div>
            <div className={`text-2xl font-black mt-0.5 tabular-nums ${valueColor}`}>{value}</div>
        </div>
    )
}

// ── Credit field ─────────────────────────────────────────────────────────

function CreditField({ label, t, value, onChange }: {
    label: string
    t: AdminTokens
    value: string
    onChange: (v: string) => void
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>{label}</span>
            <input
                type="number"
                min={0}
                max={200}
                step="any"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-[13px] font-bold tabular-nums transition-colors ${t.input} ${t.inputFocus}`}
            />
        </label>
    )
}

// ── Live preview ─────────────────────────────────────────────────────────
// A read-only replica of IntakePausedGate's not-joined card — the actual
// customer-facing surface this copy feeds. Always rendered in the
// dashboard's light palette (cream + brand orange) regardless of the admin
// panel's own light/dark theme, because that is what customers always see.

function PreviewCard({ headline, body, creditAed }: { headline: string; body: string; creditAed: number }) {
    return (
        <div style={{
            background: '#fcf8ee',
            border: '1px solid rgba(9,24,37,0.10)',
            borderRadius: 18,
            boxShadow: '0 6px 18px rgba(9,24,37,0.07), 0 1px 3px rgba(9,24,37,0.04)',
            padding: '26px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            textAlign: 'center',
            fontFamily: BODY,
        }}>
            <span style={{
                width: 42, height: 42, borderRadius: '50%',
                background: 'rgba(245,127,32,0.12)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: OG,
            }}>
                <Gift size={20} strokeWidth={2.4} />
            </span>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#091825', lineHeight: 1.3 }}>
                {headline.trim() || 'Headline goes here'}
            </div>
            <div style={{ fontSize: 12.5, color: 'rgba(9,24,37,0.65)', lineHeight: 1.55 }}>
                {body.trim() || 'Body copy goes here.'}
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: OG_DEEP, letterSpacing: '-0.01em' }}>
                AED {creditAed} is waiting in your account
            </div>
            <div style={{
                marginTop: 4, minHeight: 44,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '12px 22px',
                background: OG, color: '#fff', opacity: 0.55,
                borderRadius: 999,
                fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
                Save my spot
            </div>
        </div>
    )
}
