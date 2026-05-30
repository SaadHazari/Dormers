/**
 * Sentry init — browser / client runtime.
 *
 * File name matches the current Sentry Next.js SDK pattern
 * (`instrumentation-client.ts`, not the older `sentry.client.config.ts`).
 *
 * Init is guarded by NEXT_PUBLIC_SENTRY_DSN — when missing, Sentry is a
 * no-op. Safe to ship without a Sentry account; set the env var in Netlify
 * when you're ready to start collecting.
 */

import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV
      ?? process.env.NODE_ENV
      ?? 'unknown',

    // Trace sampling: 100% in dev so every nav is visible; 10% in prod for cost.
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

    // Browser profiling — captures JS CPU samples for active transactions.
    // Requires `Document-Policy: js-profiling` header (set in next.config.ts).
    // Sample rate matches tracing rate. Decision is made once per session.
    profileSessionSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

    // Distributed tracing — propagate the sentry-trace header on outgoing
    // requests so spans across client → server stitch into one trace. Limit
    // to same-origin so we don't leak the header to Supabase / Stripe /
    // third parties that don't speak Sentry's wire format.
    tracePropagationTargets: ['localhost', /^\//],

    // Session Replay — records DOM mutations around errors. Sentry masks
    // all input fields by default; canvas recording is off (would balloon
    // payload).
    //
    // Free tier gives 50 replays/month. Healthy sessions don't need to be
    // recorded — they consume the quota that should be reserved for the
    // ones that actually error. So: 0 baseline (no random healthy capture),
    // 1.0 on error (every session that throws gets recorded back to the
    // error moment via the buffer).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    // Sentry's Logs product — Sentry.logger.* calls land in the Logs tab.
    enableLogs: true,

    // sendDefaultPii includes IP + request headers. Sentry's built-in
    // scrubbers strip cookies / auth tokens / known credential headers
    // before transmission. Useful for "which user / region had this error."
    sendDefaultPii: true,

    integrations: [
      // Browser tracing — explicitly include even though current Next.js
      // SDK adds it by default. Gives us navigation transactions, fetch /
      // XHR spans, and resource timing for every page load.
      Sentry.browserTracingIntegration(),
      // Browser profiler — collects JS CPU samples during traced spans.
      // No-ops if the Document-Policy header isn't set.
      Sentry.browserProfilingIntegration(),
      // Replays — DOM mutations around errors so we can watch what happened.
      Sentry.replayIntegration(),
      // Mirror console.warn / console.error into Sentry Logs. 'log' was
      // included earlier but the codebase uses console.log liberally as
      // debug breadcrumbs — forwarding all of them was burning the Logs
      // quota for noise. warn + error keep the genuinely interesting
      // entries.
      Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
      // User-submitted bug reports. autoInject:false suppresses Sentry's
      // generic floating button — the trigger is the BugReportTrigger
      // icon at the bottom-right of the dashboard's content-border.
      //
      // Theme tokens map Sentry's dialog onto the dashboard's brand:
      // cream surface, navy text, brand orange CTA, Montserrat body.
      // colorScheme is pinned to 'light' rather than 'system' because the
      // dashboard is intentionally light regardless of OS preference.
      Sentry.feedbackIntegration({
        autoInject: false,
        colorScheme: 'light',
        showBranding: false,
        // Copy.
        formTitle: 'Tell us what happened',
        messageLabel: 'What went wrong?',
        messagePlaceholder: 'Saw something weird? Type away — the more detail the better.',
        submitButtonLabel: 'Send it',
        cancelButtonLabel: 'Never mind',
        successMessageText: 'Got it — thanks for helping us improve.',
        // On-brand light theme. Sentry CSS-variable names map 1:1 to
        // the keys below. Hex / rgba values come from src/app/dashboard/_shared/tokens.ts
        // so they stay in lockstep with the rest of the surface.
        themeLight: {
          background: '#ede8da',                  // BG (cream)
          foreground: '#091825',                  // NV (dark navy)
          accentBackground: '#f57f20',            // OG (brand orange)
          accentForeground: '#ffffff',
          successColor: '#22c55e',
          errorColor: '#ef4444',
          border: '1px solid rgba(9,24,37,0.12)',
          boxShadow: '0 20px 50px rgba(9,24,37,0.22), 0 2px 6px rgba(9,24,37,0.10)',
          fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif',
          fontSize: '14px',
          borderRadius: '14px',
          inputBackground: '#f5f0e8',             // slightly lighter cream — "inset" feel
          inputForeground: '#091825',
          inputBorder: 'rgba(9,24,37,0.15)',
          inputOutlineFocus: '#f57f20',
        },
      }),
    ],
  })
}

// Hook into App Router navigation transitions — every soft navigation
// becomes a trace transaction. Required export per Sentry's Next.js SDK.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
