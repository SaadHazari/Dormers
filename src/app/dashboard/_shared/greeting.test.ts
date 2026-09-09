/**
 * Every dashboard-home shape greets the customer by name, and on a phone
 * that greeting is the first thing in the burger's row.
 *
 * NoPlanView once rendered its ribbon only for RETURNING customers (anyone
 * with a finished plan). A brand-new signup — most real accounts at the
 * time (28 of 57 non-QA customers, 18 of them from the previous 30 days) —
 * landed on a page with no name on it and, on a phone, an empty burger row
 * above a purchase gate. The preview fixture had even been edited around
 * it: an empty history "read as a missing feature" and was swapped for a
 * returning one, so no screenshot survey could see the gap.
 *
 * The mobile home had the sibling fault: its purchase gates (profile /
 * out-of-zone banners) were mounted ABOVE <MobileHome>, so a gated customer
 * saw the banner under the burger and the greeting pushed beneath it.
 *
 * Source-level assertions for the two surfaces (client components; this
 * repo has no DOM harness) plus unit tests for the copy helper. The painted
 * contract — greeting beside the burger, nothing above it — is
 * scripts/check-greeting-row.mjs.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { noPlanGreeting } from './greeting'

const ROOT = resolve(__dirname, '../../../..')
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8')

describe('noPlanGreeting', () => {
  it('greets a brand-new signup by first name', () => {
    expect(noPlanGreeting('Saad Hazari', false)).toEqual({ lead: 'Welcome', firstName: 'Saad' })
  })

  it('welcomes back a customer with a finished plan', () => {
    expect(noPlanGreeting('Saad Hazari', true)).toEqual({ lead: 'Welcome back', firstName: 'Saad' })
  })

  it('degrades to no name — never an email prefix, never "there"', () => {
    // Abandoned referral claims leave a customers row with name = null
    // (the auth user is created when the OTP is sent; the name only lands
    // when the claim completes). "Welcome." beats "Welcome, saadhazari01."
    expect(noPlanGreeting(null, false)).toEqual({ lead: 'Welcome', firstName: null })
    expect(noPlanGreeting(undefined, true)).toEqual({ lead: 'Welcome back', firstName: null })
    expect(noPlanGreeting('   ', false).firstName).toBeNull()
  })
})

describe('the greeting owns the top of every dashboard-home shape', () => {
  it('NoPlanView renders its ribbon for every customer, not only returning ones', () => {
    const src = read('src/app/dashboard/NoPlanView.tsx')
    expect(src).toMatch(/className="noplan-greeting"/)
    // The exact shape of the bug: the ribbon behind a returning-only guard.
    expect(src).not.toMatch(/isReturning\s*&&\s*\(\s*<motion\.div\s+className="noplan-greeting"/)
    // And the burger-row claim travels with the ribbon — unconditionally.
    expect(src).toMatch(/className="noplan-root owns-burger-row"/)
  })
})
