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

export const END_TODAY_PHRASE = 'CLOSE TONIGHT'

type ConfirmKind = Exclude<SeasonAction, 'reopen'>

// What each plan's season looks like, in the words the owner uses.
const DISPOSITION: Record<Disposition, { label: string; tone: 'quiet' | 'held' | 'wait' | 'done'; order: number }> = {
    runs_past: { label: 'Goes past the end', tone: 'held', order: 0 },
    starts_after: { label: 'Starts after the end', tone: 'held', order: 1 },
    staff_pending: { label: 'Waiting for staff approval', tone: 'wait', order: 2 },
    customer_paused: { label: 'Paused by customer', tone: 'quiet', order: 3 },
    finishes: { label: 'Finishes in time', tone: 'done', order: 4 },
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
    const money = `${view.exposureEstimated ? 'about ' : ''}${formatAed(view.exposureFils)}`
    return view.exposureUnknownPlans > 0
        ? `${money}, plus ${plural(view.exposureUnknownPlans, 'plan', 'plans')} with no price on record`
        : money
}

const keptLine = (meals: number, worth: string) =>
    `**${plural(meals, 'meal does', 'meals do')} not fit** (worth ${worth}). They are kept for next semester${SEASON_REFUNDS_LIVE ? ', or refunded if the customer asks and you agree' : ''}.`

export interface ConfirmCopy { title: string; lines: string[]; undo: string; cta: string; danger: boolean }

