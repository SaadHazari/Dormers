#!/usr/bin/env node
// scripts/send-season-test-emails.mjs
//
// Sends one of every season email to a real inbox, so the templates can be
// read in Gmail before a customer ever gets one. Mirrors sendSeasonTemplateEmail
// in src/infra/zeptomail/client.ts inline, so no TS build step is needed.
//
// Run (after the templates exist in ZeptoMail and their keys are in .env.local):
//   node --env-file=.env.local scripts/send-season-test-emails.mjs
//
//   TEST_TO_EMAIL=someone@example.com   send somewhere else
//   ONLY=season-plan-held               send just one
//
// A template whose key is not set yet is skipped and listed at the end, so the
// script is useful while they are being added one at a time.

const TO_EMAIL = process.env.TEST_TO_EMAIL ?? 'saadhazari01@gmail.com'
const ONLY = process.env.ONLY ?? null
const FIRST_NAME = 'Saad'

const region = process.env.ZEPTOMAIL_REGION ?? 'com'
const API_URL = `https://api.zeptomail.${region}/v1.1/email/template`
const token = process.env.ZEPTOMAIL_API_TOKEN
const fromAddress = process.env.ZEPTOMAIL_FROM_ADDRESS
const fromName = process.env.ZEPTOMAIL_FROM_NAME ?? 'Dormers'

if (!token) { console.error('✘ ZEPTOMAIL_API_TOKEN is not set'); process.exit(1) }
if (!fromAddress) { console.error('✘ ZEPTOMAIL_FROM_ADDRESS is not set'); process.exit(1) }

// The sample numbers a real customer would see. Every optional key is present
// on purpose, amounts and can_refund alike, so each conditional block renders
// in the test send. A real send leaves out whatever does not apply: no credit
// means no credit line, and no refundable payment means no refund block.
const SENDS = [
  { name: 'season-plan-runs-past', env: 'ZEPTOMAIL_TPL_SEASON_PLAN_RUNS_PAST', merge: { wrap_up_day: 'Sat 3 Oct', held_meals: '9', credit_aed: '20', can_refund: 'yes' } },
  { name: 'season-last-dinners', env: 'ZEPTOMAIL_TPL_SEASON_LAST_DINNERS', merge: { last_dinner: 'Thu 1 Oct', wrap_up_day: 'Sat 3 Oct', offer_aed: '15' } },
  { name: 'season-plan-held', env: 'ZEPTOMAIL_TPL_SEASON_PLAN_HELD', merge: { plan_name: 'Monthly Premium', held_meals: '9', credit_aed: '20', can_refund: 'yes' } },
  { name: 'season-pause-carries', env: 'ZEPTOMAIL_TPL_SEASON_PAUSE_CARRIES', merge: { plan_name: 'Monthly Premium', offer_aed: '15', can_refund: 'yes' } },
  { name: 'season-plan-ready', env: 'ZEPTOMAIL_TPL_SEASON_PLAN_READY', merge: { plan_name: 'Monthly Premium', held_meals: '9', credit_aed: '20' } },
  { name: 'season-credit-waiting', env: 'ZEPTOMAIL_TPL_SEASON_CREDIT_WAITING', merge: { credit_aed: '20' } },
  { name: 'season-spot-saved', env: 'ZEPTOMAIL_TPL_SEASON_SPOT_SAVED', merge: { credit_aed: '20' } },
  { name: 'season-refund-declined', env: 'ZEPTOMAIL_TPL_SEASON_REFUND_DECLINED', merge: { plan_name: 'Monthly Premium', held_meals: '9', reason: 'The card on this order has expired, so the money cannot go back to it. Message us on WhatsApp and we will arrange a bank transfer instead.' } },
]

const chosen = ONLY ? SENDS.filter((s) => s.name === ONLY) : SENDS
if (chosen.length === 0) { console.error(`✘ no template named ${ONLY}`); process.exit(1) }

const missing = []
const failed = []
let sent = 0

for (const item of chosen) {
  const templateKey = process.env[item.env]
  if (!templateKey) { missing.push(`${item.name} (${item.env})`); continue }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      mail_template_key: templateKey,
      from: { address: fromAddress, name: fromName },
      to: [{ email_address: { address: TO_EMAIL, name: FIRST_NAME } }],
      merge_info: { first_name: FIRST_NAME, ...item.merge },
    }),
  })
  const text = await res.text()
  if (!res.ok) { failed.push(`${item.name}: ZeptoMail ${res.status} ${text || res.statusText}`); continue }
  sent += 1
  console.log(`✔ ${item.name}`)
}

console.log(`\n${sent} sent to ${TO_EMAIL}`)
if (missing.length) console.log(`\nNot set up yet, so skipped:\n  ${missing.join('\n  ')}`)
if (failed.length) { console.error(`\nFailed:\n  ${failed.join('\n  ')}`); process.exit(1) }
