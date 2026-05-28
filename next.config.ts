import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No remote image hosts whitelisted — every image in the codebase is a
  // local /public asset or static import. Adding a remote source must come
  // with an explicit hostname allowlist here. Security: prevents an
  // attacker-controlled URL from being proxied through our Image optimizer.
  experimental: {
    // Extend the App Router client-side route cache so return visits to a
    // page within the window are served from memory (no server round-trip).
    // 30s for dynamic, 3m for static — balances "feels instant" with freshness.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

// Sentry build-time wrapping. Source-map upload only fires when
// SENTRY_AUTH_TOKEN is present, so local + CI builds without that secret
// still succeed (you just get minified stack traces in Sentry).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress Sentry's chatty build output unless we're in CI (where it's
  // useful to see what got uploaded).
  silent: !process.env.CI,

  // Upload a wider set of client source files so stack traces resolve
  // through dynamic imports and code-split chunks, not just the entry.
  widenClientFileUpload: true,

  // Tunnel Sentry events through this app's own origin so ad-blockers /
  // corporate network filters can't drop them. Middleware matcher in
  // src/middleware.ts is narrow enough (dashboard, admin, login,
  // onboarding) that /monitoring is naturally excluded.
  tunnelRoute: "/monitoring",

  // Strip Sentry's internal debug logging from the production bundle.
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
