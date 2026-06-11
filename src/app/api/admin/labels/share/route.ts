// POST /api/admin/labels/share — publish today's label PDF for WhatsApp.
//
// Desktop path for "Share to WhatsApp": browsers without the Web Share API
// can't attach a file to a wa.me link, so we upload the PDF to a private
// storage bucket and hand back a 7-day signed URL the kitchen can tap.
// (On mobile the client shares the PDF file directly — no upload needed.)
//
// Body (optional): { order: "DM-1042" } narrows the upload to that single
// label — the per-label WhatsApp button in the admin grid (reprints,
// "this one box only" messages to the kitchen).

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

export async function POST(request: Request) {
  const user = await getUserFromHeaders()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Body is optional — the whole-day share posts nothing.
  const order: string | null = await request.json()
    .then(b => (typeof b?.order === 'string' ? b.order : null))
    .catch(() => null)

  const { dateIso, labels, noDeliveryReason } = await getDailyLabels()
  if (labels.length === 0) {
    return NextResponse.json({ error: noDeliveryReason ?? 'No labels today' }, { status: 404 })
  }

  const selected = order ? labels.filter(l => l.orderId === order) : labels
  if (selected.length === 0) {
    return NextResponse.json({ error: `No label ${order} today` }, { status: 404 })
  }

  const pdf = await renderLabelsPdf(await toLabelData(selected), {
    title: order ? `Dormers' Label — ${order}` : `Dormers' Labels — ${dateIso}`,
  })

  const sb = createAdminSupabaseClient()

  // Lazily create the private bucket on first use.
  const { error: bucketError } = await sb.storage.createBucket(BUCKET, { public: false })
  if (bucketError && !/already exists/i.test(bucketError.message)) {
    return NextResponse.json({ error: `bucket: ${bucketError.message}` }, { status: 500 })
  }

  // order matched a generated DM id above, so it's path-safe.
  const path = order
    ? `dormers-label-${dateIso}-${order}.pdf`
    : `dormers-labels-${dateIso}.pdf`
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
    count: selected.length,
    dateIso,
  })
}
