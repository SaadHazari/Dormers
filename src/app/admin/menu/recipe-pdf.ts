// src/app/admin/menu/recipe-pdf.ts
// Recipe → PDF (A4) using the same pdfkit + subsetted Montserrat pipeline as
// the label engine.
//
// Layout: each recipe is ONE A4 page — ingredients in a left column, method in
// a right column — with the body font auto-shrunk so it always fits a single
// page. A multi-recipe export ("cookbook") adds a cover page and a contents
// list, then one recipe per page.
//
// Amounts render at a chosen serving size (default = the recipe's base) using
// the SAME scaleIngredient() the kitchen screen uses, so paper and screen agree.
// Vector text only — small files, cheap cold start (memory: ONE pdfkit
// renderer, never an HTML re-implementation).

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

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 44
const CONTENT_W = PAGE_W - MARGIN * 2
const COL_GAP = 26
const LEFT_W = Math.round((CONTENT_W - COL_GAP) * 0.42)
const RIGHT_W = CONTENT_W - COL_GAP - LEFT_W
const AMOUNT_W = 66
const LABEL_W = LEFT_W - AMOUNT_W
const NUM_W = 20
const STEP_W = RIGHT_W - NUM_W

interface Line { amount: string | null; label: string; note: string | null }
interface Section { heading: string; items: Line[] }
interface Laid { sections: Section[]; method: string[]; notes: string }

/** Legacy v1 line → { amount, label } so both formats print through one path. */
function v1Line(line: string): Line {
  const m = line.match(/^([\d.,/-]+\s*[a-zA-Z]*)\s+(.*)$/)
  if (m && /\d/.test(m[1])) return { amount: m[1].trim(), label: m[2].trim(), note: null }
  return { amount: null, label: line, note: null }
}

