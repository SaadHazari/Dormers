#!/usr/bin/env node
/**
 * Verify the ops_access_link WhatsApp template is actually sendable.
 *
 * Written after the first submission came back APPROVED but broken: the
 * dynamic URL button had been created by typing `https://dormers.ae/{{1}}`
 * into the URL box, so Meta percent-encoded that placeholder as literal text
 * and appended its OWN variable after it, giving
 * `https://dormers.ae/%7B%7B1%7D%7D{{1}}`. Every link would have resolved to a
 * dead page.
 *
 * That failure mode is the dangerous one: the send SUCCEEDS, so the wa.me
 * fallback never fires and nobody finds out until a rider says the link does
 * not work. APPROVED is not the same as correct, and only reading back what
 * Meta stored can tell the two apart.
 *
 *   node scripts/check-whatsapp-template.mjs [template_name]
 *
 * Exits 0 when the template is sendable, 1 otherwise.
 */

import fs from 'node:fs'
import path from 'node:path'

const GRAPH_VERSION = 'v22.0'
const DEFAULT_TEMPLATE = 'ops_access_link'

// Env comes from the process first (CI, Netlify) and falls back to .env.local
// so this is runnable straight from a checkout.
function loadEnv() {
  const env = { ...process.env }
  const local = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(local)) {
    for (const line of fs.readFileSync(local, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}

const env = loadEnv()
const wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID
const token = env.WHATSAPP_ACCESS_TOKEN
const name = process.argv[2] ?? env.WHATSAPP_OPS_LINK_TEMPLATE_NAME ?? DEFAULT_TEMPLATE
const wantLang = env.WHATSAPP_OPS_LINK_TEMPLATE_LANG ?? 'en'

if (!wabaId || !token) {
  console.error('Missing WHATSAPP_BUSINESS_ACCOUNT_ID or WHATSAPP_ACCESS_TOKEN.')
  process.exit(1)
}

const problems = []
const notes = []

const res = await fetch(
  `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates` +
  `?limit=200&fields=name,language,status,category,components`,
  { headers: { Authorization: `Bearer ${token}` } },
)
const body = await res.json()
if (body.error) {
  console.error('Meta rejected the read:', body.error.message)
  process.exit(1)
}

const tpl = body.data.find(t => t.name === name)
if (!tpl) {
  console.error(`No template named "${name}" on this WhatsApp Business Account.`)
  console.error(`Templates found: ${body.data.map(t => t.name).join(', ')}`)
  process.exit(1)
}

console.log(`${tpl.name} | ${tpl.language} | ${tpl.status} | ${tpl.category}`)

if (tpl.status !== 'APPROVED') problems.push(`Status is ${tpl.status}, not APPROVED. Sends will fail until Meta approves it.`)
if (tpl.language !== wantLang) problems.push(`Language is "${tpl.language}" but the code sends "${wantLang}". Set WHATSAPP_OPS_LINK_TEMPLATE_LANG=${tpl.language}.`)
if (tpl.category !== 'UTILITY') notes.push(`Category is ${tpl.category}; UTILITY is expected for an ops link.`)

const body_ = tpl.components.find(c => c.type === 'BODY')
const buttons = tpl.components.find(c => c.type === 'BUTTONS')
const footer = tpl.components.find(c => c.type === 'FOOTER')

// ── Body: the code sends NAMED parameters, so numbered ones are fatal ───────
if (!body_) {
  problems.push('No BODY component.')
} else {
  const named = body_.example?.body_text_named_params?.map(p => p.param_name) ?? []
  for (const required of ['name', 'link_name']) {
    if (!named.includes(required)) {
      problems.push(`Body is missing the named variable {{${required}}}. Found: ${named.length ? named.join(', ') : 'none (numbered variables?)'}. The code sends named parameters and Meta rejects positional ones against a named template.`)
    }
  }
}

// ── Button: the one that broke ─────────────────────────────────────────────
const btn = buttons?.buttons?.find(b => b.type === 'URL')
if (!btn) {
  problems.push('No URL button. The link travels in the button, so there is nothing to open without it.')
} else {
  const url = btn.url ?? ''
  if (url.includes('%7B%7B') || url.includes('%7D%7D')) {
    problems.push(`Button URL contains a percent-encoded placeholder: ${url}\n    The literal text {{1}} was typed into the URL box. In Meta's UI enter ONLY the base "https://dormers.ae/" and let Meta append the variable.`)
  } else if (!/\{\{1\}\}$/.test(url)) {
    problems.push(`Button URL is "${url}" — it must END with {{1}} (a dynamic suffix). A static button makes Meta reject the send with error 132018.`)
  } else if (!url.startsWith('https://dormers.ae/')) {
    problems.push(`Button URL base is "${url}" — expected it to start with https://dormers.ae/`)
  }
  // Count the variables Meta will substitute: exactly one, at the end.
  const varCount = (url.match(/\{\{\d+\}\}/g) ?? []).length
  if (varCount > 1) problems.push(`Button URL has ${varCount} variables; the code sends exactly one suffix.`)
}

// ── Footer: silently clipped at Meta's 60-character limit ──────────────────
if (footer?.text) {
  if (footer.text.length >= 60) {
    problems.push(`Footer is ${footer.text.length} characters and reads "${footer.text}" — Meta's limit is 60 and it clips without warning. Shorten it.`)
  } else if (/[a-z]$/.test(footer.text)) {
    notes.push(`Footer ends mid-word without punctuation: "${footer.text}". Check it was not truncated.`)
  }
}

if (notes.length) {
  console.log('\nWorth a look:')
  for (const n of notes) console.log(`  - ${n}`)
}

if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length > 1 ? 's' : ''} — this template is NOT safe to send:`)
  for (const p of problems) console.log(`  ✗ ${p}`)
  console.log('\nMeta refuses edits to this template over the API (error 2388039).')
  console.log('Fix it in WhatsApp Manager, or create a new template and point')
  console.log('WHATSAPP_OPS_LINK_TEMPLATE_NAME at it.')
  process.exit(1)
}

console.log('\n✓ Sendable. Named body variables, dynamic button ending in {{1}}, footer within limits.')
