// src/contexts/ops/domain/box-count-verify.ts
// Phase 5 — Gemini Vision box counting for delivery drop-off verification.
//
// Pure domain function: zero @/infra imports. Only 'ai' and '@ai-sdk/google'.
// Called by the verify-box-count API route (Plan 02) with the photo bytes and
// the expected count for this delivery stop. Returns a structured result so the
// route can make the triple-match / retake / escalate decision.

import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

export interface BoxCountResult {
  count: number | null        // null = could not count
  confidence: 'high' | 'medium' | 'low'
  reason: string
  imageQuality: 'clear' | 'unclear'
}

function buildBoxCountPrompt(expectedCount: number): string {
  return `You are counting meal delivery boxes in a photo taken by a delivery rider.

The rider says there should be ${expectedCount} box(es) for this delivery stop.

Count ALL visible boxes including partially hidden or stacked ones. A "box" is a sealed meal container (typically a cardboard or plastic box with a label).

Output ONLY a JSON object with this exact shape:

{
  "count": number | null,
  "confidence": "high" | "medium" | "low",
  "reason": string,
  "imageQuality": "clear" | "unclear"
}

Field rules:
- count: the total number of boxes you can confidently count. Return null ONLY if the image is too dark, blurry, or obscured to count at all.
- confidence: "high" if you are certain of the count; "medium" if the count is likely but not certain (some boxes partially hidden); "low" if you can make a guess but the image is unclear.
- reason: one short sentence (max 150 chars) explaining what you see or why you are uncertain.
- imageQuality: "clear" if the photo is well-lit and boxes are visible; "unclear" if the image is too dark, blurry, obstructed, or does not appear to show delivery boxes at all.

Output JSON only. No explanation. No code fences.`
}

export async function verifyBoxCount(
  imageBytes: Uint8Array,
  mimeType: string,
  expectedCount: number,
): Promise<BoxCountResult> {
  const t0 = Date.now()
  console.log(`[box-count-verify] calling Gemini (mime=${mimeType}, bytes=${imageBytes.byteLength})`)

  const prompt = buildBoxCountPrompt(expectedCount)

  let raw: string
  try {
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', image: imageBytes, mediaType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' },
          ],
        },
      ],
      // SDK-level timeout — fires a clean abort before the surrounding
      // Netlify function maxDuration kills the whole request. 45s leaves
      // ~15s headroom under maxDuration=60 for upload + DB writes.
      abortSignal: AbortSignal.timeout(45_000),
    })
    raw = result.text.trim()
    console.log(`[box-count-verify] Gemini responded in ${Date.now() - t0}ms`)
  } catch (err) {
    const elapsed = Date.now() - t0
    console.error(`[box-count-verify] Gemini call failed after ${elapsed}ms:`, err)
    return {
      count: null,
      confidence: 'low',
      reason: elapsed >= 45_000
        ? 'Verification timed out — manual confirm needed'
        : 'Verification service unavailable — manual confirm needed',
      imageQuality: 'unclear',
    }
  }

  // Defensive parse — Gemini sometimes wraps JSON in ```json fences despite
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

function normaliseBoxCount(raw: unknown): BoxCountResult {
  const o = (raw ?? {}) as Record<string, unknown>

  // Coerce count — model sometimes returns a string number
  let count: number | null = null
  if (typeof o.count === 'number') {
    count = o.count
  } else if (typeof o.count === 'string') {
    count = parseInt(o.count, 10)
  }
  if (!Number.isFinite(count)) {
    count = null
  }

  const confidence: 'high' | 'medium' | 'low' =
    o.confidence === 'high' ? 'high'
    : o.confidence === 'medium' ? 'medium'
    : 'low'

  const reason: string =
    typeof o.reason === 'string'
      ? o.reason.slice(0, 200)
      : 'No reason provided'

  const imageQuality: 'clear' | 'unclear' =
    o.imageQuality === 'clear' ? 'clear' : 'unclear'

  return { count, confidence, reason, imageQuality }
}
