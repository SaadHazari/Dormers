'use client'

/**
 * Season planner (spec §11.1 and §11.2).
 *
 * Open, or sales stopped with no wrap-up day: the owner sees the last meal on
 * the books and the kitchen calendar, tries a wrap-up day and a buffer, and
 * reads what that choice costs before scheduling it. Winding down: the same
 * view is the wind-down board, with move, clear, stop or resume sales, and end
 * today. Every number comes from the pure projection in
 * src/contexts/season/domain, fed the live rows from season-data.ts.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarClock, Pause, Play, Power, XCircle } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminButton } from '../_components/AdminButton'
import { BreakBoard } from './BreakBoard'
import { RefundQueue } from './RefundQueue'
import { refundQueue } from './season-break-view'
import {
    scheduleSeasonEndAction,
    moveSeasonEndAction,
    clearSeasonEndAction,
    stopSeasonSalesAction,
    resumeSeasonSalesAction,
    endSeasonTodayAction,
} from './actions'
import type { SeasonPageData, SeasonPlanRow } from './season-data'
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
import type { AdminTokens } from '@/ui-system/tokens/admin-theme'

export const END_TODAY_PHRASE = 'END SEASON'

type ConfirmKind = Exclude<SeasonAction, 'reopen'>

const DISPOSITION_LABEL: Record<Disposition, string> = {
    runs_past: 'Runs past',
    starts_after: 'Starts after',
    customer_paused: 'Customer paused',
    staff_pending: 'Staff approval pending',
    finishes: 'Finishes',
}

const DISPOSITION_ORDER: Record<Disposition, number> = {
    runs_past: 0,
    starts_after: 1,
    customer_paused: 2,
    staff_pending: 3,
    finishes: 4,
}

export const prettyDay = formatShortDay

function plural(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`
}

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
    const money = `${formatAed(view.exposureFils)}${view.exposureEstimated ? ' (estimated)' : ''}`
    return view.exposureUnknownPlans > 0
        ? `${money}, plus ${plural(view.exposureUnknownPlans, 'plan', 'plans')} with no price on record`
        : money
}

function confirmCopy(
    kind: ConfirmKind,
    c: { wrap: string; buffer: number; snapshot: SeasonSnapshot; view: SeasonView; endTodayView: SeasonView; books: SeasonView; plans: readonly SeasonPlanRow[] },
): { title: string; body: string[]; cta: string; danger: boolean } {
    if (kind === 'schedule' || kind === 'move') {
        const s = c.view.summary.byDisposition
        const summary = c.view.summary
        const booksSummary = c.books.summary
        return {
            title: kind === 'schedule' ? 'Schedule the season end?' : 'Move the season end?',
            body: [
                `Wrap-up day ${prettyDay(c.wrap)}, buffer ${plural(c.buffer, 'delivery day', 'delivery days')}, close day ${prettyDay(closeDayFor(c.wrap, c.buffer))}. The break starts the night after the close day.`,
                `${plural(s.finishes, 'plan finishes', 'plans finish')}, ${plural(s.runs_past, 'plan runs', 'plans run')} past the wrap-up day, ${plural(s.starts_after, 'plan starts', 'plans start')} after it, and ${plural(s.customer_paused, 'customer pause waits', 'customer pauses wait')} for next semester.`,
                SEASON_BREAK_RELEASE_LIVE
                    ? (summary.mealsAfterWrapUp > 0
                        ? `${plural(summary.mealsAfterWrapUp, 'meal is', 'meals are')} left after the wrap-up day: ${exposureText(c.view)} kept for next semester${SEASON_REFUNDS_LIVE ? ' or refunded' : ''}.`
                        : 'No meals are left after the wrap-up day.')
                    : (summary.mealsAfterWrapUp > 0
                        ? `${plural(summary.mealsAfterWrapUp, 'meal is', 'meals are')} due after the wrap-up day (${exposureText(c.view)}). For now they keep delivering. Holding or refunding them arrives with the season break.`
                        : 'No meals are left after the wrap-up day.'),
                SEASON_BREAK_RELEASE_LIVE
                    ? `The kitchen cooks ${plural(summary.kitchenDays, 'more day', 'more days')} (${formatAed(summary.kitchenCostAed * 100)}).`
                    : `Until the season break goes live the kitchen cooks for every plan on the books (${booksSummary.kitchenDays} days, ${formatAed(booksSummary.kitchenCostAed * 100)}). With it, this wrap-up day would make it ${summary.kitchenDays} days (${formatAed(summary.kitchenCostAed * 100)}).`,
                `From now on, new plans must finish by ${prettyDay(c.wrap)}.`,
            ],
            cta: kind === 'schedule' ? 'Yes, schedule it' : 'Yes, move it',
            danger: false,
        }
    }
    if (kind === 'clear') {
        return {
            title: 'Clear the wrap-up day?',
            body: c.snapshot.salesStopped
                ? ['Sales stay stopped. With no wrap-up day the kitchen keeps cooking until the last plan ends.']
                : ['Every plan goes back on sale at full length straight away, and the season ends.'],
            cta: 'Yes, clear it',
            danger: false,
        }
    }
    if (kind === 'stop_sales') {
        return {
            title: 'Stop sales now?',
            body: [
                'Nobody can buy or renew a plan from now on. Plans already paid for keep running.',
                c.snapshot.wrapUpDay
                    ? `The wrap-up day stays ${prettyDay(c.snapshot.wrapUpDay)}.`
                    : 'No wrap-up day is set yet, so plan the season end next.',
            ],
            cta: 'Yes, stop sales',
            danger: true,
        }
    }
    if (kind === 'resume_sales') {
        return {
            title: 'Resume sales?',
            body: c.snapshot.wrapUpDay
                ? [`Plans that finish by ${prettyDay(c.snapshot.wrapUpDay)} go back on sale.`]
                : ['Every plan goes back on sale at full length, and the season ends. Customers on the waitlist who hold credit see the reopened notice.'],
            cta: 'Yes, resume sales',
            danger: false,
        }
    }
    const e = c.endTodayView.summary
    const heldPlans = e.byDisposition.runs_past + e.byDisposition.starts_after
    const heldNames = c.plans
        .filter((p) => {
            const d = c.endTodayView.projections.get(p.id)?.disposition
            return d === 'runs_past' || d === 'starts_after'
        })
        .map((p) => `${p.customerName} (${p.planName})`)
    return {
        title: 'End the season today?',
        body: [
            'Tonight is the last kitchen night, and sales stop now. The break starts at 00:20.',
            e.mealsAfterWrapUp > 0
                ? `${plural(heldPlans, 'plan still has', 'plans still have')} ${plural(e.mealsAfterWrapUp, 'meal', 'meals')} after today: ${exposureText(c.endTodayView)} kept for next semester${SEASON_REFUNDS_LIVE ? ' or refunded' : ''}.`
                : 'No plan has meals after today.',
            ...(heldNames.length > 0 ? [`Kept for next semester: ${heldNames.join(', ')}.`] : []),
            'Skips whose make-up day would fall after today become wallet credit.',
            `Type ${END_TODAY_PHRASE} to confirm.`,
        ],
        cta: 'End the season today',
        danger: true,
    }
}

export function SeasonPlanner({ data }: { data: SeasonPageData }) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const { snapshot, todayAe } = data
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

    const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
    const [phrase, setPhrase] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    const rows = useMemo(
        () => [...data.plans].sort((a, b) => {
            const pa = view.projections.get(a.id)
            const pb = view.projections.get(b.id)
            if (!pa || !pb) return 0
            return DISPOSITION_ORDER[pa.disposition] - DISPOSITION_ORDER[pb.disposition]
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

    const driftMessage = seasonDriftMessage(data.paused, snapshot)
    const salesStoppedOn = data.salesStoppedAt ? prettyDay(todayAeIso(Date.parse(data.salesStoppedAt))) : null
    const status =
        snapshot.phase === 'open'
            ? { tone: `${t.successBg} ${t.success}`, title: 'Open', text: 'Selling normally. The kitchen cooks for every plan on the books.' }
        : snapshot.phase === 'break'
            ? { tone: `${t.dangerBg} ${t.danger}`, title: 'On the break', text: 'No sales and no cooking until you reopen.' }
        : !snapshot.wrapUpDay
            ? {
                tone: `${t.warningBg} ${t.warning}`,
                title: 'Sales stopped, no wrap-up day',
                text: `${salesStoppedOn ? `Sales stopped on ${salesStoppedOn}. ` : ''}The kitchen keeps cooking until the last plan ends, and a customer who resumes a pause can keep it running. Set a wrap-up day so the season has an end.`,
            }
            : {
                tone: `${t.accentBg} ${t.accent}`,
                title: `Winding down to ${prettyDay(snapshot.wrapUpDay)}`,
                text: `Regular dinners stop after ${prettyDay(snapshot.wrapUpDay)}. Close day ${prettyDay(snapshot.closeDay ?? snapshot.wrapUpDay)}, and the break starts the night after. ${snapshot.salesStopped ? 'Sales are stopped.' : 'New plans must finish by the wrap-up day.'}${SEASON_BREAK_RELEASE_LIVE ? '' : ' For now the kitchen keeps cooking for plans with meals after the wrap-up day, and nothing is held. That changes when the season break goes live.'}`,
            }

    const summary = view.summary
    const copy = confirm ? confirmCopy(confirm, { wrap: wrapDraft, buffer: bufferDraft, snapshot, view, endTodayView, books, plans: data.plans }) : null

    // Spec §11.3: during the break the page is the break board. Every hook
    // above has already run, so this early return keeps the hook order stable.
    if (snapshot.phase === 'break') return <BreakBoard data={data} />

    // A refund asked for during the break outlives the reopening (spec §6.3):
    // the queue stays on the page until the owner has answered every request.
    const pendingRefunds = refundQueue(data.holds)

    return (
        <div className={`mt-6 rounded-xl border p-5 ${t.card}`}>
            {pendingRefunds.length > 0 && <div className="mb-3"><RefundQueue queue={pendingRefunds} /></div>}
            {driftMessage && (
                <div data-testid="season-drift" role="alert" className={`flex items-start gap-3 px-4 py-3 rounded-xl border mb-3 ${t.warningBg} ${t.warning}`}>
                    <AlertTriangle size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                    <div className="text-[12px] font-semibold max-w-[72ch]">{driftMessage}</div>
                </div>
            )}
            <div data-testid="season-status" className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${status.tone}`}>
                <CalendarClock size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                <div>
                    <div className="text-[14px] font-black">{status.title}</div>
                    <div className={`text-[12px] font-medium mt-0.5 max-w-[72ch] ${t.body}`}>{status.text}</div>
                </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 mt-4">
                <Fact
                    t={t}
                    label="Last meal on the books"
                    value={lastOnBooks ? prettyDay(lastOnBooks.date) : 'None'}
                    detail={lastOnBooks ? plural(lastOnBooks.planIds.length, 'plan', 'plans') : 'No live plans'}
                />
                <Fact
                    t={t}
                    label="Kitchen days left"
                    value={String(SEASON_BREAK_RELEASE_LIVE ? summary.kitchenDays : books.calendar.length)}
                    detail={
                        SEASON_BREAK_RELEASE_LIVE
                            ? `${formatAed(summary.kitchenCostAed * 100)} at ${formatAed(data.kitchenDailyCostAed * 100)} a day`
                            : `${formatAed(books.summary.kitchenCostAed * 100)} at ${formatAed(data.kitchenDailyCostAed * 100)} a day${shownWrap ? `. With the season break live, this wrap-up day would make it ${summary.kitchenDays} days.` : ''}`
                    }
                />
                <Fact
                    t={t}
                    label="Meals after the wrap-up day"
                    value={String(summary.mealsAfterWrapUp)}
                    detail={
                        summary.mealsAfterWrapUp > 0
                            ? `${exposureText(view)}${SEASON_BREAK_RELEASE_LIVE ? (SEASON_REFUNDS_LIVE ? ' to keep or refund' : ' kept for next semester') : ' still delivering for now'}`
                            : 'Nothing to hold'
                    }
                />
            </div>

            {editing && (
                <div className={`mt-5 pt-4 border-t ${t.border}`}>
                    <div className={`text-[11px] font-black uppercase tracking-[0.1em] ${t.muted}`}>
                        {canMove ? 'Move the season end' : 'Plan the season end'}
                    </div>
                    <div className="mt-3 flex items-end gap-3 flex-wrap">
                        <label className="flex flex-col gap-1.5" htmlFor="season-wrap-up-day">
                            <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>Wrap-up day</span>
                            <input
                                id="season-wrap-up-day"
                                type="date"
                                value={wrapDraft}
                                min={addDaysIso(todayAe, 1)}
                                onChange={(e) => { setWrapDraft(e.target.value); setError(null) }}
                                className={`rounded-lg border px-3 py-2 text-[13px] font-semibold ${t.input} ${t.inputFocus}`}
                            />
                        </label>
                        <label className="flex flex-col gap-1.5" htmlFor="season-buffer">
                            <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>Buffer</span>
                            <select
                                id="season-buffer"
                                value={bufferDraft}
                                onChange={(e) => { setBufferDraft(Number(e.target.value)); setError(null) }}
                                className={`rounded-lg border px-3 py-2 text-[13px] font-semibold ${t.input} ${t.inputFocus}`}
                            >
                                {Array.from({ length: MAX_BUFFER_DAYS + 1 }, (_, n) => (
                                    <option key={n} value={n}>{plural(n, 'delivery day', 'delivery days')}</option>
                                ))}
                            </select>
                        </label>
                        <AdminButton
                            icon={<CalendarClock size={14} strokeWidth={2.5} />}
                            onClick={() => openConfirm(canMove ? 'move' : 'schedule')}
                            disabled={Boolean(draftError) || pending || (canMove && !draftChanged)}
                        >
                            {canMove ? 'Save new dates' : 'Schedule'}
                        </AdminButton>
                    </div>
                    <p className={`text-[12px] font-medium mt-2 max-w-[72ch] ${draftError ? t.danger : t.muted}`}>
                        {draftError
                            ?? `Close day ${prettyDay(closeDayFor(wrapDraft, bufferDraft))}. The buffer only cooks make-up meals from skips and is never sold.${kitchenDaysSaved > 0
                                ? (SEASON_BREAK_RELEASE_LIVE
                                    ? ` Against the last meal on the books this saves ${plural(kitchenDaysSaved, 'kitchen day', 'kitchen days')} (${formatAed(kitchenDaysSaved * data.kitchenDailyCostAed * 100)}).`
                                    : ` With the season break live, this would save ${kitchenDaysSaved} kitchen days (${formatAed(kitchenDaysSaved * data.kitchenDailyCostAed * 100)}) against the last meal on the books.`)
                                : ''}`}
                    </p>
                </div>
            )}

            <div className="mt-4 flex gap-2 flex-wrap">
                {actions.includes('stop_sales') && (
                    <AdminButton variant="danger" icon={<Pause size={14} strokeWidth={2.5} />} onClick={() => openConfirm('stop_sales')} disabled={pending}>
                        Stop sales now
                    </AdminButton>
                )}
                {actions.includes('resume_sales') && (
                    <AdminButton icon={<Play size={14} strokeWidth={2.5} />} onClick={() => openConfirm('resume_sales')} disabled={pending}>
                        {snapshot.wrapUpDay ? 'Resume sales' : 'Resume sales and end the season'}
                    </AdminButton>
                )}
                {actions.includes('clear') && (
                    <AdminButton variant="ghost" icon={<XCircle size={14} strokeWidth={2.5} />} onClick={() => openConfirm('clear')} disabled={pending}>
                        Clear the wrap-up day
                    </AdminButton>
                )}
                {actions.includes('end_today') && (
                    <AdminButton variant="danger" icon={<Power size={14} strokeWidth={2.5} />} onClick={() => openConfirm('end_today')} disabled={pending}>
                        End the season today
                    </AdminButton>
                )}
            </div>
            {error && !confirm && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{error}</p>}

            <div className="grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5 mt-5">
                <PlansTable rows={rows} view={view} t={t} />
                <KitchenCalendarList calendar={view.calendar} wrapUpDay={shownWrap} closeDay={shownClose} t={t} />
            </div>

            {confirm && copy && (
                <AdminModal label={copy.title} maxW="max-w-[500px]" onBackdrop={() => { if (!pending) setConfirm(null) }}>
                    <div className={`px-5 py-4 border-b ${t.border}`}>
                        <div className={`text-[15px] font-black ${t.heading}`}>{copy.title}</div>
                    </div>
                    <div className="px-5 py-4 flex flex-col gap-2">
                        {copy.body.map((line) => (
                            <p key={line} className={`text-[13px] font-medium leading-relaxed ${t.body}`}>{line}</p>
                        ))}
                        {confirm === 'end_today' && (
                            <label className="flex flex-col gap-1.5 mt-1" htmlFor="season-end-today-phrase">
                                <span className={`text-[10px] font-black tracking-[0.1em] uppercase ${t.muted}`}>Confirmation phrase</span>
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
                        {error && <p className={`text-[12px] font-bold ${t.danger}`}>{error}</p>}
                    </div>
                    <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
                        <AdminButton variant="ghost" onClick={() => setConfirm(null)} disabled={pending}>Cancel</AdminButton>
                        <AdminButton
                            variant={copy.danger ? 'danger' : 'primary'}
                            onClick={runConfirmed}
                            loading={pending}
                            disabled={confirm === 'end_today' && phrase.trim() !== END_TODAY_PHRASE}
                        >
                            {copy.cta}
                        </AdminButton>
                    </div>
                </AdminModal>
            )}
        </div>
    )
}

function Fact({ label, value, detail, t }: { label: string; value: string; detail: string; t: AdminTokens }) {
    return (
        <div className={`rounded-xl border px-4 py-3 ${t.border}`}>
            <div className={`text-[10px] font-black uppercase tracking-[0.1em] ${t.muted}`}>{label}</div>
            <div className={`text-[20px] font-black mt-1 tabular-nums ${t.heading}`}>{value}</div>
            <div className={`text-[12px] font-medium mt-0.5 ${t.muted}`}>{detail}</div>
        </div>
    )
}

function dispositionTone(d: Disposition, t: AdminTokens): string {
    if (d === 'runs_past' || d === 'starts_after') return `${t.dangerBg} ${t.danger}`
    if (d === 'customer_paused' || d === 'staff_pending') return `${t.warningBg} ${t.warning}`
    return `${t.successBg} ${t.success}`
}

function PlansTable({ rows, view, t }: { rows: SeasonPlanRow[]; view: SeasonView; t: AdminTokens }) {
    if (rows.length === 0) {
        return <p className={`text-[13px] font-medium ${t.muted}`}>No live plans.</p>
    }
    return (
        <div className={`rounded-xl border overflow-x-auto ${t.border}`}>
            <table className="w-full text-[12px]">
                <thead className={t.tableHeader}>
                    <tr>
                        {['Customer', 'Plan', 'Season', 'Last dinner', 'After wrap-up', 'Meal value'].map((h) => (
                            <th key={h} className="text-left font-black uppercase tracking-[0.06em] text-[10px] px-3 py-2 whitespace-nowrap">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((plan) => {
                        const p = view.projections.get(plan.id)
                        if (!p) return null
                        return (
                            <tr key={plan.id} className={t.tableRow}>
                                <td className="px-3 py-2">
                                    <div className={`font-bold ${t.heading}`}>{plan.customerName}</div>
                                    <div className={t.muted}>{plan.dormName ?? 'No dorm set'}</div>
                                </td>
                                <td className="px-3 py-2">
                                    <div className={t.body}>{plan.planName}</div>
                                    <div className={t.muted}>{plan.status}</div>
                                </td>
                                <td className="px-3 py-2">
                                    <span className={`inline-block rounded-full border px-2 py-0.5 font-bold whitespace-nowrap ${dispositionTone(p.disposition, t)}`}>
                                        {DISPOSITION_LABEL[p.disposition]}
                                    </span>
                                </td>
                                <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${t.body}`}>{p.lastDinner ? prettyDay(p.lastDinner) : 'None'}</td>
                                <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${t.body}`}>{p.mealsAfterWrapUp > 0 ? plural(p.mealsAfterWrapUp, 'meal', 'meals') : '0'}</td>
                                <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${t.body}`}>
                                    {plan.mealValue ? `${formatAed(plan.mealValue.fils)}${plan.mealValue.exact ? '' : ' est.'}` : 'Unknown'}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

function KitchenCalendarList({ calendar, wrapUpDay, closeDay, t }: { calendar: KitchenDay[]; wrapUpDay: string | null; closeDay: string | null; t: AdminTokens }) {
    return (
        <div className={`rounded-xl border ${t.border}`}>
            <div className={`px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] ${t.tableHeader}`}>Kitchen calendar</div>
            {calendar.length === 0 ? (
                <p className={`px-3 py-3 text-[12px] font-medium ${t.muted}`}>Nothing left to cook.</p>
            ) : (
                <ul className="max-h-[420px] overflow-y-auto">
                    {calendar.map((day) => {
                        const marks = [
                            day.date === wrapUpDay ? 'wrap-up' : null,
                            wrapUpDay != null && day.date > wrapUpDay ? 'buffer' : null,
                            closeDay != null && day.date === closeDay && closeDay !== wrapUpDay ? 'close' : null,
                        ].filter(Boolean).join(', ')
                        return (
                            <li key={day.date} className={`flex items-center justify-between gap-3 px-3 py-1.5 text-[12px] border-b last:border-b-0 ${t.border}`}>
                                <span className={`font-bold tabular-nums ${t.heading}`}>
                                    {prettyDay(day.date)}{marks ? <span className={`ml-1.5 font-semibold ${t.accent}`}>{marks}</span> : null}
                                </span>
                                <span className={`tabular-nums ${t.muted}`}>
                                    {plural(day.meals, 'meal', 'meals')}{day.lastDinners > 0 ? `, ${plural(day.lastDinners, 'last dinner', 'last dinners')}` : ''}
                                </span>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
