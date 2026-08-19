import { BoxCounterClient } from './BoxCounterClient'

export const metadata = { title: 'Box Counter Bench — Dormers Admin' }
export const dynamic = 'force-dynamic'

// Auth is handled by the admin layout's requireAdmin(); the API route
// re-checks the allowlist so it fails closed on its own.
export default function BoxCounterPage() {
  return <BoxCounterClient />
}
