// ─────────────────────────────────────────────────────────────────────────────
// DORMERS' label — vector PDF engine.
//
// Renders the day's labels as ONE PDF: one 4×6in page per label, vector text
// with subsetted Montserrat, QR as a lossless PNG. This file is the only
// renderer in the pipeline — the admin preview displays these exact bytes via
// pdf.js, and the kitchen prints them, so screen and paper cannot diverge.
//
// Why pdfkit and not headless Chrome: identical output, ~300KB/day instead of
// shipping a 70MB Chromium into the Netlify function that also serves
// checkout + webhooks, and real glyph metrics give a hard "dish name never
// overflows, never breaks mid-word" guarantee.
// ─────────────────────────────────────────────────────────────────────────────

import PDFDocument from 'pdfkit'
import { montserratBuffer } from './fonts/montserrat'
import {
  type LabelData, type MeasureFn,
  INK, CREAM,
  PAGE_W, PAGE_H, TOP_H, TAIL_TOP, PAD_X,
  ASC, LINE,
  TOP_PAD_TOP, TOP_PAD_BOTTOM, BRAND_TOP, DORM_TOP_SHAPE, DORM_TOP_NAME,
  DISH, PREF, QR_TILE,
  PREF_VEG, VEG_PLATE,
  FRONT_PAD, ORDER_LBL, ORDER_ID, DORM_FRONT_SHAPE, DORM_FRONT_NAME,
  FOR_LBL, CUSTOMER, FRONT_FOOT,
  TAIL_BORDER, TAIL_GAP, TEAR, TAIL_ID, TAIL_BRAND,
  SHAPE_D, SHAPE_NUM_TWEAK,
  CUSTOMER_MAX_W,
  fitDishName, fitSingleLine,
} from './label-spec'
import type { DormShape } from './dorm-shapes'

const MM = 72 / 25.4   // mm → pt
const CAP = 0.7        // Montserrat cap height, em — for optical centring in shapes

type Weight = 300 | 500 | 600 | 700 | 800
const FONT_NAME: Record<Weight, string> = {
  300: 'M300', 500: 'M500', 600: 'M600', 700: 'M700', 800: 'M800',
}

export interface RenderOptions {
  /**
   * 'cream' paints the label stock colour into the PDF (locked design — what
   * the dashboard shows). If a test print ever shows the thermal driver
   * dithering faint dots over the cream, switch to 'white': identical layout,
   * but unprinted areas carry no tint at all (ink-only pipeline).
   */
  stock?: 'cream' | 'white'
  title?: string
}

