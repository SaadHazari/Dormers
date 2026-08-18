/**
 * Broadcast dispatcher tick. Called every minute by dispatch_broadcast_tick
 * (pg_cron) while any broadcast is in 'sending'. Sends a BOUNDED batch per
 * invocation so no audience size can outrun the function timeout; resume is
 * inherent because progress lives in broadcast_sends.sent_at, not in memory.
 *
 * Failure taxonomy:
 *   CircuitOpenError  → stop the whole tick, count NO attempts. ZeptoMail is
 *                       down or struggling; transactional email has priority
 *                       and the rows will still be here next tick.
 *   per-recipient err → attempts+1, last_error, keep going. At 3 attempts the
 *                       row is parked until an admin presses Retry failures.
 */
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { CircuitOpenError } from '@/infra/http/circuit-breaker'
import { sendBroadcastEmail } from '@/infra/zeptomail/client'
import { buildBroadcastEmailHtml, personalizeBroadcast, reasonLineFor } from '@/infra/zeptomail/broadcast-shell'
import { timingSafeCompare } from '@/shared/crypto'

const BATCH_SIZE = 25
export const maxDuration = 60

type PendingSend = {
  id: string
  customer_id: string
  email: string
  first_name: string
  attempts: number
}

// Task 7 implements this — the 'season_reopen' kind can't be created from the
// UI yet, so this branch is unreachable in production until then. Params are
// unused for now; kept on the signature so the call site below (which Task 7
// will keep calling unchanged) never needs to change shape.
async function sendSeasonReopenTo(
  _sb: ReturnType<typeof createAdminSupabaseClient>,
  _row: PendingSend,
): Promise<void> {
  void _sb; void _row // unused until Task 7 wires the real send
  throw new Error('season_reopen not wired yet')
}

export async function POST(req: Request) {
  const expected = process.env.INTERNAL_RETRY_SECRET
  if (!expected) {
    console.error('❌ INTERNAL_RETRY_SECRET not set; refusing to process broadcast-send')
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!presented || !timingSafeCompare(presented, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminSupabaseClient()

  const { data: broadcast } = await sb.from('broadcasts')
    .select('id, kind, subject, heading, body, cta_label, cta_url, audience, status')
    .eq('status', 'sending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!broadcast) return NextResponse.json({ ok: true, skipped: 'no_active_broadcast' })

  const { data: pending } = await sb.from('broadcast_sends')
    .select('id, customer_id, email, first_name, attempts')
    .eq('broadcast_id', broadcast.id)
    .is('sent_at', null)
    .lt('attempts', 3)
    .order('id')
    .limit(BATCH_SIZE)

  let sent = 0, failed = 0
  for (const row of pending ?? []) {
    try {
      if (broadcast.kind === 'season_reopen') {
        await sendSeasonReopenTo(sb, row)          // Task 7 fills this in
      } else {
        const html = buildBroadcastEmailHtml({
          firstName: row.first_name,
          heading: broadcast.heading,
          bodyText: broadcast.body,
          ctaLabel: broadcast.cta_label ?? undefined,
          ctaUrl: broadcast.cta_url ?? undefined,
          reasonLine: reasonLineFor(broadcast.audience),
        })
        await sendBroadcastEmail({
          toEmail: row.email,
          toName: row.first_name,
          subject: personalizeBroadcast(broadcast.subject, row.first_name),
          html,
        })
      }
      await sb.from('broadcast_sends')
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq('id', row.id)
      sent++
    } catch (err) {
      if (err instanceof CircuitOpenError || (err as Error)?.name === 'CircuitOpenError') {
        return NextResponse.json({ ok: false, skipped: 'breaker_open', sent, failed })
      }
      failed++
      // Read-modify-write on attempts is racy across concurrent ticks in
      // general, but ticks are serialized (one pg_cron schedule, one route),
      // so the row we just read is still current when we write it back.
      await sb.from('broadcast_sends')
        .update({
          attempts: row.attempts + 1,
          last_error: String((err as Error)?.message ?? err).slice(0, 500),
        })
        .eq('id', row.id)
    }
  }

  const { count: remaining } = await sb.from('broadcast_sends')
    .select('id', { count: 'exact', head: true })
    .eq('broadcast_id', broadcast.id)
    .is('sent_at', null)
    .lt('attempts', 3)

  const done = (remaining ?? 0) === 0
  if (done) {
    await sb.from('broadcasts')
      .update({ status: 'done', finished_at: new Date().toISOString() })
      .eq('id', broadcast.id)
      .eq('status', 'sending')
  }
  return NextResponse.json({ ok: true, broadcast_id: broadcast.id, sent, failed, remaining, done })
}
