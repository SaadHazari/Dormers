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

type ZohoContact = { contact_id: string; contact_name: string; email?: string };
type ZohoInvoice = {
  invoice_id: string;
  invoice_number: string;
  total: number;
  invoice_url?: string;
};

async function findContactByEmail(email: string): Promise<ZohoContact | null> {
  // email_contains is a SUBSTRING filter, so "ali@x.com" also matches
  // "natalie@x.com". Narrow with it, then require an exact email match so a
  // payment/invoice can't attach to the wrong customer's Zoho contact.
  const res = await zohoFetch<{ contacts?: ZohoContact[] }>(
    `/contacts?email_contains=${encodeURIComponent(email)}`,
  );
  const target = email.trim().toLowerCase();
  return (
    (res.contacts ?? []).find((c) => (c.email ?? '').trim().toLowerCase() === target) ?? null
  );
}

/**
 * Zoho enforces uniqueness on contact_name across the whole org, which
 * collides hard on common first names (Mohammed, Sara, Saif…) once we have
 * more than one customer with the same short name. On collision we retry
 * with the customer's CID appended — guaranteed unique forever, reads
 * cleanly in the Zoho UI ("Saif (YUG1243)"), and matches the suffix-on-
 * collision pattern already used for invoice_number and payment_number.
 */
