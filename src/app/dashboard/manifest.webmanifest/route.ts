import { NextResponse } from 'next/server'

// Installable dashboard: identity comes from the auth cookie on the device,
// so one shared manifest is enough (unlike the per-token ops manifests).
// scope '/' keeps login/onboarding inside the installed app when a session
// expires; start_url still lands users on the dashboard.
export function GET() {
  return NextResponse.json(
    {
      name: 'Dormers',
      short_name: 'Dormers',
      description: 'Your meals, delivered to your dorm',
      id: '/dashboard',
      start_url: '/dashboard',
      scope: '/',
      display: 'standalone',
      background_color: '#ede8da', // cream — matches dashboard light theme
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
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  )
}
