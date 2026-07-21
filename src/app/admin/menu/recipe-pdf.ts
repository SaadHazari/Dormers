// src/app/admin/menu/recipe-pdf.ts
// Recipe → PDF (A4) using the same pdfkit + subsetted Montserrat pipeline as
// the label engine.
//
// Layout: each recipe is ONE A4 page — ingredients in a left column, method in
// a right column — body font auto-shrunk so it fits one page. A recipe that is
// really two sub-dishes on one page (e.g. "Chicken Afghani w/ Yellow Rice") is
// split into colour-coded components: each sub-dish gets its own tinted
// ingredient card on the left and its own method block, numbered from 1, on the
// right — so the two dishes never read as one 1-to-17 method. Single-flow
// recipes keep the plain layout.
//
// A multi-recipe export ("cookbook") adds a cover page and a contents list,
// then one recipe per page.
//
// Amounts render at a chosen serving size (default = base) using the SAME
// scaleIngredient() the kitchen screen uses, so paper and screen agree.

import PDFDocument from 'pdfkit'
import { montserratBuffer } from '../labels/fonts/montserrat'
import {
  isRecipeV2,
  scaleIngredient,
  recipeBaseServings,
  getRecipeComponents,
  type AnyRecipe,
} from '@/contexts/ops/domain/recipe-format'

const INK = '#091825'
const ORANGE = '#f57f20'
const EMERALD = '#0f9d63'
const MUTED = '#6b7280'
const HAIRLINE = '#e5e2dc'

// Per-component colours (ink + light tint). Ordered so most 2-dish pages read
// brand-orange + navy. Green is avoided so a component colour never reads as
// the veg/non-veg tag.
const COMPONENT_COLORS = [
  { ink: '#f57f20', tint: '#fdf3ea' },
  { ink: '#12314f', tint: '#eef2f7' },
  { ink: '#9a5b00', tint: '#faf1e4' },
  { ink: '#0e6b6b', tint: '#e8f4f4' },
]

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
const NUM_W = 20
const STEP_W = RIGHT_W - NUM_W
const PAD = 9
const COMP_GAP = 11

interface Line { amount: string | null; label: string; note: string | null }
interface Section { heading: string; items: Line[] }
interface Comp { title: string; sections: Section[]; method: string[] }

/** Legacy v1 line → { amount, label } so both formats print through one path. */
function v1Line(line: string): Line {
  const m = line.match(/^([\d.,/-]+\s*[a-zA-Z]*)\s+(.*)$/)
  if (m && /\d/.test(m[1])) return { amount: m[1].trim(), label: m[2].trim(), note: null }
  return { amount: null, label: line, note: null }
}

function labelOf(it: Line): string {
  return it.note ? `${it.label}, ${it.note}` : it.label
}

