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
 *  4d. ALSO create a `staff-invite` template (the on-command intern claim
 *     code email fired from /admin/staff). Merge variables it uses:
 *        {{first_name}}
 *        {{claim_code}}                     ("K3QF-7WMP")
 *        {{expires_pretty}}                 ("19 June")
 *     Save → copy this Template Key into ZEPTOMAIL_TPL_STAFF_INVITE.
 *     (Until that env var is set, the code falls back to an inline raw-HTML
 *     send with identical copy — the button works either way.)
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
 * Staff invite — the claim code an admin fires on command from /admin/staff.
 * Raw-HTML send (no ZeptoMail dashboard template needed): the body is small,
 * personal, and changes with the code anyway. Visual language follows the
 * EMAIL brand rules (#FF8C00 accent, #757575 gray, Helvetica Neue) — NOT the
 * dashboard tokens.
 */
export async function sendStaffInviteEmail(input: {
  toEmail: string;
  firstName: string;
  code: string;
  expiresPretty: string; // e.g. "19 June"
}): Promise<void> {
  // Preferred path: the dashboard-managed `staff-invite` template (step 4d
  // above) — same convention as every other customer email. The inline
  // raw-HTML below is the fallback so the admin button works before the
  // template key exists.
  const staffTemplateKey = process.env.ZEPTOMAIL_TPL_STAFF_INVITE;
  if (staffTemplateKey) {
    await sendTemplate({
      templateKey: staffTemplateKey,
      to: { email: input.toEmail, name: input.firstName },
      mergeInfo: {
        first_name: input.firstName,
        claim_code: input.code,
        expires_pretty: input.expiresPretty,
      },
    });
    return;
  }

  const token = process.env.ZEPTOMAIL_API_TOKEN;
  const fromAddress = process.env.ZEPTOMAIL_FROM_ADDRESS;
  const fromName = process.env.ZEPTOMAIL_FROM_NAME ?? 'Dormers';
  if (!token) throw new Error('ZEPTOMAIL_API_TOKEN is not set');
  if (!fromAddress) throw new Error('ZEPTOMAIL_FROM_ADDRESS is not set');

  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://dormers.ae';
  const claimUrl = `${base}/staff/claim`;
  // StoryBrand structure: the intern is the hero (status moment: "You're in"),
  // Dormers is the guide, one concrete success picture (hot dinner at the
  // door, zero cooking), a numbered 3-step plan, ONE direct CTA, and honest
  // stakes (single-use code + expiry). No feature lists, no hero-brand talk.
  const html = `
  <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:36px 24px;color:#333333;">
    <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#FF8C00;font-weight:bold;margin:0 0 10px;">Welcome to the team</p>
    <h1 style="font-size:26px;line-height:1.2;margin:0 0 14px;color:#222222;">You're in, ${input.firstName}.</h1>
    <p style="font-size:15px;line-height:1.65;color:#757575;margin:0 0 8px;">
      You make things people stop scrolling for — so while you create for Dormers,
      <strong style="color:#333333;">dinner is our job.</strong> A hot, chef-cooked meal at your
      door between 7 and 8 every evening. No planning, no cooking, no bill.
    </p>
    <p style="font-size:15px;line-height:1.65;color:#757575;margin:0 0 22px;">
      Claiming it takes about two minutes:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px;">
      <tr>
        <td style="vertical-align:top;padding:0 12px 14px 0;"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:#FF8C00;color:#ffffff;font-size:14px;font-weight:bold;">1</span></td>
        <td style="font-size:14.5px;line-height:1.55;color:#333333;padding:2px 0 14px;">Tap the button below — it opens your claim page.</td>
      </tr>
      <tr>
        <td style="vertical-align:top;padding:0 12px 14px 0;"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:#FF8C00;color:#ffffff;font-size:14px;font-weight:bold;">2</span></td>
        <td style="font-size:14.5px;line-height:1.55;color:#333333;padding:2px 0 14px;">Enter <strong>this email address</strong> and your code.</td>
      </tr>
      <tr>
        <td style="vertical-align:top;padding:0 12px 0 0;"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:#FF8C00;color:#ffffff;font-size:14px;font-weight:bold;">3</span></td>
        <td style="font-size:14.5px;line-height:1.55;color:#333333;padding:2px 0 0;">Pick your meals — veg or non-veg, your spice level, your days. All yours to choose.</td>
      </tr>
    </table>
    <div style="text-align:center;margin:0 0 10px;">
      <p style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#757575;font-weight:bold;margin:0 0 8px;">Your code</p>
      <div style="display:inline-block;padding:16px 28px;border:2px dashed #FF8C00;border-radius:12px;font-size:26px;font-weight:bold;letter-spacing:6px;color:#222222;">${input.code}</div>
    </div>
    <div style="text-align:center;margin:18px 0 26px;">
      <a href="${claimUrl}" style="display:inline-block;background:#FF8C00;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:15px 36px;border-radius:10px;">Claim your meals &rarr;</a>
    </div>
    <p style="font-size:13px;line-height:1.6;color:#757575;margin:0 0 18px;">
      This code is yours alone — it works once and expires on <strong style="color:#333333;">${input.expiresPretty}</strong>.
      First dinner can land as early as tomorrow night.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#333333;margin:0;">
      Glad to have you on board.<br/>
      <strong>Team Dormers&rsquo;</strong>
    </p>
  </div>`;

  const res = await fetchWithTimeout(RAW_API_URL, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: { address: fromAddress, name: fromName },
      to: [{ email_address: { address: input.toEmail, name: input.firstName } }],
      subject: `You're in, ${input.firstName} — your Dormers meals are ready to claim`,
      htmlbody: html,
    }),
  }, { timeoutMs: SEND_TIMEOUT_MS });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ZeptoMail staff invite ${res.status}: ${text || res.statusText}`);
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

/**
 * Refund confirmation email — fired from handleChargeRefunded after Stripe
 * processes a full or partial refund. Conditional "wallet credit restored"
 * section renders only when credits_restored is non-empty.
 */
export async function sendRefundProcessedEmail(input: {
  toEmail: string;
  firstName: string;
  refundAed: string;
  orderNumber: string;
  creditsRestored: boolean;
}): Promise<void> {
  const templateKey = process.env.ZEPTOMAIL_TPL_REFUND_PROCESSED;
  if (!templateKey) throw new Error('ZEPTOMAIL_TPL_REFUND_PROCESSED is not set');

  await sendTemplate({
    templateKey,
    to: { email: input.toEmail, name: input.firstName },
    mergeInfo: {
      first_name: input.firstName,
      refund_aed: input.refundAed,
      order_number: input.orderNumber,
      credits_restored: input.creditsRestored ? 'yes' : '',
    },
  });
}

/**
 * Subscription ended email — fired when subscription_status_tick flips a sub
 * to Ended. Mirrors the renewal nudge recap format with the same conditional
 * savings/rewards blocks.
 */
export async function sendSubscriptionEndedEmail(input: {
  toEmail: string;
  firstName: string;
  planName: string;
  mealsDelivered: number;
  evenings: number;
  aedSaved: number | null;
  aedEarned: number;
  renewLink: string;
}): Promise<void> {
  const templateKey = process.env.ZEPTOMAIL_TPL_SUBSCRIPTION_ENDED;
  if (!templateKey) throw new Error('ZEPTOMAIL_TPL_SUBSCRIPTION_ENDED is not set');

  await sendTemplate({
    templateKey,
    to: { email: input.toEmail, name: input.firstName },
    mergeInfo: {
      first_name: input.firstName,
      plan_name: input.planName,
      meals_delivered: input.mealsDelivered,
      evenings: input.evenings,
      aed_saved: input.aedSaved == null ? '' : String(input.aedSaved),
      aed_earned: input.aedEarned > 0 ? String(input.aedEarned) : '',
      renew_link: input.renewLink,
    },
  });
}
