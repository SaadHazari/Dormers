/**
 * ZeptoMail transactional email client — used by the post-payment fan-out
 * for the friendly "thanks for joining Dormers" receipt. The official
 * FTA-compliant tax invoice still comes from Zoho Books separately; this
 * email is the brand-forward customer-facing one, matching the visual
 * language of the onboarding + ending-soon emails already running on
 * ZeptoMail via the Make scenario.
 *
 * ──────────────────────────── ONE-TIME SETUP ────────────────────────────
 *  1. Log into https://www.zoho.com/zeptomail/ (the same account that
 *     already sends onboarding emails via the Make scenario).
 *
 *  2. Mail Agents → pick the relevant agent (or create one for "Dormers
 *     dashboard transactional") → Send Information → API tab.
 *     Copy the `send mail token` (starts with `Zoho-enczapikey ...`).
 *
 *  3. Email Templates → New Template → name it `order-confirmation` or
 *     similar. Paste the on-brand HTML (generated via the messaging Skills
 *     in a separate pass). Use these merge variable names so the code
 *     below "just works":
 *        {{first_name}}
 *        {{plan_name}}
 *        {{first_delivery_date_pretty}}     ("Mon, 1 Jun")
 *        {{meals_count}}
 *        {{total_aed}}                      ("89.50")
 *        {{order_number}}
 *        {{account_email}}                  (the sign-in email, shown
 *                                            in the dashboard CTA card so
 *                                            customers know which account
 *                                            to log into)
 *     Save → copy the Template Key.
 *
 *  4b. ALSO create a `start-day` template (the day-1 "Today's the day"
 *     email fired by the 9 AM AE cron). HTML lives in the docs / latest
 *     conversation; merge variables it uses:
 *        {{first_name}}
 *        {{dorm_or_default}}                (the dorm name, or "your dorm"
 *                                            if the customer hasn't set one)
 *        {{account_email}}
 *     Save → copy this Template Key separately into ZEPTOMAIL_TPL_START_DAY.
 *
 *  4c. ALSO create a `renew-nudge` template (the T-3 days renewal reminder
 *     fired by the pg_cron renew_nudge_tick for customers whose Active sub
 *     is ending soon and who have NO Scheduled follow-on queued). Merge
 *     variables it uses:
 *        {{first_name}}
 *        {{plan_name}}
 *        {{end_date}}                       ("Fri 5 Jun")
 *        {{meals_delivered}}                ("21")
 *        {{evenings}}                       ("21" or for Monthly Max, "11")
 *        {{aed_saved}}                      ("184" — EMPTY when no benchmark)
 *        {{aed_earned}}                     ("12" — "0" when no rewards earned)
 *        {{renew_link}}                     full HTTPS URL to /dashboard/plan?renew=1
 *     Set conditional rendering: hide the "AED N below takeout" bullet when
 *     `aed_saved` is empty; hide the "AED N earned in rewards" bullet when
 *     `aed_earned` is "0". Save → copy this Template Key into
 *     ZEPTOMAIL_TPL_RENEW_NUDGE.
 *
 *  4. Set env vars (.env.local AND Netlify dashboard):
 *        ZEPTOMAIL_API_TOKEN              (the full "Zoho-enczapikey ..." value)
 *        ZEPTOMAIL_REGION                 (optional, defaults to 'com')
 *        ZEPTOMAIL_FROM_ADDRESS           (e.g. 'orders@dormers.ae')
 *        ZEPTOMAIL_FROM_NAME              (e.g. 'Dormers')
 *        ZEPTOMAIL_TPL_ORDER_CONFIRMATION (Template Key from step 3)
 *        ZEPTOMAIL_TPL_START_DAY          (Template Key from step 4b)
 *        ZEPTOMAIL_TPL_RENEW_NUDGE        (Template Key from step 4c)
 */

import { fetchWithTimeout } from '@/infra/http/fetch-with-timeout';
import { SUPPORT_EMAIL } from '@/shared/contacts';

