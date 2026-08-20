'use client'

// Shared visual language for the rider PWA.
//
// Same light ops palette as the kitchen display (owner call: ops surfaces are
// light, see project_kitchen_light_mode), tightened to the dashboard system:
// pill CTAs, uppercase button labels, navy-alpha text ramp instead of slate,
// and the dashboard's semantic green/red instead of Tailwind defaults.
//
// Everything a rider taps is at least 56px tall. He is standing in a stairwell
// holding a stack of tiffin boxes; this file exists so no screen forgets that.

import { useRef } from 'react'

export const OPS = {
  bg:          '#faf8f4',
  card:        '#ffffff',
  navy:        '#091825',
  muted:       'rgba(9,24,37,0.55)',
  faint:       'rgba(9,24,37,0.40)',
  border:      '#e5e2dc',
  orange:      '#f57f20',
  orangeWash:  'rgba(245,127,32,0.08)',
  orangeLine:  'rgba(245,127,32,0.40)',
  success:     '#1d8a30',
  successWash: '#eef6ef',
  successLine: 'rgba(29,138,48,0.35)',
  danger:      '#c0392b',
  dangerWash:  '#fbf1ef',
  dangerLine:  'rgba(192,57,43,0.35)',
  disabled:    '#d8d4cc',
  font:        'var(--font-montserrat), Arial, Helvetica, sans-serif',
} as const

// ─── Pill button — the only CTA shape on this surface ───────────────────────

type PillVariant = 'primary' | 'success' | 'navy' | 'ghost' | 'quiet'

const PILL_BG: Record<PillVariant, string> = {
  primary: OPS.orange,
  success: OPS.success,
  navy:    OPS.navy,
  ghost:   'transparent',
  quiet:   'transparent',
}

