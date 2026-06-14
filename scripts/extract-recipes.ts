// scripts/extract-recipes.ts
// Run with: npx tsx scripts/extract-recipes.ts
// Prereq: GOOGLE_GENERATIVE_AI_API_KEY env var set (same as production)
// Input:  Dormers_cook_book_Golden.pdf at project root
// Output: scripts/recipes-output.json

import fs from 'fs'
import path from 'path'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'

const PDF_PATH = path.join(process.cwd(), 'Dormers_cook_book_Golden.pdf')
const OUTPUT_PATH = path.join(process.cwd(), 'scripts', 'recipes-output.json')

interface RecipeSection {
  heading: string
  items: string[]
}

interface RecipeJson {
  dish_name: string
  dish_code: string
  sections: RecipeSection[]
  method: string[]
  notes: string
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`\nERROR: PDF not found at ${PDF_PATH}`)
    console.error('Place Dormers_cook_book_Golden.pdf at the project root, then re-run.')
    console.error('\nRun: npx tsx scripts/extract-recipes.ts')
    process.exit(1)
  }

  console.log('Reading cookbook PDF...')
  const pdfBytes = fs.readFileSync(PDF_PATH)

  const prompt = `You are extracting structured recipe data from the Dormers cookbook PDF.

For EVERY recipe in this PDF, output a JSON array where each element has this exact shape:
{
  "dish_name": "Full dish name as printed in the cookbook",
  "dish_code": "The alphanumeric code printed on the recipe page (e.g. CRNC01, RCVV01)",
  "sections": [
    {
      "heading": "Section heading exactly as printed (e.g. 'For the marinade:', 'Ingredients:')",
      "items": ["ingredient line 1", "ingredient line 2"]
    }
  ],
  "method": ["Step 1 text", "Step 2 text"],
  "notes": "Any allergen notes, dietary notes, or serving suggestions. Empty string if none."
}

Rules:
- Extract ALL recipes. The cookbook has 48+ recipes — do not skip any.
- dish_code: if a code is printed on the page, use it exactly. If no code is visible, derive it from the dish name using the pattern: C=Curry N=NonVeg V=Veg (e.g. Chicken Curry = CRNC01).
- sections: group ingredients exactly as the cookbook sections them. If there's only one group with no heading, use heading: "Ingredients".
- method: each numbered step as a separate array item, stripped of the step number (e.g. "Add the chicken and stir well." not "1. Add the chicken and stir well.").
- notes: combine allergen info, serving suggestions, and dietary notes into a single plain-text string.
- Output ONLY the JSON array. No markdown fences, no commentary, no preamble.`

  console.log('Sending PDF to Gemini for extraction (this may take 30-60 seconds)...')

  const result = await generateText({
    model: google('gemini-2.5-flash'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: pdfBytes,
            mimeType: 'application/pdf',
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
    abortSignal: AbortSignal.timeout(120_000), // 2 min — PDF is 60 pages
  })

  const rawText = result.text.trim()

  let recipes: RecipeJson[]
  try {
    recipes = JSON.parse(rawText)
  } catch {
    // Gemini sometimes wraps in ```json ... ``` fences despite instructions
    const match = rawText.match(/\[[\s\S]+\]/)
    if (!match) {
      console.error('Failed to parse Gemini response as JSON:')
      console.error(rawText.slice(0, 500))
      process.exit(1)
    }
    recipes = JSON.parse(match[0])
  }

  // Validate shape
  let valid = 0
  let warnings = 0
  for (const r of recipes) {
    if (!r.dish_name || !Array.isArray(r.sections) || !Array.isArray(r.method)) {
      console.warn(`WARNING: Recipe missing required fields: ${r.dish_name ?? '(unnamed)'}`)
      warnings++
    } else {
      valid++
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(recipes, null, 2), 'utf8')
  console.log(`\nExtracted ${recipes.length} recipes (${valid} valid, ${warnings} warnings)`)
  console.log(`Output written to: ${OUTPUT_PATH}`)
  if (warnings > 0) {
    console.log('Review warnings above before seeding.')
  }
  console.log('\nNext step: npx tsx scripts/seed-recipes.ts')
}

main().catch(err => {
  console.error('Extraction failed:', err)
  process.exit(1)
})
