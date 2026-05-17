'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Check, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { FieldInput, CtaButton, PhoneField } from '@/app/onboarding/primitives'
import { PasswordChecklist } from '@/components/auth/PasswordChecklist'
import { isPasswordStrong } from '@/lib/validation'
import { DORMS } from '@/app/onboarding/data'
import { nextTrialDeliveryLabel } from '@/lib/trial-delivery'
import { claimGift, sendTrialEmailOtp, setTrialPassword, verifyTrialEmailOtp } from './actions'

// Matches the dark onboarding page exactly — same bg, same primitives, same
// OTP affordances (Send code → Verify & continue) as PhoneStep + EmailStep.
//
// Two independent OTP gates run inline:
//   • WhatsApp OTP via the project's existing /api/whatsapp/* endpoints — 6 digits.
//   • Email OTP via Supabase Auth — 8 digits (the project's Auth setting).
//
// The email OTP verification ALSO creates the passwordless auth.users row that
// claimGift links the customers table to, so trial users land in the main
// customers table from day one (single source of truth).

const PHONE_OTP_LENGTH = 6 // WhatsApp template — /api/whatsapp/start uses randomInt(100000, 1000000)
const EMAIL_OTP_LENGTH = 6 // Supabase Auth — `{{ .Token }}` from the Magic Link email template (setting flipped 2026-05-17)

type Stage = 'enter' | 'sent' | 'verified'

