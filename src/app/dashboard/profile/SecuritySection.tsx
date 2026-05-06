'use client'

import { useEffect, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Mail, Lock, MessageCircle, ShieldCheck, ShieldAlert, X, ChevronRight, Eye, EyeOff, Check } from 'lucide-react'
import { OG, NV, BG, BODY, S, TIER1 } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'
import {
  requestEmailChange,
  changePassword,
  sendPasswordResetForSelf,
  markWhatsappVerified,
  resendSignupConfirmation,
} from './security-actions'
import { checkPassword, isPasswordStrong } from '@/lib/validation'

// ─── Types ────────────────────────────────────────────────────────────────

type WhatsappStatus = {
  number: string | null
  verified: boolean
}

// ─── Section ──────────────────────────────────────────────────────────────

/**
 * Security & verification card. Three rows: email, password, WhatsApp.
 * Each row shows the current value + a verification badge + a single
 * action that opens the relevant modal. The modals own their own state
 * and call the security-actions server functions on submit.
 */
export function SecuritySection({
  email,
  emailConfirmed,
  whatsapp,
}: {
  email: string
  emailConfirmed: boolean
  whatsapp: WhatsappStatus
}) {
  const [openModal, setOpenModal] = useState<null | 'email' | 'password' | 'whatsapp'>(null)

  return (
    <div style={{
      ...TIER1,
      padding: 24,
      borderRadius: 'var(--radius-md)',
      border: '1.5px solid rgba(58,111,140,0.20)',
      marginBottom: 20,
    }}>
      <Eyebrow color="#3a6f8c">Security &amp; verification</Eyebrow>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 0 }}>
        <SecurityRow
          icon={<Mail size={18} strokeWidth={2} color={NV} />}
          label="Email"
          value={email}
          status={emailConfirmed ? 'verified' : 'unverified'}
          actionLabel={emailConfirmed ? 'Change email' : 'Verify or change'}
          onClick={() => setOpenModal('email')}
        />
        <Divider />
        <SecurityRow
          icon={<Lock size={18} strokeWidth={2} color={NV} />}
          label="Password"
          value="••••••••"
          valueClassName="password-dots"
          status="set"
          actionLabel="Change password"
          onClick={() => setOpenModal('password')}
        />
        <Divider />
        <SecurityRow
          icon={<MessageCircle size={18} strokeWidth={2} color={NV} />}
          label="WhatsApp"
          value={whatsapp.number ?? 'Not set'}
          status={whatsapp.number ? (whatsapp.verified ? 'verified' : 'unverified') : 'unset'}
          actionLabel={whatsapp.verified ? 'Change & re-verify' : 'Verify now'}
          onClick={() => setOpenModal('whatsapp')}
        />
      </div>

      <ChangeEmailModal
        currentEmail={email}
        emailConfirmed={emailConfirmed}
        isOpen={openModal === 'email'}
        onClose={() => setOpenModal(null)}
      />
      <ChangePasswordModal
        isOpen={openModal === 'password'}
        onClose={() => setOpenModal(null)}
      />
      <WhatsappVerifyModal
        currentNumber={whatsapp.number}
        isOpen={openModal === 'whatsapp'}
        onClose={() => setOpenModal(null)}
      />
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(9,24,37,0.07)', margin: '4px 0' }} />
}

