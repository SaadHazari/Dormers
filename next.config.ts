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

// Sentry build-time wrapping. Only takes effect when SENTRY_DSN is set in
// the build environment; otherwise it's a near-no-op (still adds the
// instrumentation but won't upload source maps to Sentry).
export default withSentryConfig(nextConfig, {
  // Skip source-map upload when the auth token isn't available (local dev,
  // CI without Sentry secrets, the build still succeeds — just no maps).
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Don't generate source maps unless explicitly enabled — keeps bundles
  // smaller in deploys where source-map upload isn't configured.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Strip Sentry's internal debug logging from the production bundle.
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
