/**
 * Legend copy for company-closure days inside a plan window.
 *
 * The progress grids used to caption these as "2 kitchen closed" — a count
 * of a phrase nobody counts. Customers read the grid to answer two things:
 * WHEN was the kitchen shut, and did I lose those meals? So the legend now
 * names the dates ("Kitchen closed 9–10 Sep") and states the consequence
 * ("2 days added") in the tense the crons make true: closure_tick extends
 * end_date on the night of the closure, so a closure still ahead reads
 * "will be added" rather than promising an extension the Ending date does
 * not yet show.
 */

import type { CSSProperties } from 'react'
import { NV, NV_DUSK } from './tokens'
import { groupPauseRanges } from './pause-ranges'

/**
 * The closed-kitchen mark, shared by both grids, their legends and the
 * upcoming-closure notices: a navy fill that lightens toward dusk, the same
 * top-dark-to-bottom-light run the delivered orange makes. Next to orange it
 * reads as a blackout — the night the kitchen was dark — not as a dinner.
 * Deliberately not the skip hatch (diagonal, the customer's own choice) and
 * not the pause wash (faint, their hold). Mobile centres a cream
 * crossed-utensils glyph on it; the legend key there is a miniature cell.
 * Saad chose this over the earlier shutter slats on 2026-09-13 — the slats
 * read as passive.
 */
export const CLOSURE_FILL: CSSProperties & { border: string } = {
  backgroundColor: NV,
  backgroundImage: `linear-gradient(180deg, ${NV} 0%, ${NV_DUSK} 100%)`,
  border: '1px solid transparent',
}
/** Ink for anything drawn on top of CLOSURE_FILL. */
export const CLOSURE_INK = 'rgba(245,240,232,0.92)'

/**
 * A make-up day — earned from a skip or owed by a closure — is an added
 * ticket: white with a hairline edge, so it reads as a slot that was put
 * in, distinct from the grey of an ordinary upcoming day but no louder.
 */
export const MAKEUP_FILL: CSSProperties & { border: string } = {
  backgroundColor: 'var(--ds-page-bg)',
  backgroundImage: 'none',
  border: '1px solid rgba(9,24,37,0.18)',
}

type WeekType = '5DAYS' | '6DAYS'

export interface ClosureLegend {
  /** "Wed 9 Sep", "9–10 Sep", "30 Sep – 1 Oct", or "9–10 Sep, 21 Sep". */
  dates: string
  /** Closure days inside the window (delivery days only — the caller filters). */
  count: number
  /** "1 day added" / "2 days will be added" — tense follows the crons. */
  added: string
}

const dayMonth = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
// Hand-joined: en-AE would render "Wed, 9 Sep", and the comma reads as a list.
const weekdayDayMonth = (iso: string) =>
  `${new Date(iso + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'short' })} ${dayMonth(iso)}`
const monthOf = (iso: string) => iso.slice(0, 7)
const dayOf = (iso: string) => String(Number(iso.slice(8, 10)))

export function describeClosures(
  closureIsos: string[],
  todayIso: string,
  weekType: WeekType,
): ClosureLegend | null {
  if (closureIsos.length === 0) return null
  // Consecutive delivery days collapse into one range, exactly like pauses.
  const ranges = groupPauseRanges(closureIsos, weekType)
  const parts = ranges.map(r => {
    if (r.count === 1) return ranges.length === 1 ? weekdayDayMonth(r.startIso) : dayMonth(r.startIso)
    if (monthOf(r.startIso) === monthOf(r.endIso)) return `${dayOf(r.startIso)}–${dayMonth(r.endIso)}`
    return `${dayMonth(r.startIso)} – ${dayMonth(r.endIso)}`
  })
  const count = closureIsos.length
  const allPast = closureIsos.every(iso => iso < todayIso)
  const days = `${count} day${count === 1 ? '' : 's'}`
  return {
    dates: parts.join(', '),
    count,
    added: allPast ? `${days} added` : `${days} will be added`,
  }
}
