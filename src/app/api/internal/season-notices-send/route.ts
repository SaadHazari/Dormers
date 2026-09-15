/**
 * Drains the season_notices outbox (spec §12.3). dispatch_season_notices_tick
 * posts here every 5 minutes while rows are due; the row lease lives in
 * season_notice_claim_batch, so two overlapping calls never send twice.
 *
 * Auth: the same shared secret as the other internal routes.
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { sendSeasonEmail } from '@/infra/zeptomail/client'
import { queueCustomerNotification } from '@/contexts/notifications/usecases/queue'
import { processSeasonNotices, type FactCheck, type SeasonNoticeRow } from '@/contexts/season/usecases/season-notices-send'
import { timingSafeCompare } from '@/shared/crypto'

export const maxDuration = 30

type Sb = ReturnType<typeof createAdminSupabaseClient>

/** The fact each kind was queued for, re-read now (spec §12.1: changed facts are dropped, not sent). */
async function checkFact(sb: Sb, row: SeasonNoticeRow): Promise<FactCheck> {
  const holdState = async (): Promise<string | null> => {
    const { data } = await sb.from('season_holds').select('state').eq('id', row.subject_id).maybeSingle()
    return (data as { state?: string } | null)?.state ?? null
  }
  switch (row.kind) {
    case 'season_plan_runs_past': {
      const [{ data: settings }, { data: sub }] = await Promise.all([
        sb.from('intake_settings').select('season_phase, wrap_up_day').maybeSingle(),
        sb.from('subscriptions').select('status, season_hold_id').eq('id', row.subject_id).maybeSingle(),
      ])
      const s = settings as { season_phase?: string; wrap_up_day?: string | null } | null
      const plan = sub as { status?: string; season_hold_id?: string | null } | null
      if (s?.season_phase !== 'winding_down' || !s.wrap_up_day) return { ok: false, reason: 'not_winding_down' }
      if (String(s.wrap_up_day).slice(0, 10) !== String(row.payload.wrap_up_day ?? '').slice(0, 10)) return { ok: false, reason: 'wrap_up_day_moved' }
      if (!plan || !['Active', 'Skipped'].includes(plan.status ?? '') || plan.season_hold_id) return { ok: false, reason: 'plan_changed' }
      return { ok: true }
    }
    case 'season_last_dinners': {
      const [{ data: settings }, { data: sub }] = await Promise.all([
        sb.from('intake_settings').select('season_phase').maybeSingle(),
        sb.from('subscriptions').select('status, customer_id').eq('id', row.subject_id).maybeSingle(),
      ])
      const s = settings as { season_phase?: string } | null
      const plan = sub as { status?: string; customer_id?: string } | null
      if (s?.season_phase === 'break') return { ok: false, reason: 'on_break' }
      if (!plan || plan.status !== 'Active') return { ok: false, reason: 'plan_changed' }
      const { count } = await sb.from('subscriptions').select('id', { count: 'exact', head: true }).eq('customer_id', plan.customer_id ?? '').eq('status', 'Scheduled')
      if ((count ?? 0) > 0) return { ok: false, reason: 'plan_follows' }
      return { ok: true }
    }
    case 'season_plan_held':
      return (await holdState()) === 'held' ? { ok: true } : { ok: false, reason: 'hold_changed' }
    case 'season_pause_carries':
      return (await holdState()) === 'paused_by_customer' ? { ok: true } : { ok: false, reason: 'hold_changed' }
    case 'season_plan_ready':
      return (await holdState()) === 'ready' ? { ok: true } : { ok: false, reason: 'hold_changed' }
    case 'season_credit_waiting': {
      const { data } = await sb.from('credits').select('status').eq('id', row.subject_id).maybeSingle()
      return (data as { status?: string } | null)?.status === 'approved' ? { ok: true } : { ok: false, reason: 'credit_spent' }
    }
  }
}

export async function POST(req: Request) {
  const expected = process.env.INTERNAL_RETRY_SECRET
  if (!expected) {
    console.error('❌ INTERNAL_RETRY_SECRET not set; refusing to process season notices')
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!presented || !timingSafeCompare(presented, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminSupabaseClient()
  const outcome = await processSeasonNotices({
    whatsappEnabled: process.env.WHATSAPP_SEASON_TEMPLATES_ENABLED === 'true',
    now: () => new Date(),
    async claim(limit) {
      const { data, error } = await sb.rpc('season_notice_claim_batch', { p_limit: limit })
      if (error) throw new Error(`claim failed: ${error.message}`)
      return (data ?? []) as SeasonNoticeRow[]
    },
    async customer(customerId) {
      const { data } = await sb.from('customers').select('name, email').eq('id', customerId).maybeSingle()
      return (data as { name: string | null; email: string | null } | null) ?? null
    },
    checkFact: (row) => checkFact(sb, row),
    sendEmail: (input) => sendSeasonEmail({ toEmail: input.toEmail, firstName: input.firstName, subject: input.subject, bodyText: input.bodyText, cta: input.cta }),
    queueWhatsApp: (customerId, kind, payload) => queueCustomerNotification(customerId, kind, new Date(), payload),
    async stamp(id, patch) {
      const { error } = await sb.from('season_notices').update(patch).eq('id', id)
      if (error) throw new Error(`stamp failed: ${error.message}`)
    },
  })

  return NextResponse.json({ ok: true, ...outcome })
}
