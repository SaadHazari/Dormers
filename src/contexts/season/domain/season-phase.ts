/**
 * Season phase: which admin actions each state allows.
 *
 * Spec §5. The SQL transition functions are the authority and refuse anything
 * this list would not offer; this module exists so the Season page only ever
 * shows buttons that will work.
 */

export type SeasonPhase = 'open' | 'winding_down' | 'break'

export type SeasonAction = 'schedule' | 'move' | 'clear' | 'stop_sales' | 'resume_sales' | 'end_today' | 'reopen'

export interface SeasonSnapshot {
  phase: SeasonPhase
  wrapUpDay: string | null
  closeDay: string | null
  bufferDays: number
  salesStopped: boolean
}

export function allowedSeasonActions(s: SeasonSnapshot, todayAe: string): SeasonAction[] {
  if (s.phase === 'break') return ['reopen']

  if (s.phase === 'open') return ['schedule', 'stop_sales', 'end_today']

  // winding_down
  if (!s.wrapUpDay) return ['schedule', 'resume_sales', 'end_today']

  const wrapUpStillAhead = s.wrapUpDay > todayAe
  const actions: SeasonAction[] = []
  if (wrapUpStillAhead) actions.push('move')
  actions.push('clear')
  if (wrapUpStillAhead) actions.push(s.salesStopped ? 'resume_sales' : 'stop_sales')
  // Once the wrap-up day has passed, ending today would move it back to today
  // and reopen the kitchen tonight; SQL refuses it too. Clear and reschedule.
  if (s.wrapUpDay >= todayAe) actions.push('end_today')
  return actions
}

/** The actions the Season page may show: end_today needs the season break to be live. */
export function visibleSeasonActions(actions: readonly SeasonAction[], breakReleaseLive: boolean): SeasonAction[] {
  return breakReleaseLive ? [...actions] : actions.filter((a) => a !== 'end_today')
}

/**
 * A non-null warning when intake_settings.paused and the season's own
 * salesStopped flag disagree (spec's old Season page wrote `paused` directly;
 * the new page's stop/resume actions write salesStopped). Never fires on the
 * break, where sales and cooking are already both off.
 */
export function seasonDriftMessage(paused: boolean, snapshot: SeasonSnapshot): string | null {
  if (snapshot.phase === 'break') return null
  if (paused === snapshot.salesStopped) return null
  return paused
    ? 'Two settings disagree: customers cannot buy plans, but this page thinks new orders are open. Press Pause new orders once to fix it.'
    : 'Two settings disagree: customers can buy plans, but this page thinks new orders are paused. Press Take new orders again once to fix it.'
}
