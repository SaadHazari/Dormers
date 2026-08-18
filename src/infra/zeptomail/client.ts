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
 *        {{aed_saved}}                      ("184" — key OMITTED when no benchmark)
 *        {{aed_earned}}                     ("12" — key OMITTED when no rewards)
 *        {{renew_link}}                     full HTTPS URL to /dashboard/plan?renew=1
 *     Conditional rendering: the template wraps the savings/rewards bullets
 *     in {{#aed_saved}}/{{#aed_earned}} Mustache sections. ZeptoMail treats
 *     empty strings as TRUTHY (Mustache spec), so the send helpers omit the
 *     merge key entirely to hide a bullet — never send "" or "0". Save →
 *     copy this Template Key into ZEPTOMAIL_TPL_RENEW_NUDGE.
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
import { getCircuitBreaker } from '@/infra/http/circuit-breaker';

// Release It! L4: a sustained ZeptoMail outage trips this breaker so the
// post-payment fanout + retry-cron fast-fail instead of repeatedly paying the
// full send timeout against a dead mail API. Wraps the timeout-bounded send.
const ZEPTO_BREAKER = { failureThreshold: 5, recoveryTimeMs: 60_000 };
function zeptoFetch(url: string, init: RequestInit, opts: { timeoutMs: number }) {
  return getCircuitBreaker('zeptomail', ZEPTO_BREAKER).run(() => fetchWithTimeout(url, init, opts));
}
import { SUPPORT_EMAIL, whatsAppHref } from '@/shared/contacts';

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

  const res = await zeptoFetch(API_URL, {
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

  const res = await zeptoFetch(RAW_API_URL, {
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

  const res = await zeptoFetch(RAW_API_URL, {
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

  // ZeptoMail's Mustache engine follows the Mustache spec: empty strings
  // are TRUTHY in section blocks (only absent/false/empty-list are falsy).
  // Sending '' rendered the recap bullet with a blank where the number
  // should be (live bug, July 2026). To hide a bullet the key must be
  // OMITTED from merge_info entirely. The template uses
  // {{#aed_saved}}/{{#aed_earned}} sections plus a {{^aed_earned}}
  // inverted "earn rewards next cycle" nudge.
  await sendTemplate({
    templateKey,
    to: { email: input.toEmail, name: input.firstName },
    mergeInfo: {
      first_name: input.firstName,
      plan_name: input.planName,
      end_date: pretty,
      meals_delivered: input.mealsDelivered,
      evenings: input.evenings,
      ...(input.aedSaved == null ? {} : { aed_saved: String(input.aedSaved) }),
      ...(input.aedEarned > 0 ? { aed_earned: String(input.aedEarned) } : {}),
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

  // Omit the key (never '') to hide the section — ZeptoMail's Mustache
  // treats empty strings as truthy, so '' would render it anyway.
  await sendTemplate({
    templateKey,
    to: { email: input.toEmail, name: input.firstName },
    mergeInfo: {
      first_name: input.firstName,
      refund_aed: input.refundAed,
      order_number: input.orderNumber,
      ...(input.creditsRestored ? { credits_restored: 'yes' } : {}),
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

  // Same merge-key convention as sendRenewNudgeEmail: omit (never '') to
  // hide a conditional recap bullet — ZeptoMail treats '' as truthy.
  await sendTemplate({
    templateKey,
    to: { email: input.toEmail, name: input.firstName },
    mergeInfo: {
      first_name: input.firstName,
      plan_name: input.planName,
      meals_delivered: input.mealsDelivered,
      evenings: input.evenings,
      ...(input.aedSaved == null ? {} : { aed_saved: String(input.aedSaved) }),
      ...(input.aedEarned > 0 ? { aed_earned: String(input.aedEarned) } : {}),
      renew_link: input.renewLink,
    },
  });
}

/**
 * Season plan-ended email — replaces sendSubscriptionEndedEmail whenever
 * intake is paused, because that email's "Renew now" CTA points at a checkout
 * that refuses the customer for as long as the switch is on.
 *
 * Which block renders is decided upstream by resolveEndedNotice (see
 * src/contexts/notifications/domain/pause-suppression.ts), not here — this
 * function just faithfully sends what it is handed.
 *
 * Template: docs/email-templates/season-plan-ended.html.
 */
export async function sendSeasonPlanEndedEmail(input: {
  toEmail: string;
  firstName: string;
  planName: string;
  mealsDelivered: number;
  evenings: number;
  /** 'credit' → they already hold it. 'offer' → we are offering it. */
  block: 'credit' | 'offer';
  aed: number;
  ctaLabel: string;
  ctaUrl: string;
}): Promise<void> {
  const templateKey = process.env.ZEPTOMAIL_TPL_SEASON_PLAN_ENDED;
  if (!templateKey) throw new Error('ZEPTOMAIL_TPL_SEASON_PLAN_ENDED is not set');

  // credit_aed and offer_aed are mutually exclusive and the unused one must be
  // OMITTED, never sent as '' — ZeptoMail Mustache treats an empty string as
  // truthy and would render both blocks.
  await sendTemplate({
    templateKey,
    to: { email: input.toEmail, name: input.firstName },
    mergeInfo: {
      first_name: input.firstName,
      plan_name: input.planName,
      delivered_meals: String(input.mealsDelivered),
      evenings: String(input.evenings),
      cta_label: input.ctaLabel,
      cta_url: input.ctaUrl,
      ...(input.block === 'credit'
        ? { credit_aed: String(input.aed) }
        : { offer_aed: String(input.aed) }),
    },
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Wrap an admin-authored plain-text message in the approved Dormers email
 * shell. Mirrors docs/email-templates/_brand-reference-start-day.html exactly:
 * the #FF8C00 2px-bordered white card, Helvetica Neue, #757575 body, the
 * dark-mode @media block, an optional green Care-Team box, the "Team Dormers"
 * sign-off, and the "Made with ♥️ in Dubai" footer mantra.
 *
 * Plain-text → HTML: blank lines split paragraphs, single newlines become
 * <br>, and the text is HTML-escaped so admin input can't inject markup.
 */
function buildAdminCustomerEmailHtml(firstName: string, bodyText: string, includeSupportBox: boolean): string {
  const paragraphs = bodyText.trim().split(/\n{2,}/).map(p =>
    `<p style="margin:0 0 18px;line-height:26px;"><span style="font-size:16px;">${escHtml(p).replace(/\n/g, '<br>')}</span></p>`,
  ).join('');

  const supportBox = includeSupportBox ? `
              <table width="100%" border="0" cellspacing="0" cellpadding="0" class="sub-container-green" style="background-color:#f2faf3;border:1.2px solid #2e7d32;border-radius:8px;margin:30px 0 0;">
                <tbody><tr><td style="padding:26px;">
                  <p style="margin:0 0 8px;text-transform:uppercase;"><span style="color:rgb(46,125,50);"><b><span style="font-size:14px;">💬 Dormers Care Team</span></b></span></p>
                  <p style="margin:0 0 16px;line-height:24px;"><span style="color:rgb(117,117,117);"><span style="font-size:15px;">Questions, or need a hand with anything? We're a tap away on WhatsApp, usually replying within an hour.</span></span></p>
                  <a href="${whatsAppHref()}" style="background-color:#2e7d32;color:#ffffff;padding:12px 20px;text-decoration:none;font-size:14px;font-weight:700;border-radius:6px;display:inline-block;">Chat with Support</a>
                </td></tr></tbody>
              </table>` : '';

  return `
  <div>
    <style>
      @media (prefers-color-scheme: dark) {
        .main-card { border: 2px solid #FF8C00 !important; background-color: #1a1a1a !important; }
        .text-content { color: #fcfcfc !important; }
        .sub-container-green { background-color: #0d1a10 !important; border: 1.2px solid #2e7d32 !important; }
        .footer-text { color: #555555 !important; }
      }
    </style>
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 10px;">
      <tbody>
        <tr>
          <td align="center">
            <table class="main-card" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border: 2px solid #FF8C00; border-radius: 13px; overflow: hidden;">
              <tbody>
                <tr>
                  <td class="text-content" style="padding: 42px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #757575; font-weight: 500;">
                    <p style="margin:0 0 10px;text-transform:uppercase;"><span style="color:rgb(255,140,0);"><b><span style="font-size:13px;letter-spacing:1px;">A note from Dormers</span></b></span></p>
                    <h1 style="margin: 0 0 22px 0; font-size: 24px; line-height: 1.25; font-weight: 700; color: #757575;">Hi ${escHtml(firstName)},</h1>
                    ${paragraphs}${supportBox}
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px solid #eeeeee; padding-top: 26px; margin-top: 30px;">
                      <tbody>
                        <tr><td style="font-size: 14px; line-height: 22px; color: #757575;">Warmly,<br><span style="color:rgb(117,117,117);"><b><span style="font-size:16px;">Team Dormers</span></b></span></td></tr>
                        <tr><td class="footer-text" align="center" style="padding-top: 42px; font-size: 12px; color: #b0b0b0; letter-spacing: 1px; text-transform: uppercase;">Made with ♥️ in Dubai</td></tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

/**
 * Admin-composed, on-brand message sent to a single customer from the admin
 * panel. The admin writes the subject + body; the body is wrapped in the
 * approved Dormers shell (buildAdminCustomerEmailHtml). Raw-HTML send through
 * the same breaker-wrapped path as the other transactional emails.
 *
 * Throws on send failure — the caller (sendCustomerEmail action) records the
 * failure and surfaces a friendly error, so the circuit-breaker open state
 * degrades gracefully instead of crashing.
 */
export async function sendAdminCustomerEmail(input: {
  toEmail: string;
  firstName: string;
  subject: string;
  bodyText: string;
  includeSupportBox?: boolean;
}): Promise<void> {
  const token = process.env.ZEPTOMAIL_API_TOKEN;
  const fromAddress = process.env.ZEPTOMAIL_FROM_ADDRESS;
  const fromName = process.env.ZEPTOMAIL_FROM_NAME ?? 'Dormers';
  if (!token) throw new Error('ZEPTOMAIL_API_TOKEN is not set');
  if (!fromAddress) throw new Error('ZEPTOMAIL_FROM_ADDRESS is not set');

  const html = buildAdminCustomerEmailHtml(input.firstName, input.bodyText, input.includeSupportBox ?? true);

  const res = await zeptoFetch(RAW_API_URL, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: { address: fromAddress, name: fromName },
      to: [{ email_address: { address: input.toEmail, name: input.firstName } }],
      subject: input.subject,
      htmlbody: html,
    }),
  }, { timeoutMs: SEND_TIMEOUT_MS });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ZeptoMail admin message ${res.status}: ${text || res.statusText}`);
  }
}

/**
 * One broadcast recipient. Raw-HTML send through the same breaker-wrapped
 * path as every transactional email — the DISPATCHER is what protects
 * transactional traffic, by stopping its batch the moment the breaker opens
 * rather than hammering a struggling ZeptoMail with hundreds of sends.
 */
export async function sendBroadcastEmail(input: {
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
}): Promise<void> {
  const token = process.env.ZEPTOMAIL_API_TOKEN;
  const fromAddress = process.env.ZEPTOMAIL_FROM_ADDRESS;
  const fromName = process.env.ZEPTOMAIL_FROM_NAME ?? 'Dormers';
  if (!token) throw new Error('ZEPTOMAIL_API_TOKEN is not set');
  if (!fromAddress) throw new Error('ZEPTOMAIL_FROM_ADDRESS is not set');

  const res = await zeptoFetch(RAW_API_URL, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      from: { address: fromAddress, name: fromName },
      to: [{ email_address: { address: input.toEmail, name: input.toName } }],
      subject: input.subject,
      htmlbody: input.html,
    }),
  }, { timeoutMs: SEND_TIMEOUT_MS });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ZeptoMail broadcast ${res.status}: ${text || res.statusText}`);
  }
}
