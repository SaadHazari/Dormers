'use client'

/**
 * The Season page's body (spec §11.1 to §11.3, laid out per
 * docs/superpowers/specs/2026-09-16-season-page-redesign.md).
 *
 * One skeleton in every phase: where the season is, what needs the owner,
 * the kitchen calendar beside the one decision that matters now, the people
 * and plans behind it, and the rarer moves tucked at the foot. Every number
 * comes from the pure projection in src/contexts/season/domain, fed the live
 * rows from season-data.ts.
 */

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Send } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { KitchenCalendar } from './KitchenCalendar'
import { NeedsYou } from './NeedsYou'
import { BreakLists, ReopenPanel } from './BreakBoard'
import { breakBoardView, refundQueue } from './season-break-view'
import {
    scheduleSeasonEndAction,
    moveSeasonEndAction,
    clearSeasonEndAction,
    stopSeasonSalesAction,
    resumeSeasonSalesAction,
    endSeasonTodayAction,
} from './actions'
import type { SeasonPageData, SeasonPlanRow } from './season-data'
import type { WaitlistMember } from './page'
import { Chip, ConfirmDialog, Panel, PhaseRail, RowList, Section, plural } from './season-ui'
import {
    addDaysIso,
    closeDayFor,
    formatShortDay,
    todayAeIso,
    validateSeasonEnd,
    DEFAULT_BUFFER_DAYS,
    MAX_BUFFER_DAYS,
} from '@/contexts/season/domain/season-dates'
import {
    allowedSeasonActions,
    visibleSeasonActions,
    seasonDriftMessage,
    type SeasonAction,
    type SeasonSnapshot,
} from '@/contexts/season/domain/season-phase'
import { SEASON_BREAK_RELEASE_LIVE, SEASON_REFUNDS_LIVE } from '@/contexts/season/domain/season-release'
import {
    projectPlan,
    lastMealOnTheBooks,
    kitchenCalendar,
    summarizeSeason,
    type Disposition,
    type KitchenDay,
    type PlanProjection,
    type SeasonSummary,
} from '@/contexts/season/domain/season-projection'
import { formatAed } from '@/contexts/season/domain/meal-value'

export const END_TODAY_PHRASE = 'END SEASON'

type ConfirmKind = Exclude<SeasonAction, 'reopen'>

const DISPOSITION: Record<Disposition, { label: string; tone: 'quiet' | 'held' | 'wait' | 'done'; order: number }> = {
    runs_past: { label: 'Runs past', tone: 'held', order: 0 },
    starts_after: { label: 'Starts after', tone: 'held', order: 1 },
    staff_pending: { label: 'Staff approval pending', tone: 'wait', order: 2 },
    customer_paused: { label: 'Customer paused', tone: 'quiet', order: 3 },
    finishes: { label: 'Finishes', tone: 'done', order: 4 },
}

export const prettyDay = formatShortDay

interface SeasonView {
    projections: Map<string, PlanProjection>
    calendar: KitchenDay[]
    summary: SeasonSummary
    exposureFils: number
    exposureEstimated: boolean
    exposureUnknownPlans: number
}

function buildView(data: SeasonPageData, closures: ReadonlySet<string>, wrapUpDay: string | null, closeDay: string | null): SeasonView {
    const list = data.plans.map((plan) => projectPlan(plan, { todayAe: data.todayAe, closureDates: closures, wrapUpDay, closeDay }))
    const calendar = kitchenCalendar(data.plans, list)
    const projections = new Map(list.map((p) => [p.planId, p]))
    let exposureFils = 0
    let exposureEstimated = false
    let exposureUnknownPlans = 0
    for (const plan of data.plans) {
        const meals = projections.get(plan.id)?.mealsAfterWrapUp ?? 0
        if (meals === 0) continue
        if (!plan.mealValue) { exposureUnknownPlans += 1; continue }
        exposureFils += meals * plan.mealValue.fils
        if (!plan.mealValue.exact) exposureEstimated = true
    }
    return {
        projections,
        calendar,
        summary: summarizeSeason(list, calendar, data.kitchenDailyCostAed),
        exposureFils,
        exposureEstimated,
        exposureUnknownPlans,
    }
}

