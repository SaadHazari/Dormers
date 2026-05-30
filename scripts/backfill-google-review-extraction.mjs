#!/usr/bin/env node
// scripts/backfill-google-review-extraction.mjs
//
// One-shot backfill for the duplicate-detection columns on existing
// approved / auto_approved google_review claims in layer4_rewards.
//
// Why: the corpus of stored review text starts empty when the duplicate
// check ships. Without this, the first batch of new uploads can't
// collide with anything historical and fraudsters get a free pass on
// reviews already submitted before today.
//
// What it does:
//   1. Pages rows from public.layer4_rewards where
//        kind='google_review'
//        AND status IN ('approved','auto_approved')
//        AND extracted_text_hash IS NULL
//   2. For each row, downloads the screenshot from review-screenshots
//      under {customer_id}/{row_id}.{ext}, trying common extensions.
//   3. Calls Gemini Vision with the same prompt as the live verifier
//      (in sync — review-verify.ts is the source of truth).
//   4. Writes extracted_review_text, extracted_text_hash, and
//      extracted_reviewer_name on the row.
//
// Run:
//   node --env-file=.env.local scripts/backfill-google-review-extraction.mjs
//
// Optional env:
//   BACKFILL_LIMIT=N         only process the first N rows (dry-run-ish)
//   BACKFILL_DRY_RUN=1       skip DB writes, just log what it would do
//
// Idempotent — re-running skips rows that already have a hash. Safe.

import { createClient } from '@supabase/supabase-js'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import { createHash } from 'node:crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY   = process.env.GOOGLE_GENERATIVE_AI_API_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}
if (!GEMINI_KEY) {
  console.error('❌ GOOGLE_GENERATIVE_AI_API_KEY is required.')
  process.exit(1)
}

const LIMIT   = process.env.BACKFILL_LIMIT ? parseInt(process.env.BACKFILL_LIMIT, 10) : null
const DRY_RUN = process.env.BACKFILL_DRY_RUN === '1'

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── Helpers (kept in sync with src/contexts/dorm-wars/domain/google-review-verify.ts) ──

function normalizeReviewText(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function hashReviewText(text) {
  return createHash('sha256').update(normalizeReviewText(text)).digest('hex')
}

// Mirror of verifyReviewScreenshot — kept inline so the script is
// runnable without a TS loader. Prompt text MUST match the live route.
async function verifyReviewScreenshot(imageBytes, mimeType, customerName) {
  const nameHint = customerName?.trim()
    ? `The customer's account name is "${customerName.trim()}". If the screenshot shows a reviewer name that plausibly matches, note it. A mismatch is NOT a hard fail.`
    : 'The customer name is unknown — do not fail on reviewer-name mismatch.'

  const prompt = `You are verifying that a customer of "Dormers" (a Dubai meal-delivery service) actually left a Google review for the business.

The user uploaded a screenshot. Inspect it and answer the following AS A JSON OBJECT ONLY, with no commentary, code fences, or extra text. Output exactly this shape:

{
  "isGoogleReviewScreenshot": boolean,
  "businessMatchesDormers":   boolean,
  "hasVisibleRating":         boolean,
  "reviewerNameVisible":      string | null,
  "extractedReviewText":      string | null,
  "confidence":               "high" | "medium" | "low",
  "reason":                   string
}

Field meanings:
- isGoogleReviewScreenshot: true if the image clearly shows a Google review interface.
- businessMatchesDormers: true if any Dormers / Dormer / dormers.ae brand signal is visible.
- hasVisibleRating: true if a 1-5 star rating is visible.
- reviewerNameVisible: the displayed reviewer name if legible, else null. ${nameHint}
- extractedReviewText: the FULL review body text exactly as written, verbatim. Preserve punctuation and line breaks (as \\n). EXCLUDE reviewer name, star count, date, helpful button, business response. Null if no review body visible.
- confidence: "high" | "medium" | "low".
- reason: one short sentence (max 200 chars).

Output JSON only.`

  const result = await generateText({
    model: google('gemini-2.5-flash'),
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image', image: imageBytes, mediaType: mimeType },
      ],
    }],
    abortSignal: AbortSignal.timeout(45_000),
  })
  const stripped = result.text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
  const parsed = JSON.parse(stripped)
  return {
    extractedReviewText:
      typeof parsed.extractedReviewText === 'string' && parsed.extractedReviewText.trim()
        ? parsed.extractedReviewText.trim().slice(0, 4000)
        : null,
    reviewerNameVisible:
      typeof parsed.reviewerNameVisible === 'string' && parsed.reviewerNameVisible.trim()
        ? parsed.reviewerNameVisible.trim().slice(0, 120)
        : null,
  }
}

// ── Storage download — try common extensions, return bytes + mime ──

const EXTENSIONS = [
  ['jpg',  'image/jpeg'],
  ['png',  'image/png'],
  ['webp', 'image/webp'],
  ['heic', 'image/heic'],
]

async function downloadScreenshot(customerId, rowId) {
  for (const [ext, mime] of EXTENSIONS) {
    const path = `${customerId}/${rowId}.${ext}`
    const { data, error } = await sb.storage.from('review-screenshots').download(path)
    if (!error && data) {
      const bytes = new Uint8Array(await data.arrayBuffer())
      return { bytes, mime, path }
    }
  }
  return null
}

// ── Main ──

async function main() {
  const { data: rows, error } = await sb
    .from('layer4_rewards')
    .select('id, customer_id, status, claimed_at')
    .eq('kind', 'google_review')
    .in('status', ['approved', 'auto_approved'])
    .is('extracted_text_hash', null)
    .order('claimed_at', { ascending: true })
    .limit(LIMIT ?? 1000)

  if (error) {
    console.error('❌ query failed:', error)
    process.exit(1)
  }

  console.log(`📋 ${rows.length} row(s) to backfill${DRY_RUN ? ' (DRY RUN)' : ''}.`)

  let ok = 0, skipped = 0, failed = 0
  for (const row of rows) {
    const label = `${row.id.slice(0, 8)}  customer=${row.customer_id.slice(0, 8)}`
    try {
      const dl = await downloadScreenshot(row.customer_id, row.id)
      if (!dl) {
        console.warn(`⚠️  ${label}  no screenshot in bucket — skipping`)
        skipped++
        continue
      }

      const verdict = await verifyReviewScreenshot(dl.bytes, dl.mime, null)
      const text = verdict.extractedReviewText
      const hash = text ? hashReviewText(text) : null
      const name = verdict.reviewerNameVisible

      if (!text && !name) {
        console.warn(`⚠️  ${label}  Gemini extracted neither text nor name`)
        skipped++
        continue
      }

      if (DRY_RUN) {
        console.log(`🔎 ${label}  text=${text?.slice(0, 60) ?? '(none)'}… reviewer=${name ?? '(none)'}`)
      } else {
        const { error: updateErr } = await sb
          .from('layer4_rewards')
          .update({
            extracted_review_text:   text,
            extracted_text_hash:     hash,
            extracted_reviewer_name: name,
          })
          .eq('id', row.id)
        if (updateErr) {
          console.error(`❌ ${label}  update failed:`, updateErr.message)
          failed++
          continue
        }
        console.log(`✅ ${label}  text=${text?.length ?? 0} chars reviewer=${name ?? '(none)'}`)
      }
      ok++
    } catch (err) {
      console.error(`❌ ${label}  threw:`, err?.message ?? err)
      failed++
    }
  }

  console.log(`\n📊 Done — ok=${ok} skipped=${skipped} failed=${failed}`)
}

main().catch(err => {
  console.error('💥 unhandled:', err)
  process.exit(1)
})
