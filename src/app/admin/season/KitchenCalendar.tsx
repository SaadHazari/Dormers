'use client'

/**
 * The kitchen calendar: the Season page's signature and its main control.
 *
 * A Monday-to-Sunday grid from this week to the end of the season, drawn in
 * the marks customers already know from their own progress grid: orange is a
 * night the kitchen cooks, a white ticket is a make-up day, navy running to
 * dusk is the kitchen dark (a closure, or the break). A dashed orange cell is
 * food still on the books after the wrap-up day, the meals the break holds.
 * While the season end can be edited, tapping a day makes it the wrap-up day.
 */

import { useMemo } from 'react'
import { MapPin, UtensilsCrossed } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { addDaysIso, formatShortDay, isoDow, isDeliveryDayIso, MAX_SCHEDULE_DAYS_AHEAD } from '@/contexts/season/domain/season-dates'
import type { KitchenDay } from '@/contexts/season/domain/season-projection'
import { NV, NV_DUSK, OG } from '@/app/dashboard/_shared/tokens'
import { plural } from './season-ui'

type CellKind = 'past' | 'sunday' | 'cook' | 'makeup' | 'held' | 'closed' | 'break' | 'quiet'

interface Cell {
    date: string
    kind: CellKind
    meals: number
    lastDinners: number
    pickable: boolean
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// A plan booked months out would stretch the grid to the floor; past this the
// calendar says how far the books go instead of drawing every week.
const MAX_WEEKS = 8

function mondayOf(iso: string): string {
    return addDaysIso(iso, 1 - isoDow(iso))
}

export function KitchenCalendar({
    todayAe, cooking, books, closures, wrapUpDay, closeDay, onBreak, onPick,
}: {
    todayAe: string
    /** Days the kitchen cooks with the wrap-up day as drawn. */
    cooking: KitchenDay[]
    /** Every meal on the books, as if the season never ended. */
    books: KitchenDay[]
    closures: ReadonlySet<string>
    wrapUpDay: string | null
    closeDay: string | null
    onBreak: boolean
    /** Present only while the season end can be edited. */
    onPick?: (iso: string) => void
}) {
    const { t, isLight } = useAdminTheme()

    const { weeks, hiddenUntil, kinds, anyLast } = useMemo(() => {
        const cookBy = new Map(cooking.map((d) => [d.date, d]))
        const bookBy = new Map(books.map((d) => [d.date, d]))
        const lastBooked = books.length ? books[books.length - 1].date : null
        const close = closeDay ?? wrapUpDay

        // On the break the grid centres on the last kitchen day; otherwise it
        // starts this week.
        const first = mondayOf(onBreak && close && close < todayAe ? close : todayAe)
        let last = [todayAe, lastBooked, close].filter((d): d is string => !!d).sort().at(-1) ?? todayAe
        // Show at least one week of break after the last kitchen day.
        if (close) last = [last, addDaysIso(close, 7)].sort().at(-1)!
        const lastMonday = mondayOf(last)
        const weekCount = Math.round((Date.parse(lastMonday) - Date.parse(first)) / (7 * 86_400_000)) + 1
        const shownWeeks = Math.min(weekCount, MAX_WEEKS)
        const maxPick = addDaysIso(todayAe, MAX_SCHEDULE_DAYS_AHEAD)

        const seen = new Set<CellKind>()
        const rows: Cell[][] = []
        for (let w = 0; w < shownWeeks; w++) {
            const row: Cell[] = []
            for (let d = 0; d < 7; d++) {
                const date = addDaysIso(first, w * 7 + d)
                const cook = cookBy.get(date)
                const booked = bookBy.get(date)
                const afterWrap = wrapUpDay != null && date > wrapUpDay
                const afterClose = close != null && date > close
                const heldMeals = afterWrap ? Math.max(0, (booked?.meals ?? 0) - (cook?.meals ?? 0)) : 0
                let kind: CellKind
                if (date < todayAe && !onBreak) kind = 'past'
                else if (onBreak && close && date <= close) kind = 'past'
                else if (d === 6) kind = afterClose ? 'break' : 'sunday'
                else if (closures.has(date)) kind = 'closed'
                else if (cook && !afterWrap) kind = 'cook'
                else if (afterWrap && !afterClose && isDeliveryDayIso(date, '6DAYS')) kind = 'makeup'
                else if (heldMeals > 0) kind = 'held'
                else if (afterClose) kind = 'break'
                else kind = 'quiet'
                seen.add(kind)
                row.push({
                    date,
                    kind,
                    meals: kind === 'held' ? heldMeals : cook?.meals ?? 0,
                    lastDinners: cook?.lastDinners ?? 0,
                    pickable: !!onPick && date > todayAe && date <= maxPick && isDeliveryDayIso(date, '6DAYS'),
                })
            }
            rows.push(row)
        }
        const hidden = weekCount > MAX_WEEKS ? last : null
        const anyLastDinner = rows.some((r) => r.some((c) => c.lastDinners > 0))
        return { weeks: rows, hiddenUntil: hidden, kinds: seen, anyLast: anyLastDinner }
    }, [cooking, books, closures, wrapUpDay, closeDay, onBreak, todayAe, onPick])

    const maxMeals = Math.max(1, ...cooking.map((d) => d.meals))
    const ink = isLight ? '#091825' : '#ede8da'

    function cellStyle(c: Cell): React.CSSProperties {
        switch (c.kind) {
            case 'cook': {
                // Brand orange is the ceiling: busier nights are fuller, never darker.
                const a = 0.22 + 0.6 * (c.meals / maxMeals)
                return { backgroundColor: `rgba(245,127,32,${a.toFixed(2)})`, color: ink, border: '1px solid rgba(245,127,32,0.35)' }
            }
            case 'makeup':
                return { backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.06)', border: `1px solid ${isLight ? 'rgba(9,24,37,0.18)' : 'rgba(237,232,218,0.35)'}`, color: ink }
            case 'held':
                return { backgroundColor: 'rgba(245,127,32,0.06)', border: `1px dashed ${OG}`, color: OG }
            case 'closed':
            case 'break':
                return { backgroundColor: NV, backgroundImage: `linear-gradient(180deg, ${NV} 0%, ${NV_DUSK} 100%)`, border: `1px solid ${isLight ? 'transparent' : 'rgba(255,255,255,0.10)'}`, color: 'rgba(245,240,232,0.92)' }
            case 'past':
            case 'sunday':
                return { backgroundColor: 'transparent', border: '1px solid transparent', color: ink, opacity: 0.3 }
            default:
                return { backgroundColor: isLight ? 'rgba(9,24,37,0.04)' : 'rgba(255,255,255,0.04)', border: '1px solid transparent', color: ink }
        }
    }

    function label(c: Cell): string {
        const day = formatShortDay(c.date)
        const what =
            c.kind === 'cook' ? plural(c.meals, 'meal', 'meals')
            : c.kind === 'makeup' ? `make-up day${c.meals ? `, ${plural(c.meals, 'meal', 'meals')}` : ''}`
            : c.kind === 'held' ? `${plural(c.meals, 'meal', 'meals')} held for next semester`
            : c.kind === 'closed' ? 'kitchen closed'
            : c.kind === 'break' ? 'break'
            : 'no meals'
        const pin = c.date === wrapUpDay ? ', wrap-up day' : ''
        return `${day}: ${what}${pin}`
    }

    return (
        <div>
            <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-1 sm:gap-2">
                <span />
                {WEEKDAYS.map((d) => (
                    <span key={d} className={`text-center text-[11px] font-bold ${t.faint}`}>{d}</span>
                ))}
                {weeks.map((row) => (
                    <WeekRow key={row[0].date} row={row} wrapUpDay={wrapUpDay} todayAe={todayAe} cellStyle={cellStyle} label={label} onPick={onPick} />
                ))}
            </div>

            {hiddenUntil && (
                <p className={`mt-3 text-[12px] ${t.muted}`}>Plans stay on the books until {formatShortDay(hiddenUntil)}.</p>
            )}

            <Legend kinds={kinds} isLight={isLight} lastDinners={anyLast} />
            {onPick && <p className={`mt-2 text-[12px] ${t.muted}`}>Tap a delivery day to make it the wrap-up day.</p>}
        </div>
    )
}

function WeekRow({ row, wrapUpDay, todayAe, cellStyle, label, onPick }: {
    row: Cell[]
    wrapUpDay: string | null
    todayAe: string
    cellStyle: (c: Cell) => React.CSSProperties
    label: (c: Cell) => string
    onPick?: (iso: string) => void
}) {
    const { t } = useAdminTheme()
    const [, m, d] = row[0].date.split('-')
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]
    return (
        <>
            <span className={`self-center pr-1 text-right text-[11px] font-bold tabular-nums whitespace-nowrap ${t.faint}`}>
                {Number(d)} {month}
            </span>
            {row.map((c) => {
                const isWrap = c.date === wrapUpDay
                const isToday = c.date === todayAe
                const body = (
                    <>
                        <span className="text-[13px] font-black leading-none tabular-nums">{Number(c.date.slice(8))}</span>
                        <span className="text-[11px] font-bold leading-none tabular-nums opacity-75">
                            {c.kind === 'closed'
                                ? <UtensilsCrossed size={12} strokeWidth={2.4} aria-hidden />
                                : (c.kind === 'cook' || c.kind === 'held' || (c.kind === 'makeup' && c.meals > 0))
                                    ? <><span className="sm:hidden">{c.meals}</span><span className="hidden sm:inline">{plural(c.meals, 'meal', 'meals')}</span></>
                                    : '\u00a0'}
                        </span>
                        {isWrap && (
                            <span aria-hidden className="absolute -top-2 -right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#091825] text-white ring-2 ring-white">
                                <MapPin size={11} strokeWidth={2.6} />
                            </span>
                        )}
                        {c.lastDinners > 0 && !isWrap && (
                            <span aria-hidden className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-white/90 ring-1 ring-[#091825]/30" />
                        )}
                    </>
                )
                const base = `relative flex h-11 sm:h-14 flex-col justify-between rounded-lg p-1.5 sm:p-2 text-left ${isToday ? 'outline outline-2 outline-offset-1 outline-[#f57f20]' : ''}`
                if (c.pickable && onPick) {
                    return (
                        <button
                            key={c.date}
                            type="button"
                            aria-label={label(c)}
                            aria-pressed={isWrap}
                            onClick={() => onPick(c.date)}
                            className={`${base} cursor-pointer transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[0_0_0_2px_rgba(9,24,37,0.35)] active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f57f20]`}
                            style={cellStyle(c)}
                        >
                            {body}
                        </button>
                    )
                }
                return (
                    <div key={c.date} role="img" aria-label={label(c)} className={base} style={cellStyle(c)}>
                        {body}
                    </div>
                )
            })}
        </>
    )
}

const LEGEND: Array<{ kind: CellKind; text: string }> = [
    { kind: 'cook', text: 'Kitchen cooks' },
    { kind: 'makeup', text: 'Make-up day' },
    { kind: 'held', text: 'Held for next semester' },
    { kind: 'closed', text: 'Closed' },
    { kind: 'break', text: 'Break' },
]

function Legend({ kinds, isLight, lastDinners }: { kinds: ReadonlySet<CellKind>; isLight: boolean; lastDinners: boolean }) {
    const { t } = useAdminTheme()
    const swatch: Record<string, React.CSSProperties> = {
        cook: { backgroundColor: 'rgba(245,127,32,0.6)' },
        makeup: { backgroundColor: isLight ? '#fff' : 'transparent', border: `1px solid ${isLight ? 'rgba(9,24,37,0.25)' : 'rgba(237,232,218,0.4)'}` },
        held: { border: `1px dashed ${OG}` },
        closed: { backgroundImage: `linear-gradient(180deg, ${NV} 0%, ${NV_DUSK} 100%)` },
        break: { backgroundImage: `linear-gradient(180deg, ${NV} 0%, ${NV_DUSK} 100%)` },
    }
    const shown = LEGEND.filter((l) => kinds.has(l.kind))
    if (shown.length === 0 && !lastDinners) return null
    return (
        <ul className={`mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[12px] ${t.muted}`}>
            {shown.map((l) => (
                <li key={l.kind} className="inline-flex items-center gap-2">
                    <span aria-hidden className="inline-flex h-3 w-3 items-center justify-center rounded-[4px] text-[rgba(245,240,232,0.92)]" style={swatch[l.kind]}>
                        {l.kind === 'closed' && <UtensilsCrossed size={8} strokeWidth={3} />}
                    </span>
                    {l.text}
                </li>
            ))}
            {lastDinners && (
                <li className="inline-flex items-center gap-2">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white ring-1 ring-[#091825]/40" />
                    Someone&apos;s last dinner
                </li>
            )}
        </ul>
    )
}
