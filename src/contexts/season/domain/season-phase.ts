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
  actions.push('end_today')
  return actions
}
