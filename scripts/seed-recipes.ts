// scripts/seed-recipes.ts
// Run with: npx tsx scripts/seed-recipes.ts
// Prereq: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL env vars (reads .env.local)
// Input:  scripts/recipes-output.json (from extract-recipes.ts or manual generation)
// Action: UPDATE public.dishes SET recipe = {json} WHERE name ILIKE {dish_name}
//         Idempotent — safe to rerun; overwrites previous recipe data.

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const RECIPES_PATH = path.join(process.cwd(), 'scripts', 'recipes-output.json')

interface RecipeSection {
  heading: string
  items: string[]
}

interface RecipeJson {
  dish_name: string
  sections: RecipeSection[]
  method: string[]
  notes: string
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const sb = createClient(supabaseUrl, serviceKey)

  if (!fs.existsSync(RECIPES_PATH)) {
    console.error(`recipes-output.json not found at ${RECIPES_PATH}`)
    console.error('Run: npx tsx scripts/extract-recipes.ts first')
    process.exit(1)
  }

  const recipes: RecipeJson[] = JSON.parse(fs.readFileSync(RECIPES_PATH, 'utf8'))
  console.log(`Loaded ${recipes.length} recipes from recipes-output.json`)

  const { data: dishes, error: dishErr } = await sb
    .from('dishes')
    .select('id, name')
  if (dishErr) {
    console.error('Failed to fetch dishes:', dishErr.message)
    process.exit(1)
  }

  const nameToIds = new Map<string, string[]>()
  for (const d of dishes ?? []) {
    const key = (d.name as string).toLowerCase().trim()
    const existing = nameToIds.get(key) ?? []
    existing.push(d.id as string)
    nameToIds.set(key, existing)
  }

  let seeded = 0
  let skipped = 0
  const unmatched: string[] = []

  for (const recipe of recipes) {
    const normalizedName = recipe.dish_name.toLowerCase().trim()

    let dishIds = nameToIds.get(normalizedName)

    if (!dishIds) {
      for (const [dbName, ids] of nameToIds.entries()) {
        if (dbName.includes(normalizedName) || normalizedName.includes(dbName)) {
          dishIds = ids
          console.log(`  Fuzzy match: "${recipe.dish_name}" → "${dbName}"`)
          break
        }
      }
    }

    if (!dishIds || dishIds.length === 0) {
      unmatched.push(recipe.dish_name)
      skipped++
      continue
    }

    const recipeJsonb = {
      sections: recipe.sections,
      method: recipe.method,
      notes: recipe.notes ?? '',
    }

    for (const dishId of dishIds) {
      const { error: updateErr } = await sb
        .from('dishes')
        .update({ recipe: recipeJsonb })
        .eq('id', dishId)

      if (updateErr) {
        console.error(`  FAILED to update "${recipe.dish_name}" (${dishId}):`, updateErr.message)
        skipped++
      } else {
        seeded++
      }
    }
    console.log(`  ✓ Seeded: ${recipe.dish_name} (${dishIds.length} row${dishIds.length > 1 ? 's' : ''})`)
  }

  console.log(`\nSeed complete: ${seeded} rows seeded, ${skipped} skipped`)
  if (unmatched.length > 0) {
    console.log('\nUnmatched recipe names (no dishes row found):')
    unmatched.forEach(n => console.log(`  - ${n}`))
  }

  const { count } = await sb
    .from('dishes')
    .select('id', { count: 'exact', head: true })
    .not('recipe', 'is', null)
  console.log(`\nVerification: ${count} dishes now have recipe data`)
}

main().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
