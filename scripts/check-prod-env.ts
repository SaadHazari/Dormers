// Production env check — run before `git push origin main:Production`:
//
//   npm run check:prod-env
//
// Why this exists: the code can need an env key that Netlify production does
// not have. .env.local has it, so everything works locally, and the deploy
// builds green. The first person to use the feature finds out. That happened
// with WHATSAPP_BUSINESS_ACCOUNT_ID on the broadcast page (Sentry
// JAVASCRIPT-NEXTJS-1H).
//
// Method: ask the Netlify CLI (already logged in) which keys production has,
// and compare with every rule ENV_RULES expects in production. Presence only;
// no values are read or printed.

import { execFileSync } from 'node:child_process'
import { validateEnv } from '../src/infra/config/env-schema'

const raw = execFileSync('netlify', ['env:list', '--context', 'production', '--json'], { encoding: 'utf8' })
const keys = Object.keys(JSON.parse(raw) as Record<string, string>)

// Stand-in values: only presence matters here, so skip the format checks.
const present = Object.fromEntries(keys.map((k) => [k, 'set']))
const { missing } = validateEnv(present, 'production')

if (missing.length === 0) {
  console.log(`OK: Netlify production has every key the app expects (${keys.length} keys set).`)
} else {
  console.log('Netlify production is missing:')
  for (const rule of missing) {
    console.log(`  ${rule.key}${rule.description ? ` (${rule.description})` : ''}`)
  }
  process.exitCode = 1
}