function confirmCopy(
    kind: ConfirmKind,
    c: { wrap: string; buffer: number; snapshot: SeasonSnapshot; view: SeasonView; endTodayView: SeasonView; plans: readonly SeasonPlanRow[] },
): ConfirmCopy {
    if (kind === 'schedule' || kind === 'move') {
        const s = c.view.summary
        const d = s.byDisposition
        const lastCook = closeDayFor(c.wrap, c.buffer)
        return {
            title: kind === 'schedule'
                ? `Make ${prettyDay(c.wrap)} the last dinner day?`
                : `Change the last dinner day to ${prettyDay(c.wrap)}?`,
            lines: [
                `Normal dinners go out until **${prettyDay(c.wrap)}**.`,
                c.buffer > 0
                    ? `After that, the kitchen cooks for ${plural(c.buffer, 'more day', 'more days')}, until **${prettyDay(lastCook)}**, only for meals customers skipped earlier. Then it closes for the semester break.`
                    : `The kitchen closes for the semester break straight after that day.`,
                `That is **${plural(s.kitchenDays, 'more cooking day', 'more cooking days')}** from today.`,
                `Of the plans running now: ${plural(d.finishes, 'finishes', 'finish')} in time, ${plural(d.runs_past, 'goes', 'go')} past the end, ${plural(d.starts_after, 'starts', 'start')} after it, and ${plural(d.customer_paused, 'is', 'are')} paused by the customer.`,
                s.mealsAfterWrapUp > 0 ? keptLine(s.mealsAfterWrapUp, exposureText(c.view)) : 'Every meal fits before the end. Nothing needs to be kept.',
                `From now on, people can only buy plans that finish by ${prettyDay(c.wrap)}.`,
                'Customers whose plans go past the end get a message at 10:00 tomorrow. You get a WhatsApp summary now.',
            ],
            undo: kind === 'schedule'
                ? 'Yes. Until that day comes, you can pick a different day, or press Cancel the season end under Other options.'
                : 'Yes. Until that day comes, you can change it again or cancel the season end.',
            cta: kind === 'schedule' ? 'Yes, set this day' : 'Yes, change it',
            danger: false,
        }
    }
    if (kind === 'clear') {
        return {
            title: 'Cancel the season end?',
            lines: c.snapshot.salesStopped
                ? [
                    'The last dinner day is removed.',
                    'New orders stay paused.',
                    'The kitchen keeps cooking until every plan that is already paid for has finished.',
                    'Messages about the season end that have not gone out yet are cancelled.',
                ]
                : [
                    'The last dinner day is removed.',
                    'People can buy plans of any length again, straight away.',
                    'The kitchen keeps cooking as normal.',
                    'Messages about the season end that have not gone out yet are cancelled.',
                ],
            undo: 'Yes. You can pick a new last dinner day on the calendar at any time.',
            cta: 'Yes, cancel the end',
            danger: false,
        }
    }
    if (kind === 'stop_sales') {
        return {
            title: 'Pause new orders?',
            lines: [
                'From now on, nobody can buy a new plan or renew one.',
                'Plans people already paid for carry on as normal, and the kitchen keeps cooking for them.',
                c.snapshot.wrapUpDay
                    ? `The last dinner day stays **${prettyDay(c.snapshot.wrapUpDay)}**.`
                    : 'There is no last dinner day yet, so the kitchen cooks until the last paid plan finishes. You can pick a last dinner day on the calendar next.',
                'Customers see the waiting list message instead of the plans.',
            ],
            undo: 'Yes. Press Take new orders again at any time.',
            cta: 'Yes, pause new orders',
            danger: true,
        }
    }
    if (kind === 'resume_sales') {
        return {
            title: 'Take new orders again?',
            lines: c.snapshot.wrapUpDay
                ? [
                    `People can buy plans again, as long as the plan finishes by **${prettyDay(c.snapshot.wrapUpDay)}**.`,
                    'The last dinner day does not change.',
                ]
                : [
                    'People can buy plans of any length again, straight away.',
                    'There is no season end any more, so the kitchen stays open as normal.',
                    'People on the waiting list who hold credit see that you are open again.',
                ],
            undo: 'Yes. Press Pause new orders at any time.',
            cta: 'Yes, take new orders',
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
        title: 'Close the kitchen tonight?',
        lines: [
            "**Tonight's dinners are the last ones.** New orders stop straight away.",
            'The semester break starts just after midnight (00:20). From then on nothing is cooked or sold.',
            e.mealsAfterWrapUp > 0
                ? `${keptLine(e.mealsAfterWrapUp, exposureText(c.endTodayView))}${heldNames.length ? ` Plans affected: ${heldNames.join(', ')}.` : ''}`
                : 'Every plan has finished by tonight. Nothing needs to be kept.',
            'Meals customers skipped and were due to get back later turn into wallet credit instead.',
        ],
        undo: 'Only until midnight, by pressing Cancel the season end under Other options. Once the break starts, the only way back is Reopen the kitchen.',
        cta: 'Close the kitchen tonight',
        danger: true,
    }
}

export function SeasonPlanner({ data, members, waiting, customerView }: {
    data: SeasonPageData
    members: WaitlistMember[]
    /** The waiting list column. */
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
                        Just reopened? Tell customers we are open
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
                                    {!shownWrap ? 'Last meal anyone has paid for' : editing && draftChanged ? 'If you pick this day' : 'The season end you set'}
                                </div>
                                {!shownWrap ? (
                                    <>
                                        <div className={`mt-1 text-[28px] font-black tracking-tight tabular-nums ${t.heading}`}>{lastOnBooks ? prettyDay(lastOnBooks.date) : 'None'}</div>
                                        <div className={`text-[13px] ${t.muted}`}>{plural(books.calendar.length, 'cooking day', 'cooking days')} if nothing ends early</div>
                                    </>
                                ) : (
                                    <>
                                        <div className={`mt-1 text-[28px] font-black tracking-tight tabular-nums ${t.heading}`}>
                                            {view.summary.kitchenDays} <span className={`text-[14px] font-bold ${t.muted}`}>cooking days left</span>
                                        </div>
                                        <dl className={`mt-3 flex flex-col gap-2 text-[13px] ${t.body}`}>
                                            <Fact term="Last dinner day" value={prettyDay(shownWrap)} />
                                            <Fact term="Last cooking day" value={prettyDay(shownClose ?? shownWrap)} />
                                            <Fact
                                                term="Meals that do not fit"
                                                value={view.summary.mealsAfterWrapUp > 0 ? plural(view.summary.mealsAfterWrapUp, 'meal', 'meals') : 'Nothing'}
                                                accent={view.summary.mealsAfterWrapUp > 0}
                                            />
                                            {view.exposureFils > 0 && <Fact term="Worth" value={`${view.exposureEstimated ? 'about ' : ''}${formatAed(view.exposureFils)}`} />}
                                            {view.exposureUnknownPlans > 0 && <Fact term="Plans with no price" value={String(view.exposureUnknownPlans)} />}
                                            {kitchenDaysSaved > 0 && <Fact term="Cooking days saved" value={String(kitchenDaysSaved)} />}
                                        </dl>
                                        <div className={`mt-2 text-[12px] ${t.faint}`}>Without an end, the last paid meal is {lastOnBooks ? prettyDay(lastOnBooks.date) : 'none'}.</div>
                                    </>
                                )}
                            </div>

                            {editing && (
                                <div className="flex flex-col gap-4">
                                    <div>
                                        <div id="season-buffer-label" className={`text-[12px] font-bold ${t.muted}`}>Catch-up days</div>
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
                                        <div className={`mt-2 text-[12px] ${t.muted}`}>Extra days after the last dinner day to cook meals customers skipped earlier. Nobody can buy these days.</div>
                                    </div>
                                    {draftError && <p role="alert" className={`text-[12px] font-bold ${t.danger}`}>{draftError}</p>}
                                    {canMove && !draftChanged ? (
                                        <p className={`text-[12px] ${t.muted}`}>To change the last dinner day, tap another day on the calendar.</p>
                                    ) : (
                                        <AdminButton
                                            className="w-full"
                                            onClick={() => openConfirm(canMove ? 'move' : 'schedule')}
                                            disabled={Boolean(draftError) || pending}
                                        >
                                            {canMove ? 'Change the last dinner day' : 'Set the last dinner day'}
                                        </AdminButton>
                                    )}
                                    {canMove && draftChanged && (
                                        <button
                                            type="button"
                                            onClick={() => { setWrapDraft(snapshot.wrapUpDay ?? defaultWrapDraft); setBufferDraft(snapshot.bufferDays) }}
                                            className={`-mt-2 self-center text-[12px] font-bold ${t.muted} hover:underline underline-offset-4`}
                                        >
                                            Go back to {snapshot.wrapUpDay ? prettyDay(snapshot.wrapUpDay) : 'the saved day'}
                                        </button>
                                    )}
                                </div>
                            )}

                            {clearInPanel && (
                                <div className="flex flex-col gap-2">
                                    <p className={`text-[13px] ${t.body}`}>The last dinner day has passed, so it can no longer be changed. To pick a new one, cancel the season end first.</p>
                                    <AdminButton variant="ghost" onClick={() => openConfirm('clear')} disabled={pending}>Cancel the season end</AdminButton>
                                </div>
                            )}

                            {(actions.includes('stop_sales') || actions.includes('resume_sales')) && (
                                <div className={`flex flex-col gap-3 border-t pt-4 ${t.border}`}>
                                    <div>
                                        <div className={`text-[12px] font-bold ${t.muted}`}>New orders</div>
                                        <div className={`mt-1 text-[14px] font-black ${snapshot.salesStopped ? t.warning : t.heading}`}>
                                            {snapshot.salesStopped ? 'Paused. Nobody can buy a plan.' : snapshot.wrapUpDay ? `Open, for plans that end by ${prettyDay(snapshot.wrapUpDay)}` : 'Open. People can buy plans.'}
                                        </div>
                                    </div>
                                    {actions.includes('stop_sales') ? (
                                        <AdminButton variant="ghost" onClick={() => openConfirm('stop_sales')} disabled={pending}>Pause new orders</AdminButton>
                                    ) : (
                                        <AdminButton variant="ghost" onClick={() => openConfirm('resume_sales')} disabled={pending}>
                                            Take new orders again
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
                        <Section title="Customers' plans" count={rows.length}>
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
                    undo={copy.undo}
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
                            <span className={`text-[12px] font-bold ${t.muted}`}>To make sure, type {END_TODAY_PHRASE}</span>
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
            title: 'Open as normal',
            text: `People can buy plans and the kitchen cooks every day${lastBooked ? `. The last meal anyone has paid for is on ${prettyDay(lastBooked)}` : ''}. To end the season, tap the day of the last dinner on the calendar.`,
        }
    }
    if (s.phase === 'break') {
        return {
            title: 'Closed for the semester break',
            text: `${s.closeDay ? `The last cooking day was ${prettyDay(s.closeDay)}. ` : ''}Nothing is cooked or sold until you reopen. Kept plans only restart when each customer taps Resume or picks a start date.`,
        }
    }
    if (!s.wrapUpDay) {
        return {
            title: 'New orders paused, no end date yet',
            text: `${salesStoppedOn ? `New orders were paused on ${salesStoppedOn}. ` : ''}The kitchen keeps cooking until the last paid plan finishes, and a customer who unpauses keeps theirs going. Tap a day on the calendar to set the last dinner day.`,
        }
    }
    const passed = s.wrapUpDay <= data.todayAe
    return {
        title: `Season ends ${prettyDay(s.wrapUpDay)}`,
        text: passed
            ? `Normal dinners have ended. The last cooking day is ${prettyDay(s.closeDay ?? s.wrapUpDay)}, and the kitchen closes for the break that night.`
            : `${plural(kitchenDays, 'cooking day', 'cooking days')} left. ${prettyDay(s.wrapUpDay)} is the last normal dinner${s.closeDay && s.closeDay !== s.wrapUpDay ? `, ${prettyDay(s.closeDay)} is the last cooking day` : ''}, then the kitchen closes for the break. ${s.salesStopped ? 'New orders are paused.' : 'People can still buy plans that finish by then.'}`,
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
            headers={['Customer', 'Plan', 'At the season end', 'Last dinner', 'Kept', 'Price a meal']}
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
                        <span className={`md:hidden text-[12px] font-normal ${t.muted}`}>Kept </span>
                        {p && p.mealsAfterWrapUp > 0 ? plural(p.mealsAfterWrapUp, 'meal', 'meals') : '0'}
                    </div>,
                    <div key="v" className={`tabular-nums ${plan.mealValue ? t.body : t.faint}`}>
                        <span className={`md:hidden text-[12px] ${t.muted}`}>A meal </span>
                        {plan.mealValue ? `${plan.mealValue.exact ? '' : 'about '}${formatAed(plan.mealValue.fils)}` : 'Not known'}
                    </div>,
                ]
            }}
        />
    )
}

const MOVE_COPY: Record<'clear' | 'end_today', { label: string; text: string }> = {
    clear: { label: 'Cancel the season end', text: 'Remove the last dinner day. The kitchen goes back to cooking every paid plan to the end.' },
    end_today: { label: 'Close the kitchen tonight', text: 'For an emergency: tonight becomes the last dinner and the break starts at midnight.' },
}

function MoreMoves({ moves, onPick, pending }: { moves: Array<'clear' | 'end_today'>; onPick: (k: ConfirmKind) => void; pending: boolean }) {
    const { t } = useAdminTheme()
    return (
        <details className={`group rounded-xl border ${t.border}`}>
            <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-6 [&::-webkit-details-marker]:hidden ${t.body}`}>
                <span>
                    <span className={`text-[11px] font-black uppercase tracking-[0.12em] ${t.muted}`}>Other options</span>
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
