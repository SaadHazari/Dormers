// src/contexts/ops/domain/recipe-format.ts
// Structured (v2) recipe format.
//
// Ingredients are data ({ item, qty, unit }), not sentences, so the kitchen
// scales with exact math instead of a regex over free text.
//
// UNIT POLICY — deliberately unit-PRESERVING (owner decision, 2026-07-20):
// each ingredient keeps the unit its author chose, exactly like the Dormers
// Golden cookbook (spices in tsp/tbsp, liquids in ml/litres, bulk in kg,
// countable things bare). We do NOT convert between measurement systems
// (no g→tsp) and we do NOT promote magnitude (no g→kg). Different cooks
// prefer different systems; forcing one is worse than a big gram number.
// Scaling multiplies the number and keeps the unit; display only rounds and
// adds thousands separators for readability.
//
// BASE SERVINGS — every v2 recipe carries baseServings (default 4). The
// kitchen scales by mealCount / recipe.baseServings, so a recipe authored at
// a different base can never be mis-scaled (this is the fix for the batch-size
// cookbook recipes that read "5 kg paneer" at a supposed 4-serving base).
//
// Zero imports from @/infra/ — pure domain module per L1-BOUNDARIES rule.

// ─── Types ──────────────────────────────────────────────────────────────────

/** The units the cookbook actually uses. No cross-conversion between them. */
export type IngredientUnit =
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'tsp'
  | 'tbsp'
  | 'cup'
  | 'pcs'
  | 'pinch'

export const DEFAULT_BASE_SERVINGS = 4

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
  /** Servings the quantities are written for. Kitchen scales by mealCount/this. */
  baseServings: number
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

/** Servings a recipe's quantities are written for (safe default for legacy v1). */
export function recipeBaseServings(recipe: AnyRecipe | null | undefined): number {
  if (isRecipeV2(recipe) && recipe.baseServings > 0) return recipe.baseServings
  return DEFAULT_BASE_SERVINGS
}

// ─── Unit normalisation (ingest) ────────────────────────────────────────────
// Map free-text unit words to a canonical token. NOTE: kg stays kg and litre
// stays l — we normalise spelling, never magnitude or system.

const UNIT_ALIASES: Record<string, IngredientUnit> = {
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', milliliter: 'ml', millilitre: 'ml', milliliters: 'ml', millilitres: 'ml',
  l: 'l', lt: 'l', ltr: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup',
  pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs', no: 'pcs', nos: 'pcs',
  count: 'pcs', whole: 'pcs', unit: 'pcs', units: 'pcs',
  pinch: 'pinch', pinches: 'pinch',
}

/**
 * Normalise a raw { qty, unit } pair. Unit SPELLING is canonicalised; the unit
 * itself is never converted. Unknown units, or missing/zero quantities, collapse
 * to "to taste" (null/null) rather than lying with a fake number.
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
  return { qty, unit }
}

// ─── Display formatting (kitchen + PDF) ──────────────────────────────────────

/** 1234.5 → "1,234.5" — group the integer part only. */
function withThousands(s: string): string {
  const neg = s.startsWith('-')
  const body = neg ? s.slice(1) : s
  const [intPart, dec] = body.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + (dec ? `${grouped}.${dec}` : grouped)
}

function trimTo(n: number, decimals: number): number {
  return parseFloat(n.toFixed(decimals))
}

/** 0.5 → "1/2", 1.5 → "1 1/2", 2 → "2" — spoons/cups read as fractions. */
function fractionText(n: number): string {
  const whole = Math.floor(n)
  const frac = Math.round((n - whole) * 4) / 4
  if (frac === 1) return String(whole + 1)
  const fracStr = frac === 0.25 ? '1/4' : frac === 0.5 ? '1/2' : frac === 0.75 ? '3/4' : ''
  if (!fracStr) return withThousands(String(trimTo(n, 2)))
  if (whole === 0) return fracStr
  return `${withThousands(String(whole))} ${fracStr}`
}

/** Round bulk weight/volume to steps a kitchen scale can hit, then group. */
function bulkText(qty: number): string {
  let r: number
  if (qty >= 100) r = Math.round(qty / 5) * 5
  else if (qty >= 20) r = Math.round(qty)
  else r = Math.round(qty * 2) / 2
  return withThousands(String(trimTo(r, 1)))
}

function plural(n: number, word: string): string {
  return Math.abs(n - 1) < 1e-9 ? word : `${word}s`
}

/**
 * Format an already-scaled amount, PRESERVING its unit. Returns the amount
 * string with unit (e.g. "1,200 g", "1.5 kg", "2 tbsp", "10") — or null when
 * the ingredient has no fixed amount.
 */
export function formatAmount(qty: number | null, unit: IngredientUnit | null): string | null {
  if (qty === null || unit === null || !Number.isFinite(qty) || qty <= 0) return null
  switch (unit) {
    case 'g':   return `${bulkText(qty)} g`
    case 'ml':  return `${bulkText(qty)} ml`
    case 'kg':  return `${withThousands(String(trimTo(qty, 3)))} kg`
    case 'l': { const v = trimTo(qty, 3); return `${withThousands(String(v))} ${plural(v, 'litre')}` }
    case 'tsp': return `${fractionText(Math.round(qty * 4) / 4)} tsp`
    case 'tbsp':return `${fractionText(Math.round(qty * 4) / 4)} tbsp`
    case 'cup': { const v = Math.round(qty * 4) / 4; return `${fractionText(v)} ${plural(v, 'cup')}` }
    case 'pcs': return withThousands(String(Math.max(0.5, Math.round(qty * 2) / 2)))
    case 'pinch': { const v = Math.max(1, Math.round(qty)); return `${v} ${v === 1 ? 'pinch' : 'pinches'}` }
  }
}

export interface IngredientDisplay {
  /** "1,200 g" / "2 tbsp" / "10" (pcs) — null when the amount is "to taste" */
  amount: string | null
  /** "Basmati rice" */
  label: string
  /** "finely chopped" */
  note: string | null
}

/**
 * Scale a structured ingredient by the kitchen multiplier and format it for
 * display. Exact math on data — no regex over sentences, no unit conversion.
 */
export function scaleIngredient(
  ing: StructuredIngredient,
  multiplier: number,
): IngredientDisplay {
  const note = ing.note?.trim() ? ing.note.trim() : null
  const amount = formatAmount(
    ing.qty === null ? null : ing.qty * multiplier,
    ing.unit,
  )
  if (amount === null) {
    return { amount: null, label: ing.item, note: note ?? 'to taste' }
  }
  return { amount, label: ing.item, note }
}
