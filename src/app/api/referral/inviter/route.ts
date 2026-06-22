import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { inviterLimiter, ipKey } from '@/infra/rate-limit/limiters'

// Returns only the inviter's first name for personalising the landing page.
// Intentionally minimal — never exposes full name, email, or phone.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cid = (searchParams.get('cid') ?? '').toUpperCase().trim()

  if (!cid) return NextResponse.json({ firstName: null })

  // Shadow rate-limit (Phase 4 / L3): per-IP, observe-only, fails open. When
  // enforced, throttles CID enumeration / customer-name harvesting.
  await inviterLimiter.check(await ipKey('inviter'))

  const supabaseAdmin = createAdminSupabaseClient()

  const { data } = await supabaseAdmin
    .from('customers')
    .select('name')
    .eq('cid', cid)
    .maybeSingle()

  const firstName = data?.name?.split(' ')[0] ?? null
  return NextResponse.json({ firstName })
}
