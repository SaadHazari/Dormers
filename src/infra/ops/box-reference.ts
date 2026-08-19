// src/infra/ops/box-reference.ts
// Loads the catalogue photos of the Dormers box that get sent to the vision
// model alongside the rider's photo, so it knows what it is looking for.
//
// These are RECOGNITION aids, not a counting fix. The model was never shown
// the packaging before 2026-08-19, which is worth fixing — but the reason it
// approved five boxes as six was that we told it we expected six. That is
// fixed in box-count-verify.ts. Do not expect these images to make counting
// reliable; nothing does.
//
// Files live in box-reference/ at the repo root, already downscaled by
// `npm run prep:box-reference`. Read once and cached for the process. If the
// folder is empty or missing, every caller still works: verifyBoxCount falls
// back to its written description of the packaging.

import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import type { BoxReferenceImage } from '@/contexts/ops/domain/box-count-verify'

// Every reference image is re-sent on every count call, so these caps are a
// latency and cost budget, not just a sanity check. The prep script targets
// roughly 60 KB per file at 768px.
const MAX_FILES = 8
const MAX_BYTES_EACH = 300 * 1024
const DIR = path.join(process.cwd(), 'box-reference')

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

let cache: BoxReferenceImage[] | null = null

/** "2-long-side.jpg" → "long side" */
function labelFromFilename(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/^\d+[-_]?/, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'box'
}

export function loadBoxReferenceImages(): BoxReferenceImage[] {
  if (cache) return cache

  let files: string[]
  try {
    files = readdirSync(DIR)
      .filter(f => MIME[path.extname(f).toLowerCase()])
      .sort()
  } catch {
    // No folder is a supported state, not an error — the model falls back to
    // the written description.
    console.log('[box-reference] no box-reference/ directory; using text description only')
    cache = []
    return cache
  }

  const out: BoxReferenceImage[] = []
  for (const file of files) {
    if (out.length >= MAX_FILES) {
      console.warn(`[box-reference] more than ${MAX_FILES} images present; ignoring the rest`)
      break
    }
    const full = path.join(DIR, file)
    try {
      const size = statSync(full).size
      if (size > MAX_BYTES_EACH) {
        // Loud on purpose: a full-size phone photo here would be re-uploaded
        // on every single count call.
        console.warn(
          `[box-reference] skipping ${file} (${Math.round(size / 1024)} KB > ${MAX_BYTES_EACH / 1024} KB). Run: npm run prep:box-reference`,
        )
        continue
      }
      out.push({
        bytes: new Uint8Array(readFileSync(full)),
        mimeType: MIME[path.extname(file).toLowerCase()],
        label: labelFromFilename(file),
      })
    } catch (err) {
      console.warn(`[box-reference] could not read ${file}:`, err)
    }
  }

  console.log(`[box-reference] loaded ${out.length} reference image(s)`)
  cache = out
  return cache
}
