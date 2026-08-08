'use client'

import { useId, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { useIsLight } from '@/ui-system/hooks/useIsLight'
import { activeOtpIndex, sanitizeOtp } from '@/shared/otp'

// Segmented one-time-code entry.
//
// THE IMPORTANT PART: there is exactly ONE real <input>, stretched invisibly
// across the whole row. The cells underneath are presentational divs that we
// paint the typed digits into.
//
// Do NOT "improve" this into one input per cell. Everything that decides
// whether someone actually gets into their account — pasting the code out of
// WhatsApp, iOS offering the code from Mail via autocomplete="one-time-code",
// screen readers, backspace, text selection — is native browser behaviour of a
// single input. Six inputs means reimplementing all of it by hand, and that
// reimplementation is where segmented OTP components normally break.
//
// Why segmented at all: the code field appears mid-step, after the user has
// already filled the fields above it. Rendered as one more rounded text box it
// reads as something they've already done and gets skipped. A row of cells is
// a visibly different kind of object, so it registers as new.

type Variant = 'auth' | 'dashboard'

// 'auto' follows the app theme via useIsLight(). Pages that hardcode a dark
// palette regardless of the user's OS preference (the referral claim page) MUST
// pass 'dark' explicitly — otherwise a light-theme user gets light cells on a
// dark page. Same trap that bit CtaButton on always-dark surfaces.
type Tone = 'auto' | 'dark' | 'light'

type Palette = {
    cellBg: string
    cellBorder: string
    cellBorderFilled: string
    cellFg: string
    activeBorder: string
    activeGlow: string
}

// The two design systems in this app. `auth` is the Tailwind auth-token world
// (login, onboarding, referral claim); `dashboard` rides the --ds-* CSS custom
// properties used by the profile surfaces. Both are resolved to plain colours
// here so the cells can be styled inline and stay identical in either place.
function paletteFor(variant: Variant, isLight: boolean): Palette {
    if (variant === 'dashboard') {
        return {
            cellBg: 'var(--ds-input-bg)',
            cellBorder: 'var(--ds-input-border)',
            cellBorderFilled: 'var(--ds-input-border)',
            cellFg: 'var(--ds-input-fg)',
            activeBorder: '#f57f20',
            activeGlow: 'rgba(245,127,32,0.12)',
        }
    }
    return isLight
        ? {
            cellBg: 'rgba(255,255,255,0.80)',
            cellBorder: 'rgba(9,24,37,0.12)',
            cellBorderFilled: 'rgba(9,24,37,0.28)',
            cellFg: '#091825',
            activeBorder: '#f57f20',
            activeGlow: 'rgba(245,127,32,0.12)',
        }
        : {
            cellBg: 'rgba(13,32,53,0.80)',
            cellBorder: '#1e3448',
            cellBorderFilled: '#2a4a68',
            cellFg: '#f5f0e8',
            activeBorder: '#f57f20',
            activeGlow: 'rgba(245,127,32,0.14)',
        }
}

export function OtpInput({
    value,
    onChange,
    length = 6,
    label,
    disabled = false,
    verified = false,
    autoFocus = false,
    variant = 'auth',
    tone = 'auto',
    ariaLabel,
    inputRef: externalRef,
}: {
    value: string
    onChange: (next: string) => void
    length?: number
    label?: string
    disabled?: boolean
    verified?: boolean
    autoFocus?: boolean
    variant?: Variant
    /** Force the palette on pages that hardcode one theme. Defaults to following the app theme. */
    tone?: Tone
    ariaLabel?: string
    /** Optional handle to the real input, so callers can re-focus it (e.g. after a resend). */
    inputRef?: React.RefObject<HTMLInputElement | null>
}) {
    const themeIsLight = useIsLight()
    // The dashboard design system is hardcoded light (S.fgMuted etc. are literal
    // light values), so it must not follow the app theme.
    const isLight = tone !== 'auto' ? tone === 'light'
        : variant === 'dashboard' ? true
        : themeIsLight
    const reduceMotion = useReducedMotion()
    const localRef = useRef<HTMLInputElement>(null)
    const inputRef = externalRef ?? localRef
    const [focused, setFocused] = useState(false)
    const inputId = useId()

    const p = paletteFor(variant, isLight)
    const active = activeOtpIndex(value, length)
    const cells = Array.from({ length }, (_, i) => value[i] ?? '')

    // Always park the caret at the end. Without this, tapping the middle of the
    // row drops the caret mid-string and the next keystroke inserts into the
    // middle of the code, which looks like the field silently scrambling input.
    const caretToEnd = () => {
        const el = inputRef.current
        if (!el) return
        const end = el.value.length
        if (el.selectionStart !== end || el.selectionEnd !== end) {
            el.setSelectionRange(end, end)
        }
    }

    // Entry animation is the part that actually solves "I didn't notice it
    // appeared" — motion is caught pre-attentively, colour and shape are not.
    // Honour reduced-motion by rendering it already in place.
    const entry = reduceMotion
        ? { initial: false as const, animate: { opacity: 1, y: 0 } }
        : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 } }

    return (
        <motion.div
            {...entry}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
            {label && (
                <label
                    htmlFor={inputId}
                    className={`block text-[11px] font-bold uppercase tracking-widest mb-1.5 ${
                        isLight ? 'text-[#091825]/65' : 'text-[#f5f0e8]/65'
                    }`}
                >
                    {label}
                </label>
            )}

            <div className="relative" style={{ opacity: disabled ? 0.6 : 1 }}>
                {/* The one real field. Invisible, but full-size and on top so a
                    tap anywhere on the row focuses it. Never use display:none
                    or visibility:hidden here — both make it unfocusable and
                    kill paste and autofill. 16px font-size stops iOS Safari
                    zooming the page on focus. */}
                <input
                    id={inputId}
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={length}
                    value={value}
                    disabled={disabled}
                    aria-label={ariaLabel ?? label ?? 'Verification code'}
                    onChange={e => onChange(sanitizeOtp(e.target.value, length))}
                    onFocus={() => { setFocused(true); caretToEnd() }}
                    onBlur={() => setFocused(false)}
                    onSelect={caretToEnd}
                    onClick={caretToEnd}
                    autoFocus={autoFocus}
                    className="absolute inset-0 z-10 w-full h-full opacity-0 disabled:cursor-not-allowed"
                    style={{ fontSize: 16, caretColor: 'transparent' }}
                />

                <div
                    aria-hidden="true"
                    className="grid gap-1.5 sm:gap-2"
                    style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
                >
                    {cells.map((digit, i) => {
                        const isActive = focused && !verified && i === active
                        const filled = digit !== ''
                        const border = verified ? 'rgba(34,197,94,0.60)'
                            : isActive ? p.activeBorder
                            : filled   ? p.cellBorderFilled
                            :            p.cellBorder
                        return (
                            <div
                                key={i}
                                className="relative flex items-center justify-center rounded-xl border transition-all duration-150"
                                style={{
                                    height: 52,
                                    background: p.cellBg,
                                    borderColor: border,
                                    color: p.cellFg,
                                    boxShadow: isActive
                                        ? `0 0 0 3px ${p.activeGlow}`
                                        : verified
                                            ? '0 0 0 3px rgba(34,197,94,0.10)'
                                            : 'none',
                                }}
                            >
                                <span className="text-[20px] font-mono font-semibold leading-none tabular-nums">
                                    {digit}
                                </span>
                                {/* Blinking caret in the cell that's next up.
                                    Only while empty, so it never sits on top of
                                    a digit the user just typed. */}
                                {isActive && !filled && (
                                    <span
                                        className="absolute w-[2px] h-[22px] rounded-full otp-caret"
                                        style={{ background: p.activeBorder }}
                                    />
                                )}
                            </div>
                        )
                    })}
                </div>

                {verified && (
                    <CheckCircle2
                        size={18}
                        strokeWidth={2.4}
                        className="absolute -right-1 -top-1 text-[#22c55e]"
                    />
                )}
            </div>

            <style jsx global>{`
                @keyframes otpCaretBlink { 0%, 45% { opacity: 1 } 55%, 100% { opacity: 0 } }
                .otp-caret { animation: otpCaretBlink 1.1s steps(1, end) infinite; }
                @media (prefers-reduced-motion: reduce) {
                    .otp-caret { animation: none; opacity: 1; }
                }
            `}</style>
        </motion.div>
    )
}
