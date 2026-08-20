// src/contexts/ops/domain/box-count-verify.ts
// Gemini Vision box counting for pickup and drop-off verification (VER-06).
//
// Three rules this file exists to enforce, all learned the hard way on
// 2026-08-19 when a photo of FIVE boxes was approved as six at "high"
// confidence, and a separate drop-off of two was counted as three:
//
//   1. NEVER tell the model the number we expect. The prompt used to open
//      with "the rider expects 6 boxes", then we treated the model agreeing
//      with us as independent verification. It was not verification, it was
//      suggestion. The count here is blind; the comparison happens upstream.
//   2. Let it say "I cannot tell". The prompt used to insist it MUST return
//      a count for any photo with a box in it, which manufactured confident
//      guesses. A refusal costs a retake. A wrong count lets a short load
//      leave the kitchen. Only one of those is recoverable.
//   3. Confidence from the model is not evidence. It said "high" on both
//      wrong answers. Callers must treat the count as one voice among three,
//      never as proof.
//
// Reference photos of the packaging are passed in when available. They help
// the model recognise what a Dormers box IS. They do not make it good at
// counting, and nothing here should be read as implying otherwise.
//
// The model is a parameter with a production default. Counting near-identical
// stacked objects is the hardest vision task in this system, so which model
// does it is a decision that should be settled by the bench on real photos
// rather than by taste. Production always uses DEFAULT_BOX_COUNT_MODEL;
// /admin/box-counter can point any candidate at the same photos to compare.
//
// Zero imports from @/infra/ — pure domain per L1-BOUNDARIES rule.

import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

/**
 * Models allowed to count boxes. Kept to a shortlist on purpose: this is a
 * counting task, not a chat task, and flash-lite tiers were already judged
 * too weak for it (they still run the review-screenshot checks elsewhere).
 */
export const BOX_COUNT_MODELS = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-2.5-pro',
  'gemini-3.1-pro-preview',
] as const

export type BoxCountModel = (typeof BOX_COUNT_MODELS)[number]

/**
 * Per-dorm drop-offs: small piles, five-ish times a day, and the rider is
 * standing at a door waiting. Speed is worth more than depth here.
 *
 * gemini-3.7-flash since 2026-08-20, on the owner's own testing against real
 * boxes rather than anything measured here. My own comparison was worthless:
 * it ran on tiled composites and turned out to be measuring how each model
 * interprets a collage, not how it counts.
 */
export const DEFAULT_BOX_COUNT_MODEL: BoxCountModel = 'gemini-3.7-flash'

/**
 * Kitchen packing and rider pickup: the whole load in one frame, the hardest
 * count in the system, and it happens once a day.
 *
 * This briefly ran gemini-3.1-pro-preview, because Pro read occluded boxes
 * correctly where 2.5-flash guessed. After fuller testing on real boxes the
 * owner chose 3.7-flash for the kitchen and the driver alike, so the two tiers
 * currently resolve to the SAME model.
 *
 * They are kept as two names on purpose. Every call site already says which
 * kind of count it is doing, so putting a heavier model back on the once-a-day
 * checkpoints is a one-line change here rather than a hunt through routes.
 */
export const DEEP_BOX_COUNT_MODEL: BoxCountModel = 'gemini-3.7-flash'

export interface BoxCountResult {
  count: number | null       // null = could not count (unreadable, occluded, or unsure)
  confidence: 'high' | 'medium' | 'low'
  reason: string
  imageQuality: 'clear' | 'unclear'
  /** Which model produced this. Surfaced so bench results are never ambiguous. */
  model?: string
}

/** A catalogue photo of the empty packaging, used only for recognition. */
export interface BoxReferenceImage {
  bytes: Uint8Array
  mimeType: string
  /** Which face this shows, e.g. "lid" or "QR side". Helps the model orient. */
  label: string
}

const PACKAGING_DESCRIPTION = `WHAT A DORMERS BOX LOOKS LIKE:
- Rectangular flip-top box, roughly 230x170x65 mm (about the size of a large book)
- Dark navy blue exterior with bold ORANGE text reading "MEALS THAT DON'T SUCK"
- White Dormers logo (an arch/dome shape with a small orange dot) on several faces
- Faint darker line-art food doodles printed across the navy
- The open edge of the lid shows a distinctive ORANGE AND WHITE striped band
- One long side reads "Because you can't survive on instant noodles forever."
- One short side carries an orange QR code and "Give an Honest review of your meal & Get a FREE 25th meal"`

