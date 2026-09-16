import 'server-only'

/**
 * The Zoho credit note for a cash refund (plan refund or season refund), so
 * the customer gets the PDF and the books show the money leaving.
 *
 * One refund_credit_notes row per refund; each Zoho step writes its result
 * back before the next one runs, so a retry picks up where the last attempt
 * stopped. Before each step Zoho is asked whether it already happened (a
 * lost response), and a run claims the row for two minutes so two runs never
 * overlap: no second credit note, no refund recorded twice.
 * A failure never undoes the refund itself: the owner hears about it and can
 * press "Send the credit note again" on the customer's page.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { createRefundCreditNote, recordCreditNoteRefund, emailCreditNote, findCreditNoteByReference, readCreditNote } from '@/infra/zoho/credit-notes'
import { notifyAdmin } from '@/infra/admin-alerts/notify'
import { captureError } from '@/infra/logging/capture-error'
import { todayAeIso } from '@/contexts/season/domain/season-dates'
import { formatAed } from '@/contexts/season/domain/meal-value'

export type RefundCreditNoteKind = 'plan_refund' | 'season_refund'

export type RefundCreditNoteResult =
  | { ok: true; creditnoteNumber: string | null; emailed: boolean }
  | { ok: false; error: string }
  | { skipped: 'no_cash' | 'busy' }

type Row = {
  id: string
  kind: RefundCreditNoteKind
  order_id: string
  customer_id: string
  refunded_meals: number
  cash_fils: number
  stripe_refund_id: string
  zoho_creditnote_id: string | null
  zoho_creditnote_number: string | null
  zoho_refund_id: string | null
  emailed_at: string | null
  attempts: number
}

type Sb = ReturnType<typeof createAdminSupabaseClient>

const ROW_COLUMNS = 'id, kind, order_id, customer_id, refunded_meals, cash_fils, stripe_refund_id, zoho_creditnote_id, zoho_creditnote_number, zoho_refund_id, emailed_at, attempts'

/** Record that a refund needs a credit note, then send it. Safe to call twice. */
export async function sendRefundCreditNote(input: {
  kind: RefundCreditNoteKind
  refundId: string
  orderId: string
  customerId: string
  refundedMeals: number
  cashFils: number
  stripeRefundId: string | null
}): Promise<RefundCreditNoteResult> {
  if (input.cashFils <= 0 || !input.stripeRefundId) return { skipped: 'no_cash' }
  const sb = createAdminSupabaseClient()
  const { error: insertErr } = await sb.from('refund_credit_notes').upsert(
    {
      kind: input.kind,
      refund_id: input.refundId,
      order_id: input.orderId,
      customer_id: input.customerId,
      refunded_meals: input.refundedMeals,
      cash_fils: input.cashFils,
      stripe_refund_id: input.stripeRefundId,
    },
    { onConflict: 'kind,refund_id', ignoreDuplicates: true },
  )
  if (insertErr) {
    captureError(new Error(insertErr.message), { area: 'refunds', op: 'sendRefundCreditNote.insert', refundId: input.refundId })
    void notifyAdmin(`Credit note NOT started for a ${formatAed(input.cashFils)} refund (${input.kind} ${input.refundId}): ${insertErr.message}. Make it by hand in Zoho.`, 'refund_credit_note')
    return { ok: false, error: insertErr.message }
  }
  const { data } = await sb.from('refund_credit_notes').select(ROW_COLUMNS).eq('kind', input.kind).eq('refund_id', input.refundId).maybeSingle()
  if (!data) return { ok: false, error: 'The credit note row could not be read back.' }
  return runSteps(sb, data as Row)
}

/** The owner's "Send the credit note again". */
export async function retryRefundCreditNote(creditNoteId: string): Promise<RefundCreditNoteResult> {
  const sb = createAdminSupabaseClient()
  const { data } = await sb.from('refund_credit_notes').select(ROW_COLUMNS).eq('id', creditNoteId).maybeSingle()
  if (!data) return { ok: false, error: 'That credit note is gone. Refresh the page.' }
  return runSteps(sb, data as Row)
}

const CLAIM_MS = 2 * 60 * 1000