async function createContact(params: {
  name: string;
  email: string;
  phone: string;
  cid: string;
}): Promise<ZohoContact> {
  const parts = params.name.trim().split(/\s+/);
  const firstName = parts[0] ?? params.name;
  const lastName = parts.slice(1).join(' ') || '-';
  const candidates = [params.name, `${params.name} (${params.cid})`];
  let lastErr: unknown;
  for (const contactName of candidates) {
    try {
      const res = await zohoFetch<{ contact: ZohoContact }>('/contacts', {
        method: 'POST',
        body: {
          contact_name: contactName,
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
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists') || msg.includes('duplicate')) continue;
      throw err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Zoho contact creation failed for "${params.name}"`);
}

async function findOrCreateContact(params: {
  name: string;
  email: string;
  phone: string;
  cid: string;
}): Promise<ZohoContact> {
  const existing = await findContactByEmail(params.email);
  if (existing) return existing;
  return createContact(params);
}

function yyyymmdd(iso: string): string {
  return iso.replace(/-/g, '');
}

function planCode(planName: string): string {
  const map: Record<string, string> = {
    'Monthly Max': 'MMAX',
    'Monthly Premium': 'MPREM',
    'Weekly Flex': 'WFLEX',
    'One-Time Trial': 'TRIAL',
    'Welcome Meal': 'GIFT',
    'Staff Monthly': 'STAFF',
  };
  return map[planName] ?? planName.replace(/\s+/g, '').substring(0, 6).toUpperCase();
}

/**
 * Create an invoice with a custom invoice_number. Format:
 * `INV-{cid}-{YYYYMMDD}`. On same-day collision, appends `-2`, `-3`, etc.
 * up to 5 attempts.
 *
 * The P.O.# (reference_number) is a human-readable order ref:
 * `DRM-{PLANCODE}-{YYYYMMDD}`. The Stripe session ref moves to notes
 * so it's still available for reconciliation but not customer-facing.
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
  /**
   * Invoice-level discount in AED. Set when the customer redeemed Dorm
   * Wars credit + lifetime tier % at checkout. Shown on the PDF as a
   * subtotal-reducing discount line so the FTA invoice still reflects
   * what the customer actually paid via Stripe (line subtotal − discount
   * = paid total).
   */
  discountAed?: number;
  notes?: string;
}): Promise<ZohoInvoice> {
  const taxId = process.env.ZOHO_VAT_TAX_ID;
  const inclusive = (process.env.ZOHO_VAT_INCLUSIVE ?? 'true') === 'true';
  const datePart = yyyymmdd(params.paymentDateIso);
  const base = `INV-${params.customerCid}-${datePart}`;
  const poRef = `DRM-${planCode(params.planName)}-${datePart}`;
  const stripeNote = `Stripe ref: ${params.sessionRef}`;
  const combinedNotes = params.notes
    ? `${params.notes}\n${stripeNote}`
    : stripeNote;
  // Defensive 2dp clamp — the webhook already rounds, but any future caller
  // passing a float that came from `total / qty` would print an ugly rate
  // on the FTA invoice ("5.620833 × 48"). Guarantee a clean display.
  const rate = Math.round(params.pricePerMeal * 100) / 100;
  const discount = Math.round((params.discountAed ?? 0) * 100) / 100;

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
            reference_number: poRef,
            is_inclusive_tax: inclusive,
            line_items: [
              {
                name: `Dormers Meal Plan — ${params.planName}`,
                description: `${params.mealsCount} meals · starts ${params.startDateIso}`,
                quantity: params.mealsCount,
                rate,
                ...(taxId ? { tax_id: taxId } : {}),
              },
            ],
            ...(discount > 0
              ? {
                  discount,
                  is_discount_before_tax: true,
                  discount_type: 'item_level',
                }
              : {}),
            notes: combinedNotes,
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
  throw new Error(`Zoho invoice creation failed: 5 collisions on "${base}"`);
}

async function recordPayment(params: {
  contactId: string;
  customerCid: string;
  invoiceId: string;
  amountAed: number;
  paymentDateIso: string;
  stripeRef: string;
}): Promise<{ paymentId: string }> {
  const datePart = yyyymmdd(params.paymentDateIso);
  const base = `RCT-${params.customerCid}-${datePart}`;
  const payRef = `DRM-PAY-${datePart}`;

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
            reference_number: payRef,
            notes: `Stripe ref: ${params.stripeRef}`,
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
  throw new Error(`Zoho payment recording failed: 5 collisions on "${base}"`);
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
  /**
   * Discount applied at checkout (AED). For the trial+auto-refund flow this
   * is the Dorm Wars credit + lifetime tier % portion — line subtotal minus
   * this equals what Stripe captured. Default 0 = standard paid invoice.
   */
  discountAed?: number;
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
    cid: input.customerCid,
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
    discountAed: input.discountAed,
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

/**
 * Free-checkout invoice pipeline. The customer's Dorm Wars credit + tier %
 * covered the full plan total, so no Stripe transaction happened. We still
 * mint a real FTA-compliant invoice showing the line subtotal + a
 * "Dorm Wars Credit Redemption" discount line that nets to AED 0.
 *
 * Differences from the paid pipeline:
 *   • No recordPayment — Zoho rejects 0-amount payments
 *   • Balance-zero status flip — try the auto-mark-paid path first; if
 *     Zoho leaves it 'open' after creation, call mark_as_paid explicitly
 *   • Email uses /invoices/{id}/email with subject + body override (the
 *     payment-receipt email path doesn't apply when there's no payment row)
 */
export async function createAndSendCompedInvoice(input: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCid: string;
  planName: string;
  mealsCount: number;
  pricePerMeal: number;
  /** Full plan total in AED — line subtotal AND the discount amount. */
  planTotalAed: number;
  sessionRef: string;
  startDateIso: string;
  paymentDateIso: string;
  notes?: string;
}): Promise<{ invoiceId: string; invoiceNumber: string; invoiceUrl?: string }> {
  const contact = await findOrCreateContact({
    name: input.customerName,
    email: input.customerEmail,
    phone: input.customerPhone,
    cid: input.customerCid,
  });

  // Notes line clarifies the discount source. Zoho's discount field is a
  // bare amount with the default label "Discount"; the note tells the
  // customer (and any auditor) exactly which mechanism settled the balance.
  const compedNote =
    input.notes ??
    'Plan settled in full using your Dorm Wars credit balance. No payment due.';

  const invoice = await createInvoice({
    contactId: contact.contact_id,
    customerCid: input.customerCid,
    planName: input.planName,
    mealsCount: input.mealsCount,
    pricePerMeal: input.pricePerMeal,
    sessionRef: input.sessionRef,
    startDateIso: input.startDateIso,
    paymentDateIso: input.paymentDateIso,
    // Discount equals plan total → balance lands at AED 0.
    discountAed: input.planTotalAed,
    notes: compedNote,
  });

  // Zoho marks invoices with balance=0 as 'paid' automatically in most
  // configurations, but a few orgs leave them 'open'. Re-read the invoice
  // and call mark_as_paid if still open. Idempotent — if status is already
  // paid the endpoint either no-ops or 400s harmlessly.
  type InvoiceRead = { invoice: { status?: string; balance?: number } };
  const verify = await zohoFetch<InvoiceRead>(`/invoices/${invoice.invoice_id}`);
  if (verify.invoice?.status && verify.invoice.status.toLowerCase() !== 'paid') {
    try {
      await zohoFetch(`/invoices/${invoice.invoice_id}/status/paid`, { method: 'POST' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `Zoho mark_as_paid fallback failed for invoice ${invoice.invoice_number}: ${msg}. ` +
        `Invoice balance is AED 0 either way; ops can flip status manually.`,
      );
    }
  }

  // Email the customer using the invoice email endpoint (vs payment-receipt
  // path used by paid invoices). Subject is brand-side passive; body
  // inherits whatever's configured in Zoho's invoice email template.
  type EmailDefaults = { data: { subject: string; body: string } };
  const defaults = await zohoFetch<EmailDefaults>(`/invoices/${invoice.invoice_id}/email`);
  await zohoFetch(`/invoices/${invoice.invoice_id}/email`, {
    method: 'POST',
    body: {
      to_mail_ids: [input.customerEmail],
      subject: 'Your Dormers invoice (paid using Dorm Wars credit)',
      body: defaults.data.body,
      send_from_org_email_id: true,
      attach_pdf: true,
    },
  });

  return {
    invoiceId: invoice.invoice_id,
    invoiceNumber: invoice.invoice_number,
    invoiceUrl: invoice.invoice_url,
  };
}
