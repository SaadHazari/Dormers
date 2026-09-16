import 'server-only'

/**
 * Drains the season_notices outbox (spec §12.3). For every claimed row: check
 * the fact is still true (a hold released, a plan refunded or a cleared
 * schedule drops the notice rather than sending it), send the email, queue the
 * WhatsApp, stamp each channel so a retry never repeats one that went.
 *
 * Every side effect comes in through `deps`, so the tests run the whole loop
 * against fake rows. The route wires the real Supabase, ZeptoMail and queue.
 */

import type { SeasonNoticeKind, SeasonNoticePayload } from '../domain/season-messages'
import { seasonEmailTemplateFor, seasonWhatsAppPayload, seasonWhatsAppWanted, firstNameOf } from '../domain/season-messages'

export interface SeasonNoticeRow {
  id: string
  customer_id: string
  kind: SeasonNoticeKind
  subject_id: string
  cycle_started_at: string
  payload: SeasonNoticePayload
  email_sent_at: string | null
  whatsapp_queued_at: string | null
}

export type FactCheck = { ok: true } | { ok: false; reason: string }

export interface SeasonNoticeDeps {
  claim(limit: number): Promise<SeasonNoticeRow[]>
  customer(customerId: string): Promise<{ name: string | null; email: string | null } | null>
  checkFact(row: SeasonNoticeRow): Promise<FactCheck>
  sendEmail(input: { toEmail: string; firstName: string; envKey: string; mergeInfo: Record<string, string> }): Promise<void>
  queueWhatsApp(customerId: string, kind: SeasonNoticeKind, payload: Record<string, string>): Promise<void>
  stamp(id: string, patch: { email_sent_at?: string; whatsapp_queued_at?: string; dropped_at?: string; drop_reason?: string; last_error?: string | null }): Promise<void>
  whatsappEnabled: boolean
  now(): Date
}

export interface SeasonNoticeOutcome {
  claimed: number
  emailed: number
  whatsapp: number
  dropped: number
  failed: number
}

export async function processSeasonNotices(deps: SeasonNoticeDeps, limit = 50): Promise<SeasonNoticeOutcome> {
  const rows = await deps.claim(limit)
  const out: SeasonNoticeOutcome = { claimed: rows.length, emailed: 0, whatsapp: 0, dropped: 0, failed: 0 }

  for (const row of rows) {
    try {
      const fact = await deps.checkFact(row)
      if (!fact.ok) {
        await deps.stamp(row.id, { dropped_at: deps.now().toISOString(), drop_reason: fact.reason })
        out.dropped += 1
        continue
      }
      const customer = await deps.customer(row.customer_id)
      if (!customer) {
        await deps.stamp(row.id, { dropped_at: deps.now().toISOString(), drop_reason: 'customer_missing' })
        out.dropped += 1
        continue
      }
      const firstName = firstNameOf(customer.name)

      if (!row.email_sent_at) {
        if (customer.email) {
          const template = seasonEmailTemplateFor(row.kind, row.payload)
          await deps.sendEmail({ toEmail: customer.email, firstName, envKey: template.envKey, mergeInfo: template.mergeInfo })
          out.emailed += 1
        }
        // No address is not a failure to retry: the WhatsApp still goes.
        await deps.stamp(row.id, { email_sent_at: deps.now().toISOString(), last_error: customer.email ? null : 'email skipped: no address' })
      }

      if (!row.whatsapp_queued_at) {
        if (deps.whatsappEnabled && seasonWhatsAppWanted(row.kind, row.payload)) {
          await deps.queueWhatsApp(row.customer_id, row.kind, seasonWhatsAppPayload(row.kind, row.payload))
          out.whatsapp += 1
          await deps.stamp(row.id, { whatsapp_queued_at: deps.now().toISOString() })
        } else {
          // Stamped so the row is finished; the reason stays readable on it.
          await deps.stamp(row.id, {
            whatsapp_queued_at: deps.now().toISOString(),
            last_error: deps.whatsappEnabled ? 'whatsapp skipped: amount is 0' : 'whatsapp skipped: season templates not enabled',
          })
        }
      }
    } catch (err) {
      out.failed += 1
      const message = err instanceof Error ? err.message : String(err)
      await deps.stamp(row.id, { last_error: message.slice(0, 500) }).catch(() => undefined)
    }
  }
  return out
}
