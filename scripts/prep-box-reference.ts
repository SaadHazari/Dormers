// scripts/prep-box-reference.ts
//
// Downscales the raw box photos in box-reference/source/ into small JPEGs in
// box-reference/, which is what actually ships and what the vision model gets.
//
//   npx tsx scripts/prep-box-reference.ts     (or npm run prep:box-reference)
//
// Why this exists: every reference image is re-sent on EVERY box count, at
// pickup and at each dorm. Full-size phone photos would be uploaded dozens of
// times a day and would eat the Netlify function's time budget. 768px on the
// long edge is plenty for "is that a navy box with orange text".
//
// Reads source/, writes the parent folder, never deletes anything.

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const ROOT = path.join(process.cwd(), 'box-reference')
const SRC = path.join(ROOT, 'source')
const MAX_EDGE = 768
const QUALITY = 80
const WARN_BYTES = 300 * 1024   // matches the loader's skip threshold

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`No source folder at ${SRC}\nCreate it and drop the box photos in.`)
    process.exit(1)
  }

  const files = fs
    .readdirSync(SRC)
    .filter(f => /\.(jpe?g|png|heic|webp)$/i.test(f))
    .sort()

  if (files.length === 0) {
    console.error(`No images in ${SRC}\nDrop the box photos in there first.`)
    process.exit(1)
  }

  console.log(`Downscaling ${files.length} reference photo(s) to ${MAX_EDGE}px\n`)

  let oversize = 0
  for (const file of files) {
    const inPath = path.join(SRC, file)
    // Keep the numeric prefix and the descriptive name: the filename becomes
    // the label the model sees for that view.
    const outName = path.basename(file, path.extname(file)).toLowerCase() + '.jpg'
    const outPath = path.join(ROOT, outName)

    const buf = await sharp(inPath)
      .rotate()                                   // honour EXIF orientation
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer()

    fs.writeFileSync(outPath, buf)
    const kb = Math.round(buf.length / 1024)
    if (buf.length > WARN_BYTES) oversize++
    console.log(
      `  ${file.padEnd(28)} -> ${outName.padEnd(28)} ${String(kb).padStart(4)} KB` +
        (buf.length > WARN_BYTES ? '  OVER THE LIMIT, the loader will skip this' : ''),
    )
  }

  console.log(`\nWrote ${files.length} file(s) into box-reference/.`)
  if (oversize > 0) {
    console.log(`${oversize} still exceed ${WARN_BYTES / 1024} KB. Lower MAX_EDGE or QUALITY and rerun.`)
  }
  console.log('Commit the .jpg files in box-reference/ (source/ is gitignored).')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
