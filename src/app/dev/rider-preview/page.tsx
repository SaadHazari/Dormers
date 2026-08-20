// Dev-only harness for the rider PWA. Renders RiderClient with fixture props
// so every stage (pickup, run, done, idle) can be exercised in a browser
// without a live ops token or a real delivery day, and with the write APIs
// mocked at the browser level. Unreachable in production.
import { notFound } from 'next/navigation'
import { PreviewClient } from './PreviewClient'

export const dynamic = 'force-dynamic'

export default function RiderPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <PreviewClient />
}
