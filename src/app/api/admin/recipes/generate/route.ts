// POST /api/admin/recipes/generate — run the AI recipe generator for a dish.
//
// Body: { dishId: string, mode: 'generate' | 'convert' }
//   generate — invent a pantry-constrained recipe (blocked on locked dishes)
//   convert  — parse the existing legacy text recipe into structured v2, verbatim
//
// The result is saved to dishes.recipe_draft for admin review — it never
// touches dishes.recipe directly, so the kitchen only ever sees approved
// recipes. Lives as an API route (not a server action) so it can claim
// maxDuration=60 for the Gemini call.
//
// Auth: middleware attaches x-user-* headers for /api/admin/*; we re-check
// the admin allowlist here so the route fails closed without middleware.

import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { isAdminEmail } from '@/contexts/admin/usecases/require-admin'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { getPantryForGenerator } from '@/infra/supabase/pantry'
import {
  generateRecipe,
  convertRecipe,
  RecipeGenError,
} from '@/contexts/ops/domain/recipe-generate'
import { isRecipeV2, type RecipeV1 } from '@/contexts/ops/domain/recipe-format'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const user = await getUserFromHeaders()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { dishId?: string; mode?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { dishId, mode } = body
  if (!dishId || (mode !== 'generate' && mode !== 'convert')) {
    return NextResponse.json({ error: 'dishId and mode (generate|convert) required' }, { status: 400 })
  }

  const sb = createAdminSupabaseClient()
  const { data: dish, error: dishErr } = await sb
    .from('dishes')
    .select('id, name, description, is_veg, spice_level, allergens, recipe, recipe_locked')
    .eq('id', dishId)
    .maybeSingle()
  if (dishErr) return NextResponse.json({ error: dishErr.message }, { status: 500 })
  if (!dish) return NextResponse.json({ error: 'Dish not found' }, { status: 404 })

  if (mode === 'generate' && dish.recipe_locked) {
    return NextResponse.json(
      { error: 'This recipe is locked as proprietary. Unlock it first if you really want the AI to replace it.' },
      { status: 403 },
    )
  }

  const pantry = await getPantryForGenerator()
  if (pantry.length === 0) {
    return NextResponse.json({ error: 'Pantry list unavailable — try again in a minute.' }, { status: 503 })
  }

  try {
    let draft
    if (mode === 'convert') {
      if (!dish.recipe || isRecipeV2(dish.recipe)) {
        return NextResponse.json(
          { error: dish.recipe ? 'This recipe is already structured.' : 'No existing recipe to convert.' },
          { status: 400 },
        )
      }
      draft = await convertRecipe({
        dishName: dish.name as string,
        existing: dish.recipe as RecipeV1,
        pantry,
      })
    } else {
      draft = await generateRecipe({
        dishName: dish.name as string,
        description: (dish.description as string) ?? '',
        isVeg: Boolean(dish.is_veg),
        spiceLevel: (dish.spice_level as number) ?? 2,
        allergens: (dish.allergens as string[]) ?? [],
        pantry,
      })
    }

    const { error: saveErr } = await sb
      .from('dishes')
      .update({ recipe_draft: draft, updated_at: new Date().toISOString() })
      .eq('id', dishId)
    if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 })

    await logAdminAction(user.email, mode === 'convert' ? 'convert_recipe_draft' : 'generate_recipe_draft', 'dish', dishId, {
      dishName: dish.name,
      newIngredients: draft.meta?.newIngredients ?? [],
    })

    return NextResponse.json({ ok: true, draft })
  } catch (err) {
    if (err instanceof RecipeGenError) {
      return NextResponse.json({ error: err.message }, { status: 502 })
    }
    console.error('[recipes/generate] unexpected failure:', err)
    return NextResponse.json({ error: 'Recipe generation failed unexpectedly.' }, { status: 500 })
  }
}