const VALID_ZEPTO_REGIONS = new Set(['com', 'eu', 'in', 'com.au', 'com.cn', 'sa'])
const REGION = (() => {
  const r = process.env.ZEPTOMAIL_REGION ?? 'com'
  if (!VALID_ZEPTO_REGIONS.has(r)) {
    throw new Error(`Invalid ZEPTOMAIL_REGION '${r}'. Must be one of: ${[...VALID_ZEPTO_REGIONS].join(', ')}`)
  }
  return r
})()
const API_URL = `https://api.zeptomail.${REGION}/v1.1/email/template`;
// Raw (non-template) send endpoint — used for internal ops alerts where the
// body is generated in code rather than from a ZeptoMail template.
const RAW_API_URL = `https://api.zeptomail.${REGION}/v1.1/email`;

// Post-payment fanout runs synchronously from the Stripe webhook AND from
// the hourly retry cron. 10s is generous for a templated send; longer than
// this and Stripe will retry the webhook before ZeptoMail finishes.
const SEND_TIMEOUT_MS = 10_000;

type MergeInfo = Record<string, string | number>;

async function sendTemplate(params: {
  templateKey: string;
  to: { email: string; name?: string };
  mergeInfo: MergeInfo;
}): Promise<void> {
  const token = process.env.ZEPTOMAIL_API_TOKEN;
  const fromAddress = process.env.ZEPTOMAIL_FROM_ADDRESS;
  const fromName = process.env.ZEPTOMAIL_FROM_NAME ?? 'Dormers';
  if (!token) throw new Error('ZEPTOMAIL_API_TOKEN is not set');
  if (!fromAddress) throw new Error('ZEPTOMAIL_FROM_ADDRESS is not set');

  const res = await fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      mail_template_key: params.templateKey,
      from: { address: fromAddress, name: fromName },
      to: [
        {
          email_address: {
            address: params.to.email,
            ...(params.to.name ? { name: params.to.name } : {}),
          },
        },
      ],
      merge_info: params.mergeInfo,
    }),
  }, { timeoutMs: SEND_TIMEOUT_MS });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ZeptoMail ${res.status}: ${text || res.statusText}`);
  }
}

/**
 * Internal ops alert — a raw-HTML email to the ops inbox (no ZeptoMail
 * template needed; reuses the same API token + from-address as the
 * customer-facing sends). Recipient is OPS_ALERT_EMAIL when set, else the
 * canonical SUPPORT_EMAIL. Used for manual-fulfilment rewards (e.g. the Dorm
 * Weekend event) so a high-effort unlock can't be silently dropped.
 *
 * Throws on send failure — callers that must not block on it should wrap in
 * try/catch (the durable record of the event lives in the DB regardless).
 */
export async function sendOpsAlertEmail(input: {
  subject: string;
  html: string;
}): Promise<void> {
  const token = process.env.ZEPTOMAIL_API_TOKEN;
  const fromAddress = process.env.ZEPTOMAIL_FROM_ADDRESS;
  const fromName = process.env.ZEPTOMAIL_FROM_NAME ?? 'Dormers';
  const to = process.env.OPS_ALERT_EMAIL ?? SUPPORT_EMAIL;
  if (!token) throw new Error('ZEPTOMAIL_API_TOKEN is not set');
  if (!fromAddress) throw new Error('ZEPTOMAIL_FROM_ADDRESS is not set');

  const res = await fetchWithTimeout(RAW_API_URL, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: { address: fromAddress, name: fromName },
      to: [{ email_address: { address: to } }],
      subject: input.subject,
      htmlbody: input.html,
    }),
  }, { timeoutMs: SEND_TIMEOUT_MS });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ZeptoMail ops alert ${res.status}: ${text || res.statusText}`);
  }
}

/**
 * High-level helper: send the post-payment "thanks for joining" receipt.
 * Merge variable names match the template documented in the setup header.
 */