function layout(entry: RecipeForPdf): { laid: Laid; servings: number } {
  const base = recipeBaseServings(entry.recipe)
  const servings = entry.servings && entry.servings > 0 ? entry.servings : base
  const mult = servings / base
  const structured = isRecipeV2(entry.recipe)

  const sections: Section[] = entry.recipe.sections.map((s) => ({
    heading: s.heading,
    items: structured
      ? (s.items as RecipeV2['sections'][number]['items']).map((i) => scaleIngredient(i, mult))
      : (s.items as string[]).map(v1Line),
  }))

  return { laid: { sections, method: entry.recipe.method, notes: entry.recipe.notes }, servings }
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

  const font = (w: Weight, size: number) => doc.font(FONT[w]).fontSize(size)
  const heightOf = (w: Weight, size: number, text: string, width: number) =>
    doc.font(FONT[w]).fontSize(size).heightOfString(text, { width })

  const laidAll = recipes.map(layout)

  // ── Cover + contents (only for a real cookbook of several recipes) ─────────
  if (recipes.length > 1) {
    doc.addPage()
    font(800, 34).fillColor(INK).text("Dormers'", MARGIN, 250, { width: CONTENT_W, align: 'center' })
    font(800, 34).fillColor(ORANGE).text('Kitchen Cookbook', MARGIN, doc.y, { width: CONTENT_W, align: 'center' })
    font(500, 12).fillColor(MUTED).text(`${recipes.length} recipes · base ${recipeBaseServings(recipes[0].recipe)} servings each`, MARGIN, doc.y + 14, { width: CONTENT_W, align: 'center' })

    doc.addPage()
    let cy = MARGIN
    font(800, 20).fillColor(INK).text('Contents', MARGIN, cy); cy = doc.y + 10
    doc.moveTo(MARGIN, cy).lineTo(PAGE_W - MARGIN, cy).lineWidth(1.5).strokeColor(ORANGE).stroke(); cy += 12
    recipes.forEach((r, i) => {
      if (cy > PAGE_H - MARGIN - 16) { doc.addPage(); cy = MARGIN }
      const dot = r.isVeg ? EMERALD : ORANGE
      doc.circle(MARGIN + 3, cy + 6, 3).fillColor(dot).fill()
      font(500, 11).fillColor(INK).text(r.name, MARGIN + 14, cy, { width: CONTENT_W - 40, continued: false })
      font(500, 11).fillColor(MUTED).text(String(i + 1), PAGE_W - MARGIN - 24, cy, { width: 24, align: 'right' })
      cy += Math.max(18, doc.y - cy + 4)
    })
  }

  // ── One page per recipe ────────────────────────────────────────────────────
  for (let r = 0; r < recipes.length; r++) {
    const entry = recipes[r]
    const { laid, servings } = laidAll[r]
    doc.addPage()

    // Header (fixed size).
    const tag = entry.isVeg ? 'VEG' : 'NON-VEG'
    font(700, 9).fillColor(entry.isVeg ? EMERALD : ORANGE).text(tag, MARGIN, MARGIN, { characterSpacing: 1 })
    font(800, 20).fillColor(INK).text(entry.name, MARGIN, doc.y + 2, { width: CONTENT_W })
    font(500, 10).fillColor(MUTED).text(`Serves ${servings}${recipes.length > 1 ? `   ·   ${r + 1}` : ''}`, MARGIN, doc.y + 3)
    const ruleY = doc.y + 8
    doc.moveTo(MARGIN, ruleY).lineTo(PAGE_W - MARGIN, ruleY).lineWidth(1.5).strokeColor(ORANGE).stroke()
    const bodyTop = ruleY + 16
    const bodyBottom = PAGE_H - MARGIN - 14 // leave room for footer

    // Auto-fit: largest body font size whose two columns fit the page.
    const fits = (fs: number): boolean => {
      const gap = fs * 0.55
      let lh = 0
      for (const s of laid.sections) {
        lh += fs * 1.5 + 5
        for (const it of s.items) {
          const label = it.note ? `${it.label}, ${it.note}` : it.label
          lh += Math.max(fs * 1.35, heightOf(500, fs, label, LABEL_W)) + 4
        }
        lh += gap
      }
      let rh = fs * 1.5 + 8
      for (let i = 0; i < laid.method.length; i++) {
        rh += heightOf(500, fs, laid.method[i], STEP_W) + 6
      }
      let nh = 0
      if (laid.notes) nh = fs * 1.4 + heightOf(500, fs, laid.notes, CONTENT_W) + 12
      return bodyTop + Math.max(lh, rh) + nh <= bodyBottom
    }
    let fs = 10.5
    while (fs > 7 && !fits(fs)) fs -= 0.5

    // Draw left column (ingredients).
    const gap = fs * 0.55
    let ly = bodyTop
    for (const s of laid.sections) {
      font(700, fs).fillColor(INK).text(s.heading.toUpperCase(), MARGIN, ly, { width: LEFT_W, characterSpacing: 0.4 })
      ly = doc.y + 5
      for (const it of s.items) {
        const label = it.note ? `${it.label}, ${it.note}` : it.label
        const h = Math.max(fs * 1.35, heightOf(500, fs, label, LABEL_W))
        font(700, fs).fillColor(INK).text(it.amount ?? '', MARGIN, ly, { width: AMOUNT_W - 6 })
        font(500, fs).fillColor(it.amount ? INK : MUTED).text(label, MARGIN + AMOUNT_W, ly, { width: LABEL_W })
        ly += h + 4
      }
      ly += gap
    }

    // Draw right column (method).
    const rx = MARGIN + LEFT_W + COL_GAP
    let ry = bodyTop
    font(700, fs).fillColor(INK).text('METHOD', rx, ry, { width: RIGHT_W, characterSpacing: 0.4 })
    ry = doc.y + 8
    laid.method.forEach((step, i) => {
      const h = heightOf(500, fs, step, STEP_W)
      font(800, fs).fillColor(ORANGE).text(`${i + 1}.`, rx, ry, { width: NUM_W })
      font(500, fs).fillColor(INK).text(step, rx + NUM_W, ry, { width: STEP_W })
      ry += h + 6
    })

    // Notes span the full width below both columns.
    if (laid.notes) {
      let ny = Math.max(ly, ry) + 4
      doc.moveTo(MARGIN, ny).lineTo(PAGE_W - MARGIN, ny).lineWidth(0.75).strokeColor(HAIRLINE).stroke()
      ny += 8
      font(700, Math.max(8, fs - 1)).fillColor(MUTED).text('NOTES', MARGIN, ny, { characterSpacing: 0.5 })
      font(500, fs).fillColor(MUTED).text(laid.notes, MARGIN, doc.y + 2, { width: CONTENT_W })
    }

    // Footer brand.
    font(700, 8).fillColor(MUTED).text("DORMERS' KITCHEN", MARGIN, PAGE_H - MARGIN + 12, {
      width: CONTENT_W, align: 'center', characterSpacing: 1,
    })
  }

  doc.end()
  return done
}
