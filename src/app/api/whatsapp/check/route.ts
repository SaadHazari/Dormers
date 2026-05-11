import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const MAX_ATTEMPTS = 5

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

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

    // Most recent unverified, unexpired OTP for this phone.
    const { data: otp, error: lookupErr } = await supabase
        .from('whatsapp_otps')
        .select('id, code_hash, attempts')
        .eq('phone', phone)
        .is('verified_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (lookupErr) {
        console.error('OTP lookup error:', lookupErr)
        return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }
    if (!otp) return NextResponse.json({ error: 'no_active_code' }, { status: 400 })

    if (otp.attempts >= MAX_ATTEMPTS) {
        return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
    }

    // Always increment attempts — both correct and wrong tries count, so a
    // brute-force attacker can't get free guesses.
    await supabase.from('whatsapp_otps')
        .update({ attempts: otp.attempts + 1 })
        .eq('id', otp.id)

    if (otp.code_hash !== sha256(code)) {
        return NextResponse.json({ error: 'incorrect_code' }, { status: 400 })
    }

    await supabase.from('whatsapp_otps')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', otp.id)

    // Phone-duplication gate — runs AFTER ownership is proven so we're not
    // leaking account-existence info to someone who doesn't own the number.
    // Checking at /start would allow enumeration without OTP proof.
    const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('whatsapp_number', phone)
        .limit(1)
        .maybeSingle()

    if (existingCustomer) {
        return NextResponse.json({ error: 'phone_already_registered' }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
}
