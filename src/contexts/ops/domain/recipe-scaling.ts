/**
 * scaleQuantity — multiply the LEADING quantity of an ingredient line by a
 * scaling multiplier (kitchen mealCount / recipe base servings).
 *
 * Extracted from KitchenClient (Phase 9 / Arc 2) so the kitchen's scaling math
 * is unit-tested and visible. Behaviour is UNCHANGED from the inline version.
 *
 * Deliberately conservative: it scales ONLY the leading number of the line
 * (e.g. "2 cups flour" → "8 cups flour" at 4×). It intentionally does NOT
 * aggressively scale every number, because ingredient lines can contain
 * non-quantity numbers and over-scaling a kitchen recipe is worse than
 * under-scaling.
 *
 * KNOWN LIMITATIONS (documented + locked in by the tests, NOT yet "fixed" —
 * how to scale these is an owner decision):
 *   - ranges:    "2-3 tomatoes" scales only the leading "2" → "8-3 tomatoes"
 *   - fractions: "1/2 cup" scales the "1" → "4/2 cup"
 *   - mid-line:  "Salt 1 tsp, 2 cloves" has no leading number → unchanged
 */
export function scaleQuantity(text: string, multiplier: number): string {
  if (multiplier === 1) return text
  return text.replace(
    /^(\d+(?:\.\d+)?)\s*/,
    (_, num) => {
      const scaled = parseFloat(num) * multiplier
      const display = scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1)
      return display + ' '
    },
  )
}
