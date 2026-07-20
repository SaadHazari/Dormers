// scripts/regen-recipes.ts
// Batch-regenerate every dish recipe into the new base-4 structured format,
// saving to dishes.recipe_draft (live recipes untouched until approved).
//   - non-locked dishes → generateRecipe (fresh, pantry-constrained)
//   - locked/proprietary → convertRecipe (rescale existing cookbook recipe to 4,
//     ingredients + method kept faithful, wording simplified)
//
// Backs up all current recipes to scripts/recipe-backup-<runId>.json first.
// Idempotent: writes drafts, safe to rerun. Limited concurrency for rate limits.
//
// Run: npx tsx scripts/regen-recipes.ts [--only "Dish Name"]

import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import {
  generateRecipe,
  convertRecipe,
  type PantryEntry,
} from '../src/contexts/ops/domain/recipe-generate'
import type { RecipeV1 } from '../src/contexts/ops/domain/recipe-format'

const CONCURRENCY = 4
const RUN_ID = process.env.RUN_STAMP || String(Date.now())

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(url, key)

  const onlyArg = process.argv.indexOf('--only')
  const onlyName = onlyArg >= 0 ? process.argv[onlyArg + 1] : null

  // Pantry for the generator prompt (food only, equipment excluded).
  const { data: pantryRows, error: pErr } = await sb
    .from('pantry_ingredients')
    .select('name, category, pack_qty, pack_unit, pack_cost')
    .eq('is_active', true)
    .neq('category', 'Equipment')
    .order('name')
  if (pErr) throw new Error(`pantry read: ${pErr.message}`)
  const pantry: PantryEntry[] = (pantryRows ?? []).map((r) => {
    let costHint: string | null = null
    if (r.pack_cost && r.pack_qty && r.pack_qty > 0) {
      const per = r.pack_cost / r.pack_qty
      if (r.pack_unit === 'g') costHint = `AED ${(per * 1000).toFixed(per * 1000 < 1 ? 2 : 1)}/kg`
      else if (r.pack_unit === 'ml') costHint = `AED ${(per * 1000).toFixed(per * 1000 < 1 ? 2 : 1)}/L`
    }
    return { name: r.name as string, category: r.category as string, costHint }
  })
  console.log(`Pantry: ${pantry.length} items`)

  // Dishes to process.
  let dishQuery = sb
    .from('dishes')
    .select('id, name, description, is_veg, spice_level, allergens, recipe, recipe_locked')
    .neq('name', 'test Dish')
    .order('name')
  const { data: dishes, error: dErr } = await dishQuery
  if (dErr) throw new Error(`dishes read: ${dErr.message}`)
  let targets = dishes ?? []
  if (onlyName) targets = targets.filter((d) => (d.name as string).toLowerCase().includes(onlyName.toLowerCase()))
  console.log(`Dishes to process: ${targets.length}${onlyName ? ` (filtered by "${onlyName}")` : ''}`)

  // Backup current recipes.
  const backupPath = path.join(process.cwd(), 'scripts', `recipe-backup-${RUN_ID}.json`)
  fs.writeFileSync(backupPath, JSON.stringify(targets.map((d) => ({ id: d.id, name: d.name, recipe: d.recipe })), null, 2))
  console.log(`Backed up ${targets.length} recipes → ${backupPath}`)

  const results = await mapLimit(targets, CONCURRENCY, async (d) => {
    const name = d.name as string
    try {
      let draft
      if (d.recipe_locked) {
        if (!d.recipe) return { name, status: 'skip', reason: 'locked but no existing recipe to rescale' }
        draft = await convertRecipe({ dishName: name, existing: d.recipe as RecipeV1, pantry })
      } else {
        draft = await generateRecipe({
          dishName: name,
          description: (d.description as string) ?? '',
          isVeg: Boolean(d.is_veg),
          spiceLevel: (d.spice_level as number) ?? 2,
          allergens: (d.allergens as string[]) ?? [],
          pantry,
        })
      }
      const { error: upErr } = await sb
        .from('dishes')
        .update({ recipe_draft: draft, updated_at: new Date().toISOString() })
        .eq('id', d.id)
      if (upErr) return { name, status: 'error', reason: `save failed: ${upErr.message}` }
      const nNew = draft.meta?.newIngredients?.length ?? 0
      console.log(`  ok  ${d.recipe_locked ? '[rescaled]' : '[generated]'} ${name}${nNew ? ` (+${nNew} new)` : ''}`)
      return { name, status: 'ok', mode: d.recipe_locked ? 'rescaled' : 'generated', newIngredients: draft.meta?.newIngredients ?? [] }
    } catch (err) {
      console.log(`  ERR ${name}: ${String(err).slice(0, 160)}`)
      return { name, status: 'error', reason: String(err).slice(0, 200) }
    }
  })

  const ok = results.filter((r) => r.status === 'ok').length
  const errors = results.filter((r) => r.status === 'error')
  const skips = results.filter((r) => r.status === 'skip')
  console.log(`\nDone. ${ok} ok, ${errors.length} errors, ${skips.length} skipped.`)
  if (errors.length) console.log('Errors:', errors.map((e) => `${e.name}: ${e.reason}`).join('\n  '))
  fs.writeFileSync(path.join(process.cwd(), 'scripts', `regen-report-${RUN_ID}.json`), JSON.stringify(results, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
