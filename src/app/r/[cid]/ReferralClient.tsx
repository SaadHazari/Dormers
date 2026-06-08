'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTheme } from 'next-themes'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Check, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { FieldInput, CtaButton, PhoneField } from '@/app/onboarding/primitives'
import { PasswordChecklist } from '@/components/auth/PasswordChecklist'
import { isPasswordStrong } from '@/shared/validation'
import { DORMS } from '@/app/onboarding/data'
import { eligibleTrialDeliveryDates, trialDateIso, trialDeliveryLabel } from '@/contexts/referrals/domain/trial-delivery'
import { MENU_DATA, getMenuWeek, type Dish } from '@/contexts/menu/domain/catalog-data'
import { Flame, X as CloseIcon, Sun, Moon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  claimGift,
  sendTrialEmailOtp,
  setTrialPassword,
  verifyTrialEmailOtp,
  detectExistingSubscriberByEmail,
  signOutTrialSession,
} from './actions'

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

export default function ReferralLandingPage({ menuData }: { menuData?: Dish[] }) {
  const _dishes = menuData ?? MENU_DATA
  const _findDish = (date: Date, isVeg: boolean): Dish | null => {
    const jsDow = date.getUTCDay()
    if (jsDow === 0) return null
    const dayOfWeek = jsDow - 1
    const week = getMenuWeek(date)
    return _dishes.find(d => d.week === week && d.dayOfWeek === dayOfWeek && d.isVeg === isVeg) ?? null
  }
  const params   = useParams()
  const router   = useRouter()
  const cid      = (Array.isArray(params.cid) ? params.cid[0] : params.cid ?? '').toUpperCase()

  // Force the page subtree to dark theme on mount. Without this, a visitor
  // whose saved preference is 'light' (e.g. ops/dev hopping in from the
  // dashboard) gets the onboarding primitives — FieldInput / PhoneField /
  // CtaButton, all theme-aware via useIsLight() — rendering as pale pills
  // with dark text on this hard-coded dark navy page. Real users with no
  // saved preference default to dark and never trip this, but the override
  // is cheap and makes the page bulletproof to ambient theme state.
  const { setTheme } = useTheme()
  useEffect(() => { setTheme('dark') }, [setTheme])

  // Local page-mode state — drives ONLY the page chrome (bg, hero text,
  // trust strip, nav link). The form card and its primitives stay locked
  // to dark theme regardless because they live inside the always-navy
  // form container. Defaults to 'light' so first paint matches the cream
  // design the user signed off on.
  const [pageMode, setPageMode] = useState<'light' | 'dark'>('light')
  const isLightMode = pageMode === 'light'

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
  // Set when the claim is rejected by the lifetime phone/email dedupe. We
  // deliberately keep this a plain boolean and reveal NOTHING about which
  // identifier matched — surfacing "wrong email" or prefilling /login with the
  // typed address both leak that email is the lever (cheap to rotate) and
  // mislead the common phone-trigger case (the typed email has no account). The
  // recovery panel instead offers two identity-agnostic paths: sign in, or sign
  // up on a paid plan.
  const [alreadyClaimed, setAlreadyClaimed] = useState(false)
  // Set when the redeemer turns out to already have a live subscription. The
  // welcome meal is for non-customers; we pivot existing regulars to sharing
  // their own code instead of issuing a second free meal.
  const [existingSubscriber, setExistingSubscriber] = useState(false)

  // ── Delivery date chip selector ────────────────────────────────────────────
  // Replaces the server's silent auto-pick. We compute the eligible dates once
  // on mount so the chip set is stable for the session (avoids the chip row
  // re-renumbering itself if the page is left open across the 14:00 cutoff).
  // The user can change the selection up until they hit Claim.
  const eligibleDates = useRef<Date[]>(eligibleTrialDeliveryDates(new Date(), '6DAYS', 5)).current
  const [startDateIso, setStartDateIso] = useState<string>(() => trialDateIso(eligibleDates[0]))

  // Active dish-detail modal — opened from either the inline (mobile) or hero
  // (desktop) dish preview card. Stores both the Dish and the chosen ISO date
  // so the modal eyebrow can read "Wed 5 Jun" without re-deriving from state
  // that may have shifted while the modal was open.
  const [openDish, setOpenDish] = useState<{ dish: Dish; dateIso: string } | null>(null)

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
  // Title-case the first letter so a customer who registered as "dani" or
  // "DANI" still appears as "Dani" in the hero — first-impression copy
  // shouldn't be at the mercy of how someone typed their name on signup.
  useEffect(() => {
    if (!cid) { setLoading(false); return }
    fetch(`/api/referral/inviter?cid=${encodeURIComponent(cid)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const raw = (d?.firstName ?? '').trim()
        if (!raw) { setInviterName(null); return }
        setInviterName(raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase())
      })
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
      // Existing-subscriber detection deliberately runs only on email verify
      // (next handler down). Firing it here would catch the user one OTP
      // earlier, but at that point there's no session yet — the welcome-back
      // panel's /dashboard CTA would bounce through /login. Waiting one more
      // step costs the user one OTP cycle and guarantees seamless re-entry.
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
    // Same early-pivot pattern as phone verify — the email OTP step set a
    // session cookie, so detectExistingSubscriberByEmail can resolve the
    // customer directly off the authed user.
    try {
      const detect = await detectExistingSubscriberByEmail()
      if (detect.existing) setExistingSubscriber(true)
    } catch { /* non-fatal */ }
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
        startDate:   startDateIso,
      })

      if ('ok' in result)      { setDone(true); return }
      if ('blocked' in result) {
        if (result.code === 'already_claimed') {
          setAlreadyClaimed(true)
          return
        }
        if (result.code === 'existing_subscriber') {
          setExistingSubscriber(true)
          return
        }
        setError(result.reason)
        return
      }
      setError(result.error)
    })
  }

  // ── Recovery navigation off the "already claimed" panel ───────────────────
  // Both CTAs first clear the throwaway session the email-OTP step created (see
  // signOutTrialSession) so /login and /onboarding start logged-out, then
  // navigate. Sign-out is best-effort and we route regardless.
  const [recovering, startRecovering] = useTransition()
  function recoverTo(href: string) {
    startRecovering(async () => {
      await signOutTrialSession()
      router.push(href)
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

  const labelCls    = 'block text-[11px] font-bold uppercase tracking-widest mb-1.5 text-[#f5f0e8]/65'
  const selectCls   = 'w-full rounded-xl px-4 py-3 text-[14px] outline-none transition-all border bg-[#0d2035]/80 border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] text-[#f5f0e8] placeholder-[#f5f0e8]/55'
  const otpBoxCls   = 'w-full rounded-xl px-4 py-3 pr-11 text-[18px] font-mono tracking-[0.35em] text-center outline-none transition-all border bg-[#0d2035]/80 border-[#1e3448] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] text-[#f5f0e8] placeholder-[#f5f0e8]/30 disabled:opacity-60'
  const otpVerifyCls= 'w-full rounded-xl px-4 py-3 text-[13px] font-bold uppercase tracking-widest bg-[#f57f20] text-white hover:bg-[#ff8f36] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const otpSendCls  = 'w-full rounded-xl px-4 py-2.5 text-[12px] font-bold uppercase tracking-widest border border-[#f57f20]/40 text-[#f57f20] hover:bg-[#f57f20]/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const verifiedCls = 'flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2.5 text-[12px] font-bold uppercase tracking-widest border border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/[0.06]'
  // Warm cream-on-navy heading treatment — the same top-lit gradient the hero
  // headline uses (cream stops with a faint orange breath, never sharp #fff).
  // Use this for ALL display headings sitting on the navy card; pb-1 keeps the
  // gradient from clipping descenders. Solid `text-[#f5f0e8]` is the matching
  // cream for smaller white-on-navy text where a clipped gradient reads poorly.
  const warmHeadingCls = 'bg-clip-text text-transparent bg-gradient-to-b from-[#fdf8ef] via-[#f0e6cf] to-[#d6c8a8] drop-shadow-[0_1px_0_rgba(0,0,0,0.25)] pb-1'

  if (loading) {
    return (
      <div className="min-h-screen bg-[#061520] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-[#f57f20] animate-spin" />
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen flex flex-col font-montserrat ${
        isLightMode
          ? 'bg-gradient-to-b from-[#fcf2dd] via-[#ede8da] to-[#d9c9a8]'
          : 'bg-[#061520]'
      }`}
    >

      {/* Blur orbs — mood-setting glow that only belongs on the dark canvas.
          The cream-mode page wants its gradient to carry the atmosphere on
          its own; the dark orbs would muddy it. */}
      <div className={`pointer-events-none absolute inset-0 overflow-hidden ${isLightMode ? 'hidden' : ''}`}>
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[360px] rounded-full bg-[#f57f20]/[0.04] blur-[120px]" />
        {/* Bottom sunset band — thin horizontal slice pinned to the viewport
            bottom. Spans full page width via inset-x-0; the linear-gradient
            fades vertically from a warm orange wash at the bottom edge up
            to transparent so it never reads as a hard line. z-0 keeps it
            behind the z-10 form / dish content. */}
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 h-[200px] z-0"
          style={{
            background:
              'linear-gradient(to top, rgba(245,127,32,0.22) 0%, rgba(245,127,32,0.10) 45%, transparent 100%)',
          }}
        />
      </div>

      {/* Nav bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5">
        <Link href="/home">
          {/* logo-dark.svg = light-coloured logo for DARK surfaces;
              logo-light.svg = dark-coloured logo for LIGHT surfaces.
              Matches the convention the marketing Navbar, LoginForm, and
              onboarding page all use, so the trial page reads as the same
              product regardless of which mode the user picks. */}
          <Image
            src={isLightMode ? '/logo-light.svg' : '/logo-dark.svg'}
            alt="Dormers"
            width={36}
            height={36}
            className="transition-[filter] duration-200 hover:drop-shadow-[0_0_12px_rgba(245,127,32,0.65)]"
          />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className={`text-[12px] font-semibold transition-colors ${
              isLightMode
                ? 'text-[#091825]/55 hover:text-[#091825]/85'
                : 'text-[#f5f0e8]/55 hover:text-[#f5f0e8]/80'
            }`}
          >
            Sign in →
          </Link>
          <PageModeOrb
            mode={pageMode}
            onToggle={() => setPageMode(m => (m === 'light' ? 'dark' : 'light'))}
          />
        </div>
      </div>

      {/* Card */}
      <div className="relative z-10 flex-1 flex items-start lg:items-center justify-center px-4 lg:px-12 pb-12 pt-2 lg:pt-12 lg:pb-20">
        {(() => {
          const glassStyle: React.CSSProperties = {
            // Bumped from 0.70 → 0.95 so the cream lg-bg doesn't bleed through
            // into the form card and mute the navy. On the dark mobile bg the
            // higher opacity is a no-op (dark behind dark). Shadow swapped
            // from a black tint to a softer navy tint so it reads cleanly
            // against either bg.
            background:       'rgba(13,32,53,0.95)',
            backdropFilter:   'blur(24px) saturate(1.4)',
            boxShadow:        '0 16px 50px rgba(9,24,37,0.20), inset 0 1px 0 rgba(255,255,255,0.05)',
          }
          // Recovery panels (welcome-back, existing-subscriber) are short and
          // keep the narrow centered card — moment-of-confirmation surfaces
          // that benefit from visual focus. The success state carries far more
          // (confirmation + full password lock-in + checklist), so on desktop
          // it opens into a wider 2-col layout to avoid the tall slender ribbon
          // a single 384px column would produce. Mobile stays single-column.
          if (alreadyClaimed || existingSubscriber || done) {
            const isSuccess = done && !alreadyClaimed && !existingSubscriber
            return (
              <div
                className={`w-full rounded-2xl border border-white/[0.08] p-8 ${
                  isSuccess ? 'max-w-sm lg:max-w-3xl lg:p-10' : 'max-w-sm'
                }`}
                style={glassStyle}
              >
                {alreadyClaimed ? (
            // ── "Already claimed" recovery panel ─────────────────────────────
            // The lifetime dedupe fires on EITHER phone OR email — so this panel
            // must stay identity-agnostic. It deliberately does NOT say which
            // one matched, does NOT prefill /login with the typed email (that
            // both leaks "email is the lever" and dead-ends the phone-trigger
            // case where the typed email has no account), and offers two real
            // exits: sign into an existing account, or sign up on a paid plan.
            // The free welcome meal stays closed — "See plans" is the PAID
            // onboarding flow, not another freebie. Both CTAs clear the
            // throwaway email-OTP session first (recoverTo → signOutTrialSession).
            (
                <div className="text-center">
                  <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-[#f57f20]/[0.12] border border-[#f57f20]/30 flex items-center justify-center">
                    <CheckCircle2 size={26} strokeWidth={2.2} className="text-[#f57f20]" />
                  </div>
                  <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">
                    Welcome back
                  </p>
                  <h1 className={`text-[24px] font-black tracking-tight leading-tight mb-3 ${warmHeadingCls}`}>
                    Looks like we&rsquo;ve already met.
                  </h1>
                  <p className="text-[13px] text-[#f5f0e8]/65 leading-relaxed mb-6">
                    This phone or email has already used a welcome meal — but you&rsquo;re
                    always welcome to keep eating with us.
                  </p>
                  <button
                    type="button"
                    onClick={() => recoverTo('/login')}
                    disabled={recovering}
                    className="block w-full rounded-xl px-4 py-3.5 text-[14px] font-bold uppercase tracking-widest bg-[#f57f20] text-white hover:bg-[#ff8f36] transition-colors mb-3 disabled:opacity-60 disabled:pointer-events-none"
                  >
                    {recovering ? 'One sec…' : 'Sign in'}
                  </button>
                  <button
                    type="button"
                    onClick={() => recoverTo('/onboarding')}
                    disabled={recovering}
                    className="block w-full rounded-xl px-4 py-3.5 text-[14px] font-bold uppercase tracking-widest border border-white/15 text-[#f5f0e8] hover:bg-white/[0.06] transition-colors disabled:opacity-60 disabled:pointer-events-none"
                  >
                    See plans &rarr;
                  </button>
                </div>
            )
          ) : existingSubscriber ? (
            // ── "You're already with us" pivot panel ─────────────────────────
            // Fires when the redeemer turns out to have a live subscription.
            // The welcome meal is an acquisition gate, not a perk for existing
            // customers — so instead of dead-ending or silently absorbing the
            // free meal into their account, we recognise them as a regular
            // and pivot to the only real next action: sharing their own code.
            // The verifyTrialEmailOtp step already set a session cookie for
            // the redeemer's account, so the dashboard CTA lands them logged in.
            (
              <div className="text-center">
                <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-[#f57f20]/[0.12] border border-[#f57f20]/30 flex items-center justify-center">
                  <CheckCircle2 size={26} strokeWidth={2.2} className="text-[#f57f20]" />
                </div>
                <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">
                  Welcome back
                </p>
                <h1 className={`text-[24px] font-black tracking-tight leading-tight mb-3 ${warmHeadingCls}`}>
                  You&rsquo;re already eating with us.
                </h1>
                <p className="text-[13px] text-[#f5f0e8]/65 leading-relaxed mb-6">
                  The free welcome meal is for friends who haven&rsquo;t tried Dormers yet.
                  But you&rsquo;ve got your own code — share it and you&rsquo;ll earn AED 20
                  in credit when someone new joins through it.
                </p>
                <Link
                  href="/dashboard/dorm-wars"
                  className="block w-full rounded-xl px-4 py-3.5 text-[14px] font-bold uppercase tracking-widest bg-[#f57f20] text-white hover:bg-[#ff8f36] transition-colors mb-3"
                >
                  Share my code →
                </Link>
                <Link
                  href="/dashboard"
                  className="block text-[11px] text-[#f5f0e8]/45 hover:text-[#f5f0e8]/70 underline underline-offset-2"
                >
                  Back to your dashboard
                </Link>
              </div>
            )
          ) : done ? (
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
              // Pull the label from the date the user actually chose on the
              // chip selector — not nextTrialDeliveryLabel(), which would
              // re-compute "soonest from now" and clash with the user's pick.
              const chosenDate    = new Date(startDateIso + 'T00:00:00Z')
              const deliveryLabel = trialDeliveryLabel(chosenDate)
              const lowercased    = deliveryLabel.toLowerCase()
              const passOk        = isPasswordStrong(password)
              return (
                <div className="lg:grid lg:grid-cols-2 lg:gap-10 lg:items-center">
                  {/* LEFT — confirmation. Centered on mobile; left-aligned and
                      vertically centered against the form column on desktop. */}
                  <div className="text-center lg:text-left mb-6 lg:mb-0">
                    <div className="mx-auto lg:mx-0 mb-5 w-14 h-14 rounded-full bg-[#22c55e]/[0.12] border border-[#22c55e]/30 flex items-center justify-center">
                      <Check size={24} strokeWidth={2.5} className="text-[#22c55e]" />
                    </div>
                    <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">You&apos;re in</p>
                    <h1 className={`text-[24px] lg:text-[30px] font-black tracking-tight leading-tight mb-3 ${warmHeadingCls}`}>
                      Your meal is{deliveryLabel === 'Tonight' ? ' on its way.' : ` arriving ${lowercased}.`}
                    </h1>
                    <p className="text-[13px] text-[#f5f0e8]/65 leading-relaxed">
                      Expect delivery <span className="text-[#f5f0e8]/85 font-semibold">{lowercased} between 7–8 PM</span>.
                      We&apos;ll WhatsApp you when it&apos;s close.
                    </p>
                    <p className="hidden lg:block mt-5 text-[11px] text-[#f5f0e8]/40">
                      Your first monthly plan comes with a{' '}
                      <span className="text-[#f5f0e8]/65 font-semibold">5% welcome rate</span>.
                    </p>
                  </div>

                  {/* RIGHT — lock-in step (required for normal email+password
                      login later). Divider flips from a top rule on mobile to a
                      left rule on desktop so the two columns read as one card. */}
                  <div className="space-y-3 pt-6 border-t border-white/[0.08] lg:pt-0 lg:border-t-0 lg:border-l lg:pl-10">
                    <div>
                      <p className="text-[#f57f20] text-[11px] font-bold uppercase tracking-widest mb-1.5">
                        Last step
                      </p>
                      <h2 className={`text-[18px] font-black tracking-tight leading-tight ${warmHeadingCls}`}>
                        Lock in your account
                      </h2>
                      <p className="text-[12px] text-[#f5f0e8]/55 leading-snug mt-1.5">
                        Set a password so you can come back, track your meal, and order more without re-verifying every time.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5 text-[#f5f0e8]/65">
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
                          className={`w-full rounded-xl px-4 py-3 pr-11 outline-none transition-all border bg-[#0d2035]/80 border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] text-[#f5f0e8] placeholder-[#f5f0e8]/55 disabled:opacity-60 ${showPassword ? 'text-[14px]' : 'text-[18px] tracking-[0.22em] font-semibold'} placeholder:text-[14px] placeholder:tracking-normal placeholder:font-normal`}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#f5f0e8]/55 hover:text-[#f5f0e8]/85 transition-colors"
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
                      className="block w-full text-center text-[11px] text-[#f5f0e8]/45 hover:text-[#f5f0e8]/70 underline transition-colors disabled:pointer-events-none"
                    >
                      Skip for now — I&apos;ll set a password later
                    </button>
                  </div>

                  <p className="lg:hidden mt-6 text-[11px] text-[#f5f0e8]/40 text-center">
                    Your first paid plan comes with{' '}
                    <span className="text-[#f5f0e8]/65 font-semibold">20% off</span>.
                  </p>
                </div>
              )
            })()
          ) : null}
              </div>
            )
          }
          // ── Claim form (2-col on lg, single-col mobile) ──────────────────
          // Desktop hero on the left handles the marketing weight (inviter +
          // dish + trust signals) so the form on the right can stay focused
          // on the actual fields. Mobile keeps the prior single-column flow
          // — the aside is hidden below the lg breakpoint.
          return (
            <div className="w-full max-w-sm lg:max-w-6xl lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start">
              {/* DESKTOP HERO — left aside. Carries the marketing weight so
                  the form on the right can stay clean. Big inviter headline,
                  the hero dish preview (clickable → modal), and a small
                  trust strip across the bottom. Hidden below lg. */}
              <aside className="hidden lg:block lg:col-span-5 lg:pt-2 lg:sticky lg:top-12 lg:self-start space-y-6">
                <div>
                  <p
                    className={`text-[11px] font-bold uppercase tracking-widest mb-3 ${
                      isLightMode ? 'text-[#091825]/55' : 'text-[#f5f0e8]/55'
                    }`}
                  >
                    Free meal · on the house
                  </p>
                  {/* Top-lit gradient text — direction flips with page mode.
                      Light mode: navy stops on cream bg with white-tint drop
                      shadow. Dark mode: cream stops on navy bg with dark
                      drop shadow (same treatment as the weekly review H1). */}
                  <h1
                    className={`text-[56px] xl:text-[60px] font-black tracking-tight leading-[1.1] pb-1 bg-clip-text text-transparent bg-gradient-to-b ${
                      isLightMode
                        ? 'from-[#1c4255] via-[#091825] to-[#061520] drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]'
                        : 'from-[#fdf8ef] via-[#f0e6cf] to-[#d6c8a8] drop-shadow-[0_1px_0_rgba(0,0,0,0.25)]'
                    }`}
                  >
                    {inviterName
                      ? <>{inviterName} sent<br />you dinner.</>
                      : <>Your friend sent<br />you dinner.</>}
                  </h1>
                  <p
                    className={`text-[15px] mt-4 leading-relaxed max-w-[400px] ${
                      isLightMode ? 'text-[#091825]/70' : 'text-[#f5f0e8]/75'
                    }`}
                  >
                    Pick the day that works. We&rsquo;ll WhatsApp you when it&rsquo;s close,
                    and drop it hot between 7–8 PM. No card, no commitment.
                  </p>
                </div>

                {/* Trust strip — moved up under the headline so it acts as
                    supporting proof on the message block rather than as an
                    orphaned widget below the dish card. Warm-white tile
                    fills (instead of the prior near-invisible cream-on-cream
                    tint) so the chips actually read against the page bg. */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { eyebrow: 'Pay', label: 'AED 0' },
                    { eyebrow: 'Drop', label: '7–8 PM' },
                    { eyebrow: 'Card', label: 'Not needed' },
                  ].map(item => (
                    <div
                      key={item.eyebrow}
                      className={`rounded-xl border px-3 py-3 text-center ${
                        isLightMode
                          ? 'border-[#091825]/[0.14] bg-white/55 shadow-[0_2px_8px_rgba(9,24,37,0.04)]'
                          : 'border-[#f5f0e8]/[0.10] bg-[#f5f0e8]/[0.03]'
                      }`}
                    >
                      <div
                        className={`text-[9.5px] font-bold uppercase tracking-widest ${
                          isLightMode ? 'text-[#091825]/55' : 'text-[#f5f0e8]/55'
                        }`}
                      >
                        {item.eyebrow}
                      </div>
                      <div
                        className={`text-[13px] font-bold mt-1 ${
                          isLightMode ? 'text-[#091825]' : 'text-[#f5f0e8]'
                        }`}
                      >
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>

                {(() => {
                  const chosenDate = new Date(startDateIso + 'T00:00:00Z')
                  const isVeg = preference === 'Veg'
                  const dish = _findDish(chosenDate, isVeg)
                  if (!dish) return null
                  const dayLabel = chosenDate.toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
                  })
                  return (
                    <DishPreviewCard
                      dish={dish}
                      dateLabel={dayLabel}
                      variant="hero"
                      onOpen={() => setOpenDish({ dish, dateIso: startDateIso })}
                    />
                  )
                })()}
              </aside>
              {/* CLAIM FORM CARD — right column on lg, full-width on mobile */}
              <div
                className="lg:col-span-7 rounded-2xl border border-white/[0.08] p-8"
                style={glassStyle}
              >
                <form onSubmit={handleSubmit} className="space-y-5">
              <div className="lg:hidden">
                <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">
                  Free meal
                </p>
                <h1 className="text-[26px] sm:text-[28px] font-black text-[#f5f0e8] tracking-tight leading-tight">
                  {inviterName
                    ? <>{inviterName} sent<br />you a meal.</>
                    : <>Your friend sent<br />you a meal.</>}
                </h1>
                <p className="text-[13px] mt-2 text-[#f5f0e8]/75 leading-snug">
                  {(() => {
                    // Drives off the chip pick so the headline copy stays in
                    // sync if the user picks a later day; defaults to soonest
                    // on first render before any interaction.
                    const label = trialDeliveryLabel(new Date(startDateIso + 'T00:00:00Z')).toLowerCase()
                    return `No card. No commitment. Just fill in your details and expect delivery ${label} between 7–8 PM.`
                  })()}
                </p>
              </div>

              <div className="space-y-4">
                <p className="text-[#f5f0e8]/55 text-[10px] font-bold uppercase tracking-[0.18em]">
                  Contact
                </p>
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
                      <p className="text-[11px] text-[#f5f0e8]/50 -mt-1">
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
                        <p className="text-[11px] text-[#f5f0e8]/55 flex-1">
                          Sent to <span className="text-[#f5f0e8]/85 font-medium font-mono">{phone}</span>.{' '}
                          <button type="button" onClick={editPhone} className="text-[#f57f20] hover:text-[#ff8f36] font-semibold transition-colors">
                            Wrong number?
                          </button>
                        </p>
                        <button
                          type="button"
                          onClick={sendPhoneCode}
                          disabled={phoneResendIn > 0 || phoneBusy}
                          className="text-[#f57f20] text-[11px] font-semibold disabled:pointer-events-none disabled:text-[#f5f0e8]/40 whitespace-nowrap"
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
                      <p className="text-[11px] text-[#f5f0e8]/50 -mt-1">
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
                        <p className="text-[11px] text-[#f5f0e8]/55 flex-1">
                          Sent to <span className="text-[#f5f0e8]/85 font-medium break-all">{email}</span>.{' '}
                          <button type="button" onClick={editEmail} className="text-[#f57f20] hover:text-[#ff8f36] font-semibold transition-colors">
                            Wrong email?
                          </button>
                        </p>
                        <button
                          type="button"
                          onClick={sendEmailCode}
                          disabled={emailResendIn > 0 || emailBusy}
                          className="text-[#f57f20] text-[11px] font-semibold disabled:pointer-events-none disabled:text-[#f5f0e8]/40 whitespace-nowrap"
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
              </div>

              <div className="space-y-4">
                <p className="text-[#f5f0e8]/55 text-[10px] font-bold uppercase tracking-[0.18em]">
                  Delivery
                </p>
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
                    <option value="Non Veg">Non-Veg</option>
                    <option value="Veg">Veg</option>
                    {/* Religious mix is a multi-day split — only meaningful on
                        Weekly+ plans. Gated here, visible as a teaser. */}
                    <option value="Religious Preference" disabled>
                      Religious mix — pick a Weekly plan or higher
                    </option>
                  </select>
                </div>
              </div>

              {/* Delivery day chip selector + dish preview — replaces the
                  silent auto-pick + meal mystery. The chip row is horizontally
                  scrollable on mobile for one-thumb reach; the preview card
                  swaps live as the user changes either chip or preference, so
                  they always see what they're locking in. Defaults to non-veg
                  when no preference has been picked yet (more representative
                  of the catalog's lead photography). */}
              <div>
                <label className={labelCls}>When should we deliver?</label>
                <div
                  role="radiogroup"
                  aria-label="Delivery day"
                  className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {eligibleDates.map(d => {
                    const iso = trialDateIso(d)
                    const isSelected = iso === startDateIso
                    const label = trialDeliveryLabel(d)
                    const sub = d.toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', timeZone: 'UTC',
                    })
                    return (
                      <button
                        key={iso}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setStartDateIso(iso)}
                        className={`flex-shrink-0 min-w-[78px] rounded-xl px-3 py-2.5 text-center transition-all border ${
                          isSelected
                            ? 'bg-[#f57f20] border-[#f57f20] text-white shadow-[0_4px_14px_rgba(245,127,32,0.35)]'
                            : 'bg-[#0d2035]/80 border-[#1e3448] text-[#f5f0e8]/85 hover:border-[#2a4a68]'
                        }`}
                      >
                        <div className="text-[12px] font-bold leading-tight">{label}</div>
                        <div className={`text-[10px] mt-0.5 ${isSelected ? 'text-[#f5f0e8]/85' : 'text-[#f5f0e8]/55'}`}>
                          {sub}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Live preview of the dish landing on the selected day —
                    clickable, opens DishDetailModal. Hidden on lg+ because
                    the desktop layout hoists the preview into the left
                    hero aside as a bigger card. */}
                {(() => {
                  const chosenDate = new Date(startDateIso + 'T00:00:00Z')
                  const isVeg = preference === 'Veg'
                  const dish = _findDish(chosenDate, isVeg)
                  if (!dish) return null
                  const dayLabel = chosenDate.toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
                  })
                  return (
                    <div className="lg:hidden">
                      <DishPreviewCard
                        dish={dish}
                        dateLabel={dayLabel}
                        variant="compact"
                        onOpen={() => setOpenDish({ dish, dateIso: startDateIso })}
                      />
                    </div>
                  )
                })()}
              </div>

              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.18] text-[13px] text-center text-red-400 leading-snug">
                  {error}
                </div>
              )}

              {/* Page-local CTA — bypasses the onboarding CtaButton primitive
                  which is theme-aware via useIsLight(). On this always-dark
                  page, a light-theme user would otherwise see the disabled
                  state render as near-invisible dark-on-dark; the dashed
                  border + white/55 text below keeps the slot legible on
                  either system theme until verification completes. */}
              {(() => {
                // Gate on the full claim contract, not just the two OTPs.
                // claimGift() also requires firstName + dorm + preference, so
                // enabling on verification alone invited a click that
                // handleSubmit would only bounce back with an inline error.
                const isDisabled =
                  isClaiming ||
                  !firstName.trim() ||
                  !phoneVerified ||
                  !emailVerified ||
                  !dorm ||
                  !preference
                return (
                  <button
                    type="submit"
                    disabled={isDisabled}
                    className={`w-full flex items-center justify-center gap-2 font-bold text-[14px] py-3.5 rounded-xl transition-all ${
                      isDisabled
                        ? 'bg-white/[0.05] text-[#f5f0e8]/60 border border-dashed border-white/20 cursor-not-allowed'
                        : 'bg-[#f57f20] hover:bg-[#ff8f36] active:scale-[0.98] text-white shadow-[0_4px_20px_rgba(245,127,32,0.25)] hover:shadow-[0_4px_28px_rgba(245,127,32,0.4)]'
                    }`}
                  >
                    {isClaiming ? 'Claiming your meal…' : 'Claim my free meal →'}
                  </button>
                )
              })()}

              {/* Tell the user exactly what's still missing — otherwise the
                  button sits greyed-out with no explanation once both OTPs
                  pass but the dorm/preference selects are still empty. */}
              {(() => {
                if (!phoneVerified || !emailVerified) {
                  return (
                    <p className="text-center text-[11px] text-[#f5f0e8]/50">
                      Verify your WhatsApp + email above to unlock the claim button.
                    </p>
                  )
                }
                if (!firstName.trim() || !dorm || !preference) {
                  return (
                    <p className="text-center text-[11px] text-[#f5f0e8]/50">
                      Add your name, dorm, and meal preference to unlock the claim button.
                    </p>
                  )
                }
                return null
              })()}

              <p className="text-center text-[11px] text-[#f5f0e8]/50">
                By continuing you agree to our{' '}
                <Link href="/terms"  className="underline hover:text-[#f5f0e8]/70 transition-colors">Terms</Link>{' '}and{' '}
                <Link href="/privacy" className="underline hover:text-[#f5f0e8]/70 transition-colors">Privacy Policy</Link>.
              </p>
            </form>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Dish-detail modal. Both the compact (mobile, inline-in-form) and
          hero (desktop, in left aside) preview cards open this. */}
      {openDish && (
        <DishDetailModal
          dish={openDish.dish}
          dateLabel={new Date(openDish.dateIso + 'T00:00:00Z').toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
          })}
          onClose={() => setOpenDish(null)}
        />
      )}
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

