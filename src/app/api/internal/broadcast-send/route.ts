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
import { sendBroadcastEmail, sendTemplate } from '@/infra/zeptomail/client'
import { buildBroadcastEmailHtml, buildSeasonReopenMergeInfo, personalizeBroadcast, reasonLineFor } from '@/infra/zeptomail/broadcast-shell'
import { timingSafeCompare } from '@/shared/crypto'
import { getIntakeState } from '@/infra/config/intake'
import { getWaitlistStatusStrict } from '@/infra/supabase/subscriptions-repo'

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

/**
 * One reopen recipient via the ZeptoMail season-reopen template.
 * The template serves two audiences (docs/email-templates/season-reopen.html):
 * credit holders get the credit block + "Use my credit"; everyone else gets
 * "Restart my plan". Merge-key construction (including the credit_aed OMIT-
 * when-zero contract) lives in buildSeasonReopenMergeInfo.
 *
 * intake_waitlist has NO unique(customer_id) — a repeat member has one row
 * PER PAUSE CYCLE. Every read and write here is scoped to the CURRENT cycle
 * (getIntakeState().cycleStartedAt); an unscoped read against a two-row
 * customer would error out of maybeSingle(), so both the membership lookup
 * and the strict credit read throw rather than swallow, letting the
 * dispatcher's per-recipient catch park the row for retry instead of
 * silently sending a wrong-footer, never-retried email.
 */
async function sendSeasonReopenTo(
  sb: ReturnType<typeof createAdminSupabaseClient>,
  row: PendingSend,
): Promise<void> {
  const templateKey = process.env.ZEPTOMAIL_TPL_SEASON_REOPEN
  if (!templateKey) throw new Error('ZEPTOMAIL_TPL_SEASON_REOPEN is not set')

  const intakeState = await getIntakeState()
  if (!intakeState.cycleStartedAt) {
    // getIntakeState() fails open (paused: false, cycleStartedAt: null) on a
    // settings-read error so checkout never wrongly blocks — but that same
    // fail-open here would scope nothing, silently telling a waitlist member
    // they're a stranger with no retry to ever correct it. Throw so the
    // dispatcher's per-recipient catch parks the row instead.
    throw new Error('sendSeasonReopenTo: intake cycle_started_at is unset; parking for retry')
  }

  const { data: waitlistRow, error: waitlistError } = await sb.from('intake_waitlist')
    .select('id')
    .eq('customer_id', row.customer_id)
    .eq('cycle_started_at', intakeState.cycleStartedAt)
    .maybeSingle()
  if (waitlistError) {
    throw new Error(`sendSeasonReopenTo: intake_waitlist read failed for ${row.customer_id}: ${waitlistError.message}`)
  }

  // Strict, not the fail-open getWaitlistStatus: a swallowed credits-read
  // error here would send a credit holder the no-credit email and stamp it
  // sent, with no retry ever correcting it.
  const { unspentCreditAed } = await getWaitlistStatusStrict(sb, row.customer_id, intakeState.cycleStartedAt)

  const mergeInfo = buildSeasonReopenMergeInfo({
    firstName: row.first_name,
    isWaitlistMember: !!waitlistRow,
    unspentCreditAed,
  })

  await sendTemplate({
    templateKey,
    to: { email: row.email, name: row.first_name },
    mergeInfo,
  })

  if (waitlistRow) {
    const { error: notifyError } = await sb.from('intake_waitlist')
      .update({ notified_at: new Date().toISOString() })
      .eq('customer_id', row.customer_id)
      .eq('cycle_started_at', intakeState.cycleStartedAt)
      .is('notified_at', null)
    // The email already sent — at-least-once is accepted here. Log, don't
    // throw: a stamping failure shouldn't count this send as failed and
    // trigger a resend, it would just leave notified_at unset for this row.
    if (notifyError) {
      console.error(`sendSeasonReopenTo: notified_at stamp failed for ${row.customer_id}: ${notifyError.message}`)
    }
  }
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