function exposureText(view: SeasonView): string {
    const money = `${formatAed(view.exposureFils)}${view.exposureEstimated ? ' est.' : ''}`
    return view.exposureUnknownPlans > 0
        ? `${money} + ${plural(view.exposureUnknownPlans, 'plan', 'plans')} with no price`
        : money
}

const keptOrRefunded = SEASON_REFUNDS_LIVE ? 'kept for next semester or refunded' : 'kept for next semester'

function confirmCopy(
    kind: ConfirmKind,
    c: { wrap: string; buffer: number; snapshot: SeasonSnapshot; view: SeasonView; endTodayView: SeasonView; plans: readonly SeasonPlanRow[] },
): { title: string; lines: string[]; cta: string; danger: boolean } {
    if (kind === 'schedule' || kind === 'move') {
        const s = c.view.summary
        const d = s.byDisposition
        return {
            title: kind === 'schedule' ? 'Schedule the season end?' : 'Move the season end?',
            lines: [
                `Last regular dinner **${prettyDay(c.wrap)}**, last kitchen day **${prettyDay(closeDayFor(c.wrap, c.buffer))}** (${plural(c.buffer, 'make-up day', 'make-up days')}). The break starts that night.`,
                `The kitchen cooks **${plural(s.kitchenDays, 'more day', 'more days')}**.`,
                `${plural(d.finishes, 'plan finishes', 'plans finish')}, ${plural(d.runs_past, 'runs', 'run')} past, ${plural(d.starts_after, 'starts', 'start')} after, ${plural(d.customer_paused, 'customer pause waits', 'customer pauses wait')}.`,
                s.mealsAfterWrapUp > 0
                    ? `**${plural(s.mealsAfterWrapUp, 'meal', 'meals')}** (${exposureText(c.view)}) ${keptOrRefunded}.`
                    : 'No meals are left after the wrap-up day.',
                `New plans must finish by ${prettyDay(c.wrap)}.`,
            ],
            cta: kind === 'schedule' ? 'Yes, schedule it' : 'Yes, move it',
            danger: false,
        }
    }
    if (kind === 'clear') {
        return {
            title: 'Clear the wrap-up day?',
            lines: c.snapshot.salesStopped
                ? ['Sales stay stopped.', 'With no wrap-up day the kitchen cooks until the last plan ends.']
                : ['Every plan goes back on sale at full length straight away.', 'The season end is cancelled.'],
            cta: 'Yes, clear it',
            danger: false,
        }
    }
    if (kind === 'stop_sales') {
        return {
            title: 'Stop sales now?',
            lines: [
                'Nobody can buy or renew a plan from now on.',
                'Plans already paid for keep running.',
                c.snapshot.wrapUpDay
                    ? `The wrap-up day stays ${prettyDay(c.snapshot.wrapUpDay)}.`
                    : 'No wrap-up day is set yet, so pick one on the calendar next.',
            ],
            cta: 'Yes, stop sales',
            danger: true,
        }
    }
    if (kind === 'resume_sales') {
        return {
            title: 'Resume sales?',
            lines: c.snapshot.wrapUpDay
                ? [`Plans that finish by **${prettyDay(c.snapshot.wrapUpDay)}** go back on sale.`]
                : ['Every plan goes back on sale at full length, and the season end is cancelled.', 'Saved spots holding credit see the reopened notice.'],
            cta: 'Yes, resume sales',
            danger: false,
        }
    }
    const e = c.endTodayView.summary
    const heldNames = c.plans
        .filter((p) => {
            const d = c.endTodayView.projections.get(p.id)?.disposition
            return d === 'runs_past' || d === 'starts_after'
        })
        .map((p) => `${p.customerName} (${p.planName})`)
    return {
        title: 'End the season today?',
        lines: [
            '**Tonight is the last kitchen night.** Sales stop now and the break starts at 00:20.',
            e.mealsAfterWrapUp > 0
                ? `**${plural(e.mealsAfterWrapUp, 'meal', 'meals')}** (${exposureText(c.endTodayView)}) ${keptOrRefunded}${heldNames.length ? `: ${heldNames.join(', ')}` : ''}.`
                : 'No plan has meals after today.',
            'Skips whose make-up day would fall after today become wallet credit.',
        ],
        cta: 'End the season today',
        danger: true,
    }
}

