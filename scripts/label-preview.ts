// Dev harness: renders sample labels through the production PDF engine and
// rasterises each page to PNG for visual inspection.
//   npx tsx scripts/label-preview.ts
// Output: /tmp/labels-preview/labels.pdf + page-N.png
import fs from 'node:fs'
import path from 'node:path'
import QRCode from 'qrcode'
import { renderLabelsPdf } from '../src/app/admin/labels/label-pdf'
import { qrUrl, type LabelData, INK, CREAM } from '../src/app/admin/labels/label-spec'
import type { DormShape } from '../src/app/admin/labels/dorm-shapes'

const OUT = '/tmp/labels-preview'

interface Sample {
  orderId: string
  dishName: string
  customerName: string
  dorm: [string, number, DormShape]
  mealPref: 'VEG' | 'NON-VEG'
}

// Page 1 mirrors the locked reference HTML exactly (MYRIAD / 2 / circle /
// Chicken Biryani / DM-1042 / Aman V.) for side-by-side comparison.
const SAMPLES: Sample[] = [
  { orderId: 'DM-1042', dishName: 'Chicken Biryani', customerName: 'Aman V.', dorm: ['MYRIAD', 2, 'circle'], mealPref: 'NON-VEG' },
  { orderId: 'DM-1043', dishName: 'Chicken Afghani w/ Yellow Rice', customerName: 'Sara M.', dorm: ['KSK HOMES', 2, 'square'], mealPref: 'NON-VEG' },
  { orderId: 'DM-1044', dishName: 'Paneer Tikka Masala w/ Garlic Butter Naan', customerName: 'Krishnamurthy V.', dorm: ['YUGO', 3, 'triangle'], mealPref: 'VEG' },
  { orderId: 'DM-1045', dishName: 'Veg Hakka Noodles w/ Manchurian', customerName: 'Aditya R.', dorm: ['DSOA', 4, 'hexagon'], mealPref: 'VEG' },
  { orderId: 'DM-1046', dishName: 'Beef Stroganoff', customerName: 'Mohammed Abdulrahman A.', dorm: ['STUDY WORLD', 5, 'star'], mealPref: 'NON-VEG' },
  { orderId: 'DM-1047', dishName: 'Shakshouka', customerName: 'Lina K.', dorm: ['OTHER', 6, 'plus'], mealPref: 'VEG' },
]

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  const labels: LabelData[] = await Promise.all(SAMPLES.map(async s => ({
    orderId: s.orderId,
    dishName: s.dishName,
    customerName: s.customerName,
    dormDisplayName: s.dorm[0],
    dormNumber: s.dorm[1],
    dormShape: s.dorm[2],
    mealPref: s.mealPref,
    qrPngBase64: (await QRCode.toBuffer(qrUrl(s.orderId), {
      errorCorrectionLevel: 'M', margin: 1, scale: 16,
      color: { dark: INK, light: CREAM },
    })).toString('base64'),
  })))

  const pdf = await renderLabelsPdf(labels, { title: 'Dormers Labels — preview' })
  const pdfPath = path.join(OUT, 'labels.pdf')
  fs.writeFileSync(pdfPath, pdf)
  console.log(`PDF: ${pdfPath} (${(pdf.length / 1024).toFixed(0)} KB, ${labels.length} pages)`)

  // Rasterise with pdf.js — the same renderer the admin preview uses.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const docTask = getDocument({ data: new Uint8Array(pdf) })
  const docPdf = await docTask.promise
  const { createCanvas } = await import('@napi-rs/canvas')

  for (let p = 1; p <= docPdf.numPages; p++) {
    const page = await docPdf.getPage(p)
    const viewport = page.getViewport({ scale: 2 })   // 768 × 1152 px
    const canvas = createCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx as any, viewport, canvas: canvas as any }).promise
    fs.writeFileSync(path.join(OUT, `page-${p}.png`), canvas.toBuffer('image/png'))
  }
  console.log(`PNGs: ${OUT}/page-1..${docPdf.numPages}.png`)
}

main().catch(e => { console.error(e); process.exit(1) })
