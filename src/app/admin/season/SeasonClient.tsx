'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Gift, Send } from 'lucide-react'
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
import { prettySeasonDate } from '@/contexts/subscriptions/domain/season-horizon'
import { OG, OG_DEEP, BODY } from '@/app/dashboard/_shared/tokens'
import type { AdminTokens } from '@/ui-system/tokens/admin-theme'

interface Props {
    settings: IntakeSettingsRow
    /** The CURRENT cycle's early-access list, oldest join first. */
    members: WaitlistMember[]
    season: SeasonPageData
}

const HEADLINE_MAX = 120
const BODY_MAX = 400

export function SeasonClient({ settings, members, season }: Props) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const waitlistCount = members.length

    // Where the list actually lives. Six people across six buildings is not a
    // restartable route and six in two buildings is, and the table makes you
    // read for that. Biggest cluster first, because the first dorm to reach a
    // workable size is the one that decides the restart.
    const dormSplit = useMemo(() => {
        const counts = new Map<string, number>()
        for (const m of members) {
            const key = m.dormName ?? 'No dorm set'
            counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    }, [members])

    // ── Restart target ───────────────────────────────────────────────────
    // Informational only. Reaching it never reopens intake — that stays a
    // deliberate press of the Resume button.
    const [targetDraft, setTargetDraft] = useState(settings.reopenTarget == null ? '' : String(settings.reopenTarget))
    const [targetPending, startTarget] = useTransition()
    const [targetError, setTargetError] = useState<string | null>(null)
    const targetDirty = targetDraft.trim() !== (settings.reopenTarget == null ? '' : String(settings.reopenTarget))

    function handleSaveTarget() {
        setTargetError(null)
        const raw = targetDraft.trim()
        const next = raw === '' ? null : Number(raw)
        if (next !== null && !Number.isInteger(next)) {
            setTargetError('Enter a whole number, or clear the box to remove the target.')
            return
        }
        startTarget(async () => {
            const result = await setReopenTarget(next)
            if ('error' in result) { setTargetError(result.error); return }
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
                        Plan the end of the season, see what it costs, and set the credit customers earn for joining the early-access list.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                <KPI
                    label="Status"
                    value={season.snapshot.phase === 'open' ? 'Open' : season.snapshot.phase === 'break' ? 'Break' : 'Winding down'}
                    t={t}
                    tone={season.snapshot.phase === 'open' ? 'success' : 'danger'}
                />
                <WaitlistKPI count={waitlistCount} target={settings.reopenTarget} t={t} />
                <KPI label="Credit range (AED)" value={`${Math.min(settings.creditVegAed, settings.creditNonvegAed, settings.creditReligiousAed)} to ${Math.max(settings.creditVegAed, settings.creditNonvegAed, settings.creditReligiousAed)}`} t={t} />
            </div>

            {/* ── Who is waiting ───────────────────────────────────────────
                The restart decision is made from this list, so it sits above
                every control on the page. Before this existed the whole thing
                was one number, and "9" cannot tell you whether those nine are
                spread across seven buildings or clustered in two. */}
            <div className={`mt-6 rounded-xl border p-5 ${t.card}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className={`text-[15px] font-black ${t.heading}`}>Who is waiting</div>
                        <div className={`text-[12px] font-medium mt-0.5 max-w-[56ch] ${t.muted}`}>
                            Everyone who saved a spot in the current pause. This is exactly the
                            audience a season-reopen broadcast reaches.
                        </div>
                    </div>

                    <div className="flex items-end gap-2">
                        <label className="flex flex-col gap-1.5">
                            <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>Restart at</span>
                            <input
                                type="number"
                                min={1}
                                max={1000}
                                step={1}
                                value={targetDraft}
                                placeholder="No target"
                                onChange={(e) => setTargetDraft(e.target.value)}
                                className={`w-[110px] rounded-lg border px-3 py-2 text-[13px] font-bold tabular-nums transition-colors ${t.input} ${t.inputFocus}`}
                            />
                        </label>
                        {targetDirty && (
                            <AdminButton onClick={handleSaveTarget} loading={targetPending}>
                                Save
                            </AdminButton>
                        )}
                    </div>
                </div>

                {targetError && (
                    <div className={`mt-3 text-[12px] font-bold ${t.danger}`}>{targetError}</div>
                )}

                {/* A target is a note to self, never a trigger. Say so once, here,
                    so nobody waits for a restart that was never going to happen
                    on its own. */}
                <div className={`mt-2 text-[11px] font-medium ${t.faint}`}>
                    The target is a marker only. Hitting it does not reopen intake — you still press Resume.
                </div>

                {dormSplit.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        {dormSplit.map(([dorm, n]) => (
                            <span
                                key={dorm}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${t.border} ${dorm === 'No dorm set' ? t.faint : t.body}`}
                            >
                                {dorm}
                                <span className="tabular-nums opacity-70">{n}</span>
                            </span>
                        ))}
                    </div>
                )}

                {members.length === 0 ? (
                    <div className={`mt-4 rounded-lg border border-dashed px-4 py-6 text-center ${t.border}`}>
                        <div className={`text-[13px] font-bold ${t.muted}`}>Nobody has saved a spot yet.</div>
                        <div className={`text-[11px] font-medium mt-1 ${t.faint}`}>
                            {settings.paused
                                ? 'The list fills as people reach a plan page and tap Save my spot.'
                                : 'Intake is open, so there is nothing to save a spot for. Pause it first.'}
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[620px] border-collapse">
                            <thead>
                                <tr className={t.tableHeader}>
                                    {['Name', 'Dorm', 'Eats', 'Credit', 'Joined', ''].map((h, i) => (
                                        <th
                                            key={h || `col-${i}`}
                                            className={`text-left text-[10px] font-black tracking-[0.1em] uppercase px-3 py-2 ${t.muted}`}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {members.map(m => (
                                    <tr key={m.id} className={`border-t ${t.border} ${t.tableRow}`}>
                                        <td className="px-3 py-2.5">
                                            <div className={`text-[13px] font-bold ${t.heading}`}>{m.name}</div>
                                            {m.whatsapp && (
                                                <div className={`text-[11px] font-medium tabular-nums ${t.faint}`}>{m.whatsapp}</div>
                                            )}
                                        </td>
                                        <td className={`px-3 py-2.5 text-[12px] font-medium ${m.dormName ? t.body : t.faint}`}>
                                            {m.dormName ?? 'Not set'}
                                        </td>
                                        <td className={`px-3 py-2.5 text-[12px] font-medium ${m.mealPreference ? t.body : t.faint}`}>
                                            {m.mealPreference ?? 'Not set'}
                                        </td>
                                        {/* A missing credit is a real reconciliation task (the mint can
                                            fail without failing the join), so it is marked, not shown
                                            as a comfortable zero. */}
                                        <td className="px-3 py-2.5">
                                            {m.creditAed == null ? (
                                                <span className={`text-[12px] font-bold ${t.danger}`}>None minted</span>
                                            ) : (
                                                <span className={`text-[12px] font-bold tabular-nums ${t.body}`}>AED {m.creditAed}</span>
                                            )}
                                        </td>
                                        <td className={`px-3 py-2.5 text-[12px] font-medium tabular-nums ${t.body}`}>
                                            {prettySeasonDate(m.joinedAt.slice(0, 10))}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {m.notifiedAt && (
                                                <span className={`text-[10px] font-black tracking-[0.08em] uppercase ${t.success}`}>Messaged</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <SeasonPlanner data={season} />

            {season.snapshot.phase === 'open' && (
                <div className={`mt-4 rounded-xl border p-5 ${t.card}`}>
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

        </div>
    )
}

// ── KPI ──────────────────────────────────────────────────────────────────

/**
 * The early-access count, as progress toward the restart target when one is
 * set. A bare number cannot answer the only question the owner has during a
 * pause ("are we close?"), and a percentage would be worse — the meaningful
 * unit here is people, not percent. So the figure stays a count and the target
 * rides beside it, with a hairline bar for the at-a-glance read.
 */
function WaitlistKPI({ count, target, t }: { count: number; target: number | null; t: AdminTokens }) {
    // Clamped so a list that overshoots the target renders a full bar rather
    // than one that runs out of its own track.
    const pct = target && target > 0 ? Math.min(100, Math.round((count / target) * 100)) : null
    const reached = target != null && count >= target

    return (
        <div className={`rounded-xl border px-4 py-3 ${t.card}`}>
            <div className={`text-[10px] font-bold tracking-[0.08em] uppercase ${t.muted}`}>Saved spots</div>
            <div className={`text-2xl font-black mt-0.5 tabular-nums ${reached ? t.success : t.heading}`}>
                {count}
                {target != null && (
                    <span className={`text-[13px] font-bold ml-1 ${t.muted}`}>of {target}</span>
                )}
            </div>
            {pct != null && (
                <div className="mt-2 h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'rgba(128,128,128,0.22)' }}>
                    <div
                        className="h-full rounded-full"
                        style={{
                            width: `${pct}%`,
                            // Brand orange is the ceiling — the bar fades lighter
                            // toward it and never darkens past it.
                            background: `linear-gradient(90deg, ${OG_DEEP} 0%, ${OG} 100%)`,
                            transition: 'width 200ms ease',
                        }}
                    />
                </div>
            )}
        </div>
    )
}

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
    const headlineDot = !/[.!?…]$/.test(headline.trim())
    return (
        <div style={{
            background: 'linear-gradient(180deg, #fdfbf6 0%, #fdfbf6 58%, #fdf1e3 100%)',
            border: '1px solid rgba(245,127,32,0.40)',
            borderRadius: 22,
            boxShadow: '0 1px 2px rgba(9,24,37,0.04), 0 8px 24px -12px rgba(9,24,37,0.16)',
            padding: 22,
            display: 'flex', flexDirection: 'column', gap: 14,
            fontFamily: BODY,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(245,127,32,0.12)', color: OG, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Gift size={13} strokeWidth={2.4} />
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(9,24,37,0.45)' }}>Seasonal break</span>
            </div>
            <div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#091825', lineHeight: 1.25 }}>
                    {headline.trim() || 'Headline goes here'}{headlineDot && <span style={{ color: OG }}>.</span>}
                </div>
                <div style={{ margin: '8px 0 0', fontSize: 12.5, color: 'rgba(9,24,37,0.65)', lineHeight: 1.55 }}>
                    {body.trim() || 'Body copy goes here.'}
                </div>
            </div>
            <div>
                <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: OG_DEEP, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>AED {creditAed}</span>
                <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(9,24,37,0.55)' }}>yours if you save your spot</div>
            </div>
            <div style={{
                minHeight: 44, width: '100%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '14px 18px',
                background: OG, color: '#fff', opacity: 0.55,
                borderRadius: 999,
                fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
                Save my spot
            </div>
        </div>
    )
}
