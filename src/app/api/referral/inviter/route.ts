import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { inviterLimiter, ipKey } from '@/infra/rate-limit/limiters'

// Returns only the inviter's first name for personalising the landing page.
// Intentionally minimal — never exposes full name, email, or phone.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cid = (searchParams.get('cid') ?? '').toUpperCase().trim()

  if (!cid) return NextResponse.json({ firstName: null })

  // Rate-limit (L3, enforcing): per-IP, 120/min (dorm-NAT-safe), fails open.
  // On block, degrade gracefully — return firstName:null (same as not-found) so
  // the landing page still works, just without the personalized name. Throttles
  // CID enumeration / customer-name harvesting.
  const invRl = await inviterLimiter.check(await ipKey('inviter'))
  if (!invRl.allowed) {
    return NextResponse.json({ firstName: null })
  }

  const supabaseAdmin = createAdminSupabaseClient()

  const { data } = await supabaseAdmin
    .from('customers')
    .select('name')
    .eq('cid', cid)
    .maybeSingle()

  const firstName = data?.name?.split(' ')[0] ?? null
  return NextResponse.json({ firstName })
}
