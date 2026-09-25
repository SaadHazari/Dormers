/**
 * Tests for validateEnv — context resolution, required vs prodOnly handling,
 * and format checks. Uses explicit env objects so we never touch process.env.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateEnv, resolveEnvContext, ENV_RULES, PLATFORM_ENV_KEYS } from './env-schema'

// A minimal env that satisfies every "required everywhere" core rule.
const coreEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://ref.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk_x',
  SUPABASE_SERVICE_ROLE_KEY: 'service_x',
  NEXT_PUBLIC_BASE_URL: 'https://dormers.ae',
  OTP_PEPPER: 'pepper',
}

function prodEnv(): Record<string, string> {
  const env: Record<string, string> = { ...coreEnv, CONTEXT: 'production' }
  for (const rule of ENV_RULES) {
    if (rule.prodOnly && !(rule.key in env)) {
      // satisfy prod-only rules with format-valid placeholders
      if (rule.key === 'STRIPE_SECRET_KEY') env[rule.key] = 'sk_live_x'
      else if (rule.key === 'STRIPE_WEBHOOK_SECRET') env[rule.key] = 'whsec_x'
      else env[rule.key] = 'set'
    }
  }
  return env
}

describe('resolveEnvContext', () => {
  it('maps Netlify CONTEXT and NODE_ENV', () => {
    expect(resolveEnvContext({ CONTEXT: 'production' })).toBe('production')
    expect(resolveEnvContext({ CONTEXT: 'deploy-preview' })).toBe('preview')
    expect(resolveEnvContext({ CONTEXT: 'branch-deploy' })).toBe('preview')
    expect(resolveEnvContext({ NODE_ENV: 'production' })).toBe('production')
    expect(resolveEnvContext({})).toBe('development')
  })
})

describe('validateEnv', () => {
  it('passes in development with only the core keys set', () => {
    const result = validateEnv(coreEnv, 'development')
    expect(result.ok).toBe(true)
    expect(result.missing).toHaveLength(0)
    expect(result.missingCritical).toHaveLength(0)
  })

  it('reports missingCritical when a Supabase key is absent (boot would fail fast)', () => {
    const env: Record<string, string | undefined> = { ...coreEnv }
    delete env.SUPABASE_SERVICE_ROLE_KEY
    const result = validateEnv(env, 'development')
    expect(result.missingCritical.map((r) => r.key)).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('does NOT treat fallback-having keys (OTP_PEPPER) as critical', () => {
    const env: Record<string, string | undefined> = { ...coreEnv }
    delete env.OTP_PEPPER
    const result = validateEnv(env, 'development')
    expect(result.missing.map((r) => r.key)).toContain('OTP_PEPPER') // still warned
    expect(result.missingCritical.map((r) => r.key)).not.toContain('OTP_PEPPER') // but won't crash boot
  })

  it('flags a missing core key in every context', () => {
    const withoutPepper: Record<string, string | undefined> = { ...coreEnv }
    delete withoutPepper.OTP_PEPPER
    const result = validateEnv(withoutPepper, 'development')
    expect(result.ok).toBe(false)
    expect(result.missing.map((r) => r.key)).toContain('OTP_PEPPER')
  })

  it('does NOT flag prod-only keys in development', () => {
    const result = validateEnv(coreEnv, 'development')
    expect(result.missing.map((r) => r.key)).not.toContain('STRIPE_SECRET_KEY')
    expect(result.missing.map((r) => r.key)).not.toContain('ZOHO_REFRESH_TOKEN')
  })

  it('flags prod-only keys when missing in production', () => {
    const result = validateEnv(coreEnv, 'production')
    expect(result.ok).toBe(false)
    const missingKeys = result.missing.map((r) => r.key)
    expect(missingKeys).toContain('STRIPE_SECRET_KEY')
    expect(missingKeys).toContain('ZEPTOMAIL_TPL_ORDER_CONFIRMATION')
    expect(missingKeys).toContain('INTERNAL_RETRY_SECRET')
  })

  it('is fully satisfied by a complete production env', () => {
    const result = validateEnv(prodEnv(), 'production')
    expect(result.ok).toBe(true)
    expect(result.invalid).toHaveLength(0)
  })

  it('flags invalid formats (bad URL, wrong Stripe prefix)', () => {
    const env = { ...prodEnv(), NEXT_PUBLIC_BASE_URL: 'dormers.ae', STRIPE_SECRET_KEY: 'nope' }
    const result = validateEnv(env, 'production')
    const invalidKeys = result.invalid.map((r) => r.key)
    expect(invalidKeys).toContain('NEXT_PUBLIC_BASE_URL')
    expect(invalidKeys).toContain('STRIPE_SECRET_KEY')
  })
})

// Every env key the app reads, found by reading the source. Comment lines are
// skipped so prose like `process.env.NEXT_PUBLIC_FOO` does not count.
function envKeysReadBySource(): Map<string, string> {
  const SRC = join(__dirname, '..', '..')
  const READS = [
    /process\.env\.([A-Z][A-Z0-9_]+)/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g,
    /\benv\(['"]([A-Z][A-Z0-9_]+)['"]\)/g,        // meta-whatsapp's throwing helper
    /\benvKey: ?['"]([A-Z][A-Z0-9_]+)['"]/g,        // season mail template keys
  ]
  const found = new Map<string, string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) { walk(path); continue }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue
      const code = readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n')
      for (const re of READS) {
        for (const m of code.matchAll(re)) if (!found.has(m[1])) found.set(m[1], path.slice(SRC.length + 1))
      }
    }
  }
  walk(SRC)
  return found
}

describe('ENV_RULES covers the code', () => {
  // WHATSAPP_BUSINESS_ACCOUNT_ID was read by the broadcast page but missing
  // here, so boot validation never warned that prod lacked it. The page threw
  // on first use instead (Sentry JAVASCRIPT-NEXTJS-1H). A new env read must
  // come with a rule, so `validateEnv` can say when a deploy is missing it.
  it('declares every env key the source reads', () => {
    const declared = new Set<string>([...ENV_RULES.map((r) => r.key), ...PLATFORM_ENV_KEYS])
    const undeclared = [...envKeysReadBySource()]
      .filter(([key]) => !declared.has(key))
      .map(([key, file]) => `${key} (read in ${file})`)
    expect(undeclared, 'add these to ENV_RULES in env-schema.ts').toEqual([])
  })

  it('finds the reads it is meant to find', () => {
    // Guards the scanner itself: if a regex breaks, the test above would pass
    // by finding nothing.
    const keys = envKeysReadBySource()
    expect(keys.has('WHATSAPP_BUSINESS_ACCOUNT_ID')).toBe(true)
    expect(keys.has('SUPABASE_SERVICE_ROLE_KEY')).toBe(true)
    expect(keys.has('ZEPTOMAIL_TPL_SEASON_PLAN_HELD')).toBe(true)
    expect(keys.has('NEXT_PUBLIC_FOO')).toBe(false)
  })
})
