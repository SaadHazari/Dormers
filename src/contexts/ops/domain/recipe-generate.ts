// src/contexts/ops/domain/recipe-generate.ts
// AI recipe generation + legacy-recipe conversion for the admin menu CMS.
//
// Both modes return a base-4 RecipeV2 DRAFT (admin approves before the kitchen
// ever sees it):
//   generateRecipe — invent a Dormers-style recipe for a dish name, cooking
//     from the pantry master list so new recipes don't grow single-use
//     shelf-hog ingredients. Anything off-list is flagged, never hidden.
//   convertRecipe — restructure an existing legacy (v1) cookbook recipe into
//     the base-4 structured format: keep its ingredients, method, and sections
//     FAITHFUL (used for the proprietary/locked dishes) but rescale the
//     batch-size quantities down to 4 servings and simplify the wording.
//
// HOUSE STYLE (from the Dormers Golden cookbook): recipes split into named
// components ("For the marinade", "For the gravy", "For the rice"); very
// simple English for cooks who don't speak English well; natural units per
// ingredient with NO forced conversion (tsp for spices, g for solids, ml for
// liquids, bare counts for whole items).
//
// Zero imports from @/infra/ — pure domain per L1-BOUNDARIES. Callers fetch
// the dish + pantry rows and persist the draft.

