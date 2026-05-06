'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { CtaButton, FieldInput } from './primitives'
import { createAccount, resendEmailOtp, verifyEmailOtp } from './actions'
import { DRAFT_KEY, type FormState } from './data'
import { useIsLight } from '@/hooks/useIsLight'
import { authTokens } from '@/lib/auth-theme'
import { isPasswordStrong, PASSWORD_RULES_TEXT } from '@/lib/validation'
import { PasswordChecklist } from '@/components/auth/PasswordChecklist'

// Supabase email OTPs in this project are 8 digits (configured in
// Auth → Settings → Email OTP length). Bump this if you change that setting;
// if it's ever made variable per-locale we'd plumb it through the API instead.
const OTP_LENGTH = 8

// Step 7: account credentials with inline OTP verification — mirrors PhoneStep
// (one logical step, two phases). Email + password stay visible (disabled)
// during the 'sent' phase so the user retains visual context — same pattern
// Stripe / Notion / GitHub use. "Wrong email?" link unlocks for editing.
//
// Form-wide submit handler dispatches based on phase, so Enter submits in any
// input (sends the code in 'enter' phase, verifies the code in 'sent' phase).
export function EmailStep({ form, set }: {
    form: FormState
    set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}) {
    const router = useRouter()
    const [stage,    setStage]    = useState<'enter' | 'sent'>('enter')
    const [showPass, setShowPass] = useState(false)
    const [code,     setCode]     = useState('')
    const [verified, setVerified] = useState(false)
    const [error,    setError]    = useState('')
    const [resendIn, setResendIn] = useState(0)
    const [isPending, startTransition] = useTransition()
    const codeRef = useRef<HTMLInputElement>(null)

    const isLight = useIsLight()
    const tokens = authTokens(isLight)

    useEffect(() => {
        if (resendIn <= 0) return
        const t = setTimeout(() => setResendIn(s => s - 1), 1000)
        return () => clearTimeout(t)
    }, [resendIn])

    const sendCode = () => {
        if (isPending) return
        setError('')
        if (!form.email.trim()) { setError('Email is required.'); return }
        if (!isPasswordStrong(form.password)) { setError(PASSWORD_RULES_TEXT); return }

        const finalDorm = form.dorm === 'Other' ? form.customDorm.trim() : form.dorm
        const finalUni  = form.university === 'Other' ? form.customUniversity.trim() : form.university

        startTransition(async () => {
            const result = await createAccount({
                preference: form.preference,
                allergens:  form.allergens.length ? form.allergens : ['None'],
                spiceLevel: form.spiceLevel,
                dorm:       finalDorm,
                university: finalUni,
                weekType:   form.weekType,
                name:       form.name.trim(),
                phone:      form.phone.trim(),
                email:      form.email.trim(),
                password:   form.password,
                vegDays:    form.vegDays,
            })
            if (!result) { try { sessionStorage.removeItem(DRAFT_KEY) } catch {} ; return }
            if ('error' in result) { setError(result.error); return }
            if ('requiresConfirmation' in result) {
                try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
                setStage('sent')
                setResendIn(45)
                setCode('')
                setTimeout(() => codeRef.current?.focus(), 60)
            }
        })
    }

    const verify = (token: string) => {
        if (isPending || verified || token.length !== OTP_LENGTH) return
        setError('')
        startTransition(async () => {
            const res = await verifyEmailOtp(form.email.trim(), token)
            if ('error' in res) { setError(prettifyError(res.error)); return }
            setVerified(true)
            setTimeout(() => router.replace('/dashboard'), 500)
        })
    }

    useEffect(() => {
        if (code.length === OTP_LENGTH) verify(code)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code])

    const resend = () => {
        if (resendIn > 0 || isPending) return
        setError('')
        startTransition(async () => {
            const res = await resendEmailOtp(form.email.trim())
            if ('error' in res) { setError(prettifyError(res.error)); return }
            setResendIn(45)
            setCode('')
            codeRef.current?.focus()
        })
    }

    const editCredentials = () => {
        setStage('enter')
        setCode('')
        setError('')
        setResendIn(0)
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (verified || isPending) return
        if (stage === 'enter') return sendCode()
        return verify(code)
    }

    const lockedFields = stage === 'sent'

    const headlineCls    = `text-[28px] sm:text-[32px] font-black tracking-tight leading-tight ${tokens.heading}`
    const sublineCls     = `text-[13px] mt-2 ${tokens.subline}`
    const labelCls       = `block text-[11px] font-bold uppercase tracking-widest mb-1.5 ${tokens.label}`
    const sentToCls      = `text-[11px] flex-1 min-w-0 ${tokens.subline}`
    const sentToValueCls = `font-medium break-all ${isLight ? 'text-[#091825]/85' : 'text-white/85'}`
    const termsCls       = `text-center text-[11px] ${tokens.termsBase}`
    const termsLinkCls   = `underline transition-colors ${tokens.termsHover}`
    const eyeBtnCls      = `absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors ${tokens.eyeBtn}`

    // Standardised across login + profile change-password: bigger glyph and
    // wider tracking when masked so the dots read as a deliberate visual.
    // Visible (type=text) reverts to the regular 14px so the actual password
    // doesn't dominate the column.
    const passInputCls = `w-full rounded-xl px-4 py-3 pr-11 outline-none transition-all border ${tokens.field} ${tokens.fieldFocus} disabled:opacity-60 ${showPass ? 'text-[14px]' : 'text-[18px] tracking-[0.22em] font-semibold'}`

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">Create Account</p>
                <h1 className={headlineCls}>
                    You&apos;re<br />almost in.
                </h1>
                <p className={sublineCls}>
                    {stage === 'enter'
                        ? 'Create your login to lock in your preferences.'
                        : `Enter the ${OTP_LENGTH}-digit code we just emailed you.`}
                </p>
            </div>

            <div className="space-y-3">
                <FieldInput
                    label="Email Address"
                    type="email"
                    placeholder="you@university.edu"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    autoComplete="username"
                    disabled={lockedFields}
                />

                <div>
                    <label className={labelCls}>Password</label>
                    <div className="relative">
                        <input
                            type={showPass ? 'text' : 'password'}
                            placeholder="Choose a strong password"
                            value={form.password}
                            onChange={e => set('password', e.target.value)}
                            autoComplete="new-password"
                            disabled={lockedFields}
                            className={passInputCls}
                        />
                        <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)} className={eyeBtnCls}>
                            {showPass ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
                        </button>
                    </div>
                    {!lockedFields && <PasswordChecklist password={form.password} />}
                </div>

                {stage === 'sent' && (
                    <div>
                        <label className={labelCls}>Verification Code</label>
                        <div className="relative">
                            <input
                                ref={codeRef}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={OTP_LENGTH}
                                value={code}
                                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                                placeholder={'•'.repeat(OTP_LENGTH)}
                                disabled={isPending || verified}
                                className={`w-full rounded-xl px-4 py-3 pr-11 text-[18px] font-mono tracking-[0.35em] outline-none transition-all disabled:opacity-60 border ${tokens.field} ${
                                    verified
                                        ? 'border-[#22c55e]/60 shadow-[0_0_0_3px_rgba(34,197,94,0.08)]'
                                        : tokens.fieldFocus
                                }`}
                            />
                            {verified && (
                                <CheckCircle2 size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#22c55e]" strokeWidth={2.2} />
                            )}
                        </div>
                        <div className="flex items-center justify-between mt-1.5 gap-3 flex-wrap">
                            <p className={sentToCls}>
                                Sent to <span className={sentToValueCls}>{form.email}</span>.{' '}
                                <button
                                    type="button"
                                    onClick={editCredentials}
                                    className="text-[#f57f20] hover:text-[#ff8f36] font-semibold transition-colors"
                                >
                                    Wrong email?
                                </button>
                            </p>
                            <button
                                type="button"
                                onClick={resend}
                                disabled={resendIn > 0 || isPending}
                                className={`text-[#f57f20] text-[11px] font-semibold disabled:pointer-events-none whitespace-nowrap ${isLight ? 'disabled:text-[#091825]/55' : 'disabled:text-white/55'}`}
                            >
                                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className={`${tokens.errorBanner} ${tokens.errorText}`}>
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            {stage === 'enter' ? (
                <CtaButton
                    type="submit"
                    disabled={isPending || !form.email.trim() || !isPasswordStrong(form.password)}
                >
                    {isPending ? 'Sending…' : 'Send verification code →'}
                </CtaButton>
            ) : verified ? (
                <CtaButton type="submit" disabled>Verified ✓</CtaButton>
            ) : (
                <CtaButton type="submit" disabled={code.length !== OTP_LENGTH || isPending}>
                    {isPending ? 'Verifying…' : 'Verify & continue →'}
                </CtaButton>
            )}

            <p className={termsCls}>
                By continuing you agree to our{' '}
                <Link href="/terms" className={termsLinkCls}>Terms</Link>{' '}and{' '}
                <Link href="/privacy" className={termsLinkCls}>Privacy Policy</Link>.
            </p>
        </form>
    )
}

// Translate Supabase's error strings into customer-facing copy.
function prettifyError(msg: string): string {
    const lower = msg.toLowerCase()
    if (lower.includes('expired') || lower.includes('invalid'))    return 'That code is wrong or expired. Try again or resend.'
    if (lower.includes('rate') || lower.includes('too many'))       return 'Too many attempts. Wait a minute and try again.'
    return msg
}
