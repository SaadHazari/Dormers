import 'server-only'

/**
 * Plan E, after the schedule changed (spec §11.7 row 1, §12.2 N2): queue the
 * split notice for every plan that runs past the wrap-up day, and tell the
 * owner what the dates mean in counts. Never a kitchen cost: that is kitchen
 * data. A failure here never undoes the schedule; it is logged and the owner
 * still has the page.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { formatShortDay } from '../domain/season-dates'

/**
 * Plan E, after the schedule changed (spec §11.7 row 1, §12.2 N2): queue the
 * split notice for every plan that runs past the wrap-up day, and tell the
 * owner what the dates mean in counts. Never a kitchen cost: that is kitchen
 * data. A failure here never undoes the schedule; it is logged and the owner
 * still has the page.
 */
export async function afterScheduleChange(what: 'scheduled' | 'moved'): Promise<void> {
  try {
    const sb = createAdminSupabaseClient()
    const [{ data: queued }, { data: settings }] = await Promise.all([
      sb.rpc('season_queue_schedule_notices'),
      sb.from('intake_settings').select('wrap_up_day, close_day, buffer_delivery_days').maybeSingle(),
    ])
    const st = (settings ?? {}) as { wrap_up_day?: string | null; close_day?: string | null; buffer_delivery_days?: number | null }
    if (!st.wrap_up_day) return
    const { data: plans } = await sb.rpc('season_project_plans', { p_wrap_up: st.wrap_up_day, p_close: st.close_day ?? st.wrap_up_day })
    const rows = (plans ?? []) as Array<{ disposition: string; meals_after_wrap_up: number | null; cook_dates: string[] | null }>
    const count = (d: string) => rows.filter((r) => r.disposition === d).length
    const held = rows.reduce((sum, r) => sum + (r.disposition === 'runs_past' ? Number(r.meals_after_wrap_up ?? 0) : 0), 0)
    const kitchenDays = new Set(rows.flatMap((r) => r.cook_dates ?? [])).size
    const q = (queued ?? {}) as { queued?: number }
    void notifyAdmin(
      `Season end ${what === 'scheduled' ? 'set' : 'changed'}: last dinner day ${formatShortDay(st.wrap_up_day)}, ${st.buffer_delivery_days ?? 0} catch-up days, last cooking day ${formatShortDay(st.close_day ?? st.wrap_up_day)}. ` +
      `${count('finishes')} plans finish in time, ${count('runs_past')} go past the end (${held} meals kept for next semester), ${count('starts_after')} start after it, ${count('customer_paused')} paused by the customer. ` +
      `${kitchenDays} cooking days left. Customer messages go out at 10:00${(q.queued ?? 0) > 0 ? ` (${q.queued} waiting)` : ''}.`,
      'season_schedule',
    )
  } catch (err) {
    console.error('season schedule: notices or summary failed', err)
  }
}

export async function afterScheduleCleared(): Promise<void> {
  try {
    const sb = createAdminSupabaseClient()
    const { data } = await sb.rpc('season_drop_notices', { p_kind: 'season_plan_runs_past', p_reason: 'schedule_cleared', p_subject_id: null })
    void notifyAdmin(
      `Season end cancelled: the kitchen keeps cooking until the last paid plan finishes, and no season-end message will go out${Number(data ?? 0) > 0 ? ` (${data} waiting messages cancelled)` : ''}.`,
      'season_schedule',
    )
  } catch (err) {
    console.error('season clear: notices or summary failed', err)
  }
}
