/**
 * Rasterises public/favicon-tile.svg -> public/favicon-32.png.
 *
 * The PNG is the icon Safari actually uses (it is unreliable about SVG tab
 * icons), so it carries the cream tile that guarantees contrast in Safari's
 * separated-tab layout, where no plate is drawn behind the icon.
 *
 * 32x32 is the right size: tabs render the favicon at 16 CSS px, so 32 device
 * px is exactly 2x for retina. Bigger buys nothing and biases Chromium toward
 * picking the PNG over the themed SVG.
 *
 *   node scripts/build-favicon-png.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'scripts', 'favicon-tile.svg');
const out = path.join(root, 'public', 'favicon-32.png');

const svg = await readFile(src);
const png = await sharp(svg, { density: 384 })
  .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(out, png);
console.log(`wrote ${path.relative(root, out)} (${png.length} bytes)`);
