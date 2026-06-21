/**
 * Environment configuration schema + validator.
 *
 * Closes the audit's macro finding "no centralized/fail-fast env config
 * validation — 131 scattered process.env reads": a deploy missing
 * ZEPTOMAIL_TPL_*, ZOHO_REFRESH_TOKEN, or a WhatsApp secret currently builds
 * green and fails customer-facing hours later.
 *
 * Dependency-free on purpose (no zod) — keeps the boot path tiny and avoids a
 * direct dependency on a transitive package.
 *
 * The rule list below is derived from the env keys the code actually reads
 * (grep of process.env across src/), NOT from .env.example — which is stale
 * (it lists META_WHATSAPP_* but the code reads WHATSAPP_*). This validator is
 * the source of truth for "what config does the running app need."
 *
 * Phase 0: validateEnv() is wired into instrumentation.ts in WARN-ONLY mode —
 * it logs issues at boot but never throws. Phase 8 flips the boot hook to
 * fail-fast once every environment is confirmed clean. Zero request-path impact.
 */

export type EnvContext = 'production' | 'preview' | 'development'

export interface EnvRule {
  key: string
  group: string
  /** Expected in EVERY context (the app can't run correctly without it). */
  required?: boolean
  /** Expected only in production-like contexts (vendor keys, secrets). */
  prodOnly?: boolean
  /** NEXT_PUBLIC_* — bundled to the browser. */
  public?: boolean
  /** Optional format check; only run when the value is present. */
  validate?: (value: string) => boolean
  description?: string
}

const isUrl = (v: string) => /^https?:\/\//i.test(v)