/**
 * The counting instruction. Deliberately contains NO expected number.
 *
 * The bias is set toward refusal on purpose: an honest "I cannot tell" sends
 * the rider back for a better photo, which costs seconds. A confident wrong
 * number sends a short van out, which costs a customer their dinner.
 */
function buildCountPrompt(hasReferences: boolean): string {
  return `You are counting sealed Dormers meal boxes in one photograph.

${hasReferences ? 'The reference photos above show ONE single empty box from several angles, for recognition only. They are NOT part of the scene you are counting and must NEVER be added to your count.' : PACKAGING_DESCRIPTION}

Count only the boxes present in the photo to count.

THE RULE THAT MATTERS MOST
Every box you count must show its OWN distinct edge or face in this photo.
A neat pile viewed from the side is fine: each box in it has its own visible
band of lid edge, so each can be counted. What is NOT fine is a box positioned
BEHIND another one, where the front box hides it partly or completely.

You cannot see through a box. If the boxes are arranged so that one could be
sitting behind another unseen, then the true total is unknowable from this
photo and no amount of care will recover it. Say so instead of inferring it.

HOW TO COUNT
- Find each box's own lid edge or striped band first, then count those edges.
- Count each physical box exactly once.
- Do not estimate, do not round, and do not assume a pile is a tidy number.
- Never reason from how many you would expect. You have not been told a
  target, and there isn't one. Report only what is visible.

WHEN TO RETURN null INSTEAD OF A NUMBER
null is the CORRECT answer, not a failure. Return it whenever:
- one or more boxes are behind others, or the arrangement has depth you cannot
  see into, so a hidden box is possible
- you can see boxes but cannot give each one its own distinct edge
- any box is cut off by the frame edge
- the image is dark, blurred, or too far away to separate individual boxes
- you find yourself choosing between two possible totals

A wrong number is far worse than null. A null sends someone back to take a
better photo, which costs seconds. A wrong number sends a short delivery van
out, which costs a customer their dinner. Never guess to be helpful.

Output ONLY a JSON object, no commentary, no code fences:
{
  "count": number | null,
  "confidence": "high" | "medium" | "low",
  "reason": string,
  "imageQuality": "clear" | "unclear"
}

- count: exact number of Dormers boxes in the photo to count, or null per the rules above.
- confidence: "high" only if every box has its own clearly visible edge and nothing could be hidden behind another box.
- reason: one sentence (max 150 chars) saying what you saw and how you counted it.
- imageQuality: "clear" if every box is separable with nothing hidden behind another, "unclear" if the photo cannot support an exact count.

Output JSON only. No explanation. No code fences.`
}

/**
 * Normalise raw Gemini output into a strict BoxCountResult shape.
 * Any missing or unexpected field collapses to a safe default — never trust
 * the model's output structurally, only its content.
 */