export async function sendOrderConfirmationEmail(input: {
  toEmail: string;
  firstName: string;
  planName: string;
  firstDeliveryDateIso: string;
  mealsCount: number;
  totalAed: number;
  orderNumber: string;
}): Promise<void> {
  const templateKey = process.env.ZEPTOMAIL_TPL_ORDER_CONFIRMATION;
  if (!templateKey) throw new Error('ZEPTOMAIL_TPL_ORDER_CONFIRMATION is not set');

  const pretty = new Date(input.firstDeliveryDateIso + 'T00:00:00Z').toLocaleDateString(
    'en-GB',
    { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' },
  );

  await sendTemplate({
    templateKey,
    to: { email: input.toEmail, name: input.firstName },
    mergeInfo: {
      first_name: input.firstName,
      plan_name: input.planName,
      first_delivery_date_pretty: pretty,
      meals_count: input.mealsCount,
      total_aed: input.totalAed.toFixed(2),
      order_number: input.orderNumber,
      account_email: input.toEmail,
    },
  });
}

/**
 * Day-1 "Today's the day" email fired by the 9 AM AE cron on the
 * subscription's start_date. Sender stays as club@dormers.ae (same
 * brand voice as the post-payment welcome).
 */
export async function sendStartDayEmail(input: {
  toEmail: string;
  firstName: string;
  dormName?: string | null;
}): Promise<void> {
  const templateKey = process.env.ZEPTOMAIL_TPL_START_DAY;
  if (!templateKey) throw new Error('ZEPTOMAIL_TPL_START_DAY is not set');

  await sendTemplate({
    templateKey,
    to: { email: input.toEmail, name: input.firstName },
    mergeInfo: {
      first_name: input.firstName,
      dorm_or_default: input.dormName?.trim() || 'your dorm',
      account_email: input.toEmail,
    },
  });
}

/**
 * T-3 days renewal nudge — sent to customers whose Active subscription is
 * ending soon and who have NO Scheduled follow-on queued. Recap block in
 * the template body shows what they've already built this cycle (meals,
 * evenings, AED saved, AED earned) so the renewal reads as "keep going,"
 * not "commit again."
 *
 * `aedSaved` is null when the customer hasn't set their takeout benchmark;
 * the template hides the "AED N below takeout" bullet in that case rather
 * than fabricating a number. `aedEarned` of 0 hides the rewards bullet.
 *
 * `endDateIso` is the subscription's end_date (YYYY-MM-DD). Formatted to
 * "Fri 5 Jun" style — matches `first_delivery_date_pretty` in the order
 * confirmation so the brand date format stays consistent.
 */
export async function sendRenewNudgeEmail(input: {
  toEmail: string;
  firstName: string;
  planName: string;
  endDateIso: string;
  mealsDelivered: number;
  evenings: number;
  aedSaved: number | null;
  aedEarned: number;
  renewLink: string;
}): Promise<void> {
  const templateKey = process.env.ZEPTOMAIL_TPL_RENEW_NUDGE;
  if (!templateKey) throw new Error('ZEPTOMAIL_TPL_RENEW_NUDGE is not set');

  const pretty = new Date(input.endDateIso + 'T00:00:00Z').toLocaleDateString(
    'en-GB',
    { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' },
  );

  // Mustache treats any non-empty string as truthy in section blocks, so
  // we must send EMPTY strings (not "0") to hide a recap bullet. The
  // template uses {{#aed_saved}}...{{/aed_saved}} and
  // {{#aed_earned}}...{{/aed_earned}} sections that render only when these
  // values are non-empty.
  await sendTemplate({
    templateKey,
    to: { email: input.toEmail, name: input.firstName },
    mergeInfo: {
      first_name: input.firstName,
      plan_name: input.planName,
      end_date: pretty,
      meals_delivered: input.mealsDelivered,
      evenings: input.evenings,
      aed_saved: input.aedSaved == null ? '' : String(input.aedSaved),
      aed_earned: input.aedEarned > 0 ? String(input.aedEarned) : '',
      renew_link: input.renewLink,
    },
  });
}
