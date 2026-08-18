/**
 * Broadcast dispatcher tick. Called every minute by dispatch_broadcast_tick
 * (pg_cron) while any broadcast is in 'sending'. Sends a BOUNDED batch per
 * invocation so no audience size can outrun the function timeout; resume is
 * inherent because progress lives in broadcast_sends.sent_at, not in memory.
 *
 * Ticks are NOT serialized — dispatch_broadcast_tick fires this route via
 * pg_net's http_post, which is fire-and-forget, so a slow batch can overlap
 * the next minute's tick. Rows are claimed via broadcast_claim_batch (a
 * `for update skip locked` RPC, see the 20260818_broadcast_claim migration)
 * before being sent, so two overlapping ticks can never claim the same row —
 * a claim lease self-releases after 2 minutes if a tick crashes or times out.
 *
 * Failure taxonomy:
 *   CircuitOpenError  → stop the whole tick, count NO attempts. ZeptoMail is
 *                       down or struggling; transactional email has priority
 *                       and the rows will still be here next tick (the lease
 *                       simply expires and the row becomes claimable again).
 *   per-recipient err → attempts+1, last_error, keep going. At 3 attempts the
 *                       row is parked until an admin presses Retry failures.
 *
 * Also bounded by wall-clock time (BATCH_TIME_BUDGET_MS) so a full batch of
 * slow sends can't run past maxDuration, and re-checks the broadcast's status
 * every few rows so pressing Cancel takes effect within a handful of sends
 * instead of waiting out the whole batch.
 */
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { CircuitOpenError } from '@/infra/http/circuit-breaker'
import { sendBroadcastEmail } from '@/infra/zeptomail/client'
import { buildBroadcastEmailHtml, personalizeBroadcast, reasonLineFor } from '@/infra/zeptomail/broadcast-shell'
import { timingSafeCompare } from '@/shared/crypto'

const BATCH_SIZE = 25
// Leaves a margin under maxDuration for the batch's setup/teardown queries
// (the broadcast lookup, the claim RPC, the final remaining-count read).
const BATCH_TIME_BUDGET_MS = 40_000
// Re-check the broadcast's status this often so Cancel takes effect quickly.
const STATUS_RECHECK_EVERY = 5
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

  // Atomically claim a disjoint batch of rows — `for update skip locked`
  // inside the RPC means an overlapping tick can never claim the same row.
  const { data: claimed } = await sb.rpc('broadcast_claim_batch', {
    p_broadcast_id: broadcast.id,
    p_limit: BATCH_SIZE,
  })
  const rows = (claimed ?? []) as PendingSend[]

  const startedAt = Date.now()
  let sent = 0, failed = 0
  for (let i = 0; i < rows.length; i++) {
    if (Date.now() - startedAt > BATCH_TIME_BUDGET_MS) break

    if (i > 0 && i % STATUS_RECHECK_EVERY === 0) {
      const { data: current } = await sb.from('broadcasts')
        .select('status')
        .eq('id', broadcast.id)
        .maybeSingle()
      if (current?.status !== 'sending') break
    }

    const row = rows[i]
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
      const { error: stampError } = await sb.from('broadcast_sends')
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq('id', row.id)
      if (stampError) {
        // The email is already out — at-least-once is the accepted semantic
        // here. Don't count it as sent (so the caller's numbers stay honest)
        // and don't touch attempts; the row's claim lease will just expire
        // and it'll be picked up (and re-sent) next tick.
        console.error(`broadcast ${broadcast.id} send ${row.id}: sent but failed to stamp sent_at: ${stampError.message}`)
      } else {
        sent++
      }
    } catch (err) {
      if (err instanceof CircuitOpenError || (err as Error)?.name === 'CircuitOpenError') {
        console.error(`broadcast ${broadcast.id}: breaker open, stopping tick early (sent=${sent} failed=${failed})`)
        return NextResponse.json({ ok: false, skipped: 'breaker_open', sent, failed })
      }
      failed++
      const message = String((err as Error)?.message ?? err).slice(0, 500)
      console.error(`broadcast ${broadcast.id} send ${row.id}: ${message}`)
      // Read-modify-write on attempts is safe here because this row was
      // exclusively claimed by this tick (broadcast_claim_batch's `for update
      // skip locked`) — no other tick holds it until the 2-minute lease
      // expires, so nothing else can race this update.
      await sb.from('broadcast_sends')
        .update({
          attempts: row.attempts + 1,
          last_error: message,
        })
        .eq('id', row.id)
    }
  }

  const { count: remaining, error: countError } = await sb.from('broadcast_sends')
    .select('id', { count: 'exact', head: true })
    .eq('broadcast_id', broadcast.id)
    .is('sent_at', null)
    .lt('attempts', 3)

  if (countError) {
    console.error(`broadcast ${broadcast.id}: failed to read remaining count: ${countError.message}`)
  }
  const done = !countError && (remaining ?? 0) === 0
  if (done) {
    await sb.from('broadcasts')
      .update({ status: 'done', finished_at: new Date().toISOString() })
      .eq('id', broadcast.id)
      .eq('status', 'sending')
  }
  return NextResponse.json({ ok: true, broadcast_id: broadcast.id, sent, failed, remaining, done })
}