function normaliseBoxCount(raw: unknown): BoxCountResult {
  const o = (raw ?? {}) as Record<string, unknown>

  let count: number | null = null
  if (typeof o.count === 'number') {
    count = o.count
  } else if (typeof o.count === 'string' && o.count.trim() !== '') {
    count = parseInt(o.count, 10)
  }
  // Not a finite non-negative integer → treat as "could not count".
  if (count !== null && (!Number.isFinite(count) || count < 0 || !Number.isInteger(count))) {
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
 * Count delivery boxes in a photo. BLIND — the expected number is never
 * passed in, so the caller's comparison stays an independent check.
 *
 * On timeout or service error returns count: null, which every caller must
 * already handle as "could not count".
 */
export async function verifyBoxCount(
  imageBytes: Uint8Array,
  mimeType: string,
  references: BoxReferenceImage[] = [],
  modelId: BoxCountModel = DEFAULT_BOX_COUNT_MODEL,
): Promise<BoxCountResult> {
  return runVisionCount(buildCountPrompt(references.length > 0), imageBytes, mimeType, references, modelId)
}

/**
 * Count STACKS, not boxes.
 *
 * The overview shot in a stack-based pickup answers a different question from
 * the stack shots, and that separation is what stops anything being counted
 * twice (see contexts/ops/domain/stack-pickup.ts). Counting four piles is also
 * a far easier question than counting thirty boxes, and it survives the
 * occlusion that makes the box version impossible.
 */
export async function verifyStackCount(
  imageBytes: Uint8Array,
  mimeType: string,
  references: BoxReferenceImage[] = [],
  modelId: BoxCountModel = DEEP_BOX_COUNT_MODEL,
): Promise<BoxCountResult> {
  return runVisionCount(buildStackPrompt(references.length > 0), imageBytes, mimeType, references, modelId)
}

function buildStackPrompt(hasReferences: boolean): string {
  return `You are looking at a photo of a delivery load made up of SEPARATE PILES
of Dormers meal boxes. Count the PILES. Do not count the boxes.

${hasReferences ? 'The reference photos above show ONE single empty box for recognition only. They are not part of the scene and must NEVER be counted.' : PACKAGING_DESCRIPTION}

A pile is one group of boxes standing together, separated from the next group
by a visible gap or by sitting in a different spot. One box on its own still
counts as one pile.

You are NOT being asked how many boxes there are. A pile of nine and a pile of
two are two piles. Report 2.

Return null instead of a number whenever:
- the piles run into each other and you cannot tell where one ends
- any pile is cut off by the frame edge
- the image is too dark or blurred to separate the piles

Output ONLY a JSON object, no commentary, no code fences:
{
  "count": number | null,
  "confidence": "high" | "medium" | "low",
  "reason": string,
  "imageQuality": "clear" | "unclear"
}

- count: number of separate PILES, or null per the rules above.
- confidence: "high" only if every pile is clearly separated from the others.
- reason: one sentence (max 150 chars) saying how you separated the piles.
- imageQuality: "clear" if the piles are separable, "unclear" otherwise.

Output JSON only. No explanation. No code fences.`
}

async function runVisionCount(
  instruction: string,
  imageBytes: Uint8Array,
  mimeType: string,
  references: BoxReferenceImage[],
  modelId: BoxCountModel,
): Promise<BoxCountResult> {
  const t0 = Date.now()

  // Reference photos first, fenced by text on both sides so the model cannot
  // mistake the catalogue shots for boxes in the rider's van.
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: Uint8Array; mediaType: string }
  > = []

  if (references.length > 0) {
    content.push({
      type: 'text',
      text:
        `REFERENCE PHOTOS (${references.length}). These show ONE single empty Dormers box ` +
        `from different angles so you know what the packaging looks like. They are a ` +
        `catalogue, not a scene. NEVER count them.\n\n${PACKAGING_DESCRIPTION}`,
    })
    for (const ref of references) {
      content.push({ type: 'text', text: `Reference view: ${ref.label}` })
      content.push({ type: 'image', image: ref.bytes, mediaType: ref.mimeType })
    }
    content.push({
      type: 'text',
      text: 'END OF REFERENCE PHOTOS. The single image below is the ONLY one to count.',
    })
  }

  content.push({ type: 'text', text: 'PHOTO TO COUNT:' })
  content.push({ type: 'image', image: imageBytes, mediaType: mimeType })
  content.push({ type: 'text', text: instruction })

  console.log(
    `[box-count-verify] calling ${modelId} (mime=${mimeType}, bytes=${imageBytes.byteLength}, refs=${references.length})`,
  )

  let raw: string
  try {
    const result = await generateText({
      model: google(modelId),
      messages: [{ role: 'user', content }],
      // SDK-level timeout — fires a clean abort before the surrounding
      // Netlify function maxDuration kills the request. 45s leaves ~15s
      // headroom under maxDuration=60 for upload + DB writes.
      abortSignal: AbortSignal.timeout(45_000),
    })
    raw = result.text.trim()
    console.log(`[box-count-verify] ${modelId} responded in ${Date.now() - t0}ms`)
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
      model: modelId,
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
      model: modelId,
    }
  }

  return { ...normaliseBoxCount(parsed), model: modelId }
}
