/**
 * Prints a DO block that runs every projection fixture through the live SQL
 * twin (public._season_project_plan) and compares it with what the TypeScript
 * projection returns for the same fixture.
 *
 *   npm run --silent season:lockstep-sql > <scratch dir>/lockstep.sql
 *
 * Then run the file's content against the live database. The block only calls
 * a STABLE function and always raises at the end, so nothing is written. The
 * message is the report: LOCKSTEP_OK or LOCKSTEP_FAIL.
 */

import { PROJECTION_FIXTURES } from '../src/contexts/season/domain/season-projection.fixtures'
import { projectPlan, type ProjectionPlan } from '../src/contexts/season/domain/season-projection'

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`
const sqlDate = (d: string | null) => (d ? `DATE ${quote(d)}` : 'NULL::date')

/** The subscriptions row shape _season_project_plan reads (to_jsonb of a row). */
function toRow(plan: ProjectionPlan): Record<string, unknown> {
  return {
    id: plan.id,
    customer_id: plan.customerId,
    plan_name: plan.planName,
    status: plan.status,
    start_date: plan.startDate,
    end_date: plan.endDate,
    week_type: plan.weekType,
    meals_per_day: plan.mealsPerDay,
    total_meals: plan.totalMeals,
    delivered_meals: plan.deliveredMeals,
    credited_skip_days: plan.creditedSkipDays,
    season_buffer_grants: plan.bufferGrants,
    skipped_dates: plan.skippedDates,
    planned_pause_start: plan.plannedPauseStart,
    staff_approval: plan.staffApproval,
    last_delivery_tick_date: plan.lastDeliveryTickDate,
    resume_cutoff_date: plan.resumeCutoffDate ?? null,
  }
}

const rows = PROJECTION_FIXTURES.map((f) => {
  const ts = projectPlan(f.plan, { todayAe: f.todayAe, closureDates: new Set(f.closureDates), wrapUpDay: f.wrapUpDay, closeDay: f.closeDay })
  const expected = {
    disposition: ts.disposition,
    cook_dates: ts.cookDates,
    last_dinner: ts.lastDinner,
    deliveries_after_wrap_up: ts.deliveriesAfterWrapUp,
    meals_after_wrap_up: ts.mealsAfterWrapUp,
    meals_left: ts.mealsLeft,
  }
  const closures = `ARRAY[${f.closureDates.map(quote).join(', ')}]::date[]`
  return `      (${quote(f.name)}, ${quote(JSON.stringify(toRow(f.plan)))}::jsonb, ${sqlDate(f.todayAe)}, ${sqlDate(f.wrapUpDay)}, ${sqlDate(f.closeDay)}, ${closures}, ${quote(JSON.stringify(expected))}::jsonb)`
})

console.log(`DO $lockstep$
DECLARE
  r record;
  v jsonb;
  v_fail text := '';
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
${rows.join(',\n')}
    ) AS t(name, plan, today, wrap_up, close_day, closures, expected)
  LOOP
    v := public._season_project_plan(r.plan, r.today, r.wrap_up, r.close_day, r.closures) - 'plan_id';
    IF v IS DISTINCT FROM r.expected THEN
      v_fail := v_fail || r.name || ' sql=' || v::text || ' ts=' || r.expected::text || '; ';
    END IF;
    v_n := v_n + 1;
  END LOOP;
  IF v_fail <> '' THEN RAISE EXCEPTION 'LOCKSTEP_FAIL: %', v_fail; END IF;
  RAISE EXCEPTION 'LOCKSTEP_OK: % fixtures agree', v_n;
END $lockstep$;`)
