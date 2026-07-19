// src/contexts/ops/domain/recipe-format.ts
// Structured (v2) recipe format: ingredients are data ({ item, qty, unit }),
// not sentences — so the kitchen can scale with real math and render units a
// cook actually thinks in ("400 g", "1.5 kg", "2 tbsp"), never "0.1 kg salt".
//
// Legacy (v1) recipes keep the old { sections: { heading, items: string[] } }
// shape and still render through scaleQuantity() until they're converted.
//
// Zero imports from @/infra/ — pure domain module per L1-BOUNDARIES rule.

// ─── Types ──────────────────────────────────────────────────────────────────

/** Canonical storage units. kg/l are normalised to g/ml on ingest. */
export type IngredientUnit =
  | 'g'
  | 'ml'
  | 'tsp'
  | 'tbsp'
  | 'cup'
  | 'pcs'
  | 'pinch'

export interface StructuredIngredient {
  /** "Basmati rice" — matches pantry naming where possible */
  item: string
  /** null = no fixed amount ("to taste") */
  qty: number | null
  unit: IngredientUnit | null
  /** prep note: "finely chopped", "soaked 30 min" */
  note?: string
  /** false = not on the pantry master list — flagged in admin before approval */
  pantry?: boolean
}

export interface RecipeSectionV2 {
  heading: string
  items: StructuredIngredient[]
}

export interface RecipeMeta {
  source: 'generated' | 'converted'
  model: string
  generatedAt: string
  newIngredients: string[]
}

export interface RecipeV2 {
  v: 2
  sections: RecipeSectionV2[]
  method: string[]
  notes: string
  meta?: RecipeMeta
}

export interface RecipeSectionV1 {
  heading: string
  items: string[]
}

export interface RecipeV1 {
  sections: RecipeSectionV1[]
  method: string[]
  notes: string
}

export type AnyRecipe = RecipeV1 | RecipeV2

export function isRecipeV2(recipe: AnyRecipe | null | undefined): recipe is RecipeV2 {
  return !!recipe && (recipe as RecipeV2).v === 2
}

// ─── Unit normalisation (ingest) ────────────────────────────────────────────

const UNIT_ALIASES: Record<string, IngredientUnit | 'kg' | 'l'> = {
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', milliliter: 'ml', millilitre: 'ml', milliliters: 'ml', millilitres: 'ml',
  l: 'l', lt: 'l', ltr: 'l', liter: 'l', litre: 'l', liters: 'l', litres: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup',
  pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs', no: 'pcs', nos: 'pcs',
  count: 'pcs', whole: 'pcs', unit: 'pcs', units: 'pcs',
  pinch: 'pinch', pinches: 'pinch',
}

/**
 * Normalise a raw { qty, unit } pair to canonical storage units.
 * kg → g and l → ml so the DB only ever holds one mass and one volume unit.
 * Unknown units collapse to null ("to taste" rendering) rather than lying.
 */
export function normalizeQtyUnit(
  qty: number | null,
  rawUnit: string | null | undefined,
): { qty: number | null; unit: IngredientUnit | null } {
  if (qty === null || !Number.isFinite(qty) || qty <= 0) return { qty: null, unit: null }
  const key = (rawUnit ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (key === '' || key === 'to taste' || key === 'as needed') return { qty: null, unit: null }
  const unit = UNIT_ALIASES[key]
  if (!unit) return { qty: null, unit: null }
  if (unit === 'kg') return { qty: qty * 1000, unit: 'g' }
  if (unit === 'l') return { qty: qty * 1000, unit: 'ml' }
  return { qty, unit }
}

// ─── Display formatting (kitchen) ───────────────────────────────────────────

function trimNumber(n: number, decimals: number): string {
  return parseFloat(n.toFixed(decimals)).toString()
}

/** 0.5 → "1/2", 1.5 → "1 1/2" — spoon amounts read as fractions, not decimals. */
function spoonNumber(n: number): string {
  const whole = Math.floor(n)
  const frac = Math.round((n - whole) * 4) / 4
  const fracText = frac === 0.25 ? '1/4' : frac === 0.5 ? '1/2' : frac === 0.75 ? '3/4' : ''
  if (frac === 1) return String(whole + 1)
  if (whole === 0) return fracText || trimNumber(n, 2)
  return fracText ? `${whole} ${fracText}` : String(whole)
}

/** Round bulk amounts to what a kitchen scale can actually do. */
function roundBulk(n: number): number {
  if (n >= 1000) return Math.round(n / 25) * 25
  if (n >= 100) return Math.round(n / 5) * 5
  if (n >= 20) return Math.round(n)
  return Math.round(n * 2) / 2
}

/**
 * Format an already-scaled amount in cook-friendly units:
 *   1500 g → "1.5 kg", 400 g → "400 g", 12.5 g stays "12.5 g"
 *   2000 ml → "2 L", 7 tsp → "2 tbsp + 1 tsp", pcs render bare ("8")
 */
export function formatAmount(qty: number, unit: IngredientUnit): string {
  switch (unit) {
    case 'g': {
      const r = roundBulk(qty)
      if (r >= 1000) return `${trimNumber(r / 1000, 3)} kg`
      return `${trimNumber(r, 1)} g`
    }
    case 'ml': {
      const r = roundBulk(qty)
      if (r >= 1000) return `${trimNumber(r / 1000, 3)} L`
      return `${trimNumber(r, 1)} ml`
    }
    case 'tsp': {
      if (qty >= 3) {
        const tbsp = Math.floor(qty / 3)
        const rest = Math.round((qty - tbsp * 3) * 2) / 2
        if (rest === 0) return `${spoonNumber(tbsp)} tbsp`
        return `${spoonNumber(tbsp)} tbsp + ${spoonNumber(rest)} tsp`
      }
      return `${spoonNumber(Math.round(qty * 4) / 4)} tsp`
    }
    case 'tbsp': {
      if (qty < 1) return formatAmount(qty * 3, 'tsp')
      return `${spoonNumber(Math.round(qty * 2) / 2)} tbsp`
    }
    case 'cup': {
      const r = Math.round(qty * 4) / 4
      return `${spoonNumber(r)} ${r === 1 ? 'cup' : 'cups'}`
    }
    case 'pcs': {
      const r = Math.max(0.5, Math.round(qty * 2) / 2)
      return trimNumber(r, 1)
    }
    case 'pinch': {
      const r = Math.max(1, Math.round(qty))
      return `${r} ${r === 1 ? 'pinch' : 'pinches'}`
    }
  }
}

export interface IngredientDisplay {
  /** "800 g" / "2 tbsp" / "8" (pcs) — null when the amount is "to taste" */
  amount: string | null
  /** "Basmati rice" */
  label: string
  /** "finely chopped" */
  note: string | null
}

/**
 * Scale a structured ingredient by the kitchen multiplier and format it for
 * display. Exact math on data — no regex over sentences.
 */
export function scaleIngredient(
  ing: StructuredIngredient,
  multiplier: number,
): IngredientDisplay {
  const note = ing.note?.trim() ? ing.note.trim() : null
  if (ing.qty === null || ing.unit === null) {
    return { amount: null, label: ing.item, note: note ?? 'to taste' }
  }
  return {
    amount: formatAmount(ing.qty * multiplier, ing.unit),
    label: ing.item,
    note,
  }
}