/** Resolve a recipe into laid-out, scaled components (1 = plain, ≥2 = coloured). */
function layout(entry: RecipeForPdf): { comps: Comp[]; servings: number; notes: string; colored: boolean } {
  const base = recipeBaseServings(entry.recipe)
  const servings = entry.servings && entry.servings > 0 ? entry.servings : base
  const mult = servings / base

  if (isRecipeV2(entry.recipe)) {
    const parts = getRecipeComponents(entry.recipe, entry.name)
    const comps: Comp[] = parts.map((p) => ({
      title: p.title,
      sections: p.sections.map((s) => ({ heading: s.heading, items: s.items.map((i) => scaleIngredient(i, mult)) })),
      method: p.method,
    }))
    return { comps, servings, notes: entry.recipe.notes, colored: comps.length >= 2 }
  }

  // Legacy v1 — one plain component.
  const sections: Section[] = entry.recipe.sections.map((s) => ({
    heading: s.heading,
    items: (s.items as string[]).map(v1Line),
  }))
  return { comps: [{ title: '', sections, method: entry.recipe.method }], servings, notes: entry.recipe.notes, colored: false }
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
      doc.circle(MARGIN + 3, cy + 6, 3).fillColor(r.isVeg ? EMERALD : ORANGE).fill()
      font(500, 11).fillColor(INK).text(r.name, MARGIN + 14, cy, { width: CONTENT_W - 40 })
      font(500, 11).fillColor(MUTED).text(String(i + 1), PAGE_W - MARGIN - 24, cy, { width: 24, align: 'right' })
      cy += Math.max(18, doc.y - cy + 4)
    })
  }

  // ── One page per recipe ────────────────────────────────────────────────────
  for (let r = 0; r < recipes.length; r++) {
    const entry = recipes[r]
    const { comps, servings, notes, colored } = laidAll[r]
    doc.addPage()

    // Header.
    font(700, 9).fillColor(entry.isVeg ? EMERALD : ORANGE).text(entry.isVeg ? 'VEG' : 'NON-VEG', MARGIN, MARGIN, { characterSpacing: 1 })
    font(800, 20).fillColor(INK).text(entry.name, MARGIN, doc.y + 2, { width: CONTENT_W })
    font(500, 10).fillColor(MUTED).text(`Serves ${servings}${recipes.length > 1 ? `   ·   ${r + 1}` : ''}`, MARGIN, doc.y + 3)
    const ruleY = doc.y + 8
    doc.moveTo(MARGIN, ruleY).lineTo(PAGE_W - MARGIN, ruleY).lineWidth(1.5).strokeColor(ORANGE).stroke()
    const bodyTop = ruleY + 16
    const bodyBottom = PAGE_H - MARGIN - 14

    const innerW = LEFT_W - PAD * 2
    const amountW = 58
    const labelW = (colored ? innerW : LEFT_W) - amountW
    const itemH = (fs: number, it: Line) => Math.max(fs * 1.32, heightOf(500, fs, labelOf(it), labelW)) + 3

    // ── Measurement for auto-fit ──
    const leftHeight = (fs: number): number => {
      let h = 0
      for (const c of comps) {
        let bh = colored ? (fs + 1) * 1.35 + 3 : 0
        c.sections.forEach((s) => {
          if (colored ? c.sections.length > 1 : true) bh += fs * 1.4 + 3
          for (const it of s.items) bh += itemH(fs, it)
          bh += 2
        })
        h += (colored ? bh + PAD * 2 : bh) + COMP_GAP
      }
      return h
    }
    const rightHeight = (fs: number): number => {
      let h = 0
      for (const c of comps) {
        h += (colored ? (fs + 1) * 1.35 : fs * 1.4) + 6
        for (const step of c.method) h += heightOf(500, fs, step, STEP_W) + 5
        h += COMP_GAP
      }
      return h
    }
    const notesHeight = (fs: number) => (notes ? fs * 1.4 + heightOf(500, fs, notes, CONTENT_W) + 12 : 0)
    const fits = (fs: number) => bodyTop + Math.max(leftHeight(fs), rightHeight(fs)) + notesHeight(fs) <= bodyBottom

    let fs = 10.5
    while (fs > 6.5 && !fits(fs)) fs -= 0.5

    // ── Draw left column (ingredients) ──
    let ly = bodyTop
    comps.forEach((c, ci) => {
      const color = COMPONENT_COLORS[ci % COMPONENT_COLORS.length]
      const x = colored ? MARGIN + PAD : MARGIN
      if (colored) {
        // block height for the tint card
        let bh = (fs + 1) * 1.35 + 3
        c.sections.forEach((s) => {
          if (c.sections.length > 1) bh += fs * 1.4 + 3
          for (const it of s.items) bh += itemH(fs, it)
          bh += 2
        })
        doc.roundedRect(MARGIN, ly, LEFT_W, bh + PAD * 2, 6).fillColor(color.tint).fill()
      }
      let y = ly + (colored ? PAD : 0)
      if (colored) {
        font(800, fs + 1).fillColor(color.ink).text(c.title.toUpperCase(), x, y, { width: innerW, characterSpacing: 0.3 })
        y = doc.y + 3
      }
      c.sections.forEach((s) => {
        if (colored ? c.sections.length > 1 : true) {
          const sh = colored ? s.heading.replace(/^for\s+(the\s+)?/i, '') : s.heading
          font(700, fs - (colored ? 1 : 0)).fillColor(colored ? MUTED : INK).text(sh.toUpperCase(), x, y, { width: colored ? innerW : LEFT_W, characterSpacing: 0.3 })
          y = doc.y + 3
        }
        for (const it of s.items) {
          const h = itemH(fs, it)
          font(700, fs).fillColor(colored ? color.ink : INK).text(it.amount ?? '', x, y, { width: amountW - 4 })
          font(500, fs).fillColor(it.amount ? INK : MUTED).text(labelOf(it), x + amountW, y, { width: labelW })
          y += h
        }
        y += 2
      })
      ly += (colored ? (y - ly) + PAD : y - ly) + COMP_GAP
    })

    // ── Draw right column (method) ──
    const rx = MARGIN + LEFT_W + COL_GAP
    let ry = bodyTop
    comps.forEach((c, ci) => {
      const color = COMPONENT_COLORS[ci % COMPONENT_COLORS.length]
      const heading = colored ? c.title.toUpperCase() : 'METHOD'
      font(800, colored ? fs + 1 : fs).fillColor(colored ? color.ink : INK).text(heading, rx, ry, { width: RIGHT_W, characterSpacing: 0.3 })
      ry = doc.y + 6
      c.method.forEach((step, i) => {
        const h = heightOf(500, fs, step, STEP_W)
        font(800, fs).fillColor(colored ? color.ink : ORANGE).text(`${i + 1}.`, rx, ry, { width: NUM_W })
        font(500, fs).fillColor(INK).text(step, rx + NUM_W, ry, { width: STEP_W })
        ry += h + 5
      })
      ry += COMP_GAP
    })

    // ── Notes (full width) ──
    if (notes) {
      let ny = Math.max(ly, ry) + 2
      doc.moveTo(MARGIN, ny).lineTo(PAGE_W - MARGIN, ny).lineWidth(0.75).strokeColor(HAIRLINE).stroke()
      ny += 8
      font(700, Math.max(8, fs - 1)).fillColor(MUTED).text('NOTES', MARGIN, ny, { characterSpacing: 0.5 })
      font(500, fs).fillColor(MUTED).text(notes, MARGIN, doc.y + 2, { width: CONTENT_W })
    }

    // Footer brand.
    font(700, 8).fillColor(MUTED).text("DORMERS' KITCHEN", MARGIN, PAGE_H - MARGIN + 12, { width: CONTENT_W, align: 'center', characterSpacing: 1 })
  }

  doc.end()
  return done
}
