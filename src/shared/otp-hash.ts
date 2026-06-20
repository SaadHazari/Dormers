import { createHmac } from 'crypto'

// OTP codes are only 6 digits (~900k values). A plain SHA-256 of the code is
// trivially reversible with a precomputed table if the whatsapp_otps table ever
// leaks (stolen backup, service-role key exposure, a future RLS gap). HMAC keyed
// by a server-side secret makes a stolen table useless without that secret, and
// binding the code to the phone stops a hash computed for one number being
// replayed against another row.
//
// Key precedence: a dedicated OTP_PEPPER if set, otherwise the service-role key
// — which is always present (the admin client needs it) and is a secret distinct
// from the OTP table contents, so it satisfies the "the table alone is not
// enough" goal without requiring a new env var to be provisioned first. Fail
// closed if neither exists rather than silently degrading to an unkeyed hash.
export function hashOtpCode(phone: string, code: string): string {
  const pepper = process.env.OTP_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!pepper) {
    throw new Error('OTP hashing secret missing (set OTP_PEPPER or SUPABASE_SERVICE_ROLE_KEY)')
  }
  return createHmac('sha256', pepper).update(`${phone}:${code}`).digest('hex')
}
