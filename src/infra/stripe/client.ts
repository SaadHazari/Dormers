/**
 * Stripe SDK adapter — the only place `import Stripe from 'stripe'` should
 * appear in this codebase (outside tests).
 *
 * Per L1's outer-ring rule, the Stripe vendor SDK lives in infra/ and is
 * never imported directly by domain or use-case code. Routes (in app/)
 * may import this adapter; everything else gets event/session shapes via
 * payment use-case functions.
 *
 * Centralizes the API-version constant so both the webhook and checkout
 * route stay in lockstep on which Stripe API version they target.
 */

import Stripe from 'stripe'

const STRIPE_API_VERSION = '2025-06-30.basil' as Stripe.LatestApiVersion

/**
 * Build a server-side Stripe client. Throws at call time (not import time)
 * if STRIPE_SECRET_KEY is missing — the route handler returns 500 in that
 * case rather than crashing the bundle.
 */
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    // Release It! L2: the SDK default is an 80s request timeout with 0 retries.
    // An 80s hang ties up a serverless function while a customer stares at a
    // spinner. Bound each request to 8s and let the SDK retry transient network
    // failures twice with its built-in backoff (it auto-attaches a per-request
    // idempotency key so create-retries are safe).
    timeout: 8000,
    maxNetworkRetries: 2,
  })
}

/**
 * Verify + parse an incoming webhook event. Throws if the signature doesn't
 * match — caller should catch and return 400 with the message.
 */
export function constructWebhookEvent(bodyText: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
  return stripeClient().webhooks.constructEvent(bodyText, signature, secret)
}

// Re-export the Stripe namespace as a type so route handlers can keep using
// `Stripe.Checkout.Session` / `Stripe.Event` / etc. without re-importing the
// SDK directly. Type-only re-export — no runtime cost.
export type { Stripe }
