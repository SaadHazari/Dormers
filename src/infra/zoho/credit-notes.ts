/**
 * Zoho Books credit notes for refunds (plan refunds and season refunds).
 * Three steps, each one safe to resume: the caller stores what each step
 * returned and passes it back on a retry, so a retry never makes a second
 * credit note or records the refund twice.
 *
 *   1. createRefundCreditNote: a credit note against the order's invoice,
 *      numbered like the invoices (CN-{cid}-{YYYYMMDD}, -2 on collision).
 *   2. recordCreditNoteRefund: the cash leaving, recorded against the
 *      account the original Stripe payment went into (Undeposited Funds),
 *      which closes the credit note.
 *   3. emailCreditNote: Zoho emails the customer with the PDF attached.
 *
 * Each credit note carries the Stripe refund id as its reference number,
 * which is unique per refund: findCreditNoteByReference finds one made by an
 * attempt whose response was lost, so it is never made twice.
 *
 * Rehearsed against the live org on 2026-09-16 with a TEST credit note that
 * was deleted straight after (Zoho rejects a refund with no account:
 * "Involved account types are not applicable").
 */

import { zohoFetch } from './client';

type InvoiceRead = {
  invoice: {
    customer_id: string;
    is_inclusive_tax?: boolean;
    line_items?: Array<{ account_id?: string }>;
  };
};

function yyyymmdd(iso: string): string {
  return iso.replace(/-/g, '');
}

type CreditNoteRef = { creditnoteId: string; creditnoteNumber: string };

/** The credit note already made for this Stripe refund, if any. */
export async function findCreditNoteByReference(stripeRefundId: string): Promise<CreditNoteRef | null> {
  const res = await zohoFetch<{ creditnotes?: Array<{ creditnote_id: string; creditnote_number: string; reference_number?: string; status?: string }> }>(
    `/creditnotes?reference_number=${encodeURIComponent(stripeRefundId)}`,
  );
  const match = (res.creditnotes ?? []).find((c) => c.reference_number === stripeRefundId && c.status !== 'void');
  return match ? { creditnoteId: match.creditnote_id, creditnoteNumber: match.creditnote_number } : null;
}

/** What Zoho already has on a credit note: its recorded refunds and whether it was emailed. */
export async function readCreditNote(creditnoteId: string): Promise<{ refundId: string | null; emailed: boolean }> {
  const res = await zohoFetch<{ creditnote: { is_emailed?: boolean; creditnote_refunds?: Array<{ creditnote_refund_id: string }> } }>(
    `/creditnotes/${creditnoteId}`,
  );
  return {
    refundId: res.creditnote.creditnote_refunds?.[0]?.creditnote_refund_id ?? null,
    emailed: res.creditnote.is_emailed === true,
  };
}

export async function createRefundCreditNote(input: {
  invoiceId: string;
  customerCid: string;
  dateIso: string;
  planName: string;
  refundedMeals: number;
  amountAed: number;
  stripeRefundId: string;
}): Promise<CreditNoteRef> {
  const { invoice } = await zohoFetch<InvoiceRead>(`/invoices/${input.invoiceId}`);
  const accountId = invoice.line_items?.[0]?.account_id;
  const base = `CN-${input.customerCid}-${yyyymmdd(input.dateIso)}`;
  const amount = Math.round(input.amountAed * 100) / 100;
  const meals = input.refundedMeals === 1 ? '1 unused meal' : `${input.refundedMeals} unused meals`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    try {
      const res = await zohoFetch<{ creditnote: { creditnote_id: string; creditnote_number: string } }>(
        '/creditnotes?ignore_auto_number_generation=true',
        {
          method: 'POST',
          body: {
            customer_id: invoice.customer_id,
            creditnote_number: candidate,
            date: input.dateIso,
            reference_number: input.stripeRefundId,
            invoice_id: input.invoiceId,
            is_inclusive_tax: invoice.is_inclusive_tax ?? true,
            line_items: [
              {
                name: `Refund: Dormers Meal Plan (${input.planName})`,
                description: `${meals} refunded`,
                quantity: 1,
                rate: amount,
                ...(accountId ? { account_id: accountId } : {}),
              },
            ],
            notes: `Refund of Dormers order. Stripe refund: ${input.stripeRefundId}`,
          },
        },
      );
      return { creditnoteId: res.creditnote.creditnote_id, creditnoteNumber: res.creditnote.creditnote_number };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        // The number may be taken by this very refund (a lost response): reuse it.
        const existing = await findCreditNoteByReference(input.stripeRefundId);
        if (existing) return existing;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Zoho credit note creation failed: 5 collisions on "${base}"`);
}

export async function recordCreditNoteRefund(input: {
  creditnoteId: string;
  invoiceId: string;
  dateIso: string;
  amountAed: number;
  stripeRefundId: string;
}): Promise<{ refundId: string }> {
  const pays = await zohoFetch<{ payments?: Array<{ payment_id: string }> }>(`/invoices/${input.invoiceId}/payments`);
  const paymentId = pays.payments?.[0]?.payment_id;
  if (!paymentId) throw new Error(`Zoho invoice ${input.invoiceId} has no payment to refund from`);
  const { payment } = await zohoFetch<{ payment: { account_id?: string } }>(`/customerpayments/${paymentId}`);
  if (!payment.account_id) throw new Error(`Zoho payment ${paymentId} has no account`);

  const res = await zohoFetch<{ creditnote_refund: { creditnote_refund_id: string } }>(
    `/creditnotes/${input.creditnoteId}/refunds`,
    {
      method: 'POST',
      body: {
        date: input.dateIso,
        refund_mode: 'Stripe',
        reference_number: input.stripeRefundId,
        amount: Math.round(input.amountAed * 100) / 100,
        from_account_id: payment.account_id,
        description: `Stripe refund ${input.stripeRefundId}`,
      },
    },
  );
  return { refundId: res.creditnote_refund.creditnote_refund_id };
}

export async function emailCreditNote(creditnoteId: string, to: string): Promise<void> {
  type EmailDefaults = { data?: { body?: string }; body?: string };
  const defaults = await zohoFetch<EmailDefaults>(`/creditnotes/${creditnoteId}/email`);
  const body = defaults.data?.body ?? defaults.body;
  if (!body) throw new Error(`Zoho returned no email body for credit note ${creditnoteId}`);
  await zohoFetch(`/creditnotes/${creditnoteId}/email`, {
    method: 'POST',
    body: {
      to_mail_ids: [to],
      subject: 'Credit note for your Dormers refund',
      body,
      send_from_org_email_id: true,
    },
  });
}