function SecurityRow({
  icon, label, value, valueClassName, status, actionLabel, onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  valueClassName?: string
  status: 'verified' | 'unverified' | 'set' | 'unset'
  actionLabel: string
  onClick: () => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '14px 0',
      flexWrap: 'wrap',
    }}>
      <div style={{
        width: 36, height: 36, flexShrink: 0,
        borderRadius: 10,
        background: 'rgba(9,24,37,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{
          fontFamily: BODY, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgMuted,
        }}>{label}</div>
        <div
          className={valueClassName}
          style={{
            marginTop: 4, fontFamily: BODY, fontSize: 14, fontWeight: 600,
            color: NV, wordBreak: 'break-all',
          }}
        >{value}</div>
      </div>
      <StatusBadge status={status} />
      <button
        type="button"
        onClick={onClick}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '8px 14px',
          borderRadius: 999,
          background: '#ffffff',
          border: `1px solid ${S.border2}`,
          color: NV,
          fontFamily: BODY, fontSize: 12, fontWeight: 700,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'background 120ms, border-color 120ms',
        }}
        className="security-action-btn"
      >
        {actionLabel} <ChevronRight size={12} strokeWidth={2.4} />
      </button>

      <style jsx>{`
        .security-action-btn:hover { background: rgba(245,127,32,0.06); border-color: rgba(245,127,32,0.30); }
      `}</style>
      <style jsx global>{`
        /* Password dots — overrides the default 14px row value rendering so
           the obfuscated string reads as a real "this is a password" row at a
           glance, not a near-blank line. Bigger, denser, slightly raised. */
        .password-dots {
          font-size: 22px !important;
          line-height: 1 !important;
          letter-spacing: 0.18em;
          color: #091825 !important;
          /* macOS native password fields render • at ~22px with tight
             tracking; matching that mental model so the row looks like a
             "password" instead of a list of bullet points. */
          transform: translateY(2px);
        }
      `}</style>
    </div>
  )
}

function StatusBadge({ status }: { status: 'verified' | 'unverified' | 'set' | 'unset' }) {
  if (status === 'set') return null // password — no badge needed
  const map = {
    verified:   { bg: 'rgba(29,138,48,0.12)',  fg: '#1d8a30', icon: <ShieldCheck size={11} strokeWidth={2.4} />, label: 'Verified' },
    unverified: { bg: 'rgba(255,170,0,0.16)',  fg: '#a36900', icon: <ShieldAlert size={11} strokeWidth={2.4} />, label: 'Unverified' },
    unset:      { bg: 'rgba(9,24,37,0.06)',    fg: 'rgba(9,24,37,0.55)', icon: <ShieldAlert size={11} strokeWidth={2.4} />, label: 'Not set' },
  }[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px 4px 8px',
      borderRadius: 999,
      background: map.bg, color: map.fg,
      fontFamily: BODY, fontSize: 10.5, fontWeight: 700,
      letterSpacing: 0.6, textTransform: 'uppercase',
      flexShrink: 0,
    }}>{map.icon}{map.label}</span>
  )
}

// ─── Modal shell ──────────────────────────────────────────────────────────

function ModalShell({
  isOpen, onClose, title, subtitle, children,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(9,24,37,0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            style={{
              background: BG,
              borderRadius: 'var(--radius-md)',
              padding: 28,
              maxWidth: 460, width: '100%',
              border: '1px solid rgba(245,127,32,0.20)',
              boxShadow: 'var(--shadow-lg)',
              position: 'relative',
            }}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                position: 'absolute', top: 14, right: 14,
                background: 'none', border: 'none',
                color: S.fgMuted, cursor: 'pointer',
                width: 28, height: 28, borderRadius: 6,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={16} strokeWidth={2.4} />
            </button>
            <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: NV, lineHeight: 1.2, letterSpacing: '-0.01em', paddingRight: 28 }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ marginTop: 8, fontFamily: BODY, fontSize: 13, color: S.fgMuted, lineHeight: 1.6 }}>
                {subtitle}
              </div>
            )}
            <div style={{ marginTop: 18 }}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Shared field & button styles used inside the modals.
