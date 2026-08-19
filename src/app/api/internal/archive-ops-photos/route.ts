/**
 * Ops photo archival — internal endpoint hit by the archive_ops_photos daily cron.
 *
 * Moves delivery-photos objects older than 31 days (AE calendar) into an
 * archive/{date}/... prefix and rewrites the photo_path columns that point at
 * them, so the admin Photos page (clamped to the last 31 days) and the
 * storage bucket stay tidy. Nothing is deleted — chain-of-custody evidence
 * is kept, just out of the working set.
 *
 * Bucket layout is exactly two levels deep: {date}/{sub}/{file}.jpg where
 * sub is a dorm slug, _kitchen, or _pickup.
 *
 * Bounded: at most MAX_DATES_PER_RUN date folders per invocation — the daily
 * cron drains any backlog over successive nights.
 *
 * Auth: INTERNAL_RETRY_SECRET bearer token (same as all internal routes).
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { timingSafeCompare } from '@/shared/crypto'
import { captureError } from '@/infra/logging/capture-error'

export const maxDuration = 60

const BUCKET = 'delivery-photos'
const RETENTION_DAYS = 31
const MAX_DATES_PER_RUN = 10

export async function POST(req: Request) {
  const expected = process.env.INTERNAL_RETRY_SECRET
  if (!expected) {
    console.error('INTERNAL_RETRY_SECRET not set; refusing archive-ops-photos')
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!presented || !timingSafeCompare(presented, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000)
  const cutoff = new Date(aeNow.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const sb = createAdminSupabaseClient()

  // Top level of the bucket = date folders (plus the archive/ prefix itself)
  const { data: top, error: listErr } = await sb.storage
    .from(BUCKET)
    .list('', { limit: 1000 })
  if (listErr) {
    captureError(listErr, { area: 'ops', op: 'archive-photos.list-root' })
    return NextResponse.json({ error: 'list_failed' }, { status: 500 })
  }

  const oldDates = (top ?? [])
    .map(e => e.name)
    .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name) && name < cutoff)
    .sort()
    .slice(0, MAX_DATES_PER_RUN)

  let moved = 0
  let failed = 0
  const archivedDates: string[] = []

  for (const date of oldDates) {
    const { data: subs } = await sb.storage.from(BUCKET).list(date, { limit: 1000 })
    let dateHadFailure = false

    for (const sub of subs ?? []) {
      const { data: files } = await sb.storage
        .from(BUCKET)
        .list(`${date}/${sub.name}`, { limit: 1000 })
      for (const file of files ?? []) {
        const from = `${date}/${sub.name}/${file.name}`
        const { error: moveErr } = await sb.storage
          .from(BUCKET)
          .move(from, `archive/${from}`)
        if (moveErr) {
          dateHadFailure = true
          failed++
          console.error(`[archive-ops-photos] move failed for ${from}:`, moveErr.message)
        } else {
          moved++
        }
      }
    }

    if (!dateHadFailure) archivedDates.push(date)

    // Rewrite DB pointers for this date so the paths stay resolvable if the
    // photo is ever pulled up again. The not-like guard makes re-runs after a
    // partial failure safe (no double 'archive/archive/' prefixes).
    for (const table of ['delivery_events', 'ops_day_events'] as const) {
      const dateCol = table === 'delivery_events' ? 'delivery_date' : 'event_date'
      // Both tables keep a per-attempt history in photo_paths. Every pointer
      // moves together or the earlier attempts' photos go dark.
      const cols = 'id, photo_path, photo_paths'
      const { data: rows, error: rowsErr } = await sb
        .from(table)
        .select(cols)
        .eq(dateCol, date)
        .not('photo_path', 'is', null)
        .not('photo_path', 'like', 'archive/%')
      if (rowsErr) {
        captureError(rowsErr, { area: 'ops', op: 'archive-photos.read-paths', table, date })
        continue
      }
      for (const row of (rows ?? []) as unknown as {
        id: string
        photo_path: string
        photo_paths?: string[] | null
      }[]) {
        const patch: Record<string, unknown> = { photo_path: `archive/${row.photo_path}` }
        if (row.photo_paths?.length) {
          // The not-like guard above is on photo_path, so re-prefix defensively
          // per entry — never produce 'archive/archive/...'.
          patch.photo_paths = row.photo_paths.map(pp =>
            pp.startsWith('archive/') ? pp : `archive/${pp}`,
          )
        }
        const { error: updErr } = await sb
          .from(table)
          .update(patch)
          .eq('id', row.id)
        if (updErr) {
          captureError(updErr, { area: 'ops', op: 'archive-photos.update-path', table, date })
        }
      }
    }
  }

  return NextResponse.json({ ok: true, cutoff, moved, failed, archivedDates })
}
