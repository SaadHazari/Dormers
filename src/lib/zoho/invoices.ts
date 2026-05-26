/**
 * High-level Zoho Books operations used by the Stripe webhook fan-out.
 * One orchestrator (`createAndSendPaidInvoice`) does the full sequence:
 * find-or-create contact → create invoice → record payment → email it.
 *
 * VAT handling: Dormers is currently below the FTA voluntary TRN
 * threshold, so invoices are minted WITHOUT a VAT line — `tax_id` is only
 * attached to the line item when ZOHO_VAT_TAX_ID is set. Same shape as
 * the current Make.com → Zoho flow. When Dormers becomes TRN-registered,
 * set ZOHO_VAT_TAX_ID and the line will switch on automatically.
 */

import { zohoFetch, zohoFetchBinary } from './client';

type ZohoContact = { contact_id: string; contact_name: string };
type ZohoInvoice = {
  invoice_id: string;
  invoice_number: string;
  total: number;
  invoice_url?: string;
};

async function findContactByEmail(email: string): Promise<ZohoContact | null> {
  const res = await zohoFetch<{ contacts?: ZohoContact[] }>(
    `/contacts?email_contains=${encodeURIComponent(email)}`,
  );
  return res.contacts?.[0] ?? null;
}

async function createContact(params: {
  name: string;
  email: string;
  phone: string;
}): Promise<ZohoContact> {
  const parts = params.name.trim().split(/\s+/);
  const firstName = parts[0] ?? params.name;
  const lastName = parts.slice(1).join(' ') || '-';
  const res = await zohoFetch<{ contact: ZohoContact }>('/contacts', {
    method: 'POST',
    body: {
      contact_name: params.name,
      contact_type: 'customer',
      contact_persons: [
        {
          first_name: firstName,
          last_name: lastName,
          email: params.email,
          phone: params.phone,
          is_primary_contact: true,
        },
      ],
    },
  });
  return res.contact;
}

async function findOrCreateContact(params: {
  name: string;
  email: string;
  phone: string;
}): Promise<ZohoContact> {
  const existing = await findContactByEmail(params.email);
  if (existing) return existing;
  return createContact(params);
}

/**
 * Format an ISO date (YYYY-MM-DD) as DDMMYYYY for the customer-facing
 * invoice/receipt number — UAE/EU convention per user preference.
 */
