'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Mail, MessageCircle } from 'lucide-react'
import { useAdminTheme } from '../../_components/AdminThemeProvider'
import { isStaleActionError, STALE_ACTION_MESSAGE } from '../../_components/stale-action'
import {
    countAudiences, launchBroadcast, syncWhatsAppTemplates, whatsappPreflight,
    type AudienceCount,
} from './actions'
import type { BroadcastRow, WhatsAppTemplateRow } from './page'
import { assessReadiness, type Step } from './readiness'
import { AUDIENCES, AUDIENCE_LABELS, type AudienceKey } from './parts/audiences'
import { StepCard, type StepState } from './parts/StepCard'
import { AudiencePicker } from './parts/AudiencePicker'
import { MessageEmail } from './parts/MessageEmail'
import { MessageWhatsApp, keyOf } from './parts/MessageWhatsApp'
import { SendSlip, type NumberHealth } from './parts/SendSlip'
import { Runs } from './parts/Runs'

type Channel = 'email' | 'whatsapp'
type Mode = 'custom' | 'season_reopen'

const ORDER: Step[] = ['audience', 'message', 'send']
const AUDIENCE_KEYS = AUDIENCES.map(a => a.key)
const fmt = (n: number) => n.toLocaleString('en-US')

/**
 * Serializable stand-ins for the server calls, so /dev/broadcast can render the
 * composer without an admin session. Never passed in production.
 */
export interface BroadcastFixtures {
    counts: Record<Channel, Record<string, { optedIn: number; all: number }>>
    health: NumberHealth
}

interface Props {
    broadcasts: BroadcastRow[]
    dorms: string[]
    parked: Record<string, number>
    templates: WhatsAppTemplateRow[]
    fixtures?: BroadcastFixtures
}

/**
 * Sending a broadcast, as three steps: who, what, send.
 *
 * Rebuilt from scratch on 2026-09-16 after the flat version proved unusable —
 * two rows of look-alike pills, a dropdown that hid every count but one, and a
 * consent switch buried behind a Send button that could never enable because
 * the switch was off. Here one question is open at a time, every count is on
 * screen, and the bar at the bottom always says what is stopping you and takes
 * you to the step that fixes it.
 */
