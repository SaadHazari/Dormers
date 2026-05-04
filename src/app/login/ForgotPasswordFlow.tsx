'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { requestPasswordReset, updatePassword, verifyResetOtp } from './actions'

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
            // Brief beat for the success state, then move to set-password.
            setTimeout(() => setPhase('reset'), 400)
        })
    }

    // Auto-verify on full-length input (typed or pasted).
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
        if (newPass.length < 8) { setError('Password must be at least 8 characters.'); return }
        if (newPass !== confirm) { setError('Passwords don’t match.'); return }
        startTransition(async () => {
            const res = await updatePassword(newPass)
            if ('error' in res) { setError(prettifyError(res.error)); return }
            setDone(true)
            // Brief beat for the success state, then dashboard.
            setTimeout(() => router.replace('/dashboard'), 600)
        })
    }

    // Form-level submit dispatches by phase (Enter key + button click).
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
            : 'Choose a new password — at least 8 characters.'

    return (
        <form onSubmit={handleSubmit}>
            <div className="mb-5">
                <button
                    type="button"
                    onClick={onBackToSignIn}
                    className="text-[#091825]/55 hover:text-[#091825]/85 text-[12px] font-semibold mb-3 transition-colors"
                >
                    ← Back to sign in
                </button>
                <h1 className="text-[20px] font-bold text-[#091825] tracking-tight leading-snug">{heading}</h1>
                <p className="text-[#091825]/55 text-[13px] mt-1">{subhead}</p>
            </div>

            {/* Phase: request — email entry */}
            {phase === 'request' && (
                <div className="mb-3.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#091825]/55 mb-2">Email</label>
                    <input
                        type="email"
                        required
                        autoComplete="email"
                        autoFocus
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-white/80 border border-[#091825]/[0.12] hover:border-[#091825]/[0.22] focus:border-[#f57f20]/70 focus:bg-white focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] rounded-xl px-4 py-3 text-[#091825] text-[14px] placeholder-[#091825]/30 outline-none transition-all duration-200"
                    />
                </div>
            )}

            {/* Phase: verify — OTP entry */}
            {phase === 'verify' && (
                <div className="space-y-3">
                    <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#091825]/55 mb-2">Email</label>
                        <input
                            type="email"
                            value={email}
                            disabled
                            className="w-full bg-white/40 border border-[#091825]/[0.10] rounded-xl px-4 py-3 text-[#091825]/65 text-[14px] outline-none transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#091825]/55 mb-2">Verification Code</label>
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
                                className={`w-full bg-white/80 border rounded-xl px-4 py-3 pr-11 text-[#091825] text-[18px] font-mono tracking-[0.35em] placeholder-[#091825]/25 outline-none transition-all disabled:opacity-60 ${
                                    verified
                                        ? 'border-[#22c55e]/60 shadow-[0_0_0_3px_rgba(34,197,94,0.10)]'
                                        : 'border-[#091825]/[0.12] hover:border-[#091825]/[0.22] focus:border-[#f57f20]/70 focus:bg-white focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)]'
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
                                className="text-[#f57f20] text-[11px] font-semibold disabled:text-[#091825]/30 disabled:pointer-events-none whitespace-nowrap"
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
                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#091825]/55 mb-2">New Password</label>
                        <div className="relative">
                            <input
                                ref={passRef}
                                type={showPass ? 'text' : 'password'}
                                placeholder="Min. 8 characters"
                                value={newPass}
                                onChange={e => setNewPass(e.target.value)}
                                autoComplete="new-password"
                                disabled={isPending || done}
                                className="w-full bg-white/80 border border-[#091825]/[0.12] hover:border-[#091825]/[0.22] focus:border-[#f57f20]/70 focus:bg-white focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] rounded-xl px-4 py-3 pr-11 text-[#091825] text-[14px] placeholder-[#091825]/30 outline-none transition-all disabled:opacity-60"
                            />
                            <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#091825]/45 hover:text-[#091825]/75 transition-colors">
                                {showPass ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#091825]/55 mb-2">Confirm Password</label>
                        <input
                            type={showPass ? 'text' : 'password'}
                            placeholder="Re-enter your new password"
                            value={confirm}
                            onChange={e => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            disabled={isPending || done}
                            className="w-full bg-white/80 border border-[#091825]/[0.12] hover:border-[#091825]/[0.22] focus:border-[#f57f20]/70 focus:bg-white focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] rounded-xl px-4 py-3 text-[#091825] text-[14px] placeholder-[#091825]/30 outline-none transition-all disabled:opacity-60"
                        />
                    </div>
                </div>
            )}

            <div className="mt-4 mb-4 min-h-0">
                <AnimatePresence>
                    {error && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                            className="px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.18] text-red-600 text-[13px] text-center leading-snug">
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <button
                type="submit"
                disabled={isPending || done || (phase === 'verify' && verified)}
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
