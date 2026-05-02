import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
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
};

export default nextConfig;
