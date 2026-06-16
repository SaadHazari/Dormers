// Next.js serves this automatically at /manifest.webmanifest
// Do NOT add a theme_color to the root layout viewport export —
// the manifest value wins for installed PWAs (Pitfall 7 in RESEARCH)
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dormers' Ops",
    short_name: 'Dormers Ops',
    description: 'Kitchen display and rider delivery interface',
    start_url: '/',
    display: 'standalone',
    background_color: '#ede8da', // cream — matches kitchen light theme
    theme_color: '#f57f20', // brand orange — ceiling color, never go darker
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
