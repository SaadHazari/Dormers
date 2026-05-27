/**
 * StaticMenuRepository — the in-process implementation backed by catalog-data.ts.
 *
 * This is what runs today. When the menu-CMS milestone ships, a Supabase-backed
 * repository in infra/supabase/ will replace this without changing the
 * interface. The whole point of the repository pattern is that swap is a
 * single-file change.
 */

import type { MenuRepository } from './repository'
import { MENU_DATA, getMenuWeek, type Dish, type Week } from './catalog-data'

export const staticMenuRepository: MenuRepository = {
  resolveWeekForDate(date: Date): Week {
    return getMenuWeek(date)
  },

  getDishesForWeek(week: Week): Dish[] {
    return MENU_DATA.filter((d) => d.week === week)
  },

  getAllDishes(): Dish[] {
    return MENU_DATA
  },
}
