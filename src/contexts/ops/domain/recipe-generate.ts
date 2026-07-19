// src/contexts/ops/domain/recipe-generate.ts
// AI recipe generation + legacy-recipe conversion for the admin menu CMS.
//
// Two modes, both returning a RecipeV2 DRAFT (admin approves before the
// kitchen ever sees it):
//   generateRecipe — invent a Dormers-style recipe for a dish name, cooking
//     from the pantry master list so new recipes don't grow single-use
//     shelf-hog ingredients. Anything off-list is flagged, never hidden.
//   convertRecipe — parse an existing legacy (v1) text recipe into the
//     structured format VERBATIM. No creative changes; used to migrate old
//     cookbook extractions (including locked proprietary recipes).
//
// Zero imports from @/infra/ — pure domain per L1-BOUNDARIES. Callers fetch
// the dish + pantry rows and persist the draft.

import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import {
  normalizeQtyUnit,
  type RecipeV1,
  type RecipeV2,
  type RecipeSectionV2,
  type StructuredIngredient,
} from './recipe-format'

const MODEL_ID = 'gemini-2.5-flash'

export class RecipeGenError extends Error {}

export interface PantryEntry {
  name: string
  category: string
  /** e.g. "AED 2/kg" — omitted when pack data is incomplete */
  costHint: string | null
}

export interface GenerateRecipeInput {
  dishName: string
  description: string
  isVeg: boolean
  spiceLevel: number
  allergens: string[]
  pantry: PantryEntry[]
}

export interface ConvertRecipeInput {
  dishName: string
  existing: RecipeV1
  pantry: PantryEntry[]
}

// ─── Pantry matching ────────────────────────────────────────────────────────

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ')
}

/** Mark each ingredient pantry:true/false against the master list. */
function matchPantry(sections: RecipeSectionV2[], pantry: PantryEntry[]): string[] {
  const pantryNorms = pantry.map(p => normName(p.name)).filter(Boolean)
  const newOnes = new Set<string>()

  for (const section of sections) {
    for (const ing of section.items) {
      const n = normName(ing.item)
      const hit =
        n === 'water' ||
        pantryNorms.some(p => p === n || p.includes(n) || n.includes(p))
      ing.pantry = hit
      if (!hit) newOnes.add(ing.item)
    }
  }
  return [...newOnes]
}

// ─── Prompts ────────────────────────────────────────────────────────────────

const OUTPUT_SHAPE = `Output ONLY a JSON object — no commentary, no code fences:
{
  "sections": [
    {
      "heading": "For the <component>",
      "items": [
        { "item": "Basmati rice", "qty": 400, "unit": "g", "note": "washed and soaked 20 min" }
      ]
    }
  ],
  "method": ["Step 1 text", "Step 2 text"],
  "notes": "Allergen and serving notes as one plain-text string."
}

Ingredient rules:
- "item": the clean ingredient name only. Prep detail goes in "note", never in "item".
- "unit" must be one of: "g", "ml", "tsp", "tbsp", "pcs". NEVER use cups, kg, litres, handfuls, cans, or packets.
- Use g for solids and ml for liquids once the amount would exceed 4 tbsp. Use tsp/tbsp for spices and seasonings. Use pcs ONLY for naturally countable items (eggs, buns, lemons, whole chillies).
- Every ingredient used in cooking gets an explicit qty. { "qty": null, "unit": null } is allowed ONLY for final "adjust to taste" seasoning.
- One combined entry per ingredient per section (no listing salt twice in one section).`

function buildGeneratePrompt(input: GenerateRecipeInput): string {
  const pantryLines = input.pantry
    .map(p => `- ${p.name}${p.costHint ? ` (${p.costHint})` : ''}`)
    .join('\n')
  const spiceText = input.spiceLevel <= 1 ? 'mild' : input.spiceLevel === 2 ? 'medium' : 'hot'

  return `You are the recipe developer for Dormers, a meal-subscription kitchen in the UAE cooking daily single-container meals for university students. Write the definitive kitchen recipe for this dish.

DISH: ${input.dishName}
DESCRIPTION: ${input.description || '(none)'}
DIET: ${input.isVeg ? 'Vegetarian' : 'Non-veg'}
SPICE LEVEL: ${spiceText}
KNOWN ALLERGENS: ${input.allergens.length ? input.allergens.join(', ') : 'none listed'}

BASE YIELD: exactly 4 servings. The kitchen scales this recipe by a multiplier daily (often 5x to 15x), so quantities must be accurate ratios, not vague.

PANTRY — cook from this stock list. These are the ingredients the kitchen already buys (with rough cost where useful for choosing between equivalents):
${pantryLines}

HARD CONSTRAINTS:
1. Use pantry ingredients wherever possible. If the dish genuinely cannot be authentic without an off-list ingredient, include it anyway — it gets flagged for the owner to approve. Never silently substitute something that ruins the dish, and never add an off-list ingredient a pantry item can honestly replace.
2. At most 14 distinct ingredients total (salt, oil, and water excluded from the count). Fewer is better — this is a cost-controlled kitchen, not a restaurant tasting menu.
3. Taste comes first within those limits: bloom whole spices in oil, brown onions properly, marinate proteins when the cuisine calls for it, finish with acid or fresh herbs where appropriate. Season confidently for ${spiceText} heat.
4. The dish is packed in a delivery box and eaten up to an hour later. Avoid anything that turns soggy or splits on standing; sauces should be clingy, not watery.
5. If the dish has distinct components (e.g. a curry AND a rice), give each component its own section with heading "For the <component>". Single-component dishes use one section with heading "Ingredients".

METHOD RULES:
- 6 to 12 numbered-free steps, each one clear action a line cook can follow.
- Name the component at the start of steps when there are multiple sections (e.g. "For the rice: ...") so steps group correctly.
- Include pan heat, timings, and doneness cues ("until oil separates", "until 75C at the centre").
- NEVER write a quantity or unit inside a method step — no "add 30ml oil", no "salt (1 tsp)". The kitchen scales the ingredient list by a daily multiplier, so any amount written in a step would be wrong on cooking day. Refer to amounts as "the marinade", "the rice salt", "the dressing oil" — disambiguate with words, never numbers.

${OUTPUT_SHAPE}`
}

