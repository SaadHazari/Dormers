// POST /api/admin/box-counter-test — score ONE photo through the live counter.
//
// A bench for stress-testing the box count without walking a rider through a
// delivery. Its whole value is fidelity: it calls the same verifyBoxCount,
// with the same model, the same prompt and the same reference photos that
// /api/ops/confirm-pickup and /api/ops/verify-box-count use. If this file
// ever grows its own prompt or its own model choice, it stops being a test of
// production and becomes a test of itself.
//
// One photo per request on purpose. The client fans out a few at a time, so a
// batch of twenty never rides on one long-running function, and results land
// as they finish instead of all at the end.
//
// Auth: middleware attaches x-user-* headers for /api/admin/*; we re-check the
// admin allowlist here so the route fails closed without middleware.

import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { isAdminEmail } from '@/contexts/admin/usecases/require-admin'
import {
  verifyBoxCount,
  BOX_COUNT_MODELS,
  DEFAULT_BOX_COUNT_MODEL,
  type BoxCountModel,
} from '@/contexts/ops/domain/box-count-verify'
import { loadBoxReferenceImages } from '@/infra/ops/box-reference'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Same guards the rider routes apply, so a photo that would be rejected in
// the field is rejected here too.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(request: Request) {
  const user = await getUserFromHeaders()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 })
  }

  const photo = formData.get('photo')
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: 'missing_photo' }, { status: 400 })
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  }
  if (!ALLOWED_MIME.has(photo.type)) {
    return NextResponse.json({ error: 'unsupported_mime' }, { status: 415 })
  }

  // Allowlisted, never free text: this endpoint takes an admin's word for
  // which model to run, and an arbitrary string would be a blank cheque
  // against the AI bill.
  const requested = formData.get('model') as string | null
  const model: BoxCountModel =
    requested && (BOX_COUNT_MODELS as readonly string[]).includes(requested)
      ? (requested as BoxCountModel)
      : DEFAULT_BOX_COUNT_MODEL

  const bytes = new Uint8Array(await photo.arrayBuffer())
  const references = loadBoxReferenceImages()

  const t0 = Date.now()
  const result = await verifyBoxCount(bytes, photo.type, references, model)
  const ms = Date.now() - t0

  return NextResponse.json({
    ok: true,
    count: result.count,
    confidence: result.confidence,
    reason: result.reason,
    imageQuality: result.imageQuality,
    ms,
    // Surfaced so a deploy that silently lost the reference photos is visible
    // on the bench instead of being mistaken for the model getting worse.
    referenceCount: references.length,
    bytes: bytes.byteLength,
    model,
    isProductionModel: model === DEFAULT_BOX_COUNT_MODEL,
  })
}
