#!/usr/bin/env node
// scripts/send-renew-nudge-test.mjs
//
// One-off test send for the renew-nudge ZeptoMail template. Replicates the
// sendRenewNudgeEmail logic from src/infra/zeptomail/client.ts inline so we
// don't need a TS build step for a smoke test.
//
// Run:
//   node --env-file=.env.local scripts/send-renew-nudge-test.mjs
//
// Override the recipient via TEST_TO_EMAIL=foo@bar.com.

const TO_EMAIL       = process.env.TEST_TO_EMAIL ?? 'saadhazari01@gmail.com'
const FIRST_NAME     = 'Saad'
const PLAN_NAME      = 'Monthly Premium'
const END_DATE_ISO   = '2026-06-04'   // T-3 from today (2026-06-01)
const MEALS_DELIVERED = 21
const EVENINGS       = 21
const AED_SAVED      = 184
const AED_EARNED     = 12
const RENEW_LINK     = 'https://dormers.ae/dashboard/plan?renew=1'

const region      = process.env.ZEPTOMAIL_REGION ?? 'com'
const API_URL     = `https://api.zeptomail.${region}/v1.1/email/template`
const token       = process.env.ZEPTOMAIL_API_TOKEN
const fromAddress = process.env.ZEPTOMAIL_FROM_ADDRESS
const fromName    = process.env.ZEPTOMAIL_FROM_NAME ?? 'Dormers'
const templateKey = process.env.ZEPTOMAIL_TPL_RENEW_NUDGE

if (!token)       { console.error('✘ ZEPTOMAIL_API_TOKEN is not set');       process.exit(1) }
if (!fromAddress) { console.error('✘ ZEPTOMAIL_FROM_ADDRESS is not set');    process.exit(1) }
if (!templateKey) { console.error('✘ ZEPTOMAIL_TPL_RENEW_NUDGE is not set'); process.exit(1) }

// Format end_date as "Fri 5 Jun" — matches sendRenewNudgeEmail in
// src/infra/zeptomail/client.ts.
const pretty = new Date(END_DATE_ISO + 'T00:00:00Z').toLocaleDateString(
  'en-GB',
  { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' },
)

// ZeptoMail's Mustache engine treats empty strings as TRUTHY (Mustache
// spec), so hiding a recap bullet requires OMITTING the merge key entirely.
// Mirror the helper's coercion in src/infra/zeptomail/client.ts.
const mergeInfo = {
  first_name:      FIRST_NAME,
  plan_name:       PLAN_NAME,
  end_date:        pretty,
  meals_delivered: MEALS_DELIVERED,
  evenings:        EVENINGS,
  ...(AED_SAVED == null ? {} : { aed_saved: String(AED_SAVED) }),
  ...(AED_EARNED > 0 ? { aed_earned: String(AED_EARNED) } : {}),
  renew_link:      RENEW_LINK,
}

console.log('→ Sending renew-nudge')
console.log('  to:        ', TO_EMAIL)
console.log('  from:      ', `${fromName} <${fromAddress}>`)
console.log('  template:  ', templateKey.slice(0, 12) + '…')
console.log('  merge_info:', mergeInfo)

const res = await fetch(API_URL, {
  method: 'POST',
  headers: {
    Authorization: token,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify({
    mail_template_key: templateKey,
    from: { address: fromAddress, name: fromName },
    to:   [{ email_address: { address: TO_EMAIL, name: FIRST_NAME } }],
    merge_info: mergeInfo,
  }),
})

const text = await res.text()
if (!res.ok) {
  console.error(`✘ ZeptoMail ${res.status}: ${text || res.statusText}`)
  process.exit(1)
}

console.log('✔ Sent successfully')
console.log('  response:', text)
