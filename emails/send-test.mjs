import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const TOKEN = process.env.ZEPTOMAIL_API_TOKEN;
const FROM = process.env.ZEPTOMAIL_FROM_ADDRESS;
const FROM_NAME = process.env.ZEPTOMAIL_FROM_NAME ?? 'Dormers';
const REGION = process.env.ZEPTOMAIL_REGION ?? 'com';
const API = `https://api.zeptomail.${REGION}/v1.1/email`;
const TO = 'saadhazari01@gmail.com';

function render(html, vars) {
  let out = html;
  for (const [k, v] of Object.entries(vars)) {
    if (v === '') {
      out = out.replace(new RegExp(`\\{\\{#${k}\\}\\}[\\s\\S]*?\\{\\{/${k}\\}\\}`, 'g'), '');
    } else {
      out = out.replace(new RegExp(`\\{\\{#${k}\\}\\}`, 'g'), '');
      out = out.replace(new RegExp(`\\{\\{/${k}\\}\\}`, 'g'), '');
    }
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

async function send(subject, html) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: TOKEN,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: { address: FROM, name: FROM_NAME },
      to: [{ email_address: { address: TO, name: 'Saad' } }],
      subject,
      htmlbody: html,
    }),
  });
  const text = await res.text();
  console.log(`${subject} → ${res.status}`, text);
}

const refundHtml = readFileSync(resolve(__dirname, 'refund-processed.html'), 'utf8');
const endedHtml = readFileSync(resolve(__dirname, 'subscription-ended.html'), 'utf8');

const refundRendered = render(refundHtml, {
  first_name: 'Saad',
  refund_aed: '89.50',
  order_number: 'cs_test_a1b2c3d4e5f6',
  credits_restored: 'yes',
});

const endedRendered = render(endedHtml, {
  first_name: 'Saad',
  plan_name: 'Monthly Premium',
  meals_delivered: '21',
  evenings: '21',
  aed_saved: '184',
  aed_earned: '40',
  renew_link: 'https://dormers.ae/dashboard/plan?renew=1',
});

await send('Your AED 89.50 refund has been processed', refundRendered);
await send('21 meals down — thanks for a great run, Saad', endedRendered);

console.log('\nBoth sent to', TO);
