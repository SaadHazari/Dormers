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
    const { error } = await supabase.rpc('send_admin_whatsapp_alert', {
      p_message: trimmed,
      p_button_text: buttonText ?? 'unknown',
    })
    if (error) {
      await alertBackup(trimmed, `RPC error: ${error.message}`)
    }
  } catch (err) {
    await alertBackup(trimmed, err instanceof Error ? err.message : String(err))
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
