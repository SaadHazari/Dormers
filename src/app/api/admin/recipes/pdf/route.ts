// GET /api/admin/recipes/pdf — recipe(s) as a print-ready / shareable PDF.
//
//   ?dishId=<uuid>   one recipe (uses its live recipe, or recipe_draft if
//                    ?draft=1) — for the "Download PDF" button in the editor.
//   ?all=1           every dish with a live recipe, one per page = a cookbook.
//   ?servings=<n>    render amounts for n servings (default = base servings).
//   ?disposition=inline  open in-browser instead of downloading.
//
// Auth: middleware attaches x-user-* headers for /api/admin/*; re-checked here
// so the route fails closed without middleware.

import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { isAdminEmail } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { renderRecipesPdf, type RecipeForPdf } from '@/app/admin/menu/recipe-pdf'
import type { AnyRecipe } from '@/contexts/ops/domain/recipe-format'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'recipe'
}

export async function GET(request: Request) {
  const user = await getUserFromHeaders()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const dishId = params.get('dishId')
  const all = params.get('all') === '1'
  const useDraft = params.get('draft') === '1'
  const servingsRaw = parseInt(params.get('servings') ?? '', 10)
  const servings = Number.isFinite(servingsRaw) && servingsRaw > 0 ? servingsRaw : undefined

  if (!dishId && !all) {
    return NextResponse.json({ error: 'dishId or all=1 required' }, { status: 400 })
  }

  const sb = createAdminSupabaseClient()
  let query = sb.from('dishes').select('id, name, is_veg, recipe, recipe_draft').order('name')
  if (dishId) query = query.eq('id', dishId)
  // The cookbook is the LIVE menu — skip dishes moved to the Removed archive.
  else if (all) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const entries: RecipeForPdf[] = []
  for (const d of data ?? []) {
    const recipe = (useDraft ? d.recipe_draft : d.recipe) as AnyRecipe | null
    if (recipe) entries.push({ name: d.name as string, isVeg: Boolean(d.is_veg), recipe, servings })
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: useDraft ? 'No draft recipe to export.' : 'No recipe to export.' },
      { status: 404 },
    )
  }

  const title = dishId ? `Dormers' Recipe — ${entries[0].name}` : "Dormers' Cookbook"
  const pdf = await renderRecipesPdf(entries, title)

  const filename = all
    ? 'dormers-cookbook.pdf'
    : `dormers-recipe-${slug(entries[0].name)}.pdf`
  const inline = params.get('disposition') === 'inline'

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
