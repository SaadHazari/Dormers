import type { Dish } from '@/contexts/menu/domain/catalog-data'
import { glassTokens, type GlassSize } from '@/ui-system/tokens/glass'
import { SpiceMeter } from '@/app/components/SpiceMeter'

/**
 * The Spice / Allergens / Calories / Macros block shown when a dish
 * card is expanded. Was inlined nearly identically in DesktopMenuCarousel
 * and MobileMenuCard, with the only meaningful divergences being:
 *   - row stacking (`flex flex-col gap-0` + `relative z-20` on desktop;
 *     these are needed because the desktop carousel rotates cards in 3D
 *     so rows need their own stacking context)
 *   - eyebrow / calories font sizes (slightly smaller on mobile)
 *
 * Token differences between sizes are handled by `glassTokens(isLight, size)`.
 */
export function DishDetailPanel({
    dish,
    isLight,
    size,
}: {
    dish: Dish
    isLight: boolean
    size: GlassSize
}) {
    const { divider, mutedText, primaryText, macroGrid, macroLabel, macroValue, allergenTag } =
        glassTokens(isLight, size)
    const isDesktop = size === 'desktop'

    // Eyebrow + calories font sizes are smaller on mobile.
    const eyebrowClass = isDesktop
        ? 'text-[#f57f20] font-bold text-[11px] tracking-widest uppercase'
        : 'text-[#f57f20] font-bold text-[10px] tracking-widest uppercase'
    const caloriesValueClass = isDesktop
        ? `font-bold text-[15px] drop-shadow-md ${primaryText}`
        : `font-bold text-base drop-shadow-md ${primaryText}`
    const caloriesUnitClass = isDesktop
        ? `text-[10px] ml-1 uppercase font-semibold ${mutedText}`
        : `text-[9px] ml-1 uppercase font-semibold ${mutedText}`

    // Desktop wraps each row in `relative z-20` so the rows render above
    // the 3D-transformed siblings in the carousel; mobile is flat so it
    // doesn't need stacking context.
    const rowZ = isDesktop ? ' relative z-20' : ''

    // Desktop wraps the whole block in `flex flex-col gap-0 ... pt-3`,
    // mobile is just `pt-2`.
    const wrapperClass = isDesktop
        ? `flex flex-col gap-0 border-t ${divider} pt-3 mt-1`
        : `pt-2 border-t ${divider} mt-1`

    // Calories row: desktop has no bottom border (only min-h), mobile has
    // a bottom border + min-h.
    const caloriesRowClass = isDesktop
        ? `flex justify-between items-center py-2.5 min-h-[36px]${rowZ}`
        : `flex justify-between items-center py-2.5 border-b ${divider} min-h-[36px]`

    // Macros wrapper paddings differ.
    const macrosWrapperClass = isDesktop
        ? `grid grid-cols-3 gap-0 mt-1 mb-1 p-2.5${rowZ} ${macroGrid}`
        : `grid grid-cols-3 gap-0 py-[10px] mt-3 p-3 mb-2 ${macroGrid}`

    return (
        <div className={wrapperClass}>
            {/* Spice */}
            <div className={`flex justify-between items-center py-2.5 border-b ${divider}${rowZ}`}>
                <span className={eyebrowClass}>Spice</span>
                <SpiceMeter level={dish.spiceLevel} />
            </div>

            {/* Allergens */}
            <div className={`flex justify-between items-center py-2.5 border-b ${divider}${rowZ}`}>
                <span className={eyebrowClass}>Allergens</span>
                <div className="flex gap-1.5 flex-wrap justify-end">
                    {dish.allergens.length > 0 ? (
                        dish.allergens.map((allergen, idx) => (
                            <span key={idx} className={allergenTag}>{allergen}</span>
                        ))
                    ) : (
                        <span className={`text-[10px] ${mutedText}`}>None</span>
                    )}
                </div>
            </div>

            {/* Calories */}
            <div className={caloriesRowClass}>
                <span className={eyebrowClass}>Calories</span>
                <div className="text-right flex items-baseline">
                    <span className={caloriesValueClass}>
                        {dish.nutrients.calories.replace(/kcal/i, '').trim()}
                    </span>
                    <span className={caloriesUnitClass}>Kcal</span>
                </div>
            </div>

            {/* Macros 3-col */}
            <div className={macrosWrapperClass}>
                <div className={`flex flex-col text-center border-r ${divider} pr-2`}>
                    <span className={macroLabel}>Protein</span>
                    <span className={macroValue}>{dish.nutrients.protein}</span>
                </div>
                <div className={`flex flex-col text-center border-r ${divider} px-2`}>
                    <span className={macroLabel}>Carbs</span>
                    <span className={macroValue}>{dish.nutrients.carbs}</span>
                </div>
                <div className="flex flex-col text-center pl-2">
                    <span className={macroLabel}>Fat</span>
                    <span className={macroValue}>{dish.nutrients.fat}</span>
                </div>
            </div>
        </div>
    )
}
