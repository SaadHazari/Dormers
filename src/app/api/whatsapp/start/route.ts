import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { randomInt } from 'crypto'
import { sendOtpTemplate } from '@/infra/meta-whatsapp/client'
import { hashOtpCode } from '@/shared/otp-hash'
import { otpIpLimiter, ipKey } from '@/infra/rate-limit/limiters'

// Tunables. Conservative for an MVP — every send costs WhatsApp credits.
const OTP_TTL_MIN          = 10
const RESEND_COOLDOWN_SEC  = 30
const MAX_SENDS_PER_HOUR   = 5

const admin = () =>
    createAdminSupabaseClient()

export async function POST(req: NextRequest) {
    let body: { phone?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

    const phone = body.phone?.trim() ?? ''
    // E.164: leading + then 8–15 digits.
    if (!/^\+\d{8,15}$/.test(phone)) {
        return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })
    }

    // Per-IP rate-limit (L3, enforcing): 40/hr/IP (dorm-NAT-safe) on top of the
    // per-phone cap below — stops phone-rotation credit drain. Fails open. Reuses
    // the existing 'too_many_requests' copy in PhoneStep. Checked before the OTP
    // insert/send so a blocked request costs nothing.
    const otpRl = await otpIpLimiter.check(await ipKey('otp'))
    if (!otpRl.allowed) {
        return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
    }

    const supabase = admin()
    const now      = Date.now()

    // Hourly cap (per phone). Cheap server-side spam guard.
    const hourAgo = new Date(now - 60 * 60 * 1000).toISOString()
    const { count: hourly } = await supabase
        .from('whatsapp_otps')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
        .gte('created_at', hourAgo)
    if ((hourly ?? 0) >= MAX_SENDS_PER_HOUR) {
        return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
    }

    // Resend cooldown — prevents accidental double-tap from burning credits.
    const cooldownAgo = new Date(now - RESEND_COOLDOWN_SEC * 1000).toISOString()
    const { count: recent } = await supabase
        .from('whatsapp_otps')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
        .gte('created_at', cooldownAgo)
    if ((recent ?? 0) > 0) {
        return NextResponse.json({ error: 'cooldown', retryAfter: RESEND_COOLDOWN_SEC }, { status: 429 })
    }

    // randomInt(min, max) yields [min, max), so [100000, 1000000) = 6-digit space.
    const code      = String(randomInt(100_000, 1_000_000))
    const expiresAt = new Date(now + OTP_TTL_MIN * 60 * 1000).toISOString()

    // Persist BEFORE sending. If the WhatsApp send fails, we'd rather have a
    // ghost record (cleaned up by TTL anyway) than miss it.
    const { data: inserted, error: insertErr } = await supabase.from('whatsapp_otps').insert({
        phone,
        code_hash:  hashOtpCode(phone, code),
        expires_at: expiresAt,
    }).select('id').single()
    if (insertErr) {
        console.error('OTP insert error:', insertErr)
        return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }

    try {
        await sendOtpTemplate(phone, code)
    } catch (e) {
        console.error('WhatsApp send error:', e)
        // Release It! L8 (Phase 6): record the send failure so onboarding's email
        // fallback can confirm WhatsApp was genuinely unavailable for this phone
        // before relaxing the phone gate. `fallbackAvailable` tells the client it
        // may offer the email path. Both are best-effort — never block on them.
        if (inserted?.id) {
            await supabase
                .from('whatsapp_otps')
                .update({ send_failed_at: new Date().toISOString() })
                .eq('id', inserted.id)
        }
        return NextResponse.json({ error: 'send_failed', fallbackAvailable: true }, { status: 502 })
    }

    return NextResponse.json({ ok: true, expiresAt })
}
