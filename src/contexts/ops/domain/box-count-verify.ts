// src/contexts/ops/domain/box-count-verify.ts
// Phase 5: Gemini Vision box counting for delivery drop-off verification (VER-06).
//
// Rider flow:
//   1. Rider takes photo of boxes at drop-off point.
//   2. Client resizes to ≤1600px JPEG and POSTs to /api/ops/verify-box-count.
//   3. API route calls THIS function with image bytes from Supabase Storage upload.
//   4. Gemini Vision counts the boxes independently of the rider's manual count.
//   5. Triple-match check: expected_count === rider_count === gemini_count → verified.
//
// Uses gemini-2.5-flash (not gemini-3.1-flash-lite) — higher multimodal accuracy
// needed for reliable box counting vs the review-screenshot verification task.
//
// Zero imports from @/infra/ — pure domain function per L1-BOUNDARIES rule.
// Only ai and @ai-sdk/google dependencies.

import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

export interface BoxCountResult {
  count: number | null       // null = could not count (timeout or image too unclear)
  confidence: 'high' | 'medium' | 'low'
  reason: string
  imageQuality: 'clear' | 'unclear'
}

/**
 * Build the Gemini Vision prompt for box counting.
 * Provides expected count as context so Gemini can flag discrepancies.
 * Requests JSON-only output; defensive parse strips fences anyway.
 */
function buildBoxCountPrompt(expectedCount: number): string {
  return `You are counting meal delivery boxes in a photo taken by a delivery rider.

The rider says there should be ${expectedCount} box${expectedCount === 1 ? '' : 'es'} for this delivery stop.

Count the delivery boxes visible in the image. Include boxes that are partially hidden or stacked.

Output ONLY a JSON object with no commentary, no code fences:
{
  "count": number | null,
  "confidence": "high" | "medium" | "low",
  "reason": string,
  "imageQuality": "clear" | "unclear"
}

Field meanings:
- count: the number of delivery boxes you can count. Return null ONLY if the image is too dark, blurry, or obscured to count at all.
- confidence: "high" if you can clearly see and count all boxes; "medium" if some boxes are partially obscured; "low" if significant portions are hidden.
- reason: one short sentence (max 150 chars) describing what you see.
- imageQuality: "clear" if the image is usable for counting; "unclear" if too dark, blurry, or not showing boxes.

Output JSON only. No explanation. No code fences.`
}

/**
 * Normalise raw Gemini output into a strict BoxCountResult shape.
 * Any missing or unexpected field collapses to a safe default — never trust
 * the model's output structurally, only its content.
 */
function normaliseBoxCount(raw: unknown): BoxCountResult {
  const o = (raw ?? {}) as Record<string, unknown>

  // count: handle number, string integer, or null
  let count: number | null = null
  if (typeof o.count === 'number') {
    count = o.count
  } else if (typeof o.count === 'string') {
    count = parseInt(o.count, 10)
  }
  // If parsed count is not a finite integer, treat as null
  if (count !== null && !Number.isFinite(count)) {
    count = null
  }

  const confidence: BoxCountResult['confidence'] =
    o.confidence === 'high' ? 'high'
    : o.confidence === 'medium' ? 'medium'
    : 'low'

  const reason: string =
    typeof o.reason === 'string' ? o.reason.slice(0, 200) : 'No reason provided'

  const imageQuality: BoxCountResult['imageQuality'] =
    o.imageQuality === 'clear' ? 'clear' : 'unclear'

  return { count, confidence, reason, imageQuality }
}

/**
 * Call Gemini Vision to count delivery boxes in the provided image.
 *
 * Returns a BoxCountResult. On Gemini timeout or service error, returns a
 * safe default with count: null — caller must handle null as "manual confirm
 * required" (VER-11: never auto-complete on null count).
 */
export async function verifyBoxCount(
  imageBytes: Uint8Array,
  mimeType: string,
  expectedCount: number,
): Promise<BoxCountResult> {
  const prompt = buildBoxCountPrompt(expectedCount)
  const t0 = Date.now()

  console.log(
    `[box-count-verify] calling Gemini (mime=${mimeType}, bytes=${imageBytes.byteLength})`,
  )

  let raw: string
  try {
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', image: imageBytes, mediaType: mimeType },
          ],
        },
      ],
      // SDK-level timeout — fires a clean abort before the surrounding
      // Netlify function maxDuration kills the request. 45s leaves ~15s
      // headroom under maxDuration=60 for upload + DB writes.
      abortSignal: AbortSignal.timeout(45_000),
    })
    const elapsed = Date.now() - t0
    raw = result.text.trim()
    console.log(`[box-count-verify] Gemini responded in ${elapsed}ms`)
  } catch (err) {
    const elapsed = Date.now() - t0
    console.error(`[box-count-verify] Gemini call failed after ${elapsed}ms:`, err)
    return {
      count: null,
      confidence: 'low',
      reason: elapsed >= 45_000
        ? 'Verification timed out — manual confirmation required'
        : 'Verification service unavailable — manual confirmation required',
      imageQuality: 'unclear',
    }
  }

  // Defensive parse. Gemini sometimes wraps JSON in ```json fences despite
  // the instruction; strip those before parsing.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    console.error('[box-count-verify] JSON parse failed. Raw output:', raw)
    return {
      count: null,
      confidence: 'low',
      reason: 'Could not parse verification result',
      imageQuality: 'unclear',
    }
  }

  return normaliseBoxCount(parsed)
}
