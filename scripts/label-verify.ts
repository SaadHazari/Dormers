// Dev harness: hard verification of the label PDF pipeline.
//   npx tsx scripts/label-verify.ts
// Checks: exact 4×6in page size, QR decodes to the right payload,
// and file size + generation time at a realistic 60-label day.
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { renderLabelsPdf } from '../src/app/admin/labels/label-pdf'
import { qrUrl, type LabelData, INK, CREAM } from '../src/app/admin/labels/label-spec'
import type { DormShape } from '../src/app/admin/labels/dorm-shapes'

const SHAPES: DormShape[] = ['circle', 'square', 'triangle', 'hexagon', 'star', 'plus']
const DORMS = ['MYRIAD', 'KSK HOMES', 'YUGO', 'DSOA', 'STUDY WORLD', 'OTHER']
const DISHES = [
  'Chicken Biryani', 'Chicken Afghani w/ Yellow Rice',
  'Paneer Tikka Masala w/ Garlic Butter Naan', 'Veg Hakka Noodles w/ Manchurian',
]

async function makeLabel(i: number): Promise<LabelData> {
  const orderId = `DM-${1042 + i}`
  return {
    orderId,
    dishName: DISHES[i % DISHES.length],
    customerName: `Customer ${String.fromCharCode(65 + (i % 26))}.`,
    dormDisplayName: DORMS[i % 6],
    dormNumber: (i % 6) + 1,
    dormShape: SHAPES[i % 6],
    mealPref: i % 3 === 0 ? 'VEG' : 'NON-VEG',
    qrPngBase64: (await QRCode.toBuffer(qrUrl(orderId), {
      errorCorrectionLevel: 'M', margin: 1, scale: 16,
      color: { dark: INK, light: CREAM },
    })).toString('base64'),
  }
}

async function main() {
  // 1 ── 60-label day: size + speed
  const labels = await Promise.all(Array.from({ length: 60 }, (_, i) => makeLabel(i)))
  const t0 = Date.now()
  const pdf = await renderLabelsPdf(labels, { title: 'verify' })
  const genMs = Date.now() - t0
  console.log(`60-label PDF: ${(pdf.length / 1024).toFixed(0)} KB, generated in ${genMs} ms`)

  // 2 ── page size must be exactly 288 × 432 pt (4 × 6 in)
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await getDocument({ data: new Uint8Array(pdf) }).promise
  const page1 = await doc.getPage(1)
  const [, , w, h] = page1.view
  console.log(`pages: ${doc.numPages}, page size: ${w} × ${h} pt ${w === 288 && h === 432 ? '✓ exact 4×6in' : '✗ WRONG'}`)

  // 3 ── QR must survive rendering and decode to the order URL
  const { createCanvas } = await import('@napi-rs/canvas')
  const viewport = page1.getViewport({ scale: 3 })   // ~216 dpi — close to thermal 203
  const canvas = createCanvas(viewport.width, viewport.height)
  const ctx = canvas.getContext('2d')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page1.render({ canvasContext: ctx as any, viewport, canvas: canvas as any }).promise
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const qr = jsQR(new Uint8ClampedArray(img.data.buffer), img.width, img.height)
  const expected = qrUrl(labels[0].orderId)
  console.log(`QR decode: ${qr?.data ?? 'FAILED'} ${qr?.data === expected ? '✓ matches' : `✗ expected ${expected}`}`)
}

main().catch(e => { console.error(e); process.exit(1) })
