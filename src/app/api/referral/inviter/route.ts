import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Returns only the inviter's first name for personalising the landing page.
// Intentionally minimal — never exposes full name, email, or phone.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cid = (searchParams.get('cid') ?? '').toUpperCase().trim()

  if (!cid) return NextResponse.json({ firstName: null })

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data } = await supabaseAdmin
    .from('customers')
    .select('name')
    .eq('cid', cid)
    .maybeSingle()

  const firstName = data?.name?.split(' ')[0] ?? null
  return NextResponse.json({ firstName })
}