function buildConvertPrompt(input: ConvertRecipeInput): string {
  return `You are converting an existing kitchen recipe into structured data. This is a FAITHFUL FORMAT CONVERSION, not a rewrite.

RECIPE: ${input.dishName}
CURRENT DATA (ingredient lines are free text):
${JSON.stringify(input.existing, null, 2)}

RULES:
- Keep every section heading, every method step, and the notes EXACTLY as they are (fix nothing, reword nothing, reorder nothing).
- Convert each ingredient line into { item, qty, unit, note }:
  - Parse the quantity and unit out of the text. "0.1 kg salt" becomes qty 100, unit "g". "1/2 cup yogurt" becomes qty 120, unit "ml" (1 cup = 240 ml for liquids, use sensible gram weights for solids measured in cups). "2-3 tomatoes" becomes qty 2.5, unit "pcs".
  - Prep detail ("finely chopped", "soaked overnight") goes in "note".
  - If a line has no parseable quantity ("Salt to taste"), use qty null, unit null and put the original wording in "note".
- The base yield is 4 servings — do NOT rescale anything.

${OUTPUT_SHAPE}`
}

// ─── Gemini call + normalisation ────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeRecipe(raw: unknown): Omit<RecipeV2, 'meta'> {
  const o = (raw ?? {}) as Record<string, unknown>

  const sections: RecipeSectionV2[] = []
  if (Array.isArray(o.sections)) {
    for (const s of o.sections) {
      const so = (s ?? {}) as Record<string, unknown>
      const heading = asString(so.heading) || 'Ingredients'
      const items: StructuredIngredient[] = []
      if (Array.isArray(so.items)) {
        for (const i of so.items) {
          const io = (i ?? {}) as Record<string, unknown>
          const item = asString(io.item)
          if (!item) continue
          let qtyRaw: number | null = null
          if (typeof io.qty === 'number') qtyRaw = io.qty
          else if (typeof io.qty === 'string') qtyRaw = parseFloat(io.qty)
          const { qty, unit } = normalizeQtyUnit(
            qtyRaw !== null && Number.isFinite(qtyRaw) ? qtyRaw : null,
            typeof io.unit === 'string' ? io.unit : null,
          )
          const note = asString(io.note)
          items.push({ item: item.slice(0, 80), qty, unit, ...(note ? { note: note.slice(0, 120) } : {}) })
        }
      }
      if (items.length > 0) sections.push({ heading: heading.slice(0, 60), items })
    }
  }

  // Strip any model-added leading step numbers — the kitchen UI renders its
  // own step badges, so "1. Marinate..." would display as "1  1. Marinate...".
  const method = Array.isArray(o.method)
    ? o.method
        .map(asString)
        .filter(Boolean)
        .map(s => s.replace(/^\d+[.)]\s*/, '').slice(0, 500))
    : []
  const notes = asString(o.notes).slice(0, 1000)

  if (sections.length === 0) throw new RecipeGenError('The AI returned no usable ingredients. Try again.')
  if (method.length < 3) throw new RecipeGenError('The AI returned an incomplete method. Try again.')

  return { v: 2, sections, method, notes }
}

async function callGemini(prompt: string): Promise<unknown> {
  let raw: string
  try {
    const result = await generateText({
      model: google(MODEL_ID),
      prompt,
      // Same clean-abort pattern as box-count-verify: fire before the
      // Netlify function maxDuration kills the request.
      abortSignal: AbortSignal.timeout(45_000),
    })
    raw = result.text.trim()
  } catch (err) {
    console.error('[recipe-generate] Gemini call failed:', err)
    throw new RecipeGenError('The AI service did not respond. Try again in a minute.')
  }

  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  try {
    return JSON.parse(stripped)
  } catch {
    console.error('[recipe-generate] JSON parse failed. Raw output:', raw.slice(0, 500))
    throw new RecipeGenError('The AI returned an unreadable recipe. Try again.')
  }
}

function stamp(
  recipe: Omit<RecipeV2, 'meta'>,
  source: 'generated' | 'converted',
  newIngredients: string[],
): RecipeV2 {
  return {
    ...recipe,
    meta: { source, model: MODEL_ID, generatedAt: new Date().toISOString(), newIngredients },
  }
}

/** Invent a pantry-constrained Dormers recipe for a dish. Returns a draft. */
export async function generateRecipe(input: GenerateRecipeInput): Promise<RecipeV2> {
  const raw = await callGemini(buildGeneratePrompt(input))
  const recipe = normalizeRecipe(raw)
  const newIngredients = matchPantry(recipe.sections, input.pantry)
  return stamp(recipe, 'generated', newIngredients)
}

/** Convert a legacy v1 text recipe to structured format, verbatim. */
export async function convertRecipe(input: ConvertRecipeInput): Promise<RecipeV2> {
  const raw = await callGemini(buildConvertPrompt(input))
  const recipe = normalizeRecipe(raw)
  const newIngredients = matchPantry(recipe.sections, input.pantry)
  return stamp(recipe, 'converted', newIngredients)
}
