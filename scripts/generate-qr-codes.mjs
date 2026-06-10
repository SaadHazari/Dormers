#!/usr/bin/env node

/**
 * Generates 48 QR code PNG files (one per dish) into public/qr-codes/.
 * Each QR encodes https://dormers.ae/dish/{id}.
 *
 * Run:  node scripts/generate-qr-codes.mjs
 */

import QRCode from 'qrcode'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'public', 'qr-codes')
const BASE_URL = 'https://dormers.ae'

const catalogSrc = readFileSync(
  join(ROOT, 'src/contexts/menu/domain/catalog-data.ts'),
  'utf-8',
)

const dishRegex = /id:\s*(\d+),\s*\n\s*name:\s*"([^"]+)"/g
const dishes = []
let match
while ((match = dishRegex.exec(catalogSrc)) !== null) {
  dishes.push({ id: Number(match[1]), name: match[2] })
}

if (dishes.length === 0) {
  console.error('No dishes found in catalog-data.ts')
  process.exit(1)
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
}

console.log(`Generating ${dishes.length} QR codes...`)

for (const dish of dishes) {
  const url = `${BASE_URL}/dish/${dish.id}`
  const filename = `${String(dish.id).padStart(2, '0')}-${slugify(dish.name)}.png`
  const filepath = join(OUT_DIR, filename)

  await QRCode.toFile(filepath, url, {
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })

  console.log(`  ✓ ${filename}`)
}

console.log(`\nDone. ${dishes.length} QR codes saved to public/qr-codes/`)
