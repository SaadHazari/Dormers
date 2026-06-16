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
  return `You are counting Dormers meal boxes in a delivery photo.

WHAT THE BOXES LOOK LIKE:
- Rectangular flip-top boxes, roughly 230×170×65 mm (about the size of a large book)
- Dark navy blue exterior with bold ORANGE text reading "MEALS THAT DON'T SUCK"
- Orange and white wavy/tiger-stripe pattern on the top lid and side flaps
- White Dormers logo (an arch/dome shape with a small orange dot) on the top face
- Side text: "Because you can't survive on instant noodles forever." in orange
- One short side has a QR code with orange text "Get a FREE 25th Meal"
- Boxes are often stacked on top of each other or placed side by side

The rider expects ${expectedCount} box${expectedCount === 1 ? '' : 'es'} at this drop-off.

Count every Dormers box visible in the image. Include boxes that are partially hidden, stacked, or viewed from any angle. A single stack of 3 boxes = 3 boxes.

Output ONLY a JSON object with no commentary, no code fences:
{
  "count": number | null,
  "confidence": "high" | "medium" | "low",
  "reason": string,
  "imageQuality": "clear" | "unclear"
}

Rules:
- count: number of Dormers boxes visible. null ONLY if the image is too dark/blurry to see anything at all.
- confidence: "high" = clearly see all boxes. "medium" = some partially obscured but countable. "low" = significant guessing needed.
- reason: one sentence (max 150 chars) describing what you counted.
- imageQuality: "clear" if you can see boxes at all (even partially). "unclear" ONLY if the photo is completely unusable (pitch black, extreme blur, no boxes visible whatsoever).

IMPORTANT: If you can see ANY navy-blue boxes with orange text, the image is "clear" and you MUST return a count. Only return "unclear" for truly unusable photos.

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
