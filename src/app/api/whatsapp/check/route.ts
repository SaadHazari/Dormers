import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { hashOtpCode } from '@/shared/otp-hash'

const MAX_ATTEMPTS = 5

const admin = () =>
    createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

export async function POST(req: NextRequest) {
    let body: { phone?: string; code?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

    const phone = body.phone?.trim() ?? ''
    const code  = body.code?.trim()  ?? ''
    if (!/^\+\d{8,15}$/.test(phone)) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })
    if (!/^\d{6}$/.test(code))       return NextResponse.json({ error: 'invalid_code'  }, { status: 400 })

    const supabase = admin()

    // Atomic attempt increment — prevents concurrent brute-force bypass.
    // The RPC increments attempts AND returns the row in a single UPDATE,
    // so N concurrent requests each burn one attempt instead of all reading
    // the same stale count.
    const { data: rows, error: rpcErr } = await supabase
        .rpc('verify_otp_attempt', { p_phone: phone, p_max_attempts: MAX_ATTEMPTS })

    if (rpcErr) {
        console.error('OTP verify_otp_attempt RPC error:', rpcErr)
        return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }

    const otp = rows?.[0]
    if (!otp) {
        return NextResponse.json({ error: 'no_active_code_or_too_many_attempts' }, { status: 400 })
    }

    if (otp.code_hash !== hashOtpCode(phone, code)) {
        return NextResponse.json({ error: 'incorrect_code' }, { status: 400 })
    }

    await supabase.from('whatsapp_otps')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', otp.id)

    return NextResponse.json({ ok: true })
}