export function SeasonPlanner({ data, members, waiting, customerView }: {
    data: SeasonPageData
    members: WaitlistMember[]
    /** The saved-spots column. */
    waiting: ReactNode
    /** The "What customers see" section. */
    customerView: ReactNode
}) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const { snapshot, todayAe } = data
    const onBreak = snapshot.phase === 'break'
    const closures = useMemo(() => new Set(data.closureDates), [data.closureDates])
    const actions = visibleSeasonActions(allowedSeasonActions(snapshot, todayAe), SEASON_BREAK_RELEASE_LIVE)
    const canSchedule = actions.includes('schedule')
    const canMove = actions.includes('move')
    const editing = canSchedule || canMove

    const books = useMemo(() => buildView(data, closures, null, null), [data, closures])
    const lastOnBooks = useMemo(() => lastMealOnTheBooks([...books.projections.values()]), [books])

    // The default draft is never a day that's already invalid: the last meal
    // on the books can be today or earlier (a plan that's already finishing),
    // so the draft falls back to tomorrow whenever that meal isn't later.
    const tomorrow = addDaysIso(todayAe, 1)
    const defaultWrapDraft = lastOnBooks && lastOnBooks.date > tomorrow ? lastOnBooks.date : tomorrow
    const [wrapDraft, setWrapDraft] = useState(snapshot.wrapUpDay ?? defaultWrapDraft)
    const [bufferDraft, setBufferDraft] = useState(snapshot.wrapUpDay ? snapshot.bufferDays : DEFAULT_BUFFER_DAYS)
    const draftError = editing ? validateSeasonEnd({ wrapUpDay: wrapDraft, bufferDays: bufferDraft, todayAe }) : null
    const draftChanged = wrapDraft !== snapshot.wrapUpDay || bufferDraft !== snapshot.bufferDays

    const shownWrap = editing && !draftError ? wrapDraft : snapshot.wrapUpDay
    const shownClose = editing && !draftError ? closeDayFor(wrapDraft, bufferDraft) : snapshot.closeDay
    const view = useMemo(() => buildView(data, closures, shownWrap, shownClose), [data, closures, shownWrap, shownClose])
    const endTodayView = useMemo(() => buildView(data, closures, todayAe, todayAe), [data, closures, todayAe])
    const kitchenDaysSaved = shownWrap ? Math.max(0, books.calendar.length - view.calendar.length) : 0
    const breakView = useMemo(() => breakBoardView(data), [data])

    const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
    const [phrase, setPhrase] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    const rows = useMemo(
        () => [...data.plans].sort((a, b) => {
            const pa = view.projections.get(a.id)
            const pb = view.projections.get(b.id)
            if (!pa || !pb) return 0
            return DISPOSITION[pa.disposition].order - DISPOSITION[pb.disposition].order
                || (pb.lastDinner ?? '').localeCompare(pa.lastDinner ?? '')
                || a.customerName.localeCompare(b.customerName)
        }),
        [data.plans, view],
    )

    function openConfirm(kind: ConfirmKind) {
        setError(null)
        setPhrase('')
        setConfirm(kind)
    }

    function runConfirmed() {
        const kind = confirm
        if (!kind) return
        setError(null)
        startTransition(async () => {
            const result =
                kind === 'schedule' ? await scheduleSeasonEndAction(wrapDraft, bufferDraft)
                : kind === 'move' ? await moveSeasonEndAction(wrapDraft, bufferDraft)
                : kind === 'clear' ? await clearSeasonEndAction()
                : kind === 'stop_sales' ? await stopSeasonSalesAction()
                : kind === 'resume_sales' ? await resumeSeasonSalesAction()
                : await endSeasonTodayAction()
            if ('error' in result) { setError(result.error); return }
            setConfirm(null)
            setPhrase('')
            router.refresh()
        })
    }

    const drift = seasonDriftMessage(data.paused, snapshot)
    const salesStoppedOn = data.salesStoppedAt ? prettyDay(todayAeIso(Date.parse(data.salesStoppedAt))) : null
    const status = statusLine(data, lastOnBooks?.date ?? null, view.summary.kitchenDays, salesStoppedOn)
    const copy = confirm ? confirmCopy(confirm, { wrap: wrapDraft, buffer: bufferDraft, snapshot, view, endTodayView, plans: data.plans }) : null
    const unminted = members.filter((m) => m.creditAed == null)
    const moreMoves = actions.filter((a): a is 'clear' | 'end_today' => a === 'clear' || a === 'end_today')
    // Once the wrap-up day has passed, Clear is the only move left; it belongs
    // in the panel, not hidden at the foot.
    const clearInPanel = !editing && !onBreak && actions.includes('clear')

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className={`text-[13px] font-black uppercase tracking-[0.12em] ${t.muted}`}>Season</h1>
                    <PhaseRail phase={snapshot.phase} />
                </div>
                <div data-testid="season-status">
                    <div className={`text-[28px] leading-tight font-black tracking-tight ${t.heading}`}>{status.title}</div>
                    <div className={`mt-2 text-[14px] leading-relaxed max-w-[64ch] ${t.body}`}>{status.text}</div>
                </div>
                {snapshot.phase === 'open' && (
                    <Link
                        href="/admin/comms/broadcast?preset=reopen"
                        className={`self-start inline-flex items-center gap-2 text-[13px] font-bold ${t.accent} hover:underline underline-offset-4`}
                    >
                        <Send size={14} strokeWidth={2.2} aria-hidden />
                        Just reopened? Send the reopening notice
                    </Link>
                )}
            </header>

            <NeedsYou
                refunds={refundQueue(data.holds)}
                drift={drift}
                cookingDuringBreak={onBreak ? breakView.cookingDuringBreak : []}
                unminted={unminted}
            />

            <Panel className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="p-4 sm:p-6 min-w-0">
                    <h2 className={`mb-4 text-[11px] font-black uppercase tracking-[0.12em] ${t.muted}`}>Kitchen calendar</h2>
                    <KitchenCalendar
                        todayAe={todayAe}
                        cooking={onBreak ? [] : view.calendar}
                        books={onBreak ? [] : books.calendar}
                        closures={closures}
                        wrapUpDay={onBreak ? null : shownWrap}
                        closeDay={onBreak ? snapshot.closeDay : shownClose}
                        onBreak={onBreak}
                        onPick={editing ? (iso) => { setWrapDraft(iso); setError(null) } : undefined}
                    />
                </div>
                <aside className={`p-4 sm:p-6 border-t lg:border-t-0 lg:border-l flex flex-col gap-6 ${t.border}`}>
                    {onBreak ? (
                        <ReopenPanel view={breakView} savedSpots={members.length} />
                    ) : (
                        <>
                            <div>
                                <div className={`text-[12px] font-bold ${t.muted}`}>
                                    {!shownWrap ? 'Last meal on the books' : editing && draftChanged ? 'If the season ends here' : 'This season end'}
                                </div>
                                {!shownWrap ? (
                                    <>
                                        <div className={`mt-1 text-[28px] font-black tracking-tight tabular-nums ${t.heading}`}>{lastOnBooks ? prettyDay(lastOnBooks.date) : 'None'}</div>
                                        <div className={`text-[13px] ${t.muted}`}>{plural(books.calendar.length, 'kitchen day', 'kitchen days')} if nothing ends early</div>
                                    </>
                                ) : (
                                    <>
                                        <div className={`mt-1 text-[28px] font-black tracking-tight tabular-nums ${t.heading}`}>
                                            {view.summary.kitchenDays} <span className={`text-[14px] font-bold ${t.muted}`}>kitchen days</span>
                                        </div>
                                        <dl className={`mt-3 flex flex-col gap-2 text-[13px] ${t.body}`}>
                                            <Fact term="Wrap-up day" value={prettyDay(shownWrap)} />
                                            <Fact term="Last kitchen day" value={prettyDay(shownClose ?? shownWrap)} />
                                            <Fact
                                                term="Held for next semester"
                                                value={view.summary.mealsAfterWrapUp > 0 ? plural(view.summary.mealsAfterWrapUp, 'meal', 'meals') : 'Nothing'}
                                                accent={view.summary.mealsAfterWrapUp > 0}
                                            />
                                            {view.exposureFils > 0 && <Fact term="Worth" value={`${formatAed(view.exposureFils)}${view.exposureEstimated ? ' est.' : ''}`} />}
                                            {view.exposureUnknownPlans > 0 && <Fact term="No price on record" value={plural(view.exposureUnknownPlans, 'plan', 'plans')} />}
                                            {kitchenDaysSaved > 0 && <Fact term="Saved vs the books" value={plural(kitchenDaysSaved, 'kitchen day', 'kitchen days')} />}
                                        </dl>
                                        <div className={`mt-2 text-[12px] ${t.faint}`}>Last meal on the books {lastOnBooks ? prettyDay(lastOnBooks.date) : 'none'}</div>
                                    </>
                                )}
                            </div>

                            {editing && (
                                <div className="flex flex-col gap-4">
                                    <div>
                                        <div id="season-buffer-label" className={`text-[12px] font-bold ${t.muted}`}>Make-up days after the wrap-up day</div>
                                        <div role="radiogroup" aria-labelledby="season-buffer-label" className={`mt-2 inline-flex rounded-lg border p-1 ${t.border}`}>
                                            {Array.from({ length: MAX_BUFFER_DAYS + 1 }, (_, n) => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={bufferDraft === n}
                                                    onClick={() => { setBufferDraft(n); setError(null) }}
                                                    className={`h-8 w-10 rounded-md text-[13px] font-bold tabular-nums transition-colors ${
                                                        bufferDraft === n ? 'bg-[#f57f20] text-white' : `${t.body} hover:bg-[#f57f20]/10`
                                                    }`}
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                        <div className={`mt-2 text-[12px] ${t.faint}`}>They only cook make-up meals from skips, and are never sold.</div>
                                    </div>
                                    {draftError && <p role="alert" className={`text-[12px] font-bold ${t.danger}`}>{draftError}</p>}
                                    {canMove && !draftChanged ? (
                                        <p className={`text-[12px] ${t.muted}`}>To move the end, tap another day on the calendar.</p>
                                    ) : (
                                        <AdminButton
                                            className="w-full"
                                            onClick={() => openConfirm(canMove ? 'move' : 'schedule')}
                                            disabled={Boolean(draftError) || pending}
                                        >
                                            {canMove ? 'Save new dates' : 'Schedule'}
                                        </AdminButton>
                                    )}
                                    {canMove && draftChanged && (
                                        <button
                                            type="button"
                                            onClick={() => { setWrapDraft(snapshot.wrapUpDay ?? defaultWrapDraft); setBufferDraft(snapshot.bufferDays) }}
                                            className={`-mt-2 self-center text-[12px] font-bold ${t.muted} hover:underline underline-offset-4`}
                                        >
                                            Undo changes
                                        </button>
                                    )}
                                </div>
                            )}

                            {clearInPanel && (
                                <div className="flex flex-col gap-2">
                                    <p className={`text-[13px] ${t.body}`}>The wrap-up day has passed, so the dates can no longer move. To change them, clear the wrap-up day and schedule again.</p>
                                    <AdminButton variant="ghost" onClick={() => openConfirm('clear')} disabled={pending}>Clear the wrap-up day</AdminButton>
                                </div>
                            )}

                            {(actions.includes('stop_sales') || actions.includes('resume_sales')) && (
                                <div className={`flex flex-col gap-3 border-t pt-4 ${t.border}`}>
                                    <div>
                                        <div className={`text-[12px] font-bold ${t.muted}`}>Sales</div>
                                        <div className={`mt-1 text-[14px] font-black ${snapshot.salesStopped ? t.warning : t.heading}`}>
                                            {snapshot.salesStopped ? 'Stopped' : snapshot.wrapUpDay ? `Open, plans ending by ${prettyDay(snapshot.wrapUpDay)}` : 'Open'}
                                        </div>
                                    </div>
                                    {actions.includes('stop_sales') ? (
                                        <AdminButton variant="ghost" onClick={() => openConfirm('stop_sales')} disabled={pending}>Stop sales now</AdminButton>
                                    ) : (
                                        <AdminButton variant="ghost" onClick={() => openConfirm('resume_sales')} disabled={pending}>
                                            {snapshot.wrapUpDay ? 'Resume sales' : 'Resume sales and end the season'}
                                        </AdminButton>
                                    )}
                                </div>
                            )}
                            {error && !confirm && <p role="alert" className={`text-[12px] font-bold ${t.danger}`}>{error}</p>}
                        </>
                    )}
                </aside>
            </Panel>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
                <div className="min-w-0">
                    {onBreak ? (
                        <BreakLists view={breakView} />
                    ) : (
                        <Section title="Plans on the books" count={rows.length}>
                            <PlansList rows={rows} view={view} />
                        </Section>
                    )}
                </div>
                {waiting}
            </div>

            {customerView}

            {!onBreak && moreMoves.filter((a) => !(clearInPanel && a === 'clear')).length > 0 && (
                <MoreMoves
                    moves={moreMoves.filter((a) => !(clearInPanel && a === 'clear'))}
                    onPick={openConfirm}
                    pending={pending}
                />
            )}

            {confirm && copy && (
                <ConfirmDialog
                    title={copy.title}
                    lines={copy.lines}
                    cta={copy.cta}
                    danger={copy.danger}
                    pending={pending}
                    error={error}
                    onCancel={() => setConfirm(null)}
                    onConfirm={runConfirmed}
                    confirmDisabled={confirm === 'end_today' && phrase.trim() !== END_TODAY_PHRASE}
                >
                    {confirm === 'end_today' && (
                        <label className="flex flex-col gap-2" htmlFor="season-end-today-phrase">
                            <span className={`text-[12px] font-bold ${t.muted}`}>Type {END_TODAY_PHRASE} to confirm</span>
                            <input
                                id="season-end-today-phrase"
                                value={phrase}
                                onChange={(e) => setPhrase(e.target.value)}
                                placeholder={END_TODAY_PHRASE}
                                autoComplete="off"
                                className={`rounded-lg border px-3 py-2 text-[13px] font-semibold ${t.input} ${t.inputFocus}`}
                            />
                        </label>
                    )}
                </ConfirmDialog>
            )}
        </div>
    )
}

function statusLine(data: SeasonPageData, lastBooked: string | null, kitchenDays: number, salesStoppedOn: string | null): { title: string; text: string } {
    const s = data.snapshot
    if (s.phase === 'open') {
        return {
            title: 'Open',
            text: `Selling normally. The kitchen cooks every plan on the books${lastBooked ? `, the last one on ${prettyDay(lastBooked)}` : ''}. To end the season, tap its last regular dinner on the calendar.`,
        }
    }
    if (s.phase === 'break') {
        return {
            title: 'On the break',
            text: `${s.closeDay ? `The last kitchen day was ${prettyDay(s.closeDay)}. ` : ''}No sales and no cooking until you reopen. Held plans restart only when their customers tap Resume or pick a start date.`,
        }
    }
    if (!s.wrapUpDay) {
        return {
            title: 'Sales stopped, no wrap-up day',
            text: `${salesStoppedOn ? `Sales stopped on ${salesStoppedOn}. ` : ''}The kitchen keeps cooking until the last plan ends, and a customer who resumes a pause keeps it running. Pick the wrap-up day on the calendar.`,
        }
    }
    const passed = s.wrapUpDay <= data.todayAe
    return {
        title: `Winding down to ${prettyDay(s.wrapUpDay)}`,
        text: passed
            ? `Regular dinners have ended. The last kitchen day is ${prettyDay(s.closeDay ?? s.wrapUpDay)} and the break starts that night.`
            : `${plural(kitchenDays, 'kitchen day', 'kitchen days')} to go. The last kitchen day is ${prettyDay(s.closeDay ?? s.wrapUpDay)} and the break starts that night. ${s.salesStopped ? 'Sales are stopped.' : 'Sales are open for plans that finish by the wrap-up day.'}`,
    }
}

function Fact({ term, value, accent }: { term: string; value: string; accent?: boolean }) {
    const { t } = useAdminTheme()
    return (
        <div className="flex items-baseline justify-between gap-3">
            <dt className={t.muted}>{term}</dt>
            <dd className={`text-right font-bold tabular-nums ${accent ? t.accent : t.heading}`}>{value}</dd>
        </div>
    )
}

function PlansList({ rows, view }: { rows: SeasonPlanRow[]; view: SeasonView }) {
    const { t } = useAdminTheme()
    return (
        <RowList
            rows={rows}
            empty="No live plans."
            columns="minmax(0,1.3fr) minmax(0,1.1fr) 168px 96px 80px 112px"
            headers={['Customer', 'Plan', 'Season', 'Last dinner', 'Held', 'Meal value']}
            cells={(plan) => {
                const p = view.projections.get(plan.id)
                const d = p ? DISPOSITION[p.disposition] : null
                return [
                    <div key="c" className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className={`font-bold truncate ${t.heading}`}>{plan.customerName}</div>
                            <div className={`text-[12px] truncate ${t.muted}`}>{plan.dormName ?? 'No dorm set'}</div>
                        </div>
                        {d && <span className="md:hidden"><Chip tone={d.tone}>{d.label}</Chip></span>}
                    </div>,
                    <div key="p">
                        <div className={t.body}>{plan.planName}</div>
                        <div className={`text-[12px] ${t.muted}`}>{plan.status}</div>
                    </div>,
                    d ? <span key="s" className="hidden md:inline"><Chip tone={d.tone}>{d.label}</Chip></span> : null,
                    <div key="l" className={`tabular-nums ${t.body}`}>
                        <span className={`md:hidden text-[12px] ${t.muted}`}>Last dinner </span>
                        {p?.lastDinner ? prettyDay(p.lastDinner) : 'None'}
                    </div>,
                    <div key="h" className={`tabular-nums ${p && p.mealsAfterWrapUp > 0 ? `font-bold ${t.accent}` : t.faint}`}>
                        <span className={`md:hidden text-[12px] font-normal ${t.muted}`}>Held </span>
                        {p && p.mealsAfterWrapUp > 0 ? plural(p.mealsAfterWrapUp, 'meal', 'meals') : '0'}
                    </div>,
                    <div key="v" className={`tabular-nums ${plan.mealValue ? t.body : t.faint}`}>
                        <span className={`md:hidden text-[12px] ${t.muted}`}>Meal </span>
                        {plan.mealValue ? `${formatAed(plan.mealValue.fils)}${plan.mealValue.exact ? '' : ' est.'}` : 'Unknown'}
                    </div>,
                ]
            }}
        />
    )
}

const MOVE_COPY: Record<'clear' | 'end_today', { label: string; text: string }> = {
    clear: { label: 'Clear the wrap-up day', text: 'Cancel the season end. The kitchen goes back to cooking every plan on the books.' },
    end_today: { label: 'End the season today', text: 'Tonight becomes the last kitchen night. For when the season has to stop now.' },
}

function MoreMoves({ moves, onPick, pending }: { moves: Array<'clear' | 'end_today'>; onPick: (k: ConfirmKind) => void; pending: boolean }) {
    const { t } = useAdminTheme()
    return (
        <details className={`group rounded-xl border ${t.border}`}>
            <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-6 [&::-webkit-details-marker]:hidden ${t.body}`}>
                <span>
                    <span className={`text-[11px] font-black uppercase tracking-[0.12em] ${t.muted}`}>More moves</span>
                    <span className={`ml-3 text-[13px] ${t.muted}`}>{moves.map((m) => MOVE_COPY[m].label).join(' · ')}</span>
                </span>
                <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ul className={`border-t ${t.border}`}>
                {moves.map((m) => (
                    <li key={m} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 border-b last:border-b-0 ${t.border}`}>
                        <div className="min-w-0 max-w-[56ch]">
                            <div className={`text-[13px] font-bold ${t.heading}`}>{MOVE_COPY[m].label}</div>
                            <div className={`text-[12px] ${t.muted}`}>{MOVE_COPY[m].text}</div>
                        </div>
                        <AdminButton variant={m === 'end_today' ? 'danger' : 'ghost'} onClick={() => onPick(m)} disabled={pending}>
                            {MOVE_COPY[m].label}
                        </AdminButton>
                    </li>
                ))}
            </ul>
        </details>
    )
}