const fieldStyle: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 14px',
  borderRadius: 10, border: '1px solid rgba(9,24,37,0.15)',
  background: '#ffffff',
  fontFamily: BODY, fontSize: 13, color: NV,
  outline: 'none',
}
// Password fields get a bigger glyph + wider tracking so the masked dots
// read as a deliberate visual element rather than tiny pinpoints. Same
// token used across login, onboarding, and profile so the user sees a
// consistent password experience everywhere they enter one.
const passwordFieldStyle: React.CSSProperties = {
  ...fieldStyle,
  height: 48,
  fontSize: 18,
  letterSpacing: '0.22em',
  fontFamily: BODY,
  fontWeight: 600,
}
const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 6,
  fontFamily: BODY, fontSize: 11, fontWeight: 700,
  letterSpacing: '0.10em', textTransform: 'uppercase',
  color: S.fgMuted,
}
const primaryBtn = (loading: boolean): React.CSSProperties => ({
  flex: 1, padding: '12px 0',
  borderRadius: 'var(--radius-sm)', border: 'none',
  background: OG, color: '#fff',
  fontFamily: BODY, fontSize: 13, fontWeight: 700,
  letterSpacing: '0.04em', cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.7 : 1,
  boxShadow: '0 0 16px rgba(245,127,32,0.45)',
})
const secondaryBtn = (loading: boolean): React.CSSProperties => ({
  flex: 1, padding: '12px 0',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid rgba(9,24,37,0.15)',
  background: '#ffffff', color: NV,
  fontFamily: BODY, fontSize: 13, fontWeight: 700,
  letterSpacing: '0.04em',
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.6 : 1,
})

function FlashError({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div style={{
      marginTop: 12, padding: '10px 14px',
      borderRadius: 'var(--radius-sm)',
      background: 'rgba(239,68,68,0.06)',
      border: '1px solid rgba(239,68,68,0.18)',
      color: '#9a2828',
      fontFamily: BODY, fontSize: 12, fontWeight: 600, lineHeight: 1.5,
    }}>{msg}</div>
  )
}
function FlashSuccess({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div style={{
      marginTop: 12, padding: '10px 14px',
      borderRadius: 'var(--radius-sm)',
      background: 'rgba(29,138,48,0.08)',
      border: '1px solid rgba(29,138,48,0.22)',
      color: '#176626',
      fontFamily: BODY, fontSize: 12, fontWeight: 600, lineHeight: 1.5,
    }}>{msg}</div>
  )
}

// ─── ChangeEmailModal ─────────────────────────────────────────────────────

