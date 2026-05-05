'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { requestPasswordReset, updatePassword, verifyResetOtp } from './actions'
import { useIsLight } from '@/hooks/useIsLight'
import { useCapsLock } from '@/hooks/useCapsLock'
import { authTokens } from '@/lib/auth-theme'
import { isPasswordStrong, PASSWORD_RULES_TEXT } from '@/lib/validation'
import { PasswordChecklist } from '@/components/auth/PasswordChecklist'

// Supabase email OTPs in this project are 8 digits (Auth → Settings).
// If you change that setting, bump this constant.
const OTP_LENGTH = 8

type Phase = 'request' | 'verify' | 'reset'

// Three-phase password reset flow, lives inside the login card. Mirrors the
// onboarding pattern (PhoneStep / EmailStep) — single component, multiple
// phases, no scene changes.
//
// Two entry points converge here:
//   • OTP path:    user enters email → we send code → user types code → set new password
//   • Magic-link:  user clicks the link in the email → /auth/confirm verifies →
//                  redirects to /login?step=set-password → we land directly in 'reset'
export function ForgotPasswordFlow({
    initialPhase = 'request',
    initialEmail = '',
    onBackToSignIn,
}: {
    initialPhase?: Phase
    initialEmail?: string
    onBackToSignIn: () => void
}) {
    const router = useRouter()
    const [phase,    setPhase]    = useState<Phase>(initialPhase)
    const [email,    setEmail]    = useState(initialEmail)
    const [otp,      setOtp]      = useState('')
    const [newPass,  setNewPass]  = useState('')
    const [confirm,  setConfirm]  = useState('')
    const [showPass, setShowPass] = useState(false)
    const [verified, setVerified] = useState(false)
    const [done,     setDone]     = useState(false)
    const [error,    setError]    = useState('')
    const [resendIn, setResendIn] = useState(0)
    const [isPending, startTransition] = useTransition()
    const otpRef  = useRef<HTMLInputElement>(null)
    const passRef = useRef<HTMLInputElement>(null)

    const isLight = useIsLight()
    const tokens = authTokens(isLight)
    const { capsOn, onKeyDown: capsKeyDown, onKeyUp: capsKeyUp } = useCapsLock()

    // Resend cooldown ticker.
    useEffect(() => {
        if (resendIn <= 0) return
        const t = setTimeout(() => setResendIn(s => s - 1), 1000)
        return () => clearTimeout(t)
    }, [resendIn])

    // Focus management on phase change.
    useEffect(() => {
        if (phase === 'verify') setTimeout(() => otpRef.current?.focus(), 60)
        if (phase === 'reset')  setTimeout(() => passRef.current?.focus(), 60)
    }, [phase])

    const sendCode = () => {
        if (isPending) return
        setError('')
        if (!email.trim()) { setError('Please enter your email.'); return }
        startTransition(async () => {
            const res = await requestPasswordReset(email.trim())
            if ('error' in res) { setError(res.error); return }
            setPhase('verify')
            setResendIn(45)
            setOtp('')
        })
    }

    const verify = (token: string) => {
        if (isPending || verified || token.length !== OTP_LENGTH) return
        setError('')
        startTransition(async () => {
            const res = await verifyResetOtp(email.trim(), token)
            if ('error' in res) { setError(prettifyError(res.error)); return }
            setVerified(true)
            setTimeout(() => setPhase('reset'), 400)
        })
    }

    useEffect(() => {
        if (otp.length === OTP_LENGTH) verify(otp)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otp])

    const resend = () => {
        if (resendIn > 0 || isPending) return
        setError('')
        startTransition(async () => {
            const res = await requestPasswordReset(email.trim())
            if ('error' in res) { setError(res.error); return }
            setResendIn(45)
            setOtp('')
            otpRef.current?.focus()
        })
    }

    const editEmail = () => {
        setPhase('request')
        setOtp('')
        setVerified(false)
        setError('')
        setResendIn(0)
    }

    const setNewPassword = () => {
        if (isPending) return
        setError('')
        if (!isPasswordStrong(newPass)) { setError(PASSWORD_RULES_TEXT); return }
        if (newPass !== confirm) { setError('Passwords don’t match.'); return }
        startTransition(async () => {
            const res = await updatePassword(newPass)
            if ('error' in res) { setError(prettifyError(res.error)); return }
            setDone(true)
            setTimeout(() => router.replace('/dashboard'), 600)
        })
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (isPending || done) return
        if (phase === 'request') return sendCode()
        if (phase === 'verify')  return verify(otp)
        return setNewPassword()
    }

    const heading = phase === 'request' ? 'Reset your password.'
                  : phase === 'verify'  ? 'Check your email.'
                  : 'Set a new password.'

    const subhead = phase === 'request'
        ? "We'll email you a code to verify it's you."
        : phase === 'verify'
            ? `Enter the ${OTP_LENGTH}-digit code we just sent.`
            : 'Choose a strong new password.'

    const fieldClass   = `w-full rounded-xl px-4 py-3 text-[14px] outline-none transition-all duration-200 border ${tokens.field} ${tokens.fieldFocus} disabled:opacity-60`
    const labelClass   = `block text-[11px] font-semibold uppercase tracking-widest mb-2 ${tokens.label}`
    const headingClass = `text-[20px] font-bold tracking-tight leading-snug ${tokens.heading}`
    const subClass     = `text-[13px] mt-1 ${tokens.subline}`
    const eyeBtnClass  = `absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors ${tokens.eyeBtn}`

    return (
        <form onSubmit={handleSubmit}>
            <div className="mb-5">
                <button
                    type="button"
                    onClick={onBackToSignIn}
                    className={`text-[12px] font-semibold mb-3 transition-colors ${tokens.backLink}`}
                >
                    ← Back to sign in
                </button>
                <h1 className={headingClass}>{heading}</h1>
                <p className={subClass}>{subhead}</p>
            </div>

            {/* Phase: request — email entry */}
            {phase === 'request' && (
                <div className="mb-3.5">
                    <label className={labelClass}>Email</label>
                    <input
                        type="email"
                        required
                        autoComplete="email"
                        autoFocus
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className={fieldClass}
                    />
                </div>
            )}

            {/* Phase: verify — OTP entry */}
            {phase === 'verify' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelClass}>Email</label>
                        <input
                            type="email"
                            value={email}
                            disabled
                            className={fieldClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Verification Code</label>
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
                                disabled={isPending || verified}
                                className={`${fieldClass} pr-11 text-[18px] font-mono tracking-[0.35em] ${
                                    verified ? 'border-[#22c55e]/60 shadow-[0_0_0_3px_rgba(34,197,94,0.10)]' : ''
                                }`}
                            />
                            {verified && (
                                <CheckCircle2 size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#22c55e]" strokeWidth={2.2} />
                            )}
                        </div>
                        <div className="flex items-center justify-between mt-2 gap-3 flex-wrap">
                            <button type="button" onClick={editEmail}
                                className="text-[#f57f20] hover:text-[#ff8f36] text-[11px] font-semibold transition-colors">
                                Wrong email?
                            </button>
                            <button
                                type="button"
                                onClick={resend}
                                disabled={resendIn > 0 || isPending}
                                className={`text-[#f57f20] text-[11px] font-semibold disabled:pointer-events-none whitespace-nowrap ${isLight ? 'disabled:text-[#091825]/30' : 'disabled:text-white/30'}`}
                            >
                                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Phase: reset — new password */}
            {phase === 'reset' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelClass}>New Password</label>
                        <div className="relative">
                            <input
                                ref={passRef}
                                type={showPass ? 'text' : 'password'}
                                placeholder="Choose a strong password"
                                value={newPass}
                                onChange={e => setNewPass(e.target.value)}
                                onKeyDown={capsKeyDown}
                                onKeyUp={capsKeyUp}
                                autoComplete="new-password"
                                disabled={isPending || done}
                                className={`${fieldClass} pr-11`}
                            />
                            <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)} className={eyeBtnClass}>
                                {showPass ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
                            </button>
                        </div>
                        {capsOn && (
                            <p className="text-[11px] font-semibold text-[#f57f20] mt-1.5 flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#f57f20]" />
                                Caps Lock is on
                            </p>
                        )}
                        <PasswordChecklist password={newPass} />
                    </div>
                    <div>
                        <label className={labelClass}>Confirm Password</label>
                        <input
                            type={showPass ? 'text' : 'password'}
                            placeholder="Re-enter your new password"
                            value={confirm}
                            onChange={e => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            disabled={isPending || done}
                            className={fieldClass}
                        />
                    </div>
                </div>
            )}

            <div className="mt-4 mb-4 min-h-0">
                <AnimatePresence>
                    {error && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                            className={`${tokens.errorBanner} ${tokens.errorText}`}>
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <button
                type="submit"
                disabled={
                    isPending || done
                    || (phase === 'verify' && verified)
                    || (phase === 'reset' && (!isPasswordStrong(newPass) || newPass !== confirm))
                }
                className="relative w-full flex items-center justify-center gap-2.5 bg-[#f57f20] hover:bg-[#ff8f36] active:scale-[0.98] disabled:opacity-55 disabled:pointer-events-none text-white font-bold text-[14px] py-3.5 rounded-xl transition-all duration-200 shadow-[0_0_24px_rgba(245,127,32,0.22)]"
            >
                {done       ? 'Updated ✓'
                : isPending ? (phase === 'request' ? 'Sending…' : phase === 'verify' ? 'Verifying…' : 'Updating…')
                : phase === 'request' ? 'Send code'
                : phase === 'verify'  ? 'Verify code'
                :                       'Update password'}
            </button>
        </form>
    )
}

function prettifyError(msg: string): string {
    const lower = msg.toLowerCase()
    if (lower.includes('expired'))                               return 'That code expired. Resend a new one.'
    if (lower.includes('invalid'))                                return 'That code is wrong. Try again.'
    if (lower.includes('rate') || lower.includes('too many'))      return 'Too many attempts. Wait a moment and try again.'
    if (lower.includes('session') || lower.includes('jwt'))         return 'Your reset session expired. Start over and request a new code.'
    return msg
}
