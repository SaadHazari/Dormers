'use client'

import { useEffect, useRef, useState } from 'react'
import { CtaButton, FieldInput, PhoneField } from './primitives'
import { OtpInput } from '@/components/auth/OtpInput'
import type { FormState } from './data'
import { useIsLight } from '@/ui-system/hooks/useIsLight'
import { authTokens } from '@/ui-system/tokens/auth-theme'
import { isAlphaName, sanitizeNameInput } from '@/shared/validation'

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
    // Resend tracks its own in-flight state. When it shared `busy` with the
    // primary action, pressing "Resend code" flipped the submit button to
    // "Verifying…" and disabled it — the user sees a button they didn't press
    // react to their click. See ForgotPasswordFlow for the same fix.
    const [resending, setResending] = useState(false)
    const [resendIn, setResendIn] = useState(0)
    // Phase 6 (L8): set when a WhatsApp send fails and the server signals the
    // email fallback is available — lets the user continue via email during an outage.
    const [fallbackOffer, setFallbackOffer] = useState(false)
    const otpRef = useRef<HTMLInputElement>(null)

    const isLight = useIsLight()
    const tokens = authTokens(isLight)

    // Resend cooldown ticker. Plain interval, cleaned up on unmount/change.
    useEffect(() => {
        if (resendIn <= 0) return
        const t = setTimeout(() => setResendIn(s => s - 1), 1000)
        return () => clearTimeout(t)
    }, [resendIn])

    const sendCode = async ({ isResend = false }: { isResend?: boolean } = {}) => {
        if (busy || resending || !isAlphaName(form.name) || !form.phone.trim()) return
        const setInFlight = isResend ? setResending : setBusy
        setInFlight(true); setError('')
        try {
            const res  = await fetch('/api/whatsapp/start', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ phone: form.phone }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                setError(messageForError(data?.error))
                if (data?.error === 'cooldown' && data.retryAfter) setResendIn(Number(data.retryAfter) || 30)
                if (data?.fallbackAvailable) setFallbackOffer(true)
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
            setInFlight(false)
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
        setFallbackOffer(false) // a new number must fail on its own to re-offer
    }

    // Phase 6 (L8): WhatsApp send failed — continue via email. The phone is left
    // unverified; createAccount re-confirms the failure server-side and the
    // checkout profile gate forces phone re-verification before delivery.
    const continueWithEmail = () => {
        set('emailFallback', true)
        advance()
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
                    {/* Name the channel here, not just in the field label above.
                        This is the line the user reads immediately before
                        pressing send, and it's where they decide which app to
                        go watch. Replaces the old wording rather than adding a
                        line, so the step's height is unchanged. */}
                    {stage === 'enter' && (
                        <p className={`text-[11px] mt-1.5 ${tokens.subline}`}>
                            We&apos;ll send a 6-digit code to this number on WhatsApp.
                        </p>
                    )}
                </div>

                {stage === 'sent' && (
                    <div>
                        <OtpInput
                            label="Verification Code"
                            value={otp}
                            onChange={setOtp}
                            length={OTP_LENGTH}
                            disabled={busy || form.phoneVerified}
                            verified={form.phoneVerified}
                            autoFocus
                            inputRef={otpRef}
                            ariaLabel="WhatsApp verification code"
                        />
                        <div className="flex items-center justify-between mt-1.5 gap-3 flex-wrap">
                            {/* Names the channel instead of echoing the number:
                                the number is already visible in the locked
                                field directly above, so repeating it cost a
                                line wrap at 375px while adding nothing. This
                                reads shorter than the old "Sent to +9715…"
                                and still fits on one line. */}
                            <p className={`text-[11px] flex-1 min-w-0 ${tokens.subline}`}>
                                Sent on <span className={`font-medium ${isLight ? 'text-[#091825]/85' : 'text-white/85'}`}>WhatsApp</span>.{' '}
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
                                onClick={() => sendCode({ isResend: true })}
                                disabled={resendIn > 0 || busy || resending}
                                className={`text-[#f57f20] text-[11px] font-semibold disabled:pointer-events-none whitespace-nowrap ${isLight ? 'disabled:text-[#091825]/55' : 'disabled:text-white/55'}`}
                            >
                                {resending      ? 'Sending…'
                                : resendIn > 0  ? `Resend in ${resendIn}s`
                                :                 'Resend code'}
                            </button>
                        </div>
                    </div>
                )}

                {error && (
                    <p className={`text-[12px] font-medium ${tokens.errorText}`}>{error}</p>
                )}

                {fallbackOffer && stage === 'enter' && !form.phoneVerified && (
                    <button
                        type="button"
                        onClick={continueWithEmail}
                        className="block text-left text-[#f57f20] hover:text-[#ff8f36] text-[12px] font-semibold transition-colors"
                    >
                        Can&apos;t get the WhatsApp code? Continue with email — you&apos;ll confirm WhatsApp later →
                    </button>
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
        case 'too_many_attempts':  return 'Too many wrong attempts. Send a new code.'
        default:                   return 'Something went wrong. Try again.'
    }
}
