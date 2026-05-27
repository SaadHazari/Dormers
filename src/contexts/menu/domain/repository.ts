/**
 * MenuRepository — the menu context's contract with the outside world.
 *
 * Today's implementation (StaticMenuRepository) wraps the 1277-line static
 * catalog in catalog-data.ts. A future menu-CMS milestone will swap in a
 * Supabase-backed implementation under infra/supabase/menu-repo.ts WITHOUT
 * touching anything that depends on this interface.
 *
 * See .planning/refactor/L1-BOUNDARIES.md (menu context) and
 * .planning/refactor/L2-MODULE-SHAPES.md (#7 Menu).
 */

import type { Dish, Week } from './catalog-data'

export interface MenuRepository {
  /** Resolves the four-week rotation to the active key for a given date. */
  resolveWeekForDate(date: Date): Week

  /** All dishes scheduled in the given week, in their natural order. */
  getDishesForWeek(week: Week): Dish[]

  /** The full catalog as a flat array. Convenience for code that filters itself. */
  getAllDishes(): Dish[]
}
