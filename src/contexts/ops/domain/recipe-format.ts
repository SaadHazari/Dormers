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

/**
 * A servable sub-dish of a meal — e.g. "Butter Paneer" and "Carrot & Peas Rice"
 * are the two components of that meal. Each carries its OWN ingredient sections
 * and its OWN method, numbered from 1. This is stored explicitly (the generator
 * decides the components) instead of being guessed from the method text.
 */
export interface RecipeComponentV2 {
  /** the food itself, short: "Rajma", "Zeera Rice" — never the full menu name */
  title: string
  sections: RecipeSectionV2[]
  method: string[]
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
  /** Canonical structure: the meal's servable components. */
  components?: RecipeComponentV2[]
  /** Legacy pre-components shape — still readable, converted on the fly. */
  sections?: RecipeSectionV2[]
  method?: string[]
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

// ─── Reading components (the single render entry point) ──────────────────────
// New recipes store `components` explicitly. Legacy recipes (pre-components,
// with top-level sections + flat method) are converted on the fly by splitting
// the flat method at its "For the <side>:" markers. Kitchen, PDF, and admin all
// render through getRecipeComponents so they never diverge.

function componentKeywords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/^for\s+(?:the\s+|serving\b)?/, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Return a v2 recipe's components. Uses the explicit `components` array when
 * present; otherwise derives them from the legacy sections + flat method by
 * splitting on "For the <side>:" markers (validated against section headings so
 * a stray "For best results:" never invents a component).
 */
export function getRecipeComponents(recipe: RecipeV2, dishName: string): RecipeComponentV2[] {
  if (recipe.components && recipe.components.length > 0) return recipe.components

  const sections = recipe.sections ?? []
  const method = recipe.method ?? []
  if (sections.length === 0 && method.length === 0) return []

  const sectionKw = sections.map((s) => componentKeywords(s.heading))
  const markerRe = /^for\s+(?:the\s+)?(.+?):\s+/i
  const mainTitle = (dishName.split(/\s+w\/\s+|\s+with\s+/i)[0] || dishName).trim()
  const groups: { title: string; method: string[] }[] = [{ title: mainTitle, method: [] }]

  for (const raw of method) {
    const m = raw.match(markerRe)
    const markerKw = m ? componentKeywords(m[1]) : []
    const matchesSection =
      markerKw.length > 0 && sectionKw.some((kw) => kw.some((k) => markerKw.includes(k)))
    if (m && matchesSection) {
      groups.push({ title: titleCase(m[1].trim()), method: [raw.replace(markerRe, '').trim()] })
    } else {
      groups[groups.length - 1].method.push(raw)
    }
  }

  const groupKw = groups.map((g) => componentKeywords(g.title))
  const buckets: RecipeSectionV2[][] = groups.map(() => [])
  sections.forEach((section, si) => {
    let best = 0
    let bestScore = 0
    for (let gi = 1; gi < groups.length; gi++) {
      const score = groupKw[gi].filter((k) => sectionKw[si].includes(k)).length
      if (score > bestScore) {
        bestScore = score
        best = gi
      }
    }
    buckets[best].push(section)
  })

  return groups
    .map((g, i) => ({ title: g.title, sections: buckets[i], method: g.method }))
    .filter((c) => c.sections.length > 0 || c.method.length > 0)
}

// ─── Optional unit conversion (chef-chosen, view only) ───────────────────────
// The recipe stays stored in its authored unit; a cook can tap an amount to
// SEE it in the unit they prefer. Same-system conversions (g↔kg, ml↔l↔tsp↔tbsp
// ↔cup) are exact; cross-system (weight↔volume/spoons) assume a water-like
// density of 1 g/ml and are flagged approximate. Never mutates the recipe.

const UNIT_BASE: Record<IngredientUnit, number | null> = {
  g: 1, kg: 1000, ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 240, pcs: null, pinch: null,
}
const CONVERTIBLE: IngredientUnit[] = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup']

function unitSystem(u: IngredientUnit): 'weight' | 'volume' | 'other' {
  if (u === 'g' || u === 'kg') return 'weight'
  if (u === 'ml' || u === 'l' || u === 'tsp' || u === 'tbsp' || u === 'cup') return 'volume'
  return 'other'
}

export interface AmountOption {
  qty: number
  unit: IngredientUnit
  /** true when the conversion crossed weight↔volume (assumed density 1) */
  approx: boolean
}

/**
 * The unit alternatives a cook can cycle an amount through, original first.
 * Returns just the original for count/pinch units or missing amounts. Filters
 * out silly magnitudes (no "160 tsp of chicken") and caps the list.
 */
export function alternativeAmounts(
  qty: number | null,
  unit: IngredientUnit | null,
): AmountOption[] {
  if (qty === null || unit === null || UNIT_BASE[unit] === null) {
    return qty !== null && unit !== null ? [{ qty, unit, approx: false }] : []
  }
  const base = qty * (UNIT_BASE[unit] as number)
  const oSys = unitSystem(unit)
  const opts: AmountOption[] = []

  for (const u of CONVERTIBLE) {
    if (u === unit) continue
    const factor = UNIT_BASE[u] as number
    const q = base / factor
    const cross = unitSystem(u) !== oSys

    // Magnitude sensibility per unit.
    if (u === 'kg' && base < 1000) continue
    if (u === 'l' && base < 1000) continue
    if (u === 'ml' && base >= 1000) continue   // prefer litres over 1000+ ml
    if (u === 'g' && base >= 100000) continue
    if ((u === 'g' || u === 'ml') && q < 1) continue
    if (u === 'tsp' && (q < 0.25 || q > 24)) continue
    if (u === 'tbsp' && (q < 0.5 || q > 16)) continue
    if (u === 'cup' && (q < 0.25 || q > 8)) continue
    // Cross-system gates: spoons/cups only make sense for small amounts.
    if (cross && (u === 'tsp' || u === 'tbsp' || u === 'cup') && base > 400) continue
    if (cross && (u === 'ml' || u === 'g') && base > 2000) continue

    opts.push({ qty: q, unit: u, approx: cross })
  }

  // Exact (same-system) conversions before approximate ones.
  opts.sort((a, b) => Number(a.approx) - Number(b.approx))
  return [{ qty, unit, approx: false }, ...opts].slice(0, 5)
}