function ChangeEmailModal({
  currentEmail, emailConfirmed, isOpen, onClose,
}: {
  currentEmail: string
  emailConfirmed: boolean
  isOpen: boolean
  onClose: () => void
}) {
  const [newEmail, setNewEmail] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [resending, startResend]   = useTransition()

  useEffect(() => {
    if (isOpen) { setNewEmail(''); setError(null); setSuccess(null) }
  }, [isOpen])

  const handleSave = () => {
    setError(null); setSuccess(null)
    startTransition(async () => {
      const res = await requestEmailChange(newEmail)
      if ('error' in res) setError(res.error ?? null)
      else setSuccess(res.message ?? null)
    })
  }

  const handleResendVerification = () => {
    setError(null); setSuccess(null)
    startResend(async () => {
      const res = await resendSignupConfirmation()
      if ('error' in res) setError(res.error ?? null)
      else setSuccess(res.message ?? null)
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={emailConfirmed ? 'Change email' : 'Verify or change email'}
      subtitle={emailConfirmed
        ? `Your account email is currently ${currentEmail}. Enter a new one and confirm via the link we send.`
        : `Your account email ${currentEmail} hasn't been verified yet. Resend the verification link, or replace it with a different address.`}
    >
      {!emailConfirmed && (
        <div style={{ marginBottom: 18 }}>
          <button
            onClick={handleResendVerification}
            disabled={resending || pending}
            style={{
              ...secondaryBtn(resending),
              width: '100%',
              border: '1px solid rgba(58,111,140,0.32)',
              background: 'rgba(58,111,140,0.08)',
              color: '#3a6f8c',
            }}
          >
            {resending ? 'Sending…' : `Resend verification to ${currentEmail}`}
          </button>
        </div>
      )}

      <div>
        <label style={labelStyle}>New email address</label>
        <input
          type="email"
          autoComplete="email"
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder="you@example.com"
          style={fieldStyle}
        />
      </div>

      <FlashError msg={error} />
      <FlashSuccess msg={success} />

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <button onClick={onClose} disabled={pending} style={secondaryBtn(pending)}>Cancel</button>
        <button onClick={handleSave} disabled={pending || !newEmail.trim()} style={primaryBtn(pending)}>
          {pending ? 'Sending…' : 'Send verification'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── ChangePasswordModal ──────────────────────────────────────────────────

function ChangePasswordModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew]         = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [sendingReset, startReset] = useTransition()

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setShowCurrent(false); setShowNew(false); setShowConfirm(false)
      setError(null); setSuccess(null)
    }
  }, [isOpen])

  const newRules = checkPassword(newPassword)
  const newIsStrong = isPasswordStrong(newPassword)
  const confirmMatches = confirmPassword.length > 0 && confirmPassword === newPassword
  const canSubmit = !!currentPassword && newIsStrong && confirmMatches

  const handleSave = () => {
    setError(null); setSuccess(null)
    if (!newIsStrong) { setError('New password doesn’t meet the requirements yet.'); return }
    if (newPassword !== confirmPassword) { setError("New password and confirmation don't match."); return }
    startTransition(async () => {
      const res = await changePassword(currentPassword, newPassword)
      if ('error' in res) setError(res.error ?? null)
      else { setSuccess(res.message ?? null); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('') }
    })
  }

  const handleSendReset = () => {
    setError(null); setSuccess(null)
    startReset(async () => {
      const res = await sendPasswordResetForSelf()
      if ('error' in res) setError(res.error ?? null)
      else setSuccess(res.message ?? null)
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Change password"
      subtitle="Enter your current password to confirm it's you, then choose a new one. Forgot it? We can email a reset link instead."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Current password</label>
          <PasswordInput
            value={currentPassword}
            onChange={setCurrentPassword}
            visible={showCurrent}
            onToggleVisible={() => setShowCurrent(v => !v)}
            autoComplete="current-password"
          />
        </div>
        <div>
          <label style={labelStyle}>New password</label>
          <PasswordInput
            value={newPassword}
            onChange={setNewPassword}
            visible={showNew}
            onToggleVisible={() => setShowNew(v => !v)}
            autoComplete="new-password"
          />
          {/* Live requirement checklist — same five rules as login +
              onboarding, rendered in the dashboard's light theme so the
              ticks match the surrounding card. */}
          {newPassword.length > 0 && (
            <DashboardPasswordChecklist
              rules={newRules}
            />
          )}
        </div>
        <div>
          <label style={labelStyle}>Confirm new password</label>
          <PasswordInput
            value={confirmPassword}
            onChange={setConfirmPassword}
            visible={showConfirm}
            onToggleVisible={() => setShowConfirm(v => !v)}
            autoComplete="new-password"
          />
          {confirmPassword.length > 0 && !confirmMatches && (
            <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 11.5, color: '#9a2828' }}>
              Doesn&rsquo;t match the new password yet.
            </div>
          )}
        </div>
      </div>

      <FlashError msg={error} />
      <FlashSuccess msg={success} />

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <button onClick={onClose} disabled={pending || sendingReset} style={secondaryBtn(pending || sendingReset)}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={pending || sendingReset || !canSubmit} style={primaryBtn(pending)}>
          {pending ? 'Updating…' : 'Update password'}
        </button>
      </div>

      <div style={{ marginTop: 14, textAlign: 'center' }}>
        <button
          onClick={handleSendReset}
          disabled={pending || sendingReset}
          style={{
            background: 'none', border: 'none',
            color: S.fgMuted,
            fontFamily: BODY, fontSize: 12, fontWeight: 600,
            textDecoration: 'underline', textDecorationColor: 'rgba(9,24,37,0.30)',
            textUnderlineOffset: 3,
            cursor: pending || sendingReset ? 'not-allowed' : 'pointer',
          }}
        >
          {sendingReset ? 'Sending reset email…' : 'Forgot it? Email me a reset link'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── PasswordInput + checklist ────────────────────────────────────────────
//
// Shared password input for the dashboard's light theme. Bigger glyph + wider
// tracking on the masked dots so they read as a deliberate visual element,
// plus an inline eye toggle. Matches the password rules used by login +
// onboarding so the customer sees a consistent pattern across the product.

function PasswordInput({
  value, onChange, visible, onToggleVisible, autoComplete,
}: {
  value: string
  onChange: (v: string) => void
  visible: boolean
  onToggleVisible: () => void
  autoComplete: string
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...passwordFieldStyle, paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          width: 32, height: 32, borderRadius: 8,
          background: 'transparent', border: 'none',
          color: S.fgMuted, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {visible
          ? <EyeOff size={16} strokeWidth={2.2} aria-hidden />
          : <Eye    size={16} strokeWidth={2.2} aria-hidden />}
      </button>
    </div>
  )
}

const PASSWORD_RULES_DASHBOARD: { key: keyof ReturnType<typeof checkPassword>; label: string }[] = [
  { key: 'length',  label: 'At least 8 characters' },
  { key: 'upper',   label: 'One uppercase letter' },
  { key: 'lower',   label: 'One lowercase letter' },
  { key: 'number',  label: 'One number' },
  { key: 'special', label: 'One special character' },
]

function DashboardPasswordChecklist({ rules }: { rules: ReturnType<typeof checkPassword> }) {
  return (
    <ul style={{
      margin: '8px 0 0 0', padding: 0, listStyle: 'none',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {PASSWORD_RULES_DASHBOARD.map(r => {
        const ok = rules[r.key]
        return (
          <li key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 14, height: 14, borderRadius: 999,
              background: ok ? '#1d8a30' : '#ffffff',
              border: `1px solid ${ok ? '#1d8a30' : 'rgba(9,24,37,0.18)'}`,
              transition: 'background 150ms, border-color 150ms',
              flexShrink: 0,
            }}>
              {ok && <Check size={9} strokeWidth={3.5} color="#ffffff" />}
            </span>
            <span style={{
              fontFamily: BODY, fontSize: 12,
              color: ok ? NV : S.fgMuted,
              fontWeight: ok ? 600 : 500,
            }}>
              {r.label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ─── WhatsappVerifyModal ──────────────────────────────────────────────────
//
// Two-step: send OTP → enter OTP → mark verified.
// Uses the existing /api/whatsapp/start + /api/whatsapp/check endpoints
// that onboarding already relies on. The final markWhatsappVerified server
// action persists the (now verified) number onto the customer row.

function WhatsappVerifyModal({
  currentNumber, isOpen, onClose,
}: {
  currentNumber: string | null
  isOpen: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [phone, setPhone] = useState(currentNumber ?? '')
  const [code, setCode]   = useState('')
  const [stage, setStage] = useState<'enter' | 'sent'>('enter')
  const [error, setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [sending, startSend]   = useTransition()
  const [verifying, startVerify] = useTransition()

  useEffect(() => {
    if (isOpen) {
      setPhone(currentNumber ?? '')
      setCode(''); setStage('enter'); setError(null); setSuccess(null)
    }
  }, [isOpen, currentNumber])

  const handleSendCode = () => {
    setError(null); setSuccess(null)
    const trimmed = phone.trim()
    if (!/^\+\d{8,15}$/.test(trimmed)) {
      setError('Enter a number with country code, e.g. +971 50 000 0000.')
      return
    }
    startSend(async () => {
      try {
        const res = await fetch('/api/whatsapp/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: trimmed }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          const map: Record<string, string> = {
            invalid_phone:     'Invalid phone number.',
            too_many_requests: 'Too many code requests for this number — try again in an hour.',
            cooldown:          'Wait a moment before requesting another code.',
          }
          setError(map[data.error] ?? 'Could not send code. Try again shortly.')
          return
        }
        setStage('sent')
        setSuccess(`Code sent to ${trimmed} on WhatsApp.`)
      } catch {
        setError('Network error. Check your connection and try again.')
      }
    })
  }

  const handleVerify = () => {
    setError(null); setSuccess(null)
    const trimmed = phone.trim()
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code.'); return }
    startVerify(async () => {
      try {
        const checkRes = await fetch('/api/whatsapp/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: trimmed, code }),
        })
        if (!checkRes.ok) {
          const data = await checkRes.json().catch(() => ({}))
          const map: Record<string, string> = {
            no_active_code:    'Code expired or already used. Request a new one.',
            too_many_attempts: 'Too many wrong attempts. Send a fresh code.',
            invalid_code:      'Wrong code — check the digits and try again.',
          }
          setError(map[data.error] ?? 'Verification failed. Try again.')
          return
        }
        // OTP confirmed in whatsapp_otps. Now persist on customers.
        const persistRes = await markWhatsappVerified(trimmed)
        if ('error' in persistRes) { setError(persistRes.error ?? null); return }
        setSuccess(persistRes.message ?? null)
        // Auto-close after a beat so the user sees the success toast.
        // router.refresh() re-runs the server component (page.tsx) so the
        // new whatsapp_verified status flows back into Profile without a
        // full page reload.
        setTimeout(() => { onClose(); router.refresh() }, 1200)
      } catch {
        setError('Network error. Check your connection and try again.')
      }
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={currentNumber ? 'Change & verify WhatsApp' : 'Verify WhatsApp'}
      subtitle={stage === 'enter'
        ? "Enter the number you'd like delivery messages to come to. We'll send a 6-digit code on WhatsApp."
        : `Enter the 6-digit code we just sent to ${phone}.`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>WhatsApp number</label>
          <input
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+971 50 000 0000"
            disabled={stage === 'sent'}
            style={{ ...fieldStyle, opacity: stage === 'sent' ? 0.65 : 1 }}
          />
        </div>
        {stage === 'sent' && (
          <div>
            <label style={labelStyle}>6-digit code</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              style={{ ...fieldStyle, fontFamily: 'var(--font-jetbrains, ui-monospace, monospace)', fontSize: 16, letterSpacing: '0.30em', textAlign: 'center' }}
            />
          </div>
        )}
      </div>

      <FlashError msg={error} />
      <FlashSuccess msg={success} />

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        {stage === 'enter' ? (
          <>
            <button onClick={onClose} disabled={sending} style={secondaryBtn(sending)}>Cancel</button>
            <button onClick={handleSendCode} disabled={sending || !phone.trim()} style={primaryBtn(sending)}>
              {sending ? 'Sending…' : 'Send code'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => { setStage('enter'); setCode(''); setError(null); setSuccess(null) }}
              disabled={verifying}
              style={secondaryBtn(verifying)}
            >
              Use different number
            </button>
            <button onClick={handleVerify} disabled={verifying || code.length !== 6} style={primaryBtn(verifying)}>
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
          </>
        )}
      </div>

      {stage === 'sent' && (
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button
            onClick={handleSendCode}
            disabled={sending || verifying}
            style={{
              background: 'none', border: 'none',
              color: S.fgMuted,
              fontFamily: BODY, fontSize: 12, fontWeight: 600,
              textDecoration: 'underline', textDecorationColor: 'rgba(9,24,37,0.30)',
              textUnderlineOffset: 3,
              cursor: (sending || verifying) ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? 'Resending…' : 'Resend code'}
          </button>
        </div>
      )}
    </ModalShell>
  )
}