function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}${m}${y}`;
}

/**
 * Create an invoice with a custom invoice_number. The format is
 * `invoice-{cid}-{DDMMYYYY}`. If a duplicate already exists (same customer
 * paid twice on the same day — rare but possible), append `-2`, `-3`, etc.
 * up to 5 attempts. The ?ignore_auto_number_generation=true query param
 * is what allows us to override Zoho's default sequential numbering on a
 * per-request basis without changing org settings.
 */
async function createInvoice(params: {
  contactId: string;
  customerCid: string;
  planName: string;
  mealsCount: number;
  pricePerMeal: number;
  sessionRef: string;
  startDateIso: string;
  paymentDateIso: string;
  notes?: string;
}): Promise<ZohoInvoice> {
  const taxId = process.env.ZOHO_VAT_TAX_ID;
  const inclusive = (process.env.ZOHO_VAT_INCLUSIVE ?? 'true') === 'true';
  const base = `invoice-${params.customerCid}-${ddmmyyyy(params.paymentDateIso)}`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    try {
      const res = await zohoFetch<{ invoice: ZohoInvoice }>(
        '/invoices?ignore_auto_number_generation=true',
        {
          method: 'POST',
          body: {
            customer_id: params.contactId,
            invoice_number: candidate,
            reference_number: params.sessionRef,
            is_inclusive_tax: inclusive,
            line_items: [
              {
                name: `Dormers Meal Plan — ${params.planName}`,
                description: `${params.mealsCount} meals · starts ${params.startDateIso}`,
                quantity: params.mealsCount,
                rate: params.pricePerMeal,
                ...(taxId ? { tax_id: taxId } : {}),
              },
            ],
            ...(params.notes ? { notes: params.notes } : {}),
          },
        },
      );
      return res.invoice;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Zoho returns code 4060 / "Invoice Number already exists" on collision.
      if (msg.includes('already exists') || msg.includes('duplicate')) continue;
      throw err;
    }
  }
  throw new Error(`Zoho invoice creation failed: 5 collisions on base "${base}"`);
}

async function recordPayment(params: {
  contactId: string;
  customerCid: string;
  invoiceId: string;
  amountAed: number;
  paymentDateIso: string;
  stripeRef: string;
}): Promise<{ paymentId: string }> {
  const base = `receipt-${params.customerCid}-${ddmmyyyy(params.paymentDateIso)}`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    try {
      const res = await zohoFetch<{ payment: { payment_id: string } }>(
        '/customerpayments?ignore_auto_number_generation=true',
        {
          method: 'POST',
          body: {
            customer_id: params.contactId,
            payment_number: candidate,
            payment_mode: 'Stripe',
            amount: params.amountAed,
            date: params.paymentDateIso,
            reference_number: params.stripeRef,
            invoices: [
              { invoice_id: params.invoiceId, amount_applied: params.amountAed },
            ],
          },
        },
      );
      return { paymentId: res.payment.payment_id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists') || msg.includes('duplicate')) continue;
      throw err;
    }
  }
  throw new Error(`Zoho payment recording failed: 5 collisions on base "${base}"`);
}

/**
 * Email a payment receipt to the customer with BOTH the receipt PDF and
 * the invoice PDF attached. Uses Zoho's "Payment Thank-You" template
 * (configurable under Settings → Email Templates in Zoho Books).
 *
 * Three-step flow — Zoho doesn't have a single-call way to bundle the
 * invoice PDF with a payment receipt email, so we orchestrate it:
 *   1. Fetch the invoice PDF bytes via `GET /invoices/{id}?accept=pdf`
 *   2. Upload as an attachment on the payment with
 *      `?can_send_in_mail=true` — this flag is the key; without it,
 *      attachments default to `can_send_in_mail: false` and Zoho's email
 *      endpoint silently ignores them.
 *   3. GET email defaults (preserves the user's customised subject + body
 *      from the Zoho template) → POST send. Zoho auto-bundles every
 *      `can_send_in_mail: true` attachment on the payment.
 *
 * Deliberately NOT `/invoices/{id}/email` — that endpoint always sends
 * the "please pay this invoice" template even on fully-paid invoices.
 */
async function emailPaymentReceipt(
  paymentId: string,
  invoiceId: string,
  invoiceNumber: string,
  to: string,
): Promise<void> {
  // Step 1 — fetch the invoice PDF
  const pdf = await zohoFetchBinary(`/invoices/${invoiceId}?accept=pdf`);

  // Step 2 — upload as a mail-bundlable attachment on the payment
  const form = new FormData();
  form.append(
    'attachment',
    new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
    `${invoiceNumber}.pdf`,
  );
  await zohoFetch(
    `/customerpayments/${paymentId}/attachment?can_send_in_mail=true`,
    { method: 'POST', body: form },
  );

  // Step 3 — fetch email defaults for the body (template-rendered HTML), then
  // POST with our overridden subject. The Zoho template's default subject
  // ("✅ Payment Received Successfully") reads as a call-to-action; we want
  // this email to feel like an archive/reference, so the subject is passive
  // and tells the customer exactly what's inside.
  const defaults = await zohoFetch<{ data: { subject: string; body: string } }>(
    `/customerpayments/${paymentId}/email`,
  );
  await zohoFetch(`/customerpayments/${paymentId}/email`, {
    method: 'POST',
    body: {
      to_mail_ids: [to],
      subject: 'Receipt for your Dormers order',
      body: defaults.data.body,
      send_from_org_email_id: true,
      attach_payment_receipt: true,
    },
  });
}

/**
 * Full pipeline: find/create the Zoho contact, mint the invoice, mark it
 * paid against the Stripe charge, and trigger Zoho to email the official
 * FTA-compliant PDF to the customer.
 *
 * Returns the invoice metadata so the webhook can persist `zoho_invoice_id`
 * and `zoho_invoice_number` for idempotency + audit. Throws on any failure;
 * the caller is responsible for catching and logging into post_payment_errors.
 */
export async function createAndSendPaidInvoice(input: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCid: string;
  planName: string;
  mealsCount: number;
  pricePerMeal: number;
  amountTotalAed: number;
  sessionRef: string;
  startDateIso: string;
  paymentDateIso: string;
  stripePaymentRef: string;
  notes?: string;
}): Promise<{ invoiceId: string; invoiceNumber: string; invoiceUrl?: string }> {
  const contact = await findOrCreateContact({
    name: input.customerName,
    email: input.customerEmail,
    phone: input.customerPhone,
  });

  const invoice = await createInvoice({
    contactId: contact.contact_id,
    customerCid: input.customerCid,
    planName: input.planName,
    mealsCount: input.mealsCount,
    pricePerMeal: input.pricePerMeal,
    sessionRef: input.sessionRef,
    startDateIso: input.startDateIso,
    paymentDateIso: input.paymentDateIso,
    notes: input.notes,
  });

  const { paymentId } = await recordPayment({
    contactId: contact.contact_id,
    customerCid: input.customerCid,
    invoiceId: invoice.invoice_id,
    amountAed: input.amountTotalAed,
    paymentDateIso: input.paymentDateIso,
    stripeRef: input.stripePaymentRef,
  });

  await emailPaymentReceipt(
    paymentId,
    invoice.invoice_id,
    invoice.invoice_number,
    input.customerEmail,
  );

  return {
    invoiceId: invoice.invoice_id,
    invoiceNumber: invoice.invoice_number,
    invoiceUrl: invoice.invoice_url,
  };
}
