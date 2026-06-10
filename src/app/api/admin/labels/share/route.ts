// POST /api/admin/labels/share — publish today's label PDF for WhatsApp.
//
// Desktop path for "Share to WhatsApp": browsers without the Web Share API
// can't attach a file to a wa.me link, so we upload the PDF to a private
// storage bucket and hand back a 7-day signed URL the kitchen can tap.
// (On mobile the client shares the PDF file directly — no upload needed.)

import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { isAdminEmail } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { getDailyLabels, toLabelData } from '@/app/admin/labels/data'
import { renderLabelsPdf } from '@/app/admin/labels/label-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BUCKET = 'kitchen-labels'
const SIGNED_URL_TTL_S = 7 * 24 * 60 * 60   // 7 days — outlives any print delay

export async function POST() {
  const user = await getUserFromHeaders()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { dateIso, labels, noDeliveryReason } = await getDailyLabels()
  if (labels.length === 0) {
    return NextResponse.json({ error: noDeliveryReason ?? 'No labels today' }, { status: 404 })
  }

  const pdf = await renderLabelsPdf(await toLabelData(labels), {
    title: `Dormers' Labels — ${dateIso}`,
  })

  const sb = createAdminSupabaseClient()

  // Lazily create the private bucket on first use.
  const { error: bucketError } = await sb.storage.createBucket(BUCKET, { public: false })
  if (bucketError && !/already exists/i.test(bucketError.message)) {
    return NextResponse.json({ error: `bucket: ${bucketError.message}` }, { status: 500 })
  }

  const path = `dormers-labels-${dateIso}.pdf`
  const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, pdf, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (uploadError) {
    return NextResponse.json({ error: `upload: ${uploadError.message}` }, { status: 500 })
  }

  // Two signed URLs over the same object:
  //  • downloadUrl forces Content-Disposition: attachment → saves the file.
  //  • printUrl serves inline → opens in the browser's PDF viewer, where
  //    Print gives the same edge-to-edge 4×6 output as the admin Print
  //    button (the whole point — no Preview/driver scaling in the way).
  const [download, inline] = await Promise.all([
    sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_S, { download: path }),
    sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_S),
  ])
  if (download.error || !download.data || inline.error || !inline.data) {
    const msg = download.error?.message ?? inline.error?.message ?? 'no URL'
    return NextResponse.json({ error: `sign: ${msg}` }, { status: 500 })
  }

  return NextResponse.json({
    downloadUrl: download.data.signedUrl,
    printUrl: inline.data.signedUrl,
    count: labels.length,
    dateIso,
  })
}