// ── Local page-mode toggle orb ────────────────────────────────────────────
// Mirrors the marketing site's ThemeToggleOrb (Sun/Moon vertical swap
// animation) but drives this page's local `pageMode` state instead of
// next-themes — we can't share that because the form primitives need to
// stay locked to dark theme regardless of which background mode the user
// has chosen. Visual identity matches exactly so the marketing site and
// the trial page feel like one product.
function PageModeOrb({
  mode, onToggle,
}: { mode: 'light' | 'dark'; onToggle: () => void }) {
  const isLight = mode === 'light'
  return (
    <div className="flex-shrink-0 relative z-[110] rounded-full h-[44px] w-[44px]">
      <span
        aria-hidden
        className="absolute inset-0 rounded-full backdrop-blur-2xl bg-[#FAF6EB]/10 border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.25)] pointer-events-none"
      />
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        onClick={onToggle}
        className="absolute inset-0 flex items-center justify-center rounded-full hover:bg-[#FAF6EB]/10 transition-colors focus:outline-none"
        aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isLight ? (
            <motion.div
              key="sun"
              initial={{ opacity: 0, y: 30, x: -10, rotate: -45 }}
              animate={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
              exit={{ opacity: 0, y: 30, x: 10, rotate: 45 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="text-[#f57f20] drop-shadow-[0_0_12px_rgba(245,127,32,0.9)]"
            >
              <Sun className="w-5 h-5 fill-[#f57f20]" strokeWidth={2} />
            </motion.div>
          ) : (
            <motion.div
              key="moon"
              initial={{ opacity: 0, y: -30, x: 10, rotate: 45 }}
              animate={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
              exit={{ opacity: 0, y: -30, x: -10, rotate: -45 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="text-[#ede8da] drop-shadow-[0_0_12px_rgba(237,232,218,0.7)]"
            >
              <Moon className="w-5 h-5 fill-[#ede8da]" strokeWidth={2} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}

// ── Dish preview card ────────────────────────────────────────────────────────
// One component, two variants: 'compact' inside the mobile form (small, row
// layout), 'hero' inside the desktop left aside (large, vertical layout with
// 16:10 image header). Both are clickable buttons that open the same
// DishDetailModal — mirrors the dashboard MenuClient's tap-to-detail pattern.
function DishPreviewCard({
  dish, dateLabel, variant, onOpen,
}: {
  dish: Dish
  dateLabel: string
  variant: 'compact' | 'hero'
  onOpen: () => void
}) {
  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`See details for ${dish.name}`}
        className="mt-3 w-full rounded-xl border border-[#1e3448] bg-[#0d2035]/80 p-3 flex gap-3 items-center text-left transition-colors hover:border-[#f57f20]/50 hover:bg-[#0d2035]"
      >
        <div className="relative w-[64px] h-[64px] rounded-lg overflow-hidden flex-shrink-0 bg-[#1e3448]">
          <Image src={dish.image} alt={dish.name} fill sizes="64px" className="object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#f57f20] mb-0.5">
            {dateLabel}
          </div>
          <div className="text-[13px] font-bold text-[#f5f0e8] leading-tight truncate">
            {dish.name}
          </div>
          <div className="text-[11px] text-[#f5f0e8]/65 leading-snug mt-1 line-clamp-2">
            {dish.description}
          </div>
        </div>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`See details for ${dish.name}`}
      className="group w-full rounded-2xl border border-[#091825]/15 bg-[#0d2035] overflow-hidden text-left transition-all shadow-[0_20px_40px_-12px_rgba(9,24,37,0.30),0_4px_10px_rgba(9,24,37,0.08)] hover:border-[#f57f20]/40 hover:shadow-[0_28px_56px_-12px_rgba(245,127,32,0.28),0_4px_10px_rgba(9,24,37,0.10)]"
    >
      <div className="relative w-full aspect-[16/10] bg-[#1e3448]">
        <Image
          src={dish.image}
          alt={dish.name}
          fill
          sizes="(min-width: 1024px) 430px, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur border border-[#f5f0e8]/15 text-[#f5f0e8] text-[10px] font-bold uppercase tracking-widest">
          {dateLabel}
        </div>
      </div>
      <div className="p-5">
        <div className="text-[18px] font-black text-[#f5f0e8] leading-tight tracking-tight">
          {dish.name}
        </div>
        <div className="text-[13px] text-[#f5f0e8]/75 leading-relaxed mt-2 line-clamp-3">
          {dish.description}
        </div>
        <div className="mt-3 text-[11px] font-bold uppercase tracking-widest text-[#f5f0e8]/60 inline-flex items-center gap-1 group-hover:text-[#f5f0e8]/90 transition-colors">
          Tap for details →
        </div>
      </div>
    </button>
  )
}

// ── Dish detail modal ────────────────────────────────────────────────────────
// Hero image, day eyebrow, dish name, description, nutrient cards, spice +
// allergens. Mirrors the dashboard's DishDetailModal but skips framer-motion
// to keep the trial route bundle lean — plain show/hide with CSS transitions.
function DishDetailModal({
  dish, dateLabel, onClose,
}: { dish: Dish; dateLabel: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const cal     = parseFloat(String(dish.nutrients.calories).replace(/[^\d.]/g, '')) || 0
  const protein = parseFloat(String(dish.nutrients.protein).replace(/[^\d.]/g, '')) || 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dish.name}
      onClick={onClose}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm animate-[fadeIn_180ms_ease-out]"
      style={{ animationFillMode: 'both' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0d2035] border border-white/[0.08] shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
      >
        <div className="relative w-full aspect-[16/10] bg-[#1e3448]">
          <Image src={dish.image} alt={dish.name} fill sizes="560px" className="object-cover" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/15 flex items-center justify-center text-white hover:bg-black/75 transition-colors"
          >
            <CloseIcon size={16} strokeWidth={2.4} />
          </button>
        </div>
        <div className="p-6 sm:p-7">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#f57f20]">
            {dateLabel}
          </div>
          <h2 className="mt-2 text-[24px] font-black leading-tight tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-[#fdf8ef] via-[#f0e6cf] to-[#d6c8a8] drop-shadow-[0_1px_0_rgba(0,0,0,0.25)] pb-1">
            {dish.name}
          </h2>
          <p className="mt-3 text-[14px] text-[#f5f0e8]/65 leading-relaxed">
            {dish.description}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#f5f0e8]/55">Calories</div>
              <div className="mt-1.5 text-[22px] font-black text-[#f5f0e8] leading-none">
                {cal.toFixed(0)}<span className="text-[11px] font-medium text-[#f5f0e8]/55 ml-1">kcal</span>
              </div>
            </div>
            <div className="rounded-xl px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#f5f0e8]/55">Protein</div>
              <div className="mt-1.5 text-[22px] font-black text-[#f5f0e8] leading-none">
                {protein.toFixed(0)}<span className="text-[11px] font-medium text-[#f5f0e8]/55 ml-1">g</span>
              </div>
            </div>
          </div>
          {(dish.spiceLevel > 0 || dish.allergens.length > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              {dish.spiceLevel > 0 && (
                <div className="inline-flex items-center gap-1.5 text-[12px] text-[#f5f0e8]/70">
                  <span className="text-[11px] uppercase tracking-widest text-[#f5f0e8]/45">Spice</span>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Flame
                      key={i}
                      size={12}
                      strokeWidth={2}
                      className={i < dish.spiceLevel ? 'text-[#f57f20]' : 'text-[#f5f0e8]/20'}
                      fill={i < dish.spiceLevel ? '#f57f20' : 'none'}
                    />
                  ))}
                </div>
              )}
              {dish.allergens.length > 0 && (
                <div className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] uppercase tracking-widest text-[#f5f0e8]/45">Allergens</span>
                  {dish.allergens.map(a => (
                    <span key={a} className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[#f5f0e8]/75 capitalize">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-xl py-3 text-[13px] font-bold uppercase tracking-widest bg-white/[0.06] border border-white/[0.08] text-[#f5f0e8]/85 hover:bg-white/[0.10] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
