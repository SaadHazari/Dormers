import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Per-token manifest: start_url must be the token page itself, otherwise
// installed home-screen apps launch the marketing homepage (both Android
// and iOS follow start_url, not the page the user installed from).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const path = `/ops/${token}`

  return NextResponse.json(
    {
      name: 'Dormers Rider',
      short_name: 'Rider',
      description: 'Rider delivery interface — Dormers',
      id: path,
      start_url: path,
      scope: path,
      display: 'standalone',
      background_color: '#ede8da', // cream — matches ops light theme
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