import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import {
  normalizeQtyUnit,
  DEFAULT_BASE_SERVINGS,
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

// ─── Shared prompt blocks ────────────────────────────────────────────────────

// Dormers' fixed cooked portion per box, and the RAW base-4 amounts that hit
// it. These anchor every recipe so main components are never under-portioned.
// The raw amounts already allow for cooking loss (meat ~28%, rice/pasta expand).
const SERVING_SPEC = `DORMERS PORTION SIZES — the finished box must contain these amounts per person, so size the recipe to hit them:
- Boneless cooked chicken/meat: 150 g per person.
- Rice served ON THE SIDE (cooked): 300 g per person.
- One-pot rice dish (biryani, fried rice, pilaf): 300 g cooked rice + 150 g cooked meat per person.
- Pasta dish: 450 g per person total = 300 g cooked pasta + the protein.
- Curry: 200 g curry per person, which already includes the 150 g meat plus its gravy and vegetables.
- Bread dish: 4 pieces of bread per person (2 breads each cut in half).
- Vegetarian dishes: paneer / soya / vegetables replace the meat at the same weight (150 g cooked per person).

Because meat shrinks and rice/pasta swell when cooked, use these RAW amounts in the ingredient list for the BASE 4-SERVING recipe (they already hit the cooked targets above):
- Boneless chicken/meat, dry dish (grilled, roasted, pan-fried): about 800 g.
- Boneless chicken/meat inside a curry: about 700 g.
- Bone-in chicken: about 1000 g.
- Paneer: about 600 g.
- Soya chunks (dry, before soaking): about 200 g.
- Rice on the side OR in a one-pot dish (dry basmati): about 450 g.
- Pasta (dry): about 550 g.
- Bread (roti / naan / arabic bread): 16 pieces total.

First decide which type this dish is from its name, then set the MAIN items to the amounts above and scale every other ingredient (onion, tomato, spices, oil, cream) up to match, keeping the flavour balanced. Do NOT leave the main protein or rice under-weight.`

const ALLERGEN_RULE = `ALLERGENS — the "notes" field MUST correctly list every allergen that is actually in the ingredients, and MUST NOT list one that is not:
- Dairy: butter, ghee, cream, cooking cream, milk, paneer, cheese, yogurt.
- Egg: eggs, AND mayonnaise (mayonnaise is made from egg, it is NOT dairy).
- Gluten / wheat: wheat flour, maida, all-purpose flour, bread, roti, naan, pasta, soy sauce.
- Nuts: cashew, peanut, almond.
- Soy: soya chunks, soy sauce, tofu.
Look at your final ingredient list and declare exactly what is present. Do not copy an allergen that no ingredient supports.`

const COMPLETENESS_RULE = `COMPLETENESS:
- Every ingredient named in a method step MUST appear in the ingredient list (including oil, ghee, and water). If a step fries in oil, oil must be an ingredient.
- Never split one ingredient's amount across two steps ("half now, half later"). List it once; if used at two points say "some of the X" then "the rest of the X" — never with a number.`
// ─── (prompt blocks continue) ────────────────────────────────────────────────

// The single house-style rulebook every prompt shares. Written to keep recipes
// readable for line cooks whose first language is not English.
const HOUSE_STYLE = `HOW TO WRITE (very important):
Our cooks do not speak English well. Write the way you would explain to someone learning English.
- Use the simplest, most common words. Short sentences. One action per step.
- Say "fry" not "sauté", "brown the onions" not "caramelise", "mix well" not "emulsify" or "incorporate", "cut small" not "finely dice", "boil" not "bring to a rolling boil", "cook until soft" not "cook until translucent", "loosen the rice with a fork" not "fluff", "until the oil comes on top" not "until oil separates", "so it does not go lumpy" not "so it does not split".
- No fancy or dramatic words (no "generously", "confidently", "beautifully", "aromatic").
- Measure saffron as "a pinch", never in grams.
- For meat, say "cook until fully done, no pink inside" instead of giving a temperature.
- Do NOT write any amount or unit inside a method step (no "add 30 ml oil", no "1 tsp salt"). The kitchen scales the ingredient list every day, so a number written in a step would be wrong. Point to things by name: "the marinade", "the rice water", "the gravy spices".

SECTIONS:
Split the recipe into its real parts, like the cookbook does — "For the marinade", "For the gravy", "For the rice", "For the salad". If the dish is one simple thing, use a single section called "Ingredients".

UNITS (do not convert between them):
Give each ingredient the unit a cook naturally uses for it at this small 4-serving size. Spices and seasonings in "tsp" or "tbsp". Main solids (rice, meat, paneer, vegetables) in "g". Liquids (water, milk, cream, oil) in "ml". Whole countable things (eggs, buns, lemons, whole green chillies, curry leaves, bay leaves) in "pcs". Only use "kg" or "l" if an amount is genuinely large at 4 servings (rare). Never use cups, cans, packets, or handfuls.`

const OUTPUT_SHAPE = `Output ONLY a JSON object — no commentary, no code fences:
{
  "sections": [
    {
      "heading": "For the marinade",
      "items": [
        { "item": "Chicken thighs", "qty": 400, "unit": "g", "note": "cut into chunks" },
        { "item": "Red chilli powder", "qty": 1, "unit": "tsp" }
      ]
    }
  ],
  "method": ["Mix the chicken with all the marinade items. Keep in the fridge for 1 hour.", "Cook the chicken in a hot pan until brown. Take it out."],
  "notes": "Allergen and serving notes as one short plain-text string."
}

Rules for the JSON:
- "item": the clean ingredient name only. Prep words ("chopped", "soaked") go in "note".
- "unit": one of "g", "kg", "ml", "l", "tsp", "tbsp", "pcs", "pinch". No other unit.
- Every real ingredient gets a qty. Use qty null + unit null ONLY for "salt to taste" style items.
- List each ingredient once per section.`

const EXAMPLE = `EXAMPLE of the tone and shape we want (a different dish — do not copy its ingredients):
{
  "sections": [
    { "heading": "For the chicken marinade", "items": [
      { "item": "Chicken thighs", "qty": 700, "unit": "g", "note": "cut into chunks" },
      { "item": "Plain yogurt", "qty": 100, "unit": "g" },
      { "item": "Ginger-garlic paste", "qty": 2, "unit": "tbsp" },
      { "item": "Red chilli powder", "qty": 2, "unit": "tsp" },
      { "item": "Salt", "qty": 2, "unit": "tsp" }
    ]},
    { "heading": "For the gravy", "items": [
      { "item": "Tomato", "qty": 500, "unit": "g", "note": "made into puree" },
      { "item": "Onion", "qty": 150, "unit": "g", "note": "chopped small" },
      { "item": "Butter", "qty": 80, "unit": "g" },
      { "item": "Cooking cream", "qty": 150, "unit": "ml" }
    ]},
    { "heading": "For the rice", "items": [
      { "item": "Basmati rice", "qty": 450, "unit": "g", "note": "washed" },
      { "item": "Water", "qty": 900, "unit": "ml" },
      { "item": "Salt", "qty": null, "unit": null, "note": "to taste" }
    ]}
  ],
  "method": [
    "Mix the chicken with all the marinade items. Keep in the fridge for 1 hour.",
    "Cook the chicken in a hot pan until brown on all sides. Take it out and keep aside.",
    "In the same pan, melt the butter. Fry the onion until soft.",
    "Add the tomato and cook until the oil comes on top.",
    "Pour in the cream and mix well. Put the chicken back and cook for 10 minutes.",
    "For the rice: boil the water with salt. Add the washed rice, cover, and cook on low heat until soft.",
    "Serve the chicken with the rice."
  ],
  "notes": "Contains dairy (yogurt, butter, cream). Rich dish."
}`

function buildGeneratePrompt(input: GenerateRecipeInput): string {
  const pantryLines = input.pantry
    .map(p => `- ${p.name}${p.costHint ? ` (${p.costHint})` : ''}`)
    .join('\n')
  const spiceText = input.spiceLevel <= 1 ? 'mild' : input.spiceLevel === 2 ? 'medium' : 'hot'

  return `You are the recipe writer for Dormers, a meal kitchen in the UAE that cooks daily boxed meals for university students. Write the kitchen recipe for this dish.

DISH: ${input.dishName}
DESCRIPTION: ${input.description || '(none)'}
DIET: ${input.isVeg ? 'Vegetarian (no meat, no fish)' : 'Non-veg'}
SPICE: ${spiceText}
KNOWN ALLERGENS: ${input.allergens.length ? input.allergens.join(', ') : 'none listed'}

YIELD: write the recipe for EXACTLY 4 servings (4 boxes). The kitchen multiplies these numbers to cook for more people, so the ratios must be correct.

${SERVING_SPEC}

PANTRY — cook from this stock list (rough cost shown where helpful):
${pantryLines}

RULES:
1. Use pantry ingredients wherever possible. If the dish truly needs something not on the list, you may include it — it will be flagged for the owner. Never add an off-list ingredient when a pantry item does the same job.
2. Keep it to 14 ingredients or fewer (do not count salt, oil, and water). Fewer is better — this is a cost-controlled kitchen.
3. Make it taste good for ${spiceText} spice: brown the onions well, cook the spices, marinate the meat when the dish needs it.
4. The food is packed in a box and eaten about an hour later. Keep sauces thick, not watery, so nothing goes soggy.

${COMPLETENESS_RULE}

${ALLERGEN_RULE}

${HOUSE_STYLE}

${EXAMPLE}

${OUTPUT_SHAPE}`
}

function buildConvertPrompt(input: ConvertRecipeInput): string {
  return `You are rewriting an existing Dormers recipe so it is ready for the kitchen app. This is the kitchen's OWN recipe — keep it faithful.

RECIPE: ${input.dishName}
CURRENT RECIPE (written for a big batch, about 100 servings; ingredient lines are free text):
${JSON.stringify(input.existing, null, 2)}

WHAT TO CHANGE — only these two things:
1. RESCALE to exactly 4 servings (4 boxes), hitting the Dormers portion sizes below. The current amounts feed a big batch; bring every quantity down proportionally so the MAIN items match the base-4 raw targets (for example about 700-800 g chicken, about 450 g dry rice). Give each ingredient the natural unit at this size (batch "10 kg chicken" becomes about "800 g", not "0.8 kg").
2. SIMPLIFY the wording of the method into very simple English.

WHAT TO KEEP THE SAME:
- The same ingredients (do not add, remove, or swap any — this is the kitchen's own recipe).
- The same cooking steps in the same order (only make the words simpler).
- The same section split (keep the marinade/gravy/rice structure).

${SERVING_SPEC}

${ALLERGEN_RULE}

${HOUSE_STYLE}

${OUTPUT_SHAPE}`
}

// ─── Gemini call + normalisation ────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Clean a method step:
 *  - drop a leading step number the model added ("1. Fry..." → "Fry...")
 *  - strip stray cooking measurements the model leaked into prose ("add 100 ml
 *    water" → "add water"). The kitchen scales the ingredient list daily, so a
 *    fixed amount inside a step would be wrong on cooking day. Times, sizes,
 *    and temperatures (minutes, inch, cm, °C) are deliberately left untouched.
 */
export function cleanMethodStep(s: string): string {
  return s
    .replace(/^\d+[.)]\s*/, '')
    // Remove a leaked measured amount, INCLUDING a following "of" so we don't
    // leave a dangling "Add of the soy sauce". "Add 2 tbsp of the soy sauce"
    // → "Add the soy sauce"; "add 100 ml water" → "add water".
    .replace(/\b\d+(?:[.,]\d+)?\s?(?:ml|g|kg|l|tsp|tbsp|cups?)\b(?:\s+of)?\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .replace(/\(\s*\)/g, '')
    // Tidy a few artefacts the strip can leave behind.
    .replace(/\bAdd the the\b/gi, 'Add the')
    .replace(/\b(Add|Pour in|Mix in)\s+and\b/gi, '$1')
    .trim()
    .slice(0, 500)
}

/**
 * Fold a header-only step ("For the Lemon Rice:") into the next real step so
 * the kitchen's section-matcher keeps its grouping cue and the step doesn't
 * render as a bare numbered line. A trailing header (no following step) is
 * dropped.
 */
export function mergeHeaderSteps(steps: string[]): string[] {
  const out: string[] = []
  let pendingHeader: string | null = null
  for (const step of steps) {
    const isHeader = /:$/.test(step) && step.length <= 48 && !/[.]/.test(step)
    if (isHeader) {
      pendingHeader = step.replace(/:$/, '')
      continue
    }
    out.push(pendingHeader ? `${pendingHeader}: ${step}` : step)
    pendingHeader = null
  }
  return out
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

  // Clean each step (drop leading numbers, strip leaked amounts) then fold
  // header-only steps into the next real step.
  const method = mergeHeaderSteps(
    (Array.isArray(o.method) ? o.method.map(asString) : [])
      .filter(Boolean)
      .map(cleanMethodStep)
      .filter(Boolean),
  )
  const notes = asString(o.notes).slice(0, 1000)

  if (sections.length === 0) throw new RecipeGenError('The AI returned no usable ingredients. Try again.')
  if (method.length < 3) throw new RecipeGenError('The AI returned an incomplete method. Try again.')

  // baseServings is always 4 in both modes — never trust the model to set it.
  return { v: 2, baseServings: DEFAULT_BASE_SERVINGS, sections, method, notes }
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

/** Invent a pantry-constrained Dormers recipe for a dish. Returns a base-4 draft. */
export async function generateRecipe(input: GenerateRecipeInput): Promise<RecipeV2> {
  const raw = await callGemini(buildGeneratePrompt(input))
  const recipe = normalizeRecipe(raw)
  const newIngredients = matchPantry(recipe.sections, input.pantry)
  return stamp(recipe, 'generated', newIngredients)
}

/**
 * Restructure an existing batch-size cookbook recipe into the base-4 structured
 * format — faithful ingredients + method, rescaled to 4 servings, simple English.
 * Used for the proprietary/locked dishes where nothing may be invented.
 */
export async function convertRecipe(input: ConvertRecipeInput): Promise<RecipeV2> {
  const raw = await callGemini(buildConvertPrompt(input))
  const recipe = normalizeRecipe(raw)
  const newIngredients = matchPantry(recipe.sections, input.pantry)
  return stamp(recipe, 'converted', newIngredients)
}
