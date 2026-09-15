/**
 * Shared fixtures for the season projection. The TypeScript projection
 * (season-projection.ts) must return `expected` for each one, and the SQL
 * twin (_season_project_plan in supabase/migrations/20260915125204_season_project_plans.sql)
 * must return the same: scripts/season-projection-lockstep.ts checks it on live.
 *
 * Anchors: Mon 28 Sep 2026 is today unless a fixture says otherwise. Sun 4 Oct
 * is not a delivery day. The base plan has 6 meals left, one a day, Monday to
 * Saturday: Mon 28 Sep to Sat 3 Oct.
 */

import type { PlanProjection, ProjectionPlan } from './season-projection'

export type ProjectedFacts = Omit<PlanProjection, 'planId'>

export interface ProjectionFixture {
  name: string
  plan: ProjectionPlan
  todayAe: string
  closureDates: string[]
  wrapUpDay: string | null
  closeDay: string | null
  expected: ProjectedFacts
}

const base = (p: Partial<ProjectionPlan> = {}): ProjectionPlan => ({
  id: 'fixture', customerId: 'customer', planName: 'Monthly Premium', status: 'Active',
  startDate: '2026-09-01', endDate: '2026-10-03', weekType: '6DAYS',
  mealsPerDay: 1, totalMeals: 24, deliveredMeals: 18, creditedSkipDays: 0, bufferGrants: 0,
  skippedDates: [], plannedPauseStart: null, staffApproval: null,
  lastDeliveryTickDate: '2026-09-26', resumeCutoffDate: null,
  ...p,
})

const at = (todayAe: string, wrapUpDay: string | null, closeDay: string | null, closureDates: string[] = []) =>
  ({ todayAe, wrapUpDay, closeDay, closureDates })

const facts = (
  disposition: ProjectedFacts['disposition'], cookDates: string[], deliveriesAfterWrapUp: number, mealsAfterWrapUp: number, mealsLeft: number,
): ProjectedFacts => ({
  disposition, cookDates, lastDinner: cookDates.length > 0 ? cookDates[cookDates.length - 1] : null,
  deliveriesAfterWrapUp, mealsAfterWrapUp, mealsLeft,
})

const SIX = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']

export const PROJECTION_FIXTURES: ProjectionFixture[] = [
  { name: 'no wrap-up day', plan: base(), ...at('2026-09-28', null, null), expected: facts('finishes', SIX, 0, 0, 6) },
  { name: 'finishes on the wrap-up day', plan: base(), ...at('2026-09-28', '2026-10-03', '2026-10-05'), expected: facts('finishes', SIX, 0, 0, 6) },
  { name: 'runs past the wrap-up day', plan: base(), ...at('2026-09-28', '2026-09-30', '2026-10-01'), expected: facts('runs_past', ['2026-09-28', '2026-09-29', '2026-09-30'], 3, 3, 6) },
  {
    name: 'a closure still ahead pushes the last dinner',
    plan: base(), ...at('2026-09-28', null, null, ['2026-09-30']),
    expected: facts('finishes', ['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], 0, 0, 6),
  },
  {
    name: 'a skip still ahead pushes the last dinner',
    plan: base({ skippedDates: ['2026-09-29'] }), ...at('2026-09-28', null, null),
    expected: facts('finishes', ['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], 0, 0, 6),
  },
  {
    name: 'a buffer grant cooks the make-up meal',
    plan: base({ skippedDates: ['2026-09-29'], bufferGrants: 1 }), ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('finishes', ['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], 0, 0, 6),
  },
  {
    name: 'a buffer grant never cooks after the close day',
    plan: base({ skippedDates: ['2026-09-29', '2026-09-30'], bufferGrants: 1 }), ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('runs_past', ['2026-09-28', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], 1, 1, 6),
  },
  {
    name: 'a buffer day already behind the plan used its grant',
    plan: base({ deliveredMeals: 23, bufferGrants: 1, lastDeliveryTickDate: '2026-10-05' }), ...at('2026-10-06', '2026-10-03', '2026-10-06'),
    expected: facts('runs_past', [], 1, 1, 1),
  },
  {
    name: 'two meals a day',
    plan: base({ planName: 'Monthly Max', mealsPerDay: 2, totalMeals: 48, deliveredMeals: 36 }), ...at('2026-09-28', '2026-09-30', '2026-10-01'),
    expected: facts('runs_past', ['2026-09-28', '2026-09-29', '2026-09-30'], 3, 6, 12),
  },
  {
    name: 'tonight is already delivered',
    plan: base({ deliveredMeals: 19, lastDeliveryTickDate: '2026-09-28' }), ...at('2026-09-28', null, null),
    expected: facts('finishes', ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'], 0, 0, 5),
  },
  {
    name: 'resumed after the 2 PM cutoff',
    plan: base({ resumeCutoffDate: '2026-09-28' }), ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('runs_past', ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'], 1, 1, 6),
  },
  { name: 'a paused plan', plan: base({ status: 'Paused' }), ...at('2026-09-28', '2026-10-03', '2026-10-05'), expected: facts('customer_paused', [], 0, 0, 6) },
  {
    name: 'a planned pause before the wrap-up day',
    plan: base({ plannedPauseStart: '2026-10-01' }), ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('customer_paused', ['2026-09-28', '2026-09-29', '2026-09-30'], 0, 0, 6),
  },
  {
    name: 'starts after the wrap-up day',
    plan: base({ status: 'Scheduled', startDate: '2026-10-06', endDate: '2026-10-31', deliveredMeals: 0, lastDeliveryTickDate: null }),
    ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('starts_after', [], 24, 24, 24),
  },
  {
    name: 'a staff renewal waiting for approval',
    plan: base({ planName: 'Staff Monthly', status: 'Scheduled', startDate: '2026-10-05', totalMeals: 20, deliveredMeals: 0, staffApproval: 'pending', lastDeliveryTickDate: null }),
    ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('staff_pending', [], 0, 0, 20),
  },
  {
    name: 'the end date says finished but meals are left',
    plan: base({ endDate: '2026-09-26' }), ...at('2026-09-28', '2026-09-30', '2026-10-01'),
    expected: facts('runs_past', ['2026-09-28', '2026-09-29', '2026-09-30'], 3, 3, 6),
  },
  {
    name: 'a Monday to Friday plan cannot use a Saturday buffer day',
    plan: base({ weekType: '5DAYS', totalMeals: 20, deliveredMeals: 14, skippedDates: ['2026-09-29'], bufferGrants: 1 }),
    ...at('2026-09-28', '2026-10-02', '2026-10-03'),
    expected: facts('runs_past', ['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02'], 2, 2, 6),
  },
  {
    name: 'a closure on a buffer day does not use a grant',
    plan: base({ deliveredMeals: 22, bufferGrants: 1, lastDeliveryTickDate: '2026-10-03' }), ...at('2026-10-06', '2026-10-03', '2026-10-06', ['2026-10-05']),
    expected: facts('runs_past', ['2026-10-06'], 1, 1, 2),
  },
  {
    name: 'every meal delivered or credited',
    plan: base({ deliveredMeals: 23, creditedSkipDays: 1 }), ...at('2026-09-28', null, null),
    expected: facts('finishes', [], 0, 0, 0),
  },
  {
    // The status tick pauses the plan on the buffer day, so the break gives it
    // a customer-pause hold; it must not project as running past.
    name: 'a planned pause between the wrap-up day and the close day',
    plan: base({ plannedPauseStart: '2026-10-05' }), ...at('2026-09-28', '2026-10-03', '2026-10-05'),
    expected: facts('customer_paused', SIX, 0, 0, 6),
  },
]
