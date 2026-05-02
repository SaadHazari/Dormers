import { headers } from 'next/headers'

// Reads the user id/email validated by middleware.
// Skips a second `auth.getUser()` network round-trip in server components.
// Returns null if middleware did not attach a user (i.e. the request is unauthenticated).
export async function getUserFromHeaders(): Promise<{ id: string; email: string } | null> {
  const h = await headers()
  const id = h.get('x-user-id')
  if (!id) return null
  return { id, email: h.get('x-user-email') ?? '' }
}
