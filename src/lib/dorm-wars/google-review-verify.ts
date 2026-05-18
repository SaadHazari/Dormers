// src/lib/dorm-wars/google-review-verify.ts
// Phase 8K — Google review screenshot verification via Gemini Vision.
//
// User flow:
//   1. User taps "Claim" → opens Google review URL in new tab.
//   2. User leaves the review on Google.
//   3. User returns + uploads a screenshot of the review they just left.
//   4. THIS module calls Gemini Vision with a strict checklist.
//   5. Caller decides: auto-approve (high confidence + all checks pass)
//      or queue for manual review (everything else).
//
// We reuse the @ai-sdk/google + gemini-2.5-flash pipeline that already
// powers the homepage chat, so no new SDK / model dependency. Vision is
// supported by Flash out of the box via the multimodal `content` array.
//
// Output is JSON parsed from generateText — we don't pull in zod just for
// one verification call. A strict prompt + defensive parse handles drift.

import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

export type VerifyConfidence = 'high' | 'medium' | 'low'

export interface VerifyResult {
  isGoogleReviewScreenshot: boolean       // is this clearly a Google review UI?
  businessMatchesDormers:    boolean       // does it reference Dormers?
  hasVisibleRating:          boolean       // does it show a star rating?
  reviewerNameVisible:       string | null // displayed reviewer name if legible
  confidence:                VerifyConfidence
  reason:                    string        // short explanation, also used as ops note
}

/**
 * Run the verification call. Returns a structured verdict; caller maps
 * verdict → "auto-approve" / "manual queue" / "auto-reject".
 *
 * The prompt is intentionally narrow and asks for ONLY a JSON object.
 * Gemini Flash is good at JSON-only output but the parse is defensive
 * anyway — any malformed response degrades to a "low confidence" verdict
 * that funnels into the manual queue (safe default — never auto-approves
 * on ambiguity, never auto-rejects on parse failure).
 */
export async function verifyReviewScreenshot(
  imageBytes: Uint8Array,
  mimeType: string,
  customerName: string | null,
): Promise<VerifyResult> {
  const nameHint = customerName?.trim()
    ? `The customer's account name is "${customerName.trim()}". If the screenshot shows a reviewer name that plausibly matches (e.g. first name only, initials, married surname), note it. A mismatch is NOT a hard fail — many users leave reviews under a different display name.`
    : 'The customer name is unknown — do not fail on reviewer-name mismatch.'

  const prompt = `You are verifying that a customer of "Dormers" (a Dubai meal-delivery service) actually left a Google review for the business.

The user uploaded a screenshot. Inspect it and answer the following AS A JSON OBJECT ONLY, with no commentary, code fences, or extra text. Output exactly this shape:

{
  "isGoogleReviewScreenshot": boolean,
  "businessMatchesDormers":   boolean,
  "hasVisibleRating":         boolean,
  "reviewerNameVisible":      string | null,
  "confidence":               "high" | "medium" | "low",
  "reason":                   string
}

Field meanings:
- isGoogleReviewScreenshot: true if the image clearly shows a Google review interface (Google logo, Google Maps review card, Google search business panel, or the "Write a review" / "Your review" surface). False for non-Google reviews, screenshots of other apps, marketing material, or unrelated content.
- businessMatchesDormers: true if ANY of these brand-name signals are visible anywhere in the screenshot — header, business card, page title, URL, OR the review text itself:
    • "Dormers" / "dormers" (any case)
    • "Dormer" / "dormer" (singular form — acceptable, often how Google renders the brand or how users type it)
    • "Dormers UAE", "Dormers Meals", "Dormers Dubai"
    • "dormers.ae" (the URL)
  The word "dormer" in the review body is a valid positive signal — accept it. Only return false if there is NO mention of the brand anywhere in the screenshot.
- hasVisibleRating: true if you can see a star rating (1-5 stars) on the review. False if no rating is visible.
- reviewerNameVisible: the displayed reviewer name if you can read it, else null. ${nameHint}
- confidence: "high" only when isGoogleReviewScreenshot AND businessMatchesDormers AND hasVisibleRating are all true AND the screenshot is sharp and unambiguous. "medium" if one signal is weak (e.g. partial business name match, blurry rating). "low" for anything ambiguous, partially cropped, or where you cannot tell.
- reason: one short sentence (max 200 chars) explaining your verdict. Cite what you see.

Output JSON only. Do not wrap in code fences. Do not include any text before or after the JSON.`

  let raw: string
  const t0 = Date.now()
  try {
    console.log(`[review-verify] calling Gemini (mime=${mimeType}, bytes=${imageBytes.byteLength})`)
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
      // Netlify function maxDuration kills the whole request. 45s leaves
      // ~15s headroom under maxDuration=60 for upload + DB writes.
      abortSignal: AbortSignal.timeout(45_000),
    })
    raw = result.text.trim()
    console.log(`[review-verify] Gemini responded in ${Date.now() - t0}ms (${raw.length} chars)`)
  } catch (err) {
    const elapsed = Date.now() - t0
    console.error(`[review-verify] Gemini call failed after ${elapsed}ms:`, err)
    return {
      isGoogleReviewScreenshot: false,
      businessMatchesDormers:    false,
      hasVisibleRating:          false,
      reviewerNameVisible:       null,
      confidence:                'low',
      reason:                    elapsed >= 45_000
        ? 'Verification timed out — queued for manual review'
        : 'Verification service unavailable — queued for manual review',
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
    console.error('verifyReviewScreenshot — JSON parse failed. Raw output:', raw)
    return {
      isGoogleReviewScreenshot: false,
      businessMatchesDormers:    false,
      hasVisibleRating:          false,
      reviewerNameVisible:       null,
      confidence:                'low',
      reason:                    'Could not parse verification result — queued for manual review',
    }
  }

  return normaliseVerdict(parsed)
}

