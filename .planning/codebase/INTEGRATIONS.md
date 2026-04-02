# External Integrations

**Analysis Date:** 2026-04-02

## APIs & External Services

**Payments:**
- Stripe - Checkout session creation and payment processing
  - SDK (server): `stripe` `^18.3.0`
  - SDK (client): `@stripe/stripe-js` `^7.4.0`
  - Implementation: `src/app/api/checkout/route.ts` — Next.js Route Handler (POST) creates a Stripe Checkout Session and returns the hosted checkout URL. Client is then redirected to `session.url`.
  - API version: `2025-06-30.basil`
  - Currency: AED (UAE Dirhams)
  - Payment methods: `card`
  - Auth: **CRITICAL — secret key is hardcoded directly in `src/app/api/checkout/route.ts` line 5 as a live `sk_live_` key.** This is a security issue. The key should be moved to `STRIPE_SECRET_KEY` environment variable.
  - Redirect URLs: use `NEXT_PUBLIC_BASE_URL` env var for `success_url` and `cancel_url`

**Messaging / CRM:**
- WhatsApp (wa.me deep links) - Used in three places; no official SDK, plain URL construction:
  - Post-payment confirmation: `src/app/success/SuccessContent.tsx` — button links to `https://wa.me/+971585556707` with pre-filled order details
  - Live chat bot handoff: `src/app/(main)/home/ChatWindow.tsx` — after collecting name/email/phone, opens `https://wa.me/971504619384` with pre-filled message
  - Commented-out fallback in `src/app/components/OrderForm.tsx` — WhatsApp redirect as an alternative to Stripe (currently disabled)
  - Two different WhatsApp numbers are in use: `+971585556707` (order completion) and `971504619384` (live chat)

**Analytics / Advertising:**
- Google Ads (Google Tag Manager gtag.js) - Conversion tracking script loaded globally
  - Tag ID: `AW-17901506705`
  - Implementation: `src/app/layout.tsx` — two `<Script>` tags with `strategy="afterInteractive"`:
    1. External script: `https://www.googletagmanager.com/gtag/js?id=AW-17901506705`
    2. Inline init: `gtag('config', 'AW-17901506705')`
  - No Google Analytics (GA4) tag detected; only Google Ads conversion tracking

**Forms / Lead Capture:**
- @typeform/embed `^5.3.1` - SDK is listed in `package.json` dependencies but no active usage found in any source file. May be a future integration or leftover dependency.

**Fonts / CDN:**
- Google Fonts (via Next.js font optimization) - Montserrat loaded via `next/font/google` in `src/app/layout.tsx` (weight: 900)
- cdnfonts.com - Typo Round font loaded via `<link>` tag in `src/app/layout.tsx`:
  - `https://fonts.cdnfonts.com/css/typo-round`
- Self-hosted fonts - Additional Montserrat and Typo Round weights served from `public/fonts/` via `@font-face` in `src/app/globals.css`

## Data Storage

**Databases:**
- None detected — no database client, ORM, or connection string references found in source

**File Storage:**
- Local filesystem only — images served from `public/images/`, `public/fonts/`, `public/testimonials/`

**Caching:**
- None — no Redis, Memcached, or caching layer detected

## Authentication & Identity

**Auth Provider:**
- None — no auth library, session management, or protected routes detected
- The payment flow collects customer email/name/phone but does not create user accounts

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry, Datadog, or error tracking service detected
- Errors logged to console only (`console.error` calls in `src/app/api/checkout/route.ts`)

**Logs:**
- `console.error` and `console.log` only; no structured logging

**Analytics:**
- Google Ads tag only (see above); no product analytics (Mixpanel, PostHog, Amplitude, etc.)

## Social Media Profiles

**Instagram:**
- `https://www.instagram.com/dormers.ae` — linked in `src/app/components/Footer.tsx`

**Facebook:**
- `https://www.facebook.com/profile.php?id=61567276984641` — linked in `src/app/components/Footer.tsx`

## CI/CD & Deployment

**Hosting:**
- Not explicitly configured — no `vercel.json`, Dockerfile, or platform config files present
- `next start` in `package.json` suggests Node.js server hosting
- `next export` + `serve out` scripts suggest static export hosting is also supported

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars:**
- `NEXT_PUBLIC_BASE_URL` — Base URL for Stripe redirect URLs (success/cancel pages)
  - Used in: `src/app/api/checkout/route.ts` lines 72–73
  - Example value: `https://dormers.ae` or `http://localhost:3000` for dev

**Secrets that SHOULD be env vars but are currently hardcoded:**
- Stripe live secret key — hardcoded in `src/app/api/checkout/route.ts` line 5
  - Should be: `STRIPE_SECRET_KEY` (server-side, no `NEXT_PUBLIC_` prefix)

**Secrets location:**
- No `.env` files present in the repository root

## Webhooks & Callbacks

**Incoming:**
- None — no Stripe webhook handler or other incoming webhook endpoint detected
  - Notable gap: Stripe payment confirmation relies on redirect URL query params only; no server-side webhook verification of payment completion

**Outgoing:**
- None

---

*Integration audit: 2026-04-02*