export function PillButton({
  variant = 'primary',
  disabled = false,
  onClick,
  children,
  small = false,
  style,
}: {
  variant?: PillVariant
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
  small?: boolean
  style?: React.CSSProperties
}) {
  const ghost = variant === 'ghost' || variant === 'quiet'
  return (
    <button
      onClick={() => { if (!disabled) onClick?.() }}
      disabled={disabled}
      style={{
        width: '100%',
        minHeight: small ? '48px' : '56px',
        borderRadius: '999px',
        border: variant === 'ghost'
          ? `1.5px solid ${disabled ? OPS.disabled : OPS.border}`
          : 'none',
        backgroundColor: disabled && !ghost ? OPS.disabled : PILL_BG[variant],
        color: ghost ? (disabled ? OPS.faint : OPS.navy) : '#ffffff',
        fontSize: small ? '13px' : '14px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        fontFamily: OPS.font,
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '0 20px',
        boxShadow: !disabled && variant === 'primary'
          ? '0 4px 16px rgba(245,127,32,0.35)'
          : 'none',
        transition: 'background-color 150ms, box-shadow 150ms, opacity 150ms',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ─── Big count stepper — the rider's own number, typed or tapped ────────────

export function CountStepper({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const n = parseInt(value, 10)
  const canMinus = !disabled && !isNaN(n) && n > 0

  function bump(delta: number) {
    const cur = isNaN(n) ? 0 : n
    onChange(String(Math.max(0, cur + delta)))
  }

  const roundBtn = (enabled: boolean): React.CSSProperties => ({
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    border: `1.5px solid ${enabled ? OPS.border : OPS.disabled}`,
    backgroundColor: OPS.card,
    color: enabled ? OPS.navy : OPS.faint,
    fontSize: '30px',
    fontWeight: 500,
    fontFamily: OPS.font,
    cursor: enabled ? 'pointer' : 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    flexShrink: 0,
    paddingBottom: '3px',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <button aria-label="One less" onClick={() => canMinus && bump(-1)} disabled={!canMinus} style={roundBtn(canMinus)}>
        &minus;
      </button>
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        min="0"
        value={value}
        placeholder="0"
        disabled={disabled}
        onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        style={{
          width: '124px',
          height: '92px',
          fontSize: '48px',
          fontWeight: 800,
          color: OPS.navy,
          textAlign: 'center',
          border: `2px solid ${OPS.navy}`,
          borderRadius: '20px',
          backgroundColor: OPS.card,
          fontFamily: OPS.font,
          outline: 'none',
        }}
      />
      <button aria-label="One more" onClick={() => !disabled && bump(1)} disabled={disabled} style={roundBtn(!disabled)}>
        +
      </button>
    </div>
  )
}

// ─── Message banner ─────────────────────────────────────────────────────────

type BannerTone = 'info' | 'warn' | 'danger' | 'success'

const BANNER: Record<BannerTone, { bg: string; line: string; title: string }> = {
  info:    { bg: OPS.card,        line: OPS.border,      title: OPS.navy },
  warn:    { bg: OPS.orangeWash,  line: OPS.orangeLine,  title: OPS.navy },
  danger:  { bg: OPS.dangerWash,  line: OPS.dangerLine,  title: OPS.danger },
  success: { bg: OPS.successWash, line: OPS.successLine, title: OPS.success },
}

export function Banner({
  tone,
  title,
  body,
  children,
}: {
  tone: BannerTone
  title: string
  body?: string
  children?: React.ReactNode
}) {
  const c = BANNER[tone]
  return (
    <div
      style={{
        backgroundColor: c.bg,
        border: `1px solid ${c.line}`,
        borderRadius: '20px',
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        fontFamily: OPS.font,
      }}
    >
      <div style={{ fontSize: '15px', fontWeight: 700, color: c.title, lineHeight: 1.3 }}>{title}</div>
      {body && <div style={{ fontSize: '13px', color: OPS.muted, lineHeight: 1.5 }}>{body}</div>}
      {children}
    </div>
  )
}

// ─── Screen heading ─────────────────────────────────────────────────────────

export function ScreenTitle({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string
  title: string
  sub?: string
}) {
  return (
    <div style={{ fontFamily: OPS.font, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {eyebrow && (
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: OPS.orange }}>
          {eyebrow}
        </div>
      )}
      <div style={{ fontSize: '26px', fontWeight: 800, color: OPS.navy, lineHeight: 1.15 }}>{title}</div>
      {sub && <div style={{ fontSize: '14px', color: OPS.muted, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  )
}

// ─── Photo card — shows the shot it wants, and is itself the shutter ────────

export function ShotCard({
  label,
  hint,
  guide,
  shot,
  flagged = false,
  hero = false,
  disabled = false,
  onFile,
  onRemove,
}: {
  label: string
  hint: string
  guide: React.ReactNode
  shot: { url: string } | null
  flagged?: boolean
  /** Full-width layout for the single most important photo of a screen. */
  hero?: boolean
  disabled?: boolean
  onFile: (f: File | undefined) => void
  onRemove?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const open = () => { if (!disabled) inputRef.current?.click() }

  const frame: React.CSSProperties = hero
    ? { width: '100%', aspectRatio: '4 / 3', maxHeight: '38vh' }
    : { width: '104px', height: '78px' }

  const shutter = (
    <button
      onClick={open}
      disabled={disabled}
      aria-label={shot ? `Retake photo of ${label}` : `Photograph ${label}`}
      style={{
        ...frame,
        flexShrink: 0,
        padding: 0,
        border: 'none',
        borderRadius: hero ? '14px' : '10px',
        overflow: 'hidden',
        backgroundColor: '#050d15',
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative',
      }}
    >
      {shot
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={shot.url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : guide}
      {!shot && hero && (
        <span
          style={{
            position: 'absolute', left: 0, right: 0, bottom: '12px',
            fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: '#f5f0e8', fontFamily: OPS.font,
          }}
        >
          Tap to open the camera
        </span>
      )}
    </button>
  )

  return (
    <div
      style={{
        backgroundColor: OPS.card,
        border: flagged ? `2px solid ${OPS.danger}` : `1px solid ${OPS.border}`,
        borderRadius: '20px',
        padding: hero ? '14px' : '12px',
        display: 'flex',
        flexDirection: hero ? 'column' : 'row',
        gap: '12px',
        alignItems: hero ? 'stretch' : 'center',
        fontFamily: OPS.font,
      }}
    >
      {shutter}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: OPS.navy }}>{label}</div>
        <div style={{ fontSize: '12px', color: flagged ? OPS.danger : OPS.muted, marginTop: '2px', lineHeight: 1.4 }}>
          {flagged ? 'Could not be counted. Lay it out flat and shoot it again.' : hint}
        </div>
        <div style={{ display: 'flex', gap: '14px', marginTop: '6px' }}>
          <button
            onClick={open}
            disabled={disabled}
            style={{
              border: 'none', background: 'none', padding: '4px 0', color: OPS.orange,
              fontSize: '13px', fontWeight: 700, fontFamily: OPS.font,
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {shot ? 'Retake' : 'Take photo'}
          </button>
          {onRemove && (
            <button
              onClick={() => !disabled && onRemove()}
              disabled={disabled}
              style={{
                border: 'none', background: 'none', padding: '4px 0', color: OPS.muted,
                fontSize: '13px', fontWeight: 600, fontFamily: OPS.font,
                cursor: disabled ? 'default' : 'pointer',
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f) }}
        style={{ display: 'none' }}
      />
    </div>
  )
}

// ─── Check mark (SVG, not a text glyph) ─────────────────────────────────────

export function Tick({ size = 20, color = '#ffffff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 12.5 L9.8 17.8 L19.5 6.5" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Full-screen success splash ─────────────────────────────────────────────

export function TickSplash({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        backgroundColor: OPS.success,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '16px', padding: '32px', fontFamily: OPS.font,
      }}
    >
      <div className="splash-tick">
        <Tick size={88} />
      </div>
      <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', textAlign: 'center' }}>{title}</div>
      {sub && <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 1.5 }}>{sub}</div>}
      <style jsx>{`
        .splash-tick {
          animation: splashPop 0.35s ease-out forwards;
          transform: scale(0);
        }
        @keyframes splashPop {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .splash-tick { animation: none; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
