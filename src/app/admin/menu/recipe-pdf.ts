// src/app/admin/menu/recipe-pdf.ts
// Recipe → PDF (A4) using the same pdfkit + subsetted Montserrat pipeline as
// the label engine. One recipe per page (or several recipes = a mini cookbook).
//
// Purpose: a clean printable / shareable recipe card the kitchen can send over
// WhatsApp or email. Renders at a chosen serving size (default = the recipe's
// own base servings) using the SAME scaleIngredient() the kitchen screen uses,
// so paper and screen never diverge.
//
// Vector text only, no external images — keeps the file small and the function
// cold-start cheap (memory: ONE pdfkit renderer, never an HTML re-implementation).

import PDFDocument from 'pdfkit'
import { montserratBuffer } from '../labels/fonts/montserrat'
import {
  isRecipeV2,
  scaleIngredient,
  recipeBaseServings,
  type AnyRecipe,
  type RecipeV2,
} from '@/contexts/ops/domain/recipe-format'

const INK = '#091825'
const ORANGE = '#f57f20'
const EMERALD = '#0f9d63'
const MUTED = '#6b7280'
const HAIRLINE = '#e5e2dc'

type Weight = 300 | 500 | 600 | 700 | 800
const FONT: Record<Weight, string> = { 300: 'M300', 500: 'M500', 600: 'M600', 700: 'M700', 800: 'M800' }

export interface RecipeForPdf {
  name: string
  isVeg: boolean
  recipe: AnyRecipe
  /** How many servings to render the amounts for. Defaults to base servings. */
  servings?: number
}

// A4 in points, comfortable margins.
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48
const CONTENT_W = PAGE_W - MARGIN * 2

/** Legacy v1 line → { amount, label } so both formats print through one path. */
function v1Line(line: string): { amount: string | null; label: string; note: string | null } {
  const m = line.match(/^([\d.,/-]+\s*[a-zA-Z]*)\s+(.*)$/)
  if (m && /\d/.test(m[1])) return { amount: m[1].trim(), label: m[2].trim(), note: null }
  return { amount: null, label: line, note: null }
}

export function renderRecipesPdf(recipes: RecipeForPdf[], title = "Dormers' Recipes"): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margin: 0,
    autoFirstPage: false,
    info: { Title: title, Creator: 'Dormers Admin' },
  })
  for (const w of [300, 500, 600, 700, 800] as const) doc.registerFont(FONT[w], montserratBuffer(w))

  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  const setFont = (w: Weight, size: number) => doc.font(FONT[w]).fontSize(size)

  for (const entry of recipes) {
    doc.addPage()
    let y = MARGIN

    const base = recipeBaseServings(entry.recipe)
    const servings = entry.servings && entry.servings > 0 ? entry.servings : base
    const multiplier = servings / base
    const structured = isRecipeV2(entry.recipe)

    // ── Header ─────────────────────────────────────────────────────────────
    const tag = entry.isVeg ? 'VEG' : 'NON-VEG'
    const tagColor = entry.isVeg ? EMERALD : ORANGE
    setFont(700, 9)
    doc.fillColor(tagColor).text(tag, MARGIN, y, { characterSpacing: 1 })
    y += 16

    setFont(800, 22)
    doc.fillColor(INK).text(entry.name, MARGIN, y, { width: CONTENT_W })
    y = doc.y + 6

    setFont(500, 10)
    doc.fillColor(MUTED).text(`Serves ${servings}`, MARGIN, y)
    y = doc.y + 12

    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(1.5).strokeColor(ORANGE).stroke()
    y += 16

    const pageBreakIfNeeded = (needed: number) => {
      if (y + needed > PAGE_H - MARGIN) {
        doc.addPage()
        y = MARGIN
      }
    }

    // ── Ingredients, per section ───────────────────────────────────────────
    for (const section of entry.recipe.sections) {
      pageBreakIfNeeded(60)
      setFont(700, 11)
      doc.fillColor(INK).text(section.heading.toUpperCase(), MARGIN, y, { characterSpacing: 0.5 })
      y = doc.y + 8

      const items = structured
        ? (section.items as RecipeV2['sections'][number]['items']).map(i => scaleIngredient(i, multiplier))
        : (section.items as string[]).map(v1Line)

      for (const it of items) {
        pageBreakIfNeeded(20)
        const amountW = 120
        setFont(700, 10.5)
        doc.fillColor(INK).text(it.amount ?? '', MARGIN, y, { width: amountW - 8, continued: false })
        setFont(500, 10.5)
        const label = it.note ? `${it.label}, ${it.note}` : it.label
        doc.fillColor(it.amount ? INK : MUTED).text(label, MARGIN + amountW, y, { width: CONTENT_W - amountW })
        y = Math.max(y + 14, doc.y + 4)
      }
      y += 10
    }

    // ── Method ─────────────────────────────────────────────────────────────
    if (entry.recipe.method.length > 0) {
      pageBreakIfNeeded(40)
      setFont(700, 11)
      doc.fillColor(INK).text('METHOD', MARGIN, y, { characterSpacing: 0.5 })
      y = doc.y + 10

      entry.recipe.method.forEach((step, i) => {
        pageBreakIfNeeded(30)
        const numW = 22
        setFont(800, 10.5)
        doc.fillColor(ORANGE).text(`${i + 1}.`, MARGIN, y, { width: numW })
        setFont(500, 10.5)
        doc.fillColor(INK).text(step, MARGIN + numW, y, { width: CONTENT_W - numW })
        y = doc.y + 8
      })
      y += 6
    }

    // ── Notes ──────────────────────────────────────────────────────────────
    if (entry.recipe.notes) {
      pageBreakIfNeeded(40)
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(0.75).strokeColor(HAIRLINE).stroke()
      y += 10
      setFont(700, 9)
      doc.fillColor(MUTED).text('NOTES', MARGIN, y, { characterSpacing: 0.5 })
      y = doc.y + 4
      setFont(500, 10)
      doc.fillColor(MUTED).text(entry.recipe.notes, MARGIN, y, { width: CONTENT_W })
    }

    // ── Footer brand ───────────────────────────────────────────────────────
    setFont(700, 8)
    doc.fillColor(MUTED).text("DORMERS' KITCHEN", MARGIN, PAGE_H - MARGIN + 12, {
      width: CONTENT_W,
      align: 'center',
      characterSpacing: 1,
    })
  }

  doc.end()
  return done
}
