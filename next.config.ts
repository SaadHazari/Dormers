import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfkit (label PDF engine) reads its glyph/unicode data files via fs at
  // runtime — bundling it breaks those reads. Externalizing keeps it as a
  // plain node_modules require; Netlify's file tracing ships its data files.
  serverExternalPackages: ['pdfkit'],
  // Remote image allowlist. The admin menu CMS (uploadDishImage in
  // src/app/admin/menu/actions.ts) stores full Supabase Storage public URLs
  // in dishes.image_path, so the optimizer must accept that one host —
  // locked to the public-objects path. Everything else stays /public-local;
  // any new remote source needs its own explicit entry here. Security:
  // prevents attacker-controlled URLs from being proxied through our
  // Image optimizer.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'butfgoqneixophdlwljd.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  experimental: {
    // Extend the App Router client-side route cache so return visits to a
    // page within the window are served from memory (no server round-trip).
    // 30s for dynamic, 3m for static — balances "feels instant" with freshness.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  // Document-Policy: js-profiling enables the browser's JS profiling API
  // that @sentry/nextjs browserProfilingIntegration depends on. Without
  // this header the browser silently disables JS profiling and the
  // Sentry Profiles tab stays empty for client-side traces.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Document-Policy', value: 'js-profiling' },
        ],
      },
    ]
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