// Coerce whatever Gemini returned into a strict VerifyResult shape. Any
// missing or unexpected field collapses to a safe default — never trust the
// model's output structurally, only its content.
function normaliseVerdict(raw: unknown): VerifyResult {
  const o = (raw ?? {}) as Record<string, unknown>
  const confidence: VerifyConfidence =
    o.confidence === 'high' ? 'high'
    : o.confidence === 'medium' ? 'medium'
    : 'low'

  const reviewerNameVisible =
    typeof o.reviewerNameVisible === 'string' && o.reviewerNameVisible.trim()
      ? o.reviewerNameVisible.trim().slice(0, 120)
      : null

  return {
    isGoogleReviewScreenshot: o.isGoogleReviewScreenshot === true,
    businessMatchesDormers:    o.businessMatchesDormers === true,
    hasVisibleRating:          o.hasVisibleRating === true,
    reviewerNameVisible,
    confidence,
    reason:
      typeof o.reason === 'string' ? o.reason.slice(0, 300) : 'No reason provided',
  }
}

/**
 * Top-level decision based on a VerifyResult. Strict by default:
 *   • auto_approve only when all 3 signal flags true AND confidence='high'
 *   • auto_reject when clearly not a Google review screenshot at all
 *   • else manual_review (keeps the user from losing a legit claim to a
 *     blurry photo or AI uncertainty)
 */
export type VerifyDecision = 'auto_approve' | 'auto_reject' | 'manual_review'

export function decideFromVerdict(v: VerifyResult): VerifyDecision {
  if (!v.isGoogleReviewScreenshot && v.confidence !== 'low') {
    // High/medium confidence that it's NOT a Google review screenshot → reject.
    return 'auto_reject'
  }
  if (
    v.isGoogleReviewScreenshot &&
    v.businessMatchesDormers &&
    v.hasVisibleRating &&
    v.confidence === 'high'
  ) {
    return 'auto_approve'
  }
  return 'manual_review'
}
