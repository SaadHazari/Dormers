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

const MAX_MESSAGE_CHARS = 950 // Meta body limit is 1024; leave headroom

export async function notifyAdmin(
  message: string,
  buttonText?: string,
): Promise<void> {
  const trimmed = message.length > MAX_MESSAGE_CHARS
    ? message.slice(0, MAX_MESSAGE_CHARS) + '…'
    : message
  try {
    const supabase = createAdminSupabaseClient()
    const { error } = await supabase.rpc('send_admin_whatsapp_alert', {
      p_message: trimmed,
      p_button_text: buttonText ?? 'unknown',
    })
    if (error) {
      console.error('⚠️  notifyAdmin RPC error:', error.message)
    }
  } catch (err) {
    console.error('⚠️  notifyAdmin threw:', err)
  }
}