export const ENV_RULES: EnvRule[] = [
  // ── Supabase (core — required everywhere) ──────────────────────────────
  { key: 'NEXT_PUBLIC_SUPABASE_URL', group: 'supabase', required: true, public: true, validate: isUrl },
  { key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', group: 'supabase', required: true, public: true },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', group: 'supabase', required: true },

  // ── Base URL + security secrets (core) ─────────────────────────────────
  { key: 'NEXT_PUBLIC_BASE_URL', group: 'core', required: true, public: true, validate: isUrl },
  { key: 'OTP_PEPPER', group: 'security', required: true, description: 'HMAC pepper for OTP hashing' },

  // ── Stripe (payments) ──────────────────────────────────────────────────
  { key: 'STRIPE_SECRET_KEY', group: 'stripe', prodOnly: true, validate: (v) => v.startsWith('sk_') },
  { key: 'STRIPE_WEBHOOK_SECRET', group: 'stripe', prodOnly: true, validate: (v) => v.startsWith('whsec_') },

  // ── WhatsApp / Meta Cloud API (messaging) ──────────────────────────────
  { key: 'WHATSAPP_ACCESS_TOKEN', group: 'whatsapp', prodOnly: true },
  { key: 'WHATSAPP_PHONE_NUMBER_ID', group: 'whatsapp', prodOnly: true },
  { key: 'WHATSAPP_APP_SECRET', group: 'whatsapp', prodOnly: true, description: 'inbound webhook HMAC' },
  { key: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN', group: 'whatsapp', prodOnly: true },
  { key: 'WHATSAPP_STAFF_INVITE_TEMPLATE_NAME', group: 'whatsapp', description: 'staff feature' },
  { key: 'WHATSAPP_STAFF_INVITE_CODE_TEMPLATE_NAME', group: 'whatsapp', description: 'staff feature' },

  // ── Gemini / Google Generative AI (chat + review verification) ─────────
  { key: 'GOOGLE_GENERATIVE_AI_API_KEY', group: 'ai', prodOnly: true },

  // ── ZeptoMail (transactional email) ────────────────────────────────────
  { key: 'ZEPTOMAIL_API_TOKEN', group: 'zeptomail', prodOnly: true },
  { key: 'ZEPTOMAIL_FROM_ADDRESS', group: 'zeptomail', prodOnly: true },
  { key: 'ZEPTOMAIL_FROM_NAME', group: 'zeptomail' },
  { key: 'ZEPTOMAIL_REGION', group: 'zeptomail' },
  { key: 'ZEPTOMAIL_TPL_ORDER_CONFIRMATION', group: 'zeptomail-templates', prodOnly: true },
  { key: 'ZEPTOMAIL_TPL_START_DAY', group: 'zeptomail-templates', prodOnly: true },
  { key: 'ZEPTOMAIL_TPL_RENEW_NUDGE', group: 'zeptomail-templates', prodOnly: true },
  { key: 'ZEPTOMAIL_TPL_SUBSCRIPTION_ENDED', group: 'zeptomail-templates', prodOnly: true },
  { key: 'ZEPTOMAIL_TPL_REFUND_PROCESSED', group: 'zeptomail-templates', prodOnly: true },
  { key: 'ZEPTOMAIL_TPL_STAFF_INVITE', group: 'zeptomail-templates', prodOnly: true },

  // ── Zoho (invoicing) ───────────────────────────────────────────────────
  { key: 'ZOHO_CLIENT_ID', group: 'zoho', prodOnly: true },
  { key: 'ZOHO_CLIENT_SECRET', group: 'zoho', prodOnly: true },
  { key: 'ZOHO_REFRESH_TOKEN', group: 'zoho', prodOnly: true },
  { key: 'ZOHO_ORG_ID', group: 'zoho', prodOnly: true },
  { key: 'ZOHO_REGION', group: 'zoho', prodOnly: true },
  { key: 'ZOHO_VAT_TAX_ID', group: 'zoho' },
  { key: 'ZOHO_VAT_INCLUSIVE', group: 'zoho' },

  // ── Internal / ops ─────────────────────────────────────────────────────
  { key: 'INTERNAL_RETRY_SECRET', group: 'internal', prodOnly: true, description: 'gates /api/internal/* cron routes' },
  { key: 'ADMIN_EMAILS', group: 'admin', prodOnly: true, description: 'admin allowlist; empty = no admins' },
  { key: 'OPS_ALERT_EMAIL', group: 'ops', description: 'backup (non-WhatsApp) alert channel' },

  // ── Observability (optional but recommended) ───────────────────────────
  { key: 'SENTRY_DSN', group: 'observability' },
  { key: 'NEXT_PUBLIC_SENTRY_DSN', group: 'observability', public: true },
]

export interface EnvIssue {
  rule: EnvRule
  kind: 'missing' | 'invalid'
}

export interface EnvValidationResult {
  ok: boolean
  context: EnvContext
  /** Count of rules whose value was present (and thus format-checked). */
  checked: number
  issues: EnvIssue[]
  missing: EnvRule[]
  invalid: EnvRule[]
}

export function resolveEnvContext(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): EnvContext {
  const ctx = env.CONTEXT // Netlify deploy context
  if (ctx === 'production') return 'production'
  if (ctx === 'deploy-preview' || ctx === 'branch-deploy') return 'preview'
  if (env.NODE_ENV === 'production') return 'production'
  return 'development'
}

export function validateEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  context: EnvContext = resolveEnvContext(env),
): EnvValidationResult {
  const isProd = context === 'production'
  const issues: EnvIssue[] = []
  let checked = 0

  for (const rule of ENV_RULES) {
    const expected = rule.required === true || (rule.prodOnly === true && isProd)
    const raw = env[rule.key]
    const present = raw !== undefined && raw !== ''

    if (!present) {
      if (expected) issues.push({ rule, kind: 'missing' })
      continue
    }

    checked++
    if (rule.validate && !rule.validate(raw)) {
      issues.push({ rule, kind: 'invalid' })
    }
  }

  return {
    ok: issues.length === 0,
    context,
    checked,
    issues,
    missing: issues.filter((i) => i.kind === 'missing').map((i) => i.rule),
    invalid: issues.filter((i) => i.kind === 'invalid').map((i) => i.rule),
  }
}
