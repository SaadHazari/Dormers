/**
 * Plan E wiring (spec G7, G8, N4, N12): source-level, like
 * order-money-wiring.test.ts, because the routes need Supabase, ZeptoMail and
 * the WhatsApp queue to run end to end. The outbox loop itself is tested in
 * src/contexts/season/usecases/season-notices-send.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

describe('season messages are wired', () => {
  it('the renew nudge is silent on the break and sends last dinners when no plan can follow (G7, N4)', () => {
    const src = read('src/app/api/internal/renew-nudge-send/route.ts')
    expect(src).toContain("if (intakeState.phase === 'break') {")
    expect(src).toContain("skipped: 'season_break'")
    expect(src).toContain('noPlanCanFollow({')
    expect(src).toContain("p_kind: 'season_last_dinners'")
    expect(src).toContain('p_send_after: nextTenAmAe().toISOString()')
    expect(src).not.toContain("if (intakeState.paused) {\n    return NextResponse.json({ ok: true, subscription_id: subId, skipped: 'intake_paused' })")
  })

  it('the plan-ended notice takes the season version on the break or when no plan can follow (G8)', () => {
    const src = read('src/app/api/internal/subscription-ended-send/route.ts')
    expect(src).toContain("const seasonEnded = intakeState.paused || intakeState.phase === 'break' || (intakeState.phase === 'winding_down'")
    expect(src).toContain('paused: seasonEnded,')
  })

  it('every season email goes through its own ZeptoMail template', () => {
    const route = read('src/app/api/internal/season-notices-send/route.ts')
    expect(route).toContain('sendSeasonTemplateEmail')
    const client = read('src/infra/zeptomail/client.ts')
    expect(client).toContain('const templateKey = process.env[input.envKey];')
    expect(client).toContain('if (!templateKey) throw new Error(`${input.envKey} is not set`);')
    // The decline email is a template too, not the admin shell.
    expect(read('src/contexts/season/usecases/season-refund-admin.ts')).toContain("seasonEmailTemplateFor('season_refund_declined'")
  })

  it('the outbox route claims through the lease, re-checks every fact, and honours the WhatsApp flag', () => {
    const src = read('src/app/api/internal/season-notices-send/route.ts')
    expect(src).toContain("sb.rpc('season_notice_claim_batch', { p_limit: limit })")
    for (const kind of ['season_plan_runs_past', 'season_last_dinners', 'season_plan_held', 'season_pause_carries', 'season_plan_ready', 'season_credit_waiting']) {
      expect(src, kind).toContain(`case '${kind}'`)
    }
    expect(src).toContain("process.env.WHATSAPP_SEASON_TEMPLATES_ENABLED === 'true'")
    expect(src).toContain('timingSafeCompare(presented, expected)')
  })

  it('a saved spot is told on both channels, the WhatsApp behind the flag (N12)', () => {
    const src = read('src/contexts/subscriptions/usecases/join-intake-waitlist.ts')
    expect(src).toContain('void announceSpotSaved(sb, user.id, minted.amountAed)')
    expect(src).toContain("seasonEmailTemplateFor('season_spot_saved'")
    expect(src).toContain("queueCustomerNotification(userId, 'season_spot_saved'")
    expect(src).toContain('seasonWhatsAppEnabled()')
  })

  it('a credited skip is told on WhatsApp only behind the flag (N6)', () => {
    const src = read('src/contexts/season/usecases/season-skip-notices.ts')
    expect(src).toContain("queueCustomerNotification(receipt.customerId, 'season_skip_credited'")
    expect(src).toContain("env.WHATSAPP_SEASON_TEMPLATES_ENABLED === 'true'")
  })

  it('the dispatcher migration carries a branch for all eight season kinds and the constraint', () => {
    const src = read('supabase/migrations/20260916_season_notices.sql')
    for (const kind of ['season_plan_runs_past', 'season_last_dinners', 'season_skip_credited', 'season_plan_held', 'season_pause_carries', 'season_spot_saved', 'season_plan_ready', 'season_credit_waiting']) {
      expect(src, kind).toContain(`WHEN '${kind}' THEN  -- Plan E`)
      expect(src, kind).toContain(`'${kind}'`)
    }
    expect(src).toContain("PERFORM public.season_queue_break_notices(v_cycle);  -- Plan E")
  })

  it('the reopening notice tells held plans through the outbox and rides WhatsApp behind its own flag (N15 to N17)', () => {
    const actions = read('src/app/admin/comms/broadcast/actions.ts')
    expect(actions).toContain("sb.rpc('season_queue_reopen_notices')")
    const send = read('src/app/api/internal/broadcast-send/route.ts')
    expect(send).toContain("process.env.WHATSAPP_SEASON_REOPEN_ENABLED === 'true'")
    expect(send).toContain("'intake_reopened', new Date(), { credit_aed: String(unspentCreditAed) }")
    expect(send).toContain("'intake_back_open', new Date(), { plan_name: planName }")
    const migration = read('supabase/migrations/20260916_season_reopen_notices.sql')
    expect(migration).toContain("and not exists (select 1 from public.season_holds h")
    expect(migration).toContain("WHEN 'intake_reopened' THEN  -- Plan F")
    expect(migration).toContain("'reopen_notice_not_sent'")
  })


  it('a pause carried into the break can ask for a refund, and lands back on the pause', () => {
    const sql = read('supabase/migrations/20260916_season_pause_refund.sql')
    expect(sql).toContain("IF h.state NOT IN ('held', 'ready', 'paused_by_customer') THEN")
    expect(sql).toContain("WHEN p_reason = 'customer_pause' THEN 'paused_by_customer'")
    expect(sql).not.toContain('a customer pause is not refunded (X4)')
    // The notices only offer a refund the dashboard would also show.
    expect(sql).toContain("'can_refund', public._season_refund_money_ok(h.subscription_id)")
    expect(sql).toContain("'can_refund', public._season_refund_money_ok(p.subscription_id)")
  })

  it('the reopening template for lapsed customers names their plan', () => {
    expect(read('supabase/migrations/20260916_intake_back_open_plan_name.sql'))
      .toContain("'parameter_name', 'plan_name', 'text', plan_name_str")
    const route = read('src/app/api/internal/broadcast-send/route.ts')
    expect(route).toContain("'intake_back_open', new Date(), { plan_name: planName }")
    // No plan to name means no message, rather than a Meta rejection.
    expect(route).toContain('if (planName) {')
  })

  it('season_plan_ready sends no header variable, matching the approved template', () => {
    // Read from Meta 2026-09-16: its header is fixed text, first_name is in the body.
    const sql = read('supabase/migrations/20260916_season_plan_ready_header.sql')
    const branch = sql.slice(sql.indexOf("WHEN 'season_plan_ready'"), sql.indexOf("WHEN 'season_credit_waiting'"))
    expect(branch).not.toContain("'type', 'header'")
    expect(branch).toContain("'parameter_name', 'first_name'")
    expect(branch).toContain("'parameter_name', 'held_meals'")
    expect(branch).toContain("'parameter_name', 'plan_name'")
  })
})
