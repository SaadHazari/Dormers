/**
 * Tests for validateEnv — context resolution, required vs prodOnly handling,
 * and format checks. Uses explicit env objects so we never touch process.env.
 */

import { describe, it, expect } from 'vitest'
import { validateEnv, resolveEnvContext, ENV_RULES } from './env-schema'

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
