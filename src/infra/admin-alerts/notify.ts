/**
 * Admin WhatsApp alert helper — thin wrapper around the
 * `send_admin_whatsapp_alert(message, button_text)` Supabase RPC.
 *
 * Use anywhere a silent failure would otherwise eat money or trust:
 *   • Stripe events we can't auto-handle (failed payments, disputes)
 *   • Refund for an order we can't match
 *   • Credit flip mismatch (Stripe gave the discount, our DB didn't burn it)
 *   • Webhook crash post-signature
 *
 * Fire-and-forget by design: alerting must NOT block or fail the caller.
 * If the RPC fails, log and move on — the bug we were trying to flag is
 * more important than the alert itself.
 *
 * The button text is what shows on the Meta template's URL button. For
 * order-anchored alerts pass the order id; for session-anchored alerts
 * pass the session id; for everything else any short identifier (or omit
 * to use the RPC default 'unknown').
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { sendOpsAlertEmail } from '@/infra/zeptomail/client'
import { captureError } from '@/infra/logging/capture-error'

const MAX_MESSAGE_CHARS = 950 // Meta body limit is 1024; leave headroom

export async function notifyAdmin(
  message: string,
  buttonText?: string,
): Promise<void> {
  // Meta template params reject \n, \t, and 4+ consecutive spaces
  const sanitised = message.replace(/[\n\t]/g, ' · ').replace(/ {4,}/g, '   ')
  const trimmed = sanitised.length > MAX_MESSAGE_CHARS
    ? sanitised.slice(0, MAX_MESSAGE_CHARS) + '…'
    : sanitised
  try {
    const supabase = createAdminSupabaseClient()
    const { data: requestId, error } = await supabase.rpc('send_admin_whatsapp_alert', {
      p_message: trimmed,
      p_button_text: buttonText ?? 'unknown',
    })
    if (error) {
      await alertBackup(trimmed, `RPC error: ${error.message}`)
      return
    }
    await verifyMetaAccepted(supabase, requestId, trimmed)
  } catch (err) {
    await alertBackup(trimmed, err instanceof Error ? err.message : String(err))
  }
}

// The RPC queues the Meta call through pg_net and returns before Meta answers,
// so a rejection (e.g. 132018 template-contract break, 2026-07-16) would never
// surface on any channel. Poll the response row and fall back to email when
// Meta says no. A missing row after the last poll is left alone — the request
// may still be in flight, and a false alarm here is worse than a late one.
async function verifyMetaAccepted(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  requestId: unknown,
  message: string,
): Promise<void> {
  if (typeof requestId !== 'number') return
  for (const delayMs of [3000, 4000]) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    const { data, error } = await supabase.rpc('get_admin_alert_result', {
      p_request_id: requestId,
    })
    if (error) return // checker failing is not evidence the alert failed
    const result = data as {
      found: boolean
      status_code?: number | null
      error_msg?: string | null
      body?: string | null
    } | null
    if (!result?.found) continue
    const rejected =
      Boolean(result.error_msg) ||
      (typeof result.status_code === 'number' && result.status_code >= 400)
    if (rejected) {
      await alertBackup(
        message,
        `Meta rejected the WhatsApp alert: ${result.error_msg ?? `HTTP ${result.status_code}`} · ${(result.body ?? '').slice(0, 300)}`,
      )
    }
    return
  }
}

// Release It! L4: the WhatsApp alert RPC rides Meta — so when Meta is the
// outage, the very alert that would warn us about it is silenced too
// (self-blinding). Fall back to a NON-WhatsApp channel: email (ZeptoMail, a
// different vendor), and if that also fails, Sentry. The alert is never fully
// lost. Both backups are wrapped so alerting can never throw into the caller.
async function alertBackup(message: string, whatsappFailure: string): Promise<void> {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  try {
    await sendOpsAlertEmail({
      subject: 'Dormers admin alert (WhatsApp channel down)',
      html: `<p>${esc(message)}</p><p style="color:#757575;font-size:13px">WhatsApp alert failed: ${esc(whatsappFailure)}</p>`,
    })
  } catch (emailErr) {
    captureError(emailErr, {
      area: 'admin-alerts',
      op: 'alertBackup',
      alert: message,
      whatsappFailure,
    })
  }
}