export default function ReferralLandingPage() {
  const params   = useParams()
  const router   = useRouter()
  const cid      = (Array.isArray(params.cid) ? params.cid[0] : params.cid ?? '').toUpperCase()

  const [inviterName, setInviterName] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)

  const [firstName,   setFirstName]   = useState('')
  const [phone,       setPhone]       = useState('')
  const [email,       setEmail]       = useState('')
  const [dorm,        setDorm]        = useState('')
  const [preference,  setPreference]  = useState('')
  const [error,       setError]       = useState('')
  const [done,        setDone]        = useState(false)
  const [isClaiming,  startClaiming]  = useTransition()

  // Post-claim "lock in your account" step. The user is already authenticated
  // via the email OTP session cookie — we just need to set a password so they
  // can come back via /login (which expects email+password). Skipping is
  // allowed but they'd have to use the email OTP path to log back in.
  const [password,      setPassword]      = useState('')
  const [showPassword,  setShowPassword]  = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [savingPassword, startSavingPassword] = useTransition()

  // Phone OTP state
  const [phoneStage,    setPhoneStage]    = useState<Stage>('enter')
  const [phoneOtp,      setPhoneOtp]      = useState('')
  const [phoneError,    setPhoneError]    = useState('')
  const [phoneBusy,     setPhoneBusy]     = useState(false)
  const [phoneResendIn, setPhoneResendIn] = useState(0)
  const phoneOtpRef = useRef<HTMLInputElement>(null)

  // Email OTP state
  const [emailStage,    setEmailStage]    = useState<Stage>('enter')
  const [emailOtp,      setEmailOtp]      = useState('')
  const [emailError,    setEmailError]    = useState('')
  const [emailBusy,     setEmailBusy]     = useState(false)
  const [emailResendIn, setEmailResendIn] = useState(0)
  const emailOtpRef = useRef<HTMLInputElement>(null)

  const phoneVerified = phoneStage === 'verified'
  const emailVerified = emailStage === 'verified'

  // Resend cooldown tickers — match PhoneStep / EmailStep behavior.
  useEffect(() => {
    if (phoneResendIn <= 0) return
    const t = setTimeout(() => setPhoneResendIn(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phoneResendIn])
  useEffect(() => {
    if (emailResendIn <= 0) return
    const t = setTimeout(() => setEmailResendIn(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [emailResendIn])

  // Resolve the inviter's first name from the CID so the page can be
  // personalised ("Sara sent you a meal") without exposing the full customer row.
  useEffect(() => {
    if (!cid) { setLoading(false); return }
    fetch(`/api/referral/inviter?cid=${encodeURIComponent(cid)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setInviterName(d?.firstName ?? null))
      .catch(() => setInviterName(null))
      .finally(() => setLoading(false))
  }, [cid])

  // ── Phone OTP: send → verify ────────────────────────────────────────────────
  async function sendPhoneCode() {
    if (phoneBusy) return
    setPhoneError('')
    setError('')
    if (!/^\+\d{8,15}$/.test(phone)) {
      setPhoneError('Pick a country and enter your local number.')
      return
    }
    setPhoneBusy(true)
    try {
      const res = await fetch('/api/whatsapp/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPhoneError(messageForPhoneError(data?.error))
        if (data?.error === 'cooldown' && data.retryAfter) setPhoneResendIn(data.retryAfter)
        return
      }
      setPhoneStage('sent')
      setPhoneResendIn(30)
      setPhoneOtp('')
      setTimeout(() => phoneOtpRef.current?.focus(), 50)
    } catch {
      setPhoneError('Network error. Try again.')
    } finally {
      setPhoneBusy(false)
    }
  }
  async function verifyPhoneCode() {
    if (phoneBusy) return
    if (phoneOtp.length !== PHONE_OTP_LENGTH) return
    setPhoneBusy(true)
    setPhoneError('')
    try {
      const res = await fetch('/api/whatsapp/check', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone, code: phoneOtp }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPhoneError(messageForPhoneError(data?.error))
        return
      }
      setPhoneStage('verified')
    } catch {
      setPhoneError('Network error. Try again.')
    } finally {
      setPhoneBusy(false)
    }
  }
  // Auto-verify on full code typed (matches onboarding PhoneStep behavior).
  useEffect(() => {
    if (phoneOtp.length === PHONE_OTP_LENGTH && phoneStage === 'sent' && !phoneBusy) verifyPhoneCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneOtp])
  function editPhone() {
    setPhoneStage('enter')
    setPhoneOtp('')
    setPhoneError('')
    setPhoneResendIn(0)
  }

  // ── Email OTP: send → verify ────────────────────────────────────────────────
  async function sendEmailCode() {
    if (emailBusy) return
    setEmailError('')
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setEmailError('That email doesn\'t look right.')
      return
    }
    setEmailBusy(true)
    const result = await sendTrialEmailOtp(email.trim())
    setEmailBusy(false)
    if ('error' in result) {
      setEmailError(prettifyEmailError(result.error))
      return
    }
    setEmailStage('sent')
    setEmailResendIn(45)
    setEmailOtp('')
    setTimeout(() => emailOtpRef.current?.focus(), 50)
  }
  async function verifyEmailCode() {
    if (emailBusy) return
    if (emailOtp.length < 6) return
    setEmailBusy(true)
    setEmailError('')
    const result = await verifyTrialEmailOtp(email.trim(), emailOtp)
    setEmailBusy(false)
    if ('error' in result) {
      setEmailError(prettifyEmailError(result.error))
      return
    }
    setEmailStage('verified')
  }
  // Auto-verify on full code typed (matches onboarding EmailStep behavior).
  useEffect(() => {
    if (emailOtp.length === EMAIL_OTP_LENGTH && emailStage === 'sent' && !emailBusy) verifyEmailCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailOtp])
  function editEmail() {
    setEmailStage('enter')
    setEmailOtp('')
    setEmailError('')
    setEmailResendIn(0)
  }

  // Edits to phone/email after verification drop back to enter stage.
  useEffect(() => {
    if (phoneStage !== 'enter') editPhone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone])
  useEffect(() => {
    if (emailStage !== 'enter') editEmail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  // ── Claim submit ──────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isClaiming || done) return
    setError('')
    if (!firstName.trim()) { setError('Please enter your first name.'); return }
    if (!phoneVerified)    { setError('Please verify your WhatsApp number above.'); return }
    if (!emailVerified)    { setError('Please verify your email above.'); return }
    if (!dorm)             { setError('Please select your dorm.'); return }
    if (!preference)       { setError('Please choose a meal preference.'); return }

    // Stable per-browser device fingerprint — random UUID persisted in
    // localStorage. Catches the easy burner-farm case where the same browser
    // claims via multiple disposable phone/email combos.
    let deviceFp: string | undefined
    if (typeof window !== 'undefined') {
      try {
        deviceFp = localStorage.getItem('dormers-device-fp') ?? undefined
        if (!deviceFp) {
          deviceFp = crypto.randomUUID()
          localStorage.setItem('dormers-device-fp', deviceFp)
        }
      } catch { /* storage disabled (private mode) — skip the fingerprint */ }
    }

    startClaiming(async () => {
      const result = await claimGift({
        inviterCid:  cid,
        firstName:   firstName.trim(),
        phone:       phone.trim(),
        email:       email.trim(),
        dormName:    dorm,
        preference,
        deviceFp,
      })

      if ('ok' in result)      { setDone(true); return }
      if ('blocked' in result) { setError(result.reason); return }
      setError(result.error)
    })
  }

  // ── Save password on the success state ────────────────────────────────────
  function savePassword() {
    if (savingPassword || passwordSaved) return
    setPasswordError('')
    if (!isPasswordStrong(password)) {
      setPasswordError('Pick a stronger password — see the rules below.')
      return
    }
    startSavingPassword(async () => {
      const result = await setTrialPassword(password)
      if ('error' in result) {
        setPasswordError(result.error)
        return
      }
      setPasswordSaved(true)
      // Brief beat so the user sees the green confirmation before redirect.
      setTimeout(() => router.push('/dashboard'), 700)
    })
  }

  const labelCls    = 'block text-[11px] font-bold uppercase tracking-widest mb-1.5 text-white/65'
  const selectCls   = 'w-full rounded-xl px-4 py-3 text-[14px] outline-none transition-all border bg-[#0d2035]/80 border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] text-white placeholder-white/55'
  const otpBoxCls   = 'w-full rounded-xl px-4 py-3 pr-11 text-[18px] font-mono tracking-[0.35em] text-center outline-none transition-all border bg-[#0d2035]/80 border-[#1e3448] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] text-white placeholder-white/30 disabled:opacity-60'
  const otpVerifyCls= 'w-full rounded-xl px-4 py-3 text-[13px] font-bold uppercase tracking-widest bg-[#f57f20] text-white hover:bg-[#ff8f36] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const otpSendCls  = 'w-full rounded-xl px-4 py-2.5 text-[12px] font-bold uppercase tracking-widest border border-[#f57f20]/40 text-[#f57f20] hover:bg-[#f57f20]/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const verifiedCls = 'flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2.5 text-[12px] font-bold uppercase tracking-widest border border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/[0.06]'

  if (loading) {
    return (
      <div className="min-h-screen bg-[#061520] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-[#f57f20] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#061520] flex flex-col font-montserrat">

      {/* Blur orbs — matches live onboarding exactly */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[360px] rounded-full bg-[#f57f20]/[0.04] blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[#0088cc]/[0.04] blur-[100px]" />
      </div>

      {/* Nav bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5">
        <Link href="/home">
          <Image src="/logo.png" alt="Dormers" width={36} height={36} className="opacity-50 hover:opacity-80 transition-opacity" />
        </Link>
        <Link href="/login" className="text-[12px] font-semibold text-white/55 hover:text-white/80 transition-colors">
          Sign in →
        </Link>
      </div>

      {/* Card */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 pb-12">
        <div
          className="w-full max-w-sm rounded-2xl border border-white/[0.08] p-8"
          style={{
            background:       'rgba(13,32,53,0.70)',
            backdropFilter:   'blur(24px) saturate(1.4)',
            boxShadow:        '0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {done ? (
            // ── Success state ────────────────────────────────────────────────
            // After the gift claim succeeds, prompt the user to lock in a
            // password so they can come back via /login (email+password). The
            // session cookie is already set from verifyTrialEmailOtp, so
            // setTrialPassword just runs auth.updateUser({ password }) on the
            // authed user. Skipping is allowed but flagged — the user would
            // need to use the email-OTP path next time, which /login doesn't
            // support yet.
            //
            // Delivery label is computed dynamically so a Sunday claim doesn't
            // promise tonight (kitchen closed) and a post-14:00-AE claim doesn't
            // promise same-day either — both push to the next operational day.
            (() => {
              const deliveryLabel = nextTrialDeliveryLabel()
              const lowercased    = deliveryLabel.toLowerCase()
              const passOk        = isPasswordStrong(password)
              return (
                <div>
                  <div className="text-center mb-6">
                    <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-[#22c55e]/[0.12] border border-[#22c55e]/30 flex items-center justify-center">
                      <Check size={24} strokeWidth={2.5} className="text-[#22c55e]" />
                    </div>
                    <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">You&apos;re in</p>
                    <h1 className="text-[24px] font-black text-white tracking-tight leading-tight mb-3">
                      Your meal is{deliveryLabel === 'Tonight' ? ' on its way.' : ` arriving ${lowercased}.`}
                    </h1>
                    <p className="text-[13px] text-white/65 leading-relaxed">
                      Expect delivery <span className="text-white/85 font-semibold">{lowercased} between 7–8 PM</span>.
                      We&apos;ll WhatsApp you when it&apos;s close.
                    </p>
                  </div>

                  {/* Lock-in step — required for normal email+password login later */}
                  <div className="space-y-3 pt-6 border-t border-white/[0.08]">
                    <div>
                      <p className="text-[#f57f20] text-[11px] font-bold uppercase tracking-widest mb-1.5">
                        Last step
                      </p>
                      <h2 className="text-[18px] font-black text-white tracking-tight leading-tight">
                        Lock in your account
                      </h2>
                      <p className="text-[12px] text-white/55 leading-snug mt-1.5">
                        Set a password so you can come back, track your meal, and order more without re-verifying every time.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 text-white/65">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Choose a strong password"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          autoComplete="new-password"
                          disabled={passwordSaved || savingPassword}
                          className={`w-full rounded-xl px-4 py-3 pr-11 outline-none transition-all border bg-[#0d2035]/80 border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] text-white placeholder-white/55 disabled:opacity-60 ${showPassword ? 'text-[14px]' : 'text-[18px] tracking-[0.22em] font-semibold'} placeholder:text-[14px] placeholder:tracking-normal placeholder:font-normal`}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/55 hover:text-white/85 transition-colors"
                        >
                          {showPassword ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
                        </button>
                      </div>
                      {!passwordSaved && <PasswordChecklist password={password} />}
                    </div>

                    {passwordError && (
                      <div className="px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.18] text-[13px] text-center text-red-400 leading-snug">
                        {passwordError}
                      </div>
                    )}

                    {passwordSaved ? (
                      <CtaButton type="button" disabled>
                        Password saved ✓ Redirecting…
                      </CtaButton>
                    ) : (
                      <CtaButton
                        type="button"
                        onClick={savePassword}
                        disabled={!passOk || savingPassword}
                      >
                        {savingPassword ? 'Saving…' : 'Save password & continue →'}
                      </CtaButton>
                    )}

                    <button
                      type="button"
                      onClick={() => router.push('/dashboard')}
                      disabled={savingPassword || passwordSaved}
                      className="block w-full text-center text-[11px] text-white/45 hover:text-white/70 underline transition-colors disabled:pointer-events-none"
                    >
                      Skip for now — I&apos;ll set a password later
                    </button>
                  </div>

                  <p className="mt-5 text-[11px] text-white/40 text-center">
                    Your first paid plan comes with{' '}
                    <span className="text-white/65 font-semibold">20% off</span>.
                  </p>
                </div>
              )
            })()
          ) : (
            // ── Claim form ───────────────────────────────────────────────────
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">
                  Free meal
                </p>
                <h1 className="text-[26px] sm:text-[28px] font-black text-white tracking-tight leading-tight">
                  {inviterName
                    ? <>{inviterName} sent<br />you a meal.</>
                    : <>Your friend sent<br />you a meal.</>}
                </h1>
                <p className="text-[13px] mt-2 text-white/65 leading-snug">
                  {(() => {
                    const label = nextTrialDeliveryLabel().toLowerCase()
                    return `No card. No commitment. Just fill in your details and expect delivery ${label} between 7–8 PM.`
                  })()}
                </p>
              </div>

              <div className="space-y-4">
                <FieldInput
                  label="First Name"
                  type="text"
                  placeholder="What should we call you?"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />

                {/* WhatsApp number — PhoneField gives the country-code picker */}
                <div className="space-y-2">
                  <PhoneField
                    label="WhatsApp Number"
                    value={phone}
                    onChange={setPhone}
                    disabled={phoneStage !== 'enter'}
                  />

                  {phoneStage === 'enter' && (
                    <>
                      <p className="text-[11px] text-white/50 -mt-1">
                        We&apos;ll send a 6-digit code to verify this is your number.
                      </p>
                      <button
                        type="button"
                        onClick={sendPhoneCode}
                        disabled={!phone.trim() || phoneBusy}
                        className={otpSendCls}
                      >
                        {phoneBusy ? 'Sending…' : 'Send WhatsApp code'}
                      </button>
                    </>
                  )}

                  {phoneStage === 'sent' && (
                    <>
                      <label className={labelCls}>WhatsApp Code</label>
                      <div className="relative">
                        <input
                          ref={phoneOtpRef}
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={PHONE_OTP_LENGTH}
                          value={phoneOtp}
                          onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, PHONE_OTP_LENGTH))}
                          placeholder={'•'.repeat(PHONE_OTP_LENGTH)}
                          disabled={phoneBusy}
                          className={otpBoxCls}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={verifyPhoneCode}
                        disabled={phoneOtp.length !== PHONE_OTP_LENGTH || phoneBusy}
                        className={otpVerifyCls}
                      >
                        {phoneBusy ? 'Verifying…' : 'Verify WhatsApp'}
                      </button>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-[11px] text-white/55 flex-1">
                          Sent to <span className="text-white/85 font-medium font-mono">{phone}</span>.{' '}
                          <button type="button" onClick={editPhone} className="text-[#f57f20] hover:text-[#ff8f36] font-semibold transition-colors">
                            Wrong number?
                          </button>
                        </p>
                        <button
                          type="button"
                          onClick={sendPhoneCode}
                          disabled={phoneResendIn > 0 || phoneBusy}
                          className="text-[#f57f20] text-[11px] font-semibold disabled:pointer-events-none disabled:text-white/40 whitespace-nowrap"
                        >
                          {phoneResendIn > 0 ? `Resend in ${phoneResendIn}s` : 'Resend code'}
                        </button>
                      </div>
                    </>
                  )}

                  {phoneVerified && (
                    <div className={verifiedCls}>
                      <CheckCircle2 size={14} strokeWidth={3} /> WhatsApp verified
                    </div>
                  )}

                  {phoneError && (
                    <p className="text-[12px] text-red-400 leading-snug">{phoneError}</p>
                  )}
                </div>

                {/* Email + inline OTP verification */}
                <div className="space-y-2">
                  <FieldInput
                    label="Email Address"
                    type="email"
                    placeholder="you@university.edu"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={emailStage !== 'enter'}
                  />

                  {emailStage === 'enter' && (
                    <>
                      <p className="text-[11px] text-white/50 -mt-1">
                        We&apos;ll email an {EMAIL_OTP_LENGTH}-digit code to verify your address.
                      </p>
                      <button
                        type="button"
                        onClick={sendEmailCode}
                        disabled={!email.trim() || emailBusy}
                        className={otpSendCls}
                      >
                        {emailBusy ? 'Sending…' : 'Send email code'}
                      </button>
                    </>
                  )}

                  {emailStage === 'sent' && (
                    <>
                      <label className={labelCls}>Email Code</label>
                      <div className="relative">
                        <input
                          ref={emailOtpRef}
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={EMAIL_OTP_LENGTH}
                          value={emailOtp}
                          onChange={e => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, EMAIL_OTP_LENGTH))}
                          placeholder={'•'.repeat(EMAIL_OTP_LENGTH)}
                          disabled={emailBusy}
                          className={otpBoxCls}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={verifyEmailCode}
                        disabled={emailOtp.length !== EMAIL_OTP_LENGTH || emailBusy}
                        className={otpVerifyCls}
                      >
                        {emailBusy ? 'Verifying…' : 'Verify email'}
                      </button>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-[11px] text-white/55 flex-1">
                          Sent to <span className="text-white/85 font-medium break-all">{email}</span>.{' '}
                          <button type="button" onClick={editEmail} className="text-[#f57f20] hover:text-[#ff8f36] font-semibold transition-colors">
                            Wrong email?
                          </button>
                        </p>
                        <button
                          type="button"
                          onClick={sendEmailCode}
                          disabled={emailResendIn > 0 || emailBusy}
                          className="text-[#f57f20] text-[11px] font-semibold disabled:pointer-events-none disabled:text-white/40 whitespace-nowrap"
                        >
                          {emailResendIn > 0 ? `Resend in ${emailResendIn}s` : 'Resend code'}
                        </button>
                      </div>
                    </>
                  )}

                  {emailVerified && (
                    <div className={verifiedCls}>
                      <CheckCircle2 size={14} strokeWidth={3} /> Email verified
                    </div>
                  )}

                  {emailError && (
                    <p className="text-[12px] text-red-400 leading-snug">{emailError}</p>
                  )}
                </div>

                <div>
                  <label className={labelCls}>Your Dorm</label>
                  <select
                    value={dorm}
                    onChange={e => setDorm(e.target.value)}
                    className={selectCls}
                  >
                    <option value="" disabled>Select your dorm</option>
                    {DORMS.filter(d => d !== 'Other').map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Meal Preference</label>
                  <select
                    value={preference}
                    onChange={e => setPreference(e.target.value)}
                    className={selectCls}
                  >
                    <option value="" disabled>Select preference</option>
                    <option value="Non-Veg">Non-Veg</option>
                    <option value="Veg">Veg</option>
                    {/* Religious mix is a multi-day split — only meaningful on
                        Weekly+ plans. Gated here, visible as a teaser. */}
                    <option value="Religious Preference" disabled>
                      Religious mix — pick a Weekly plan or higher
                    </option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.18] text-[13px] text-center text-red-400 leading-snug">
                  {error}
                </div>
              )}

              <CtaButton type="submit" disabled={isClaiming || !phoneVerified || !emailVerified}>
                {isClaiming ? 'Claiming your meal…' : 'Claim my free meal →'}
              </CtaButton>

              {(!phoneVerified || !emailVerified) && (
                <p className="text-center text-[11px] text-white/50">
                  Verify your WhatsApp + email above to unlock the claim button.
                </p>
              )}

              <p className="text-center text-[11px] text-white/50">
                By continuing you agree to our{' '}
                <Link href="/terms"  className="underline hover:text-white/70 transition-colors">Terms</Link>{' '}and{' '}
                <Link href="/privacy" className="underline hover:text-white/70 transition-colors">Privacy Policy</Link>.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// Map server error codes to customer-facing copy. Mirrors onboarding's
// messageForError so the trial flow feels consistent.
function messageForPhoneError(code: unknown): string {
  switch (code) {
    case 'invalid_phone':      return 'That number doesn\'t look right. Check the country code and try again.'
    case 'invalid_code':       return 'Code must be 6 digits.'
    case 'cooldown':           return 'Hold on a moment before resending.'
    case 'too_many_requests':  return 'Too many requests. Try again in an hour.'
    case 'send_failed':        return 'Couldn\'t send the WhatsApp message. Double-check your number.'
    case 'no_active_code':     return 'Code expired or never sent. Send a new one.'
    case 'incorrect_code':     return 'That code doesn\'t match. Try again.'
    case 'too_many_attempts':  return 'Too many wrong attempts. Send a new code.'
    default:                   return 'Something went wrong. Try again.'
  }
}

function prettifyEmailError(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('expired') || lower.includes('invalid')) return 'That code is wrong or expired. Try again or resend.'
  if (lower.includes('rate') || lower.includes('too many'))    return 'Too many attempts. Wait a minute and try again.'
  return msg
}
