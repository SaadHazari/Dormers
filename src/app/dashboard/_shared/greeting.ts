/**
 * The no-plan greeting — one line, two shapes.
 *
 *   Welcome, Saad.        no finished plan on file: a brand-new signup, or a
 *                         customer who never bought
 *   Welcome back, Saad.   at least one finished plan
 *
 * Both shapes greet. The ribbon used to render for the second only, which
 * left every brand-new signup — most real accounts — on a page with no name
 * on it and, on a phone, an empty burger row. See greeting.test.ts.
 *
 * The name comes from the single `name` column via firstNameFrom, so this
 * ribbon, the intake place card, and the reopen email always agree on the
 * word. No name on file yields null and the caller prints "Welcome." — an
 * abandoned referral claim leaves a customers row with name = null (its auth
 * user is created when the OTP is sent, before the claim form asks for a
 * name), and "Welcome, saadhazari01." or "Welcome, there." are both worse
 * than no name at all.
 */

import { firstNameFrom } from './intake-join-outcome'

export interface NoPlanGreeting {
  lead: 'Welcome' | 'Welcome back'
  firstName: string | null
}

export function noPlanGreeting(name: string | null | undefined, hasFinishedPlan: boolean): NoPlanGreeting {
  return {
    lead: hasFinishedPlan ? 'Welcome back' : 'Welcome',
    firstName: firstNameFrom(name) || null,
  }
}
