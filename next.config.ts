import type { NextConfig } from "next";

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

export default nextConfig;
