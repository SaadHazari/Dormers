'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { CtaButton, FieldInput, PhoneField } from './primitives'
import type { FormState } from './data'
import { useIsLight } from '@/hooks/useIsLight'
import { authTokens } from '@/lib/auth-theme'
import { isAlphaName, sanitizeNameInput } from '@/lib/validation'

const OTP_LENGTH = 6 // we generate 6-digit codes server-side; see /api/whatsapp/start

// Step 6: name + WhatsApp number with inline OTP verification.
// Two phases owned by local state:
//   'enter'  — user fills name + phone, clicks "Send code".
//   'sent'   — code-input revealed; auto-verifies on 6 digits typed/pasted,
//              advances to step 7 on success.
//
// In 'sent' phase the phone fields are LOCKED (disabled). Without this,
// accidentally tapping the phone input would clear the OTP state via the
// PhoneField → onChange → form.phone churn loop, forcing a fresh send. The
// "Wrong number?" link is the explicit unlock — same affordance pattern as
// EmailStep's "Wrong email?".
export function PhoneStep({
    form, set, advance,
}: {
    form: FormState
    set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
    advance: () => void
}) {
    const [stage,    setStage]    = useState<'enter' | 'sent'>(form.phoneVerified ? 'sent' : 'enter')
    const [otp,      setOtp]      = useState('')
    const [error,    setError]    = useState('')
    const [busy,     setBusy]     = useState(false)
    const [resendIn, setResendIn] = useState(0)
    const otpRef = useRef<HTMLInputElement>(null)

    const isLight = useIsLight()
    const tokens = authTokens(isLight)

    // Resend cooldown ticker. Plain interval, cleaned up on unmount/change.
    useEffect(() => {
        if (resendIn <= 0) return
        const t = setTimeout(() => setResendIn(s => s - 1), 1000)
        return () => clearTimeout(t)
    }, [resendIn])

    const sendCode = async () => {
        if (busy || !isAlphaName(form.name) || !form.phone.trim()) return
        setBusy(true); setError('')
        try {
            const res  = await fetch('/api/whatsapp/start', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ phone: form.phone }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                setError(messageForError(data?.error))
                if (data?.error === 'cooldown' && data.retryAfter) setResendIn(data.retryAfter)
                return
            }
            setStage('sent')
            setResendIn(30)
            setOtp('')
            // Defer focus so the input has mounted.
            setTimeout(() => otpRef.current?.focus(), 50)
        } catch {
            setError('Network error. Try again.')
        } finally {
            setBusy(false)
        }
    }

    const verifyCode = async (code: string) => {
        if (busy || code.length !== OTP_LENGTH) return
        setBusy(true); setError('')
        try {
            const res  = await fetch('/api/whatsapp/check', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ phone: form.phone, code }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                if (data?.error === 'phone_already_registered') {
                    window.location.href = '/login?' + new URLSearchParams({
                        message: 'This WhatsApp number is already linked to an account — sign in below.',
                    }).toString()
                    return
                }
                setError(messageForError(data?.error))
                return
            }
            set('phoneVerified', true)
            // Brief beat so the success state is visible before the slide.
            setTimeout(() => advance(), 400)
        } catch {
            setError('Network error. Try again.')
        } finally {
            setBusy(false)
        }
    }

    // Auto-verify the moment the user finishes typing/pasting 6 digits.
    useEffect(() => {
        if (otp.length === OTP_LENGTH && !form.phoneVerified) verifyCode(otp)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otp])

    // Explicit unlock — flips back to 'enter', clears verification state.
    const editPhone = () => {
        if (form.phoneVerified) set('phoneVerified', false)
        setStage('enter')
        setOtp('')
        setError('')
        setResendIn(0)
    }

    // Form-level submit — fires for Enter in any input AND CTA click.
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (busy) return
        if (form.phoneVerified) return advance()
        if (stage === 'enter') return sendCode()
        return verifyCode(otp)
    }

    const phoneLocked = stage === 'sent' || form.phoneVerified

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">About You</p>
                <h1 className={`text-[28px] sm:text-[32px] font-black tracking-tight leading-tight ${tokens.heading}`}>
                    Who are we<br />delivering to?
                </h1>
            </div>

            <div className="space-y-3">
                <FieldInput
                    label="Full Name"
                    type="text"
                    placeholder="Your name"
                    value={form.name}
                    onChange={e => set('name', sanitizeNameInput(e.target.value))}
                    autoCapitalize="words"
                    autoComplete="name"
                    disabled={phoneLocked}
                />
                <div>
                    <PhoneField
                        label="WhatsApp Number"
                        value={form.phone}
                        onChange={v => set('phone', v)}
                        disabled={phoneLocked}
                    />
                    {stage === 'enter' && (
                        <p className={`text-[11px] mt-1.5 ${tokens.subline}`}>
                            We&apos;ll send a 6-digit code to verify this is your number.
                        </p>
                    )}
                </div>

                {stage === 'sent' && (
                    <div>
                        <label className={`block text-[11px] font-bold uppercase tracking-widest mb-1.5 ${tokens.label}`}>
                            Verification Code
                        </label>
                        <div className="relative">
                            <input
                                ref={otpRef}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={OTP_LENGTH}
                                value={otp}
                                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                                placeholder={'•'.repeat(OTP_LENGTH)}
                                disabled={busy || form.phoneVerified}
                                className={`w-full rounded-xl px-4 py-3 pr-11 text-[18px] font-mono tracking-[0.4em] outline-none transition-all disabled:opacity-60 border ${tokens.field} ${
                                    form.phoneVerified
                                        ? 'border-[#22c55e]/60 shadow-[0_0_0_3px_rgba(34,197,94,0.08)]'
                                        : tokens.fieldFocus
                                }`}
                            />
                            {form.phoneVerified && (
                                <CheckCircle2
                                    size={20}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#22c55e]"
                                    strokeWidth={2.2}
                                />
                            )}
                        </div>
                        <div className="flex items-center justify-between mt-1.5 gap-3 flex-wrap">
                            <p className={`text-[11px] flex-1 min-w-0 ${tokens.subline}`}>
                                Sent to <span className={`font-medium font-mono ${isLight ? 'text-[#091825]/85' : 'text-white/85'}`}>{form.phone}</span>.{' '}
                                <button
                                    type="button"
                                    onClick={editPhone}
                                    className="text-[#f57f20] hover:text-[#ff8f36] font-semibold transition-colors"
                                >
                                    Wrong number?
                                </button>
                            </p>
                            <button
                                type="button"
                                onClick={sendCode}
                                disabled={resendIn > 0 || busy}
                                className={`text-[#f57f20] text-[11px] font-semibold disabled:pointer-events-none whitespace-nowrap ${isLight ? 'disabled:text-[#091825]/55' : 'disabled:text-white/55'}`}
                            >
                                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                            </button>
                        </div>
                    </div>
                )}

                {error && (
                    <p className={`text-[12px] font-medium ${tokens.errorText}`}>{error}</p>
                )}
            </div>

            {form.phoneVerified ? (
                <CtaButton type="submit">Continue →</CtaButton>
            ) : stage === 'enter' ? (
                <CtaButton
                    type="submit"
                    disabled={!isAlphaName(form.name) || !form.phone.trim() || busy}
                >
                    {busy ? 'Sending…' : 'Send code →'}
                </CtaButton>
            ) : (
                <CtaButton
                    type="submit"
                    disabled={otp.length !== OTP_LENGTH || busy}
                >
                    {busy ? 'Verifying…' : 'Verify & continue →'}
                </CtaButton>
            )}
        </form>
    )
}

function messageForError(code: unknown): string {
    switch (code) {
        case 'invalid_phone':      return 'That number doesn’t look right. Check the country code and try again.'
        case 'invalid_code':       return 'Code must be 6 digits.'
        case 'cooldown':           return 'Hold on a moment before resending.'
        case 'too_many_requests':  return 'Too many requests. Try again in an hour.'
        case 'send_failed':        return 'Couldn’t send the WhatsApp message. Double-check your number.'
        case 'no_active_code':     return 'Code expired or never sent. Send a new one.'
        case 'incorrect_code':     return 'That code doesn’t match. Try again.'
        case 'too_many_attempts':         return 'Too many wrong attempts. Send a new code.'
        case 'phone_already_registered':  return 'This number is linked to an existing account.'
        default:                          return 'Something went wrong. Try again.'
    }
}
