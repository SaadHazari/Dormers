/**
 * Read-only: loads the Season page data from the live database and prints the
 * season, the plans by disposition and the last meal on the books.
 * Run: npm run check:season-data
 */
import { loadSeasonPageData } from '../src/app/admin/season/season-data'
import { todayAeIso } from '../src/contexts/season/domain/season-dates'
import { projectPlan, lastMealOnTheBooks } from '../src/contexts/season/domain/season-projection'

async function main() {
  const data = await loadSeasonPageData(todayAeIso())
  const closures = new Set(data.closureDates)
  const books = data.plans.map((p) => projectPlan(p, { todayAe: data.todayAe, closureDates: closures, wrapUpDay: null, closeDay: null }))
  const withSeason = data.plans.map((p) => projectPlan(p, { todayAe: data.todayAe, closureDates: closures, wrapUpDay: data.snapshot.wrapUpDay, closeDay: data.snapshot.closeDay }))
  console.log(JSON.stringify({
    today: data.todayAe,
    snapshot: data.snapshot,
    paused: data.paused,
    salesStoppedAt: data.salesStoppedAt,
    plans: data.plans.length,
    lastMealOnTheBooks: lastMealOnTheBooks(books),
    dispositions: withSeason.map((p) => ({ plan: p.planId.slice(0, 8), disposition: p.disposition, lastDinner: p.lastDinner, mealsLeft: p.mealsLeft })),
    mealValues: data.plans.map((p) => ({ plan: p.id.slice(0, 8), mealValue: p.mealValue })),
  }, null, 2))
}

main().catch((err) => { console.error(err); process.exit(1) })
