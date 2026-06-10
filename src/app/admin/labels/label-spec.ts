// ─────────────────────────────────────────────────────────────────────────────
// DORMERS' label — locked design spec.
//
// Single source of truth for the 4×6in three-face wrap label. Every number
// here is lifted verbatim from the approved dormers-label.html (all mm).
// The PDF engine (label-pdf.ts) is the ONLY renderer — the admin dashboard
// previews the generated PDF itself, so screen and print can never diverge.
//
// Locked decisions (do not revisit — see label brief §9):
//   • TOP = black plate (dish face), FRONT = clean cream ticket, TAIL = seal.
//   • Dish name only on TOP. No dish name on FRONT.
//   • Dorm shape+number on both TOP (outlined) and FRONT (solid).
//   • Mono #091825 on cream #ede8da. No other colour, bars or decoration.
//   • FRONT zone height fixed at 65mm (physical box constraint).
// ─────────────────────────────────────────────────────────────────────────────

import type { DormShape } from './dorm-shapes'

export interface LabelData {
  orderId: string            // "DM-1042" — the source of truth, appears 3×
  dishName: string
  customerName: string       // already display-formatted ("Aman V.")
  dormDisplayName: string    // "MYRIAD"
  dormNumber: number
  dormShape: DormShape
  mealPref: 'VEG' | 'NON-VEG'
  qrPngBase64: string        // QR PNG (payload: https://dormers.ae/o/{orderId})
}

export const INK = '#091825'
export const CREAM = '#ede8da'

/** QR payload — built from the order ID (locked decision). */
export function qrUrl(orderId: string): string {
  return `https://dormers.ae/o/${orderId}`
}

// ── Page (mm) ────────────────────────────────────────────────────────────────
export const PAGE_W = 101.6
export const PAGE_H = 152.4

// Zone folds at 45mm and 110mm from the top (110 lands on the box's opening
// seam; FRONT height 65mm is the physical box front — never change).
export const TOP_H = 45
export const FRONT_H = 65
export const TAIL_TOP = TOP_H + FRONT_H        // 110
export const PAD_X = 5                          // side padding, all zones

// ── Montserrat vertical metrics ──────────────────────────────────────────────
// (hhea ascent 968 / descent 251, upm 1000 — what Chrome uses for `normal`.)
export const ASC = 0.968
export const DESC = 0.251
export const LINE = ASC + DESC                  // normal line-box height, em

// ── TOP face (the plate) ─────────────────────────────────────────────────────
export const TOP_PAD_TOP = 4
export const TOP_PAD_BOTTOM = 4.5
export const BRAND_TOP = { size: 2.6, weight: 300 as const, ls: 0.9 }
export const DORM_TOP_SHAPE = { size: 8, stroke: 0.45, numSize: 4.4, numWeight: 600 as const }
export const DORM_TOP_NAME = { size: 1.7, weight: 600 as const, ls: 0.45, marginTop: 1 }
export const DISH = { size: 7.2, weight: 800 as const, ls: -0.12, lineHeight: 1.06 }
export const DISH_SIZE_LADDER = [7.2, 6.6, 6.0, 5.4, 4.8]   // shrink-to-fit steps
export const PREF = { size: 1.85, weight: 600 as const, ls: 0.4, sq: 2, sqRadius: 0.25, gap: 1.2, marginTop: 2 }
export const QR_TILE = { img: 16, pad: 1.6, radius: 1.2 }   // tile = 19.2 × 19.2
export const TOP_BODY_GAP = 4                               // dish block ↔ QR tile

// ── FRONT face (the ticket) ──────────────────────────────────────────────────
export const FRONT_PAD = 5
export const ORDER_LBL = { size: 1.6, weight: 600 as const, ls: 0.5 }
export const ORDER_ID = { size: 3.4, weight: 700 as const, marginTop: 0.6 }
export const DORM_FRONT_SHAPE = { size: 11, numSize: 5.6, numWeight: 700 as const }
export const DORM_FRONT_NAME = { size: 2.5, weight: 700 as const, ls: 0.55, marginTop: 1.2 }
export const FOR_LBL = { size: 1.7, weight: 600 as const, ls: 0.8, marginBottom: 1.8 }
export const CUSTOMER = { size: 6.2, weight: 600 as const, ls: 0.1 }
export const FRONT_FOOT = { size: 2.2, weight: 300 as const, ls: 0.8 }

// ── TAIL (under the box) ─────────────────────────────────────────────────────
export const TAIL_BORDER = { width: 0.4, dash: 1.2, gap: 1.2 }
export const TAIL_GAP = 3.4
export const TEAR = { size: 1.85, weight: 600 as const, ls: 0.8 }
export const TAIL_ID = { size: 2.8, weight: 500 as const, ls: 0 }
export const TAIL_BRAND = { size: 2.4, weight: 300 as const, ls: 1 }

