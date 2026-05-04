'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { CtaButton, FieldInput } from './primitives'
import { createAccount, resendEmailOtp, verifyEmailOtp } from './actions'
import { DRAFT_KEY, type FormState } from './data'

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

    // Resend cooldown ticker.
    useEffect(() => {
        if (resendIn <= 0) return
        const t = setTimeout(() => setResendIn(s => s - 1), 1000)
        return () => clearTimeout(t)
    }, [resendIn])

    const sendCode = () => {
        if (isPending) return
        setError('')
        if (!form.email.trim()) { setError('Email is required.'); return }
        if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }

        // Resolve "Other" choices the same way the legacy handler in page.tsx did.
        const finalDorm = form.dorm === 'Other' ? form.customDorm.trim() : form.dorm
        const finalUni  = form.university === 'Other' ? form.customUniversity.trim() : form.university

        startTransition(async () => {
            const result = await createAccount({
                preference: form.preference,
                allergens:  form.allergens.length ? form.allergens : ['None'],
                spiceLevel: form.spiceLevel,
                dorm:       finalDorm,
                university: finalUni,
                name:       form.name.trim(),
                phone:      form.phone.trim(),
                email:      form.email.trim(),
                password:   form.password,
                vegDays:    form.vegDays,
            })
            // Server-side redirect happened (existing user → /login, or session
            // already active → /dashboard). Wipe the draft and let it land.
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
            // Brief beat so the green check is visible before the redirect.
            setTimeout(() => router.replace('/dashboard'), 500)
        })
    }

    // Auto-verify the moment the user finishes typing/pasting a full code.
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

    // Escape hatch from 'sent' phase. Keeps email/password editable so the
    // user can fix a typo without losing their place. The old unconfirmed
    // auth user becomes a short-lived orphan — Supabase cleans those up.
    const editCredentials = () => {
        setStage('enter')
        setCode('')
        setError('')
        setResendIn(0)
    }

    // Single submit handler for both phases. Fires on Enter in any input AND
    // on CTA click. Phase decides which action runs.
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (verified || isPending) return
        if (stage === 'enter') return sendCode()
        return verify(code)
    }

    const lockedFields = stage === 'sent'

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">Create Account</p>
                <h1 className="text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-tight">
                    You&apos;re<br />almost in.
                </h1>
                <p className="text-white/40 text-[13px] mt-2">
                    {stage === 'enter'
                        ? 'Create your login to lock in your preferences.'
                        : `Enter the ${OTP_LENGTH}-digit code we just emailed you.`}
                </p>
            </div>

            <div className="space-y-3">
                {/* Email + password stay mounted across both phases. Only their
                    enabled state changes — mirrors the Stripe / Notion / GitHub
                    pattern of "context never disappears during verification". */}
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
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-white/35 mb-1.5">Password</label>
                    <div className="relative">
                        <input
                            type={showPass ? 'text' : 'password'}
                            placeholder="Min. 8 characters"
                            value={form.password}
                            onChange={e => set('password', e.target.value)}
                            autoComplete="new-password"
                            disabled={lockedFields}
                            className="w-full bg-[#0d2035] border border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.08)] rounded-xl px-4 py-3 pr-11 text-white text-[14px] placeholder-white/20 outline-none transition-all disabled:opacity-60"
                        />
                        <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/25 hover:text-white/55 transition-colors">
                            {showPass ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
                        </button>
                    </div>
                    {!lockedFields && (
                        <p className="text-white/25 text-[12px] mt-1.5">Use at least 8 characters.</p>
                    )}
                </div>

                {/* OTP appears below the locked credentials, completing the form. */}
                {stage === 'sent' && (
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-white/35 mb-1.5">
                            Verification Code
                        </label>
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
                                className={`w-full bg-[#0d2035] border rounded-xl px-4 py-3 pr-11 text-white text-[18px] font-mono tracking-[0.35em] placeholder-white/15 outline-none transition-all disabled:opacity-60 ${
                                    verified
                                        ? 'border-[#22c55e]/60 shadow-[0_0_0_3px_rgba(34,197,94,0.08)]'
                                        : 'border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.08)]'
                                }`}
                            />
                            {verified && (
                                <CheckCircle2 size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#22c55e]" strokeWidth={2.2} />
                            )}
                        </div>
                        <div className="flex items-center justify-between mt-1.5 gap-3 flex-wrap">
                            <p className="text-white/45 text-[11px] flex-1 min-w-0">
                                Sent to <span className="text-white/70 font-medium break-all">{form.email}</span>.{' '}
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
                                className="text-[#f57f20] text-[11px] font-semibold disabled:text-white/30 disabled:pointer-events-none whitespace-nowrap"
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
                        className="px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.18] text-red-400 text-[13px] text-center">
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            {stage === 'enter' ? (
                <CtaButton
                    type="submit"
                    disabled={isPending || !form.email.trim() || form.password.length < 8}
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

            <p className="text-center text-white/20 text-[11px]">
                By continuing you agree to our{' '}
                <Link href="/terms" className="underline hover:text-white/40 transition-colors">Terms</Link>{' '}and{' '}
                <Link href="/privacy" className="underline hover:text-white/40 transition-colors">Privacy Policy</Link>.
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
