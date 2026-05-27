/**
 * Compatibility shim — menuData.ts moved to contexts/menu/domain/catalog-data.ts
 * during the layered refactor (Phase 1).
 *
 * This file re-exports the public surface from the new home so existing
 * imports across the codebase keep working without edits. Deleted in Phase 11
 * cleanup once all consumers point at the new path or the MenuRepository.
 *
 * Do not add new code here. New consumers should import from:
 *   - @/contexts/menu/domain/repository           (interface)
 *   - @/contexts/menu/domain/static-menu-repository (current impl)
 *   - @/contexts/menu/domain/catalog-data         (raw catalog + types)
 */

export {
  MENU_DATA,
  getMenuWeek,
  type Dish,
} from '@/contexts/menu/domain/catalog-data'