// ── Dorm shape geometry (100×100 viewBox, from dorm-shapes.ts) ───────────────
// SVG-path d-strings so the same geometry drives pdfkit's doc.path().
export const SHAPE_D: Record<DormShape, string> = {
  circle:   'M50 6 A44 44 0 1 0 50 94 A44 44 0 1 0 50 6 Z',
  square:   'M12 6 L88 6 Q94 6 94 12 L94 88 Q94 94 88 94 L12 94 Q6 94 6 88 L6 12 Q6 6 12 6 Z',
  triangle: 'M50 6 L94 90 L6 90 Z',
  hexagon:  'M50 4 L91 27 L91 73 L50 96 L9 73 L9 27 Z',
  star:     'M50 4 L61 36 L96 36 L68 58 L79 92 L50 72 L21 92 L32 58 L4 36 L39 36 Z',
  plus:     'M34 6 L66 6 L66 34 L94 34 L94 66 L66 66 L66 94 L34 94 L34 66 L6 66 L6 34 L34 34 Z',
}

// Per-shape tweaks so the number sits optically centered: triangles and stars
// have less usable area around their centroid than circles/squares.
export const SHAPE_NUM_TWEAK: Record<DormShape, { fontScale: number; dyScale: number }> = {
  circle:   { fontScale: 1,    dyScale: 0 },
  square:   { fontScale: 1,    dyScale: 0 },
  triangle: { fontScale: 0.82, dyScale: 0.10 },
  hexagon:  { fontScale: 1,    dyScale: 0 },
  star:     { fontScale: 0.60, dyScale: 0.07 },
  plus:     { fontScale: 0.78, dyScale: 0 },
}

// Max width available to the dish block on the TOP face:
// page − side pads − QR tile − flex gap.
export const DISH_MAX_W = PAGE_W - PAD_X * 2 - (QR_TILE.img + QR_TILE.pad * 2) - TOP_BODY_GAP  // 68.4
// Max width for the centred customer name on the FRONT face.
export const CUSTOMER_MAX_W = PAGE_W - FRONT_PAD * 2 - 4   // small breathing room

/** Measures a string's rendered width in mm at a given weight/size/spacing. */
export type MeasureFn = (text: string, weight: 300 | 500 | 600 | 700 | 800, sizeMm: number, lsMm: number) => number

export interface FittedDish {
  sizeMm: number
  lines: string[]   // 1 or 2 lines, whole words only — never a mid-word break
}

/**
 * Fits a dish name into the TOP face hero slot.
 *
 * Multi-word names always take the stacked two-line hero treatment at the
 * largest size that fits (the locked design sets "Chicken / Biryani" stacked
 * — the plate reads like a menu cover). Splits are balanced (minimise the
 * longer line) and NEVER break mid-word. Single-word names stay on one line.
 * If nothing fits, font-size steps down the ladder — NEVER overflow.
 */
export function fitDishName(name: string, measure: MeasureFn): FittedDish {
  const words = name.trim().replace(/\s+/g, ' ').split(' ')
  const w = (text: string, size: number) => measure(text, DISH.weight, size, DISH.ls)

  for (const size of DISH_SIZE_LADDER) {
    if (words.length === 1) {
      if (w(name, size) <= DISH_MAX_W) return { sizeMm: size, lines: [name] }
      continue   // single long word — only shrinking helps
    }
    const split = bestSplit(words, size, w)
    if (split.maxW <= DISH_MAX_W) return { sizeMm: size, lines: split.lines }
  }

  // Pathological name: scale the smallest step down so the widest line fits.
  const smallest = DISH_SIZE_LADDER[DISH_SIZE_LADDER.length - 1]
  if (words.length === 1) {
    const size = smallest * (DISH_MAX_W / w(name, smallest))
    return { sizeMm: size, lines: [name] }
  }
  const split = bestSplit(words, smallest, w)
  const size = smallest * Math.min(1, DISH_MAX_W / split.maxW)
  return { sizeMm: size, lines: split.lines }
}

function bestSplit(
  words: string[],
  size: number,
  w: (text: string, size: number) => number,
): { lines: [string, string]; maxW: number } {
  let best: { lines: [string, string]; maxW: number } | null = null
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const maxW = Math.max(w(a, size), w(b, size))
    if (!best || maxW < best.maxW) best = { lines: [a, b], maxW }
  }
  return best!
}

/**
 * Shrinks a single-line string until it fits maxW. Used for the customer
 * name (and defensively for long dorm names).
 */
export function fitSingleLine(
  text: string,
  baseSizeMm: number,
  maxW: number,
  weight: 300 | 500 | 600 | 700 | 800,
  lsMm: number,
  measure: MeasureFn,
): number {
  const width = measure(text, weight, baseSizeMm, lsMm)
  if (width <= maxW) return baseSizeMm
  return baseSizeMm * (maxW / width)
}

/** "Aman Verma" → "Aman V." (brief: first name + last initial). */
export function formatCustomerName(fullName: string): string {
  const parts = fullName.trim().replace(/\s+/g, ' ').split(' ')
  if (parts.length <= 1) return parts[0] ?? ''
  const last = parts[parts.length - 1]
  return `${parts[0]} ${last[0].toUpperCase()}.`
}
