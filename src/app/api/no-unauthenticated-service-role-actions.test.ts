/**
 * Every export of a `'use server'` file is a public HTTP endpoint.
 *
 * Next.js gives each one a stable action id and registers it in
 * server-reference-manifest.json. That is true whether or not any client
 * component imports it — so a helper that was only ever meant to run
 * server-to-server is still reachable from the internet by anyone who knows
 * the id. There is no login in front of it unless the function performs one
 * itself.
 *
 * That is how `creditInviterOnConversion` — service-role, takes a user id from
 * its caller, pays out referral cash — ended up as an unauthenticated payout
 * endpoint. It now lives in a plain module, which has no action id at all.
 *
 * This test locks the rule in: if a function exported from a `'use server'`
 * file reaches for the service-role client, it MUST establish who is calling
 * before it does anything else. The fix for a failure here is almost always to
 * move the function out of the actions file rather than to bolt a check onto
 * it — if it has no business being called from a browser, it should not be an
 * endpoint in the first place.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

/** The service-role client bypasses row-level security entirely. */
const SERVICE_ROLE_CLIENTS = ['createAdminSupabaseClient', 'createServiceClient']

/**
 * Anything that establishes WHO is calling. Includes the pre-auth front doors
 * that legitimately run before a session exists but still prove identity some
 * other way (a one-time code, an OTP, a signature).
 */
const AUTH_SIGNALS = [
  'requireAdmin',
  'requireUser',
  'isAdminEmail',
  'getUserFromHeaders',
  'auth.getUser()',
  'validateOpsToken',
  'withOwnedSubscription',
  // Pre-auth front doors — no session yet, identity proven another way.
  'hashClaimCode',      // staff claim: possession of a mailed code
  'timingSafeCompare',
  'signUp',             // onboarding: creating the identity
  'verifyOtp',
  'isPhoneVerified',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

/** Split a module into its top-level `export async function` bodies. */
function exportedFunctions(src: string): { name: string; body: string }[] {
  const lines = src.split('\n')
  const starts: number[] = []
  lines.forEach((l, i) => { if (l.startsWith('export async function')) starts.push(i) })
  return starts.map((start, idx) => {
    const end = starts[idx + 1] ?? lines.length
    const name = /export async function (\w+)/.exec(lines[start])?.[1] ?? '?'
    return { name, body: lines.slice(start, end).join('\n') }
  })
}

describe("no 'use server' export touches the service-role client without auth", () => {
  const actionFiles = walk(SRC).filter(f => {
    const src = readFileSync(f, 'utf8')
    return src.startsWith("'use server'") || src.startsWith('"use server"')
  })

  it('found the server-action files to check', () => {
    // Guards the guard: if the walk breaks, this test must not pass vacuously.
    expect(actionFiles.length).toBeGreaterThan(10)
  })

  for (const file of actionFiles) {
    const rel = relative(ROOT, file)
    const src = readFileSync(file, 'utf8')
    if (!SERVICE_ROLE_CLIENTS.some(c => src.includes(c))) continue

    for (const fn of exportedFunctions(src)) {
      if (!SERVICE_ROLE_CLIENTS.some(c => fn.body.includes(c))) continue

      it(`${rel} → ${fn.name}() authenticates its caller`, () => {
        const guarded = AUTH_SIGNALS.some(sig => fn.body.includes(sig))
        expect(
          guarded,
          `${fn.name}() in ${rel} is exported from a 'use server' file, so it is a PUBLIC ` +
          `HTTP endpoint, and it uses the service-role client without establishing who is ` +
          `calling. If it is only ever called server-to-server, move it into a plain module ` +
          `(see src/contexts/referrals/usecases/credit-inviter.ts). If it really is called ` +
          `from the browser, add an auth check.`,
        ).toBe(true)
      })
    }
  }
})

describe('creditInviterOnConversion is not reachable as a server action', () => {
  it('lives in a plain module, not a use-server file', () => {
    const src = readFileSync(join(SRC, 'contexts/referrals/usecases/credit-inviter.ts'), 'utf8')
    expect(src).toContain('export async function creditInviterOnConversion')
    expect(src.startsWith("'use server'")).toBe(false)
    expect(src.startsWith('"use server"')).toBe(false)
  })

  it('is gone from the referral actions file', () => {
    const src = readFileSync(join(SRC, 'app/r/[cid]/actions.ts'), 'utf8')
    expect(src).not.toMatch(/export async function creditInviterOnConversion/)
    // A re-export would put the action id straight back.
    expect(src).not.toMatch(/export .*\{[^}]*creditInviterOnConversion/)
  })
})