export function renderLabelsPdf(labels: LabelData[], opts: RenderOptions = {}): Promise<Buffer> {
  const stock = opts.stock === 'white' ? '#ffffff' : CREAM

  const doc = new PDFDocument({
    size: [PAGE_W * MM, PAGE_H * MM],   // exactly 4 × 6 in
    margin: 0,
    autoFirstPage: false,
    info: { Title: opts.title ?? "Dormers' Labels", Creator: 'Dormers Admin' },
  })

  for (const w of [300, 500, 600, 700, 800] as const) {
    doc.registerFont(FONT_NAME[w], montserratBuffer(w))
  }

  // All layout maths happen in mm; only this helper layer touches pt.
  const setFont = (weight: Weight, sizeMm: number) =>
    doc.font(FONT_NAME[weight]).fontSize(sizeMm * MM)

  const measure: MeasureFn = (text, weight, sizeMm, lsMm) => {
    setFont(weight, sizeMm)
    return doc.widthOfString(text, { characterSpacing: lsMm * MM }) / MM
  }

  /** Draws one line of text with the BASELINE at yMm (no line-box ambiguity). */
  function text(
    str: string,
    xMm: number,
    baselineMm: number,
    o: { weight: Weight; size: number; ls?: number; color: string; anchor?: 'left' | 'center' | 'right' },
  ) {
    const ls = o.ls ?? 0
    setFont(o.weight, o.size)
    let x = xMm
    if (o.anchor && o.anchor !== 'left') {
      const w = measure(str, o.weight, o.size, ls)
      x = o.anchor === 'center' ? xMm - w / 2 : xMm - w
      setFont(o.weight, o.size)   // measure may have been a different font — reset
    }
    doc.fillColor(o.color).text(str, x * MM, baselineMm * MM, {
      baseline: 'alphabetic',
      characterSpacing: ls * MM,
      lineBreak: false,
    })
  }

  /** Baseline of a single normal-line-height text whose line box starts at topMm. */
  const baselineFor = (topMm: number, sizeMm: number) => topMm + ASC * sizeMm

  /** Dorm shape from the 100×100 geometry, outlined or solid. */
  function dormShape(
    shape: DormShape,
    xMm: number, yMm: number, sizeMm: number,
    mode: 'outline' | 'solid',
    color: string,
    strokeMm = 0,
  ) {
    doc.save()
    doc.translate(xMm * MM, yMm * MM)
    doc.scale((sizeMm * MM) / 100)
    doc.path(SHAPE_D[shape])
    if (mode === 'outline') {
      doc.lineWidth((strokeMm * 100) / sizeMm).strokeColor(color).stroke()
    } else {
      doc.fillColor(color).fill()
    }
    doc.restore()
  }

  /** Number optically centred inside a dorm shape. */
  function shapeNumber(
    shape: DormShape, num: number,
    shapeX: number, shapeY: number, shapeSize: number,
    fontSizeMm: number, weight: Weight, color: string,
  ) {
    const tweak = SHAPE_NUM_TWEAK[shape]
    const size = fontSizeMm * tweak.fontScale
    const cx = shapeX + shapeSize / 2
    const cy = shapeY + shapeSize / 2 + tweak.dyScale * shapeSize
    text(String(num), cx, cy + (CAP * size) / 2, { weight, size, color, anchor: 'center' })
  }

  /** Shape + name column, right-aligned to the zone edge (flex column, centred). */
  function dormColumn(
    label: LabelData,
    topMm: number,
    shapeSpec: { size: number; numSize: number; numWeight: Weight; stroke?: number },
    nameSpec: { size: number; weight: Weight; ls: number; marginTop: number },
    mode: 'outline' | 'solid',
    color: string,
  ) {
    const nameW = measure(label.dormDisplayName, nameSpec.weight, nameSpec.size, nameSpec.ls)
    const colW = Math.max(shapeSpec.size, nameW)
    const centerX = PAGE_W - PAD_X - colW / 2
    const shapeX = centerX - shapeSpec.size / 2

    dormShape(label.dormShape, shapeX, topMm, shapeSpec.size, mode, color, shapeSpec.stroke ?? 0)
    shapeNumber(
      label.dormShape, label.dormNumber, shapeX, topMm, shapeSpec.size,
      shapeSpec.numSize, shapeSpec.numWeight,
      // Outlined shape: digit matches the stroke (cream on the ink plate,
      // ink on the veg plate). Solid shape always knocks out cream.
      mode === 'outline' ? color : CREAM,
    )
    const nameTop = topMm + shapeSpec.size + nameSpec.marginTop
    text(label.dormDisplayName, centerX, baselineFor(nameTop, nameSpec.size), {
      weight: nameSpec.weight, size: nameSpec.size, ls: nameSpec.ls, color, anchor: 'center',
    })
    return topMm + shapeSpec.size + nameSpec.marginTop + nameSpec.size * LINE   // column bottom
  }

  for (const label of labels) {
    doc.addPage()

    // Stock / page background.
    doc.rect(0, 0, PAGE_W * MM, PAGE_H * MM).fillColor(stock).fill()

    // ════ TOP — the plate ════════════════════════════════════════════════
    // The plate IS the meal-pref signal: NON-VEG = solid ink (the original
    // locked design), VEG = open stock plate with an ink frame. Dark vs
    // light is readable across the kitchen — no reading required.
    const isVeg = label.mealPref === 'VEG'
    const plateInk = isVeg ? INK : CREAM   // everything drawn ON the plate
    if (isVeg) {
      const bw = VEG_PLATE.border
      doc.rect((bw / 2) * MM, (bw / 2) * MM, (PAGE_W - bw) * MM, (TOP_H - bw) * MM)
        .lineWidth(bw * MM).strokeColor(INK).stroke()
    } else {
      doc.rect(0, 0, PAGE_W * MM, TOP_H * MM).fillColor(INK).fill()
    }

    // Brand, top-left.
    text("DORMERS'", PAD_X, baselineFor(TOP_PAD_TOP, BRAND_TOP.size), {
      weight: BRAND_TOP.weight, size: BRAND_TOP.size, ls: BRAND_TOP.ls, color: plateInk,
    })

    // Dorm marker, top-right (outlined).
    dormColumn(label, TOP_PAD_TOP,
      { size: DORM_TOP_SHAPE.size, numSize: DORM_TOP_SHAPE.numSize, numWeight: DORM_TOP_SHAPE.numWeight, stroke: DORM_TOP_SHAPE.stroke },
      DORM_TOP_NAME, 'outline', plateInk)

    // Bottom-aligned body: dish block (left) + QR tile (right).
    const bodyBottom = TOP_H - TOP_PAD_BOTTOM

    const tile = QR_TILE.img + QR_TILE.pad * 2
    const tileX = PAGE_W - PAD_X - tile
    const tileY = bodyBottom - tile
    doc.roundedRect(tileX * MM, tileY * MM, tile * MM, tile * MM, QR_TILE.radius * MM)
      .fillColor(CREAM).fill()
    if (isVeg) {
      // Cream tile on the stock plate needs a hairline to read as a tile.
      doc.roundedRect(tileX * MM, tileY * MM, tile * MM, tile * MM, QR_TILE.radius * MM)
        .lineWidth(VEG_PLATE.qrTileStroke * MM).strokeColor(INK).stroke()
    }
    doc.image(Buffer.from(label.qrPngBase64, 'base64'),
      (tileX + QR_TILE.pad) * MM, (tileY + QR_TILE.pad) * MM,
      { width: QR_TILE.img * MM, height: QR_TILE.img * MM })

    // Meal preference row (square + caps), bottom of the dish block. On the
    // veg plate the word VEG prints oversized — the redundant second cue.
    const pref = isVeg ? PREF_VEG : PREF
    const prefRowH = pref.size * LINE
    const prefTop = bodyBottom - prefRowH
    const sqY = prefTop + prefRowH / 2 - pref.sq / 2
    doc.roundedRect(PAD_X * MM, sqY * MM, pref.sq * MM, pref.sq * MM, pref.sqRadius * MM)
      .fillColor(plateInk).fill()
    text(label.mealPref, PAD_X + pref.sq + pref.gap, baselineFor(prefTop, pref.size), {
      weight: pref.weight, size: pref.size, ls: pref.ls, color: plateInk,
    })

    // Dish name — the hero. Fitted: ≤2 lines, whole words, shrink-to-fit.
    const dish = fitDishName(label.dishName, measure)
    const lineAdvance = dish.sizeMm * DISH.lineHeight
    const dishTop = prefTop - pref.marginTop - dish.lines.length * lineAdvance
    // CSS half-leading: baseline inside a 1.06 line box.
    const innerBaseline = ((DISH.lineHeight - LINE) / 2 + ASC) * dish.sizeMm
    dish.lines.forEach((line, i) => {
      text(line, PAD_X, dishTop + i * lineAdvance + innerBaseline, {
        weight: DISH.weight, size: dish.sizeMm, ls: DISH.ls, color: plateInk,
      })
    })

    // ════ FRONT — the ticket ═════════════════════════════════════════════
    const frontTop = TOP_H + FRONT_PAD

    // ORDER + id, top-left.
    text('ORDER', PAD_X, baselineFor(frontTop, ORDER_LBL.size), {
      weight: ORDER_LBL.weight, size: ORDER_LBL.size, ls: ORDER_LBL.ls, color: INK,
    })
    const idTop = frontTop + ORDER_LBL.size * LINE + ORDER_ID.marginTop
    text(label.orderId, PAD_X, baselineFor(idTop, ORDER_ID.size), {
      weight: ORDER_ID.weight, size: ORDER_ID.size, color: INK,
    })
    const orderBlockBottom = idTop + ORDER_ID.size * LINE

    // Dorm marker, top-right (solid — the driver's routing cue).
    const dormBlockBottom = dormColumn(label, frontTop,
      { size: DORM_FRONT_SHAPE.size, numSize: DORM_FRONT_SHAPE.numSize, numWeight: DORM_FRONT_SHAPE.numWeight },
      DORM_FRONT_NAME, 'solid', INK)

    // FOR + customer name, centred in the space between header and footer.
    const footTop = TAIL_TOP - FRONT_PAD - FRONT_FOOT.size * LINE
    const mainTop = Math.max(orderBlockBottom, dormBlockBottom)
    const customerSize = fitSingleLine(
      label.customerName, CUSTOMER.size, CUSTOMER_MAX_W, CUSTOMER.weight, CUSTOMER.ls, measure)
    const contentH = FOR_LBL.size * LINE + FOR_LBL.marginBottom + customerSize * LINE
    const contentTop = mainTop + (footTop - mainTop - contentH) / 2
    const cx = PAGE_W / 2
    text('FOR', cx, baselineFor(contentTop, FOR_LBL.size), {
      weight: FOR_LBL.weight, size: FOR_LBL.size, ls: FOR_LBL.ls, color: INK, anchor: 'center',
    })
    const custTop = contentTop + FOR_LBL.size * LINE + FOR_LBL.marginBottom
    text(label.customerName, cx, baselineFor(custTop, customerSize), {
      weight: CUSTOMER.weight, size: customerSize, ls: CUSTOMER.ls, color: INK, anchor: 'center',
    })

    // Brand sign-off, bottom centre.
    text("DORMERS'", cx, baselineFor(footTop, FRONT_FOOT.size), {
      weight: FRONT_FOOT.weight, size: FRONT_FOOT.size, ls: FRONT_FOOT.ls, color: INK, anchor: 'center',
    })

    // ════ TAIL — seal + utility ══════════════════════════════════════════
    doc.moveTo(0, TAIL_TOP * MM).lineTo(PAGE_W * MM, TAIL_TOP * MM)
      .lineWidth(TAIL_BORDER.width * MM)
      .dash(TAIL_BORDER.dash * MM, { space: TAIL_BORDER.gap * MM })
      .strokeColor(INK).stroke()
    doc.undash()

    const tearH = TEAR.size * LINE
    const idH = TAIL_ID.size * LINE
    const brandH = TAIL_BRAND.size * LINE
    const tailContentH = tearH + TAIL_GAP + idH + TAIL_GAP + brandH
    let y = TAIL_TOP + (PAGE_H - TAIL_TOP - tailContentH) / 2

    text('TEAR HERE TO OPEN', cx, baselineFor(y, TEAR.size), {
      weight: TEAR.weight, size: TEAR.size, ls: TEAR.ls, color: INK, anchor: 'center',
    })
    y += tearH + TAIL_GAP
    text(label.orderId, cx, baselineFor(y, TAIL_ID.size), {
      weight: TAIL_ID.weight, size: TAIL_ID.size, color: INK, anchor: 'center',
    })
    y += idH + TAIL_GAP
    text("DORMERS'", cx, baselineFor(y, TAIL_BRAND.size), {
      weight: TAIL_BRAND.weight, size: TAIL_BRAND.size, ls: TAIL_BRAND.ls, color: INK, anchor: 'center',
    })
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}