export function BroadcastClient({ broadcasts, dorms, parked, templates, fixtures }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const preset = useSearchParams().get('preset')

    // ── The decisions ─────────────────────────────────────────────────────
    const [channel, setChannel] = useState<Channel>(preset === 'reopen' ? 'email' : 'whatsapp')
    const [mode, setMode] = useState<Mode>(preset === 'reopen' ? 'season_reopen' : 'custom')
    const [step, setStep] = useState<Step>('audience')

    const [audience, setAudience] = useState<AudienceKey>('everyone')
    const [dormName, setDormName] = useState(dorms[0] ?? '')
    const [includeUnknown, setIncludeUnknown] = useState(false)

    const [templateKey, setTemplateKey] = useState('')
    const [values, setValues] = useState<Record<string, string>>({})
    const [subject, setSubject] = useState('')
    const [heading, setHeading] = useState('')
    const [body, setBody] = useState('')
    const [ctaLabel, setCtaLabel] = useState('')
    const [ctaUrl, setCtaUrl] = useState('')

    // The reopening notice always goes to its own fixed list.
    const effectiveAudience = channel === 'email' && mode === 'season_reopen' ? 'reopen' : audience

    // ── Counts, all at once ───────────────────────────────────────────────
    const [counts, setCounts] = useState<Record<string, AudienceCount>>({})
    const [countLoading, setCountLoading] = useState(true)
    const [countError, setCountError] = useState<string | null>(null)

    useEffect(() => {
        if (fixtures) {
            const src = fixtures.counts[channel]
            setCounts(Object.fromEntries(Object.entries(src).map(([k, v]) => [k, {
                optedIn: v.optedIn, all: v.all, count: channel === 'whatsapp' && !includeUnknown ? v.optedIn : v.all,
            }])))
            setCountLoading(false)
            return
        }
        let stale = false
        setCountLoading(true)
        setCountError(null)
        const keys = channel === 'email' && mode === 'season_reopen' ? ['reopen'] : AUDIENCE_KEYS
        countAudiences(keys, channel, includeUnknown, dormName || undefined)
            .then(res => {
                if (stale) return
                if (!res.ok) setCountError(res.message ?? 'Could not count the audiences.')
                setCounts(res.counts)
            })
            .catch(err => {
                if (stale) return
                if (isStaleActionError(err)) { setCountError(STALE_ACTION_MESSAGE); setTimeout(() => location.reload(), 900); return }
                setCountError('Could not count the audiences. Reload and try again.')
            })
            .finally(() => { if (!stale) setCountLoading(false) })
        return () => { stale = true }
    }, [channel, mode, includeUnknown, dormName, fixtures])

    const current = counts[effectiveAudience]
    const count = current?.count ?? 0

    // ── Number health, WhatsApp only ──────────────────────────────────────
    const [health, setHealth] = useState<NumberHealth | null>(null)
    useEffect(() => {
        if (channel !== 'whatsapp') return
        if (fixtures) { setHealth(fixtures.health); return }
        let stale = false
        whatsappPreflight(0).then(r => {
            if (stale) return
            setHealth({
                quality: r.qualityRating, verdict: r.verdict, remaining: r.remaining,
                sentToday: r.sentLast24h, rate: r.ratePerMessageAed,
            })
        }).catch(() => { /* the send step says "…" until it arrives */ })
        return () => { stale = true }
    }, [channel, fixtures])

    // ── Readiness ─────────────────────────────────────────────────────────
    const template = useMemo(
        () => templates.find(x => x.approved_at && x.category === 'MARKETING' && keyOf(x) === templateKey) ?? null,
        [templates, templateKey],
    )
    const missingVariables = useMemo(
        () => (template ? template.variables.filter(v => !(values[v] ?? '').trim()) : []),
        [template, values],
    )

    const readiness = useMemo(() => assessReadiness({
        channel, mode,
        audienceCount: count,
        countLoading,
        includeUnknown,
        optedInCount: current?.optedIn ?? 0,
        templateChosen: Boolean(template),
        missingVariables,
        subject, heading, body,
        remainingToday: health?.remaining ?? Number.POSITIVE_INFINITY,
        quality: health?.verdict ?? 'ok',
    }), [channel, mode, count, countLoading, includeUnknown, current, template, missingVariables, subject, heading, body, health])

    const blockedAt = readiness.step
    const here = ORDER.indexOf(step)
    // Where the blocker sits relative to where you are decides everything the
    // bar says. Behind you: go back and fix it. Right here: say what's missing.
    // Ahead of you: this step is fine — that's just where Continue goes next.
    const blockedBehind = blockedAt !== null && ORDER.indexOf(blockedAt) < here
    const blockedHere = blockedAt === step
    const stepState = (s: Step): StepState => {
        if (s === step) return 'active'
        return ORDER.indexOf(s) < ORDER.indexOf(step) ? 'done' : 'upcoming'
    }
    // A step can be left once nothing ON it or before it is blocking.
    const canLeave = (s: Step) => !readiness.pending && (blockedAt === null || ORDER.indexOf(blockedAt) > ORDER.indexOf(s))

    // ── Channel switch resets what no longer applies ──────────────────────
    function switchChannel(next: Channel) {
        if (next === channel) return
        setChannel(next)
        setMode('custom')
        setIncludeUnknown(false)
        setStep('audience')
        setLaunchError(null)
    }

    // ── Sync templates ────────────────────────────────────────────────────
    const [syncing, setSyncing] = useState(false)
    const [syncNote, setSyncNote] = useState<string | null>(null)
    async function handleSync() {
        setSyncing(true)
        try {
            const res = await syncWhatsAppTemplates()
            setSyncNote(res.message)
            if (res.ok) router.refresh()
        } catch (err) {
            if (isStaleActionError(err)) { setSyncNote(STALE_ACTION_MESSAGE); setTimeout(() => location.reload(), 900); return }
            setSyncNote('Could not reach Meta. Try again.')
        } finally {
            setSyncing(false)
        }
    }

    // ── Send ──────────────────────────────────────────────────────────────
    const [confirmText, setConfirmText] = useState('')
    const [launchError, setLaunchError] = useState<string | null>(null)
    const [launching, startLaunch] = useTransition()
    const [trackedId, setTrackedId] = useState<string | null>(
        () => broadcasts.find(b => b.status === 'sending')?.id ?? null,
    )

    function handleSend() {
        setLaunchError(null)
        startLaunch(async () => {
            try {
                const res = await launchBroadcast({
                    kind: mode,
                    channel,
                    subject, heading, body,
                    ctaLabel: ctaLabel.trim() || undefined,
                    ctaUrl: ctaUrl.trim() || undefined,
                    audience: effectiveAudience,
                    dormName: effectiveAudience === 'dorm' ? dormName : undefined,
                    templateName: template?.name,
                    templateLanguage: template?.language,
                    templateVariables: values,
                    includeUnknownConsent: includeUnknown,
                })
                if (!res.ok || !res.id) { setLaunchError(res.message); return }
                setTrackedId(res.id)
                setConfirmText('')
                setStep('audience')
                router.refresh()
            } catch (err) {
                if (isStaleActionError(err)) { setLaunchError(STALE_ACTION_MESSAGE); setTimeout(() => location.reload(), 900); return }
                setLaunchError('Could not reach the server. Nothing was sent.')
            }
        })
    }

    const onTrack = useCallback((id: string | null) => setTrackedId(id), [])

    const audienceLabel = AUDIENCE_LABELS[effectiveAudience] + (effectiveAudience === 'dorm' && dormName ? ` · ${dormName}` : '')
    const next = ORDER[ORDER.indexOf(step) + 1] as Step | undefined

    return (
        <div className="pb-32">
            <header className="mb-6">
                <h1 className={`text-[26px] font-black tracking-tight ${t.heading}`}>Send a broadcast</h1>
                <p className={`text-[14px] font-medium mt-1 ${t.muted}`}>
                    Who it goes to, what it says, then send. Every person is logged, and a send can be stopped.
                </p>
            </header>

            {/* The channel frames everything below it, so it is its own control
                and not one more pill among many. */}
            <div className={`inline-flex rounded-xl border p-1 mb-6 ${t.border} ${t.card}`} role="radiogroup" aria-label="Channel">
                {([
                    ['whatsapp', 'WhatsApp', MessageCircle, 'Offers and news'],
                    ['email', 'Email', Mail, 'Account notices'],
                ] as const).map(([key, label, Icon, sub]) => {
                    const on = channel === key
                    return (
                        <button
                            key={key}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => switchChannel(key)}
                            className={`flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-left transition-colors ${
                                on ? 'bg-[#f57f20] text-white' : `${t.muted} hover:bg-black/[0.03]`
                            }`}
                        >
                            <Icon size={18} strokeWidth={2.2} />
                            <span>
                                <span className="block text-[14px] font-black leading-tight">{label}</span>
                                <span className={`block text-[11px] font-bold leading-tight ${on ? 'text-white/80' : t.faint}`}>{sub}</span>
                            </span>
                        </button>
                    )
                })}
            </div>

            <div className="flex flex-col gap-3">
                <StepCard
                    n={1}
                    title="Who gets it"
                    state={stepState('audience')}
                    summary={`${audienceLabel} · ${fmt(count)} ${count === 1 ? 'person' : 'people'}`}
                    onEdit={() => setStep('audience')}
                >
                    {channel === 'email' && mode === 'season_reopen' ? (
                        <p className={`text-[14px] font-medium ${t.body}`}>
                            The reopening notice always goes to its own list: everyone holding waitlist credit,
                            everyone who saved a spot, and past customers without a plan —{' '}
                            <strong className={t.heading}>{countLoading ? '…' : fmt(count)} people</strong>.
                        </p>
                    ) : (
                        <AudiencePicker
                            channel={channel}
                            selected={audience}
                            onSelect={setAudience}
                            counts={counts}
                            loading={countLoading}
                            includeUnknown={includeUnknown}
                            onIncludeUnknown={setIncludeUnknown}
                            dorms={dorms}
                            dormName={dormName}
                            onDorm={setDormName}
                        />
                    )}
                    {countError && <p className={`text-[13px] font-bold mt-4 ${t.danger}`}>{countError}</p>}
                </StepCard>

                <StepCard
                    n={2}
                    title="What it says"
                    state={stepState('message')}
                    summary={channel === 'whatsapp'
                        ? (template ? humanName(template.name) : 'No template')
                        : mode === 'season_reopen' ? 'Season reopening notice' : (subject || 'Untitled')}
                    onEdit={() => setStep('message')}
                >
                    {channel === 'whatsapp' ? (
                        <MessageWhatsApp
                            templates={templates}
                            selectedKey={templateKey}
                            onSelect={k => { setTemplateKey(k); setValues({}) }}
                            values={values}
                            onValue={(n, v) => setValues(prev => ({ ...prev, [n]: v }))}
                            onSync={handleSync}
                            syncing={syncing}
                            syncNote={syncNote}
                        />
                    ) : (
                        <MessageEmail
                            mode={mode} onMode={setMode}
                            subject={subject} onSubject={setSubject}
                            heading={heading} onHeading={setHeading}
                            body={body} onBody={setBody}
                            ctaLabel={ctaLabel} onCtaLabel={setCtaLabel}
                            ctaUrl={ctaUrl} onCtaUrl={setCtaUrl}
                            audience={effectiveAudience}
                        />
                    )}
                </StepCard>

                <StepCard n={3} title="Send" state={stepState('send')}>
                    <SendSlip
                        channel={channel}
                        audienceLabel={audienceLabel}
                        count={count}
                        health={channel === 'whatsapp' ? health : null}
                        readiness={readiness}
                        confirmText={confirmText}
                        onConfirmText={setConfirmText}
                        onSend={handleSend}
                        sending={launching}
                        error={launchError}
                    />
                </StepCard>
            </div>

            <div className="mt-10">
                <Runs broadcasts={broadcasts} parked={parked} trackedId={trackedId} onTrack={onTrack} />
            </div>

            {/* ── The bar: always says where you stand ───────────────────────── */}
            <div className="fixed bottom-0 left-0 right-0 lg:left-[220px] z-[110] px-4 pb-4 pointer-events-none">
                <div className={`pointer-events-auto mx-auto max-w-4xl flex items-center gap-4 rounded-2xl border px-5 py-3.5 ${t.overlay}`}>
                    <div className="shrink-0">
                        <div className={`text-[22px] font-black tabular-nums leading-none ${t.heading}`}>
                            {countLoading ? '…' : fmt(count)}
                        </div>
                        <div className={`text-[11px] font-bold mt-1 ${t.muted}`}>
                            {channel === 'whatsapp' ? 'on WhatsApp' : 'by email'}
                        </div>
                    </div>

                    <div className={`min-w-0 flex-1 border-l pl-4 ${t.border}`}>
                        {readiness.pending ? (
                            <p className={`text-[13px] font-medium ${t.muted}`}>Counting…</p>
                        ) : blockedBehind || blockedHere ? (
                            <>
                                <p className={`text-[13px] font-bold truncate ${t.heading}`}>{readiness.blocker}</p>
                                {readiness.fix && <p className={`text-[12px] font-medium truncate ${t.muted}`}>{readiness.fix}</p>}
                            </>
                        ) : readiness.ready && step === 'send' ? (
                            <p className={`text-[13px] font-bold ${t.success}`}>Ready — type SEND above.</p>
                        ) : (
                            <p className={`text-[13px] font-bold ${t.success}`}>
                                {step === 'audience' ? `${audienceLabel} — looks good.` : 'Message looks good.'}
                            </p>
                        )}
                    </div>

                    <div className="shrink-0">
                        {blockedBehind && blockedAt ? (
                            <button
                                type="button"
                                onClick={() => setStep(blockedAt)}
                                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold ${t.accentBg} ${t.accent} border`}
                            >
                                Fix it in step {ORDER.indexOf(blockedAt) + 1}
                            </button>
                        ) : next ? (
                            <button
                                type="button"
                                onClick={() => setStep(next)}
                                disabled={!canLeave(step)}
                                className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-bold bg-[#f57f20] text-white disabled:opacity-40 transition-opacity"
                            >
                                Continue <ArrowRight size={15} strokeWidth={2.5} />
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    )
}

function humanName(s: string) {
    const w = s.replace(/_/g, ' ')
    return w.charAt(0).toUpperCase() + w.slice(1)
}