async function runSteps(sb: Sb, row: Row): Promise<RefundCreditNoteResult> {
  if (row.zoho_refund_id && row.emailed_at) {
    return { ok: true, creditnoteNumber: row.zoho_creditnote_number, emailed: true }
  }
  const now = new Date()
  const { data: claimed } = await sb
    .from('refund_credit_notes')
    .update({ claimed_until: new Date(now.getTime() + CLAIM_MS).toISOString() })
    .eq('id', row.id)
    .or(`claimed_until.is.null,claimed_until.lt."${now.toISOString()}"`)
    .select('id')
  if (!claimed || claimed.length === 0) return { skipped: 'busy' }

  const save = async (patch: Record<string, unknown>) => {
    const { error } = await sb.from('refund_credit_notes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', row.id)
    if (error) throw new Error(`Saving credit note progress failed: ${error.message}`)
  }

  try {
    const [{ data: order }, { data: customer }] = await Promise.all([
      sb.from('orders').select('zoho_invoice_id, plan').eq('id', row.order_id).maybeSingle(),
      sb.from('customers').select('cid, email').eq('id', row.customer_id).maybeSingle(),
    ])
    const o = (order ?? null) as { zoho_invoice_id?: string | null; plan?: string | null } | null
    const c = (customer ?? null) as { cid?: string | null; email?: string | null } | null
    if (!o?.zoho_invoice_id) throw new Error('The order has no Zoho invoice yet, so there is nothing to credit.')
    if (!c?.cid) throw new Error('The customer has no CID for the credit note number.')

    const dateIso = todayAeIso()
    const amountAed = row.cash_fils / 100

    if (!row.zoho_creditnote_id) {
      const made = await findCreditNoteByReference(row.stripe_refund_id) ?? await createRefundCreditNote({
        invoiceId: o.zoho_invoice_id,
        customerCid: c.cid,
        dateIso,
        planName: o.plan ?? 'Meal plan',
        refundedMeals: row.refunded_meals,
        amountAed,
        stripeRefundId: row.stripe_refund_id,
      })
      row.zoho_creditnote_id = made.creditnoteId
      row.zoho_creditnote_number = made.creditnoteNumber
      await save({ zoho_creditnote_id: made.creditnoteId, zoho_creditnote_number: made.creditnoteNumber })
    }

    const zoho = await readCreditNote(row.zoho_creditnote_id)
    if (!row.zoho_refund_id && zoho.refundId) {
      row.zoho_refund_id = zoho.refundId
      await save({ zoho_refund_id: zoho.refundId })
    }
    if (!row.emailed_at && zoho.emailed) {
      row.emailed_at = new Date().toISOString()
      await save({ emailed_at: row.emailed_at })
    }

    if (!row.zoho_refund_id) {
      const recorded = await recordCreditNoteRefund({
        creditnoteId: row.zoho_creditnote_id,
        invoiceId: o.zoho_invoice_id,
        dateIso,
        amountAed,
        stripeRefundId: row.stripe_refund_id,
      })
      row.zoho_refund_id = recorded.refundId
      await save({ zoho_refund_id: recorded.refundId })
    }

    if (!row.emailed_at && c.email) {
      await emailCreditNote(row.zoho_creditnote_id, c.email)
      row.emailed_at = new Date().toISOString()
      await save({ emailed_at: row.emailed_at, last_error: null, claimed_until: null })
    } else {
      await save({ last_error: null, claimed_until: null })
    }
    return { ok: true, creditnoteNumber: row.zoho_creditnote_number, emailed: !!row.emailed_at }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    captureError(err, { area: 'refunds', op: 'refundCreditNote', creditNoteId: row.id })
    await sb.from('refund_credit_notes')
      .update({ last_error: message.slice(0, 500), attempts: row.attempts + 1, claimed_until: null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    void notifyAdmin(
      `Credit note FAILED for a ${formatAed(row.cash_fils)} refund (Stripe ${row.stripe_refund_id}): ${message}. ` +
      "The refund itself went through. Press Send the credit note again on the customer's page.",
      'refund_credit_note',
    )
    return { ok: false, error: message }
  }
}
