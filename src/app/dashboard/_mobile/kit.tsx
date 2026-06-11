'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { OG, OG3, NV, CR, BODY, S } from '../_shared/tokens'

/**
 * _mobile/kit — the shared mobile design vocabulary.
 *
 * The dashboard home (`_mobile/MobileHome.tsx`) was hand-perfected first; this
 * kit is its implemented DNA distilled into reusable atoms so every other
 * `Mobile<Page>` reads as the same surface. Values here are COPIED verbatim
 * from MobileHome — this file is the single source of truth going forward;
 * MobileHome itself stays untouched (optional DRY later).
 *
 * Rules captured (see _mobile/MOBILE-DNA.md):
 *   • one meaning per colour — orange = progress/CTAs, navy = data/text,
 *     green = live status only, gray+hatch = skipped/de-emphasised.
 *   • depth-on-tap: all detail lives one tap down in a MobileSheet.
 *   • no hover-only affordance — every disabled/locked state pairs with an
 *     inline caption (InlineCaption) that says why.
 *   • 44px tap targets, bottom safe-area, 14px column rhythm.
 */

// ── Re-exports so a page does one import ─────────────────────────────────────
export { OG, OG3, OG_DEEP, NV, NV2, CR, BODY, S, cleanPlanName } from '../_shared/tokens'
export { MobileSheet } from '../_shared/MobileSheet'
export { CompactMetricStrip, type CompactMetric } from '../_shared/CompactMetricStrip'
export { computeArrivalLabel, type DeliveryWeekType } from '../_shared/delivery-phase'
export { PlanGlyph } from '../_shared/PlanGlyph'
export { MealTag } from '../_shared/MealTag'
export { HeatBar } from '../_shared/HeatBar'

/**
 * Compact-viewport flag (≤768). Use it to gate behaviour that must NOT fire on
 * desktop even though the mobile tree is still mounted (display:none) — e.g. a
 * sheet whose open-state is SHARED with the desktop tree. Returns false on the
 * server / first paint, then settles on the client (sheets open post-interaction
 * by then, so there's no flash).
 */
export function useIsCompact(): boolean {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setCompact(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return compact
}

// ── Page background + rhythm ─────────────────────────────────────────────────
/** Warm beige base + faint orange breath at the top. The page itself, not a card. */
export const MOBILE_PAGE_BG =
  'radial-gradient(135% 55% at 50% 0%, rgba(245,127,32,0.06) 0%, rgba(245,127,32,0) 58%), linear-gradient(180deg, #efe8dc 0%, #e9e2d5 60%, #e7e0d2 100%)'

/** Orange momentum gradient — progress fill, delivered chips, resume CTA. */
export const ORANGE_GRAD = `linear-gradient(180deg, ${OG} 0%, ${OG3} 100%)`

// ── Surfaces ─────────────────────────────────────────────────────────────────
/** The light content card. Warm cream, roomy radius, one soft lift. */
export const CARD: CSSProperties = {
  background: '#fdfbf6',
  borderRadius: 22,
  boxShadow: '0 1px 2px rgba(9,24,37,0.04), 0 8px 24px -12px rgba(9,24,37,0.16)',
  border: '1px solid rgba(9,24,37,0.05)',
}

/** CARD with a faint-orange "sunset" wash at the bottom edge (caller adds padding). */
export const SUNSET_CARD: CSSProperties = {
  ...CARD,
  background: 'linear-gradient(180deg, #fdfbf6 0%, #fdfbf6 58%, #fdf1e3 100%)',
}

/** Dark TIER_POP hero shell. One per surface — the spotlight. */
export const HERO: CSSProperties = {
  position: 'relative',
  background: 'linear-gradient(150deg, #1f4456 0%, #0c1f2e 62%, #091825 100%)',
  borderRadius: 24,
  padding: 22,
  boxShadow: '0 10px 34px -12px rgba(9,24,37,0.55), 0 2px 6px rgba(9,24,37,0.18)',
  overflow: 'hidden',
}

/** Recessed tile — optional/rewarded items sit a tier DOWN: inset shadow, no
 *  outer lift, faint navy fill that darkens against the warm page. */
export const RECESSED: CSSProperties = {
  backgroundColor: 'rgba(9,24,37,0.045)',
  border: '1px solid rgba(9,24,37,0.08)',
  boxShadow: 'inset 0 1px 2px rgba(9,24,37,0.05)',
  borderRadius: 16,
}

/** Skipped fill — gray base + faint diagonal hatch. Longhand only (never the
 *  `background` shorthand — it would clear backgroundImage). */
export const HATCH: CSSProperties = {
  backgroundColor: 'rgba(9,24,37,0.20)',
  backgroundImage:
    'repeating-linear-gradient(135deg, rgba(253,251,246,0.55) 0px, rgba(253,251,246,0.55) 1.5px, transparent 1.5px, transparent 4px)',
}

// ── Type atoms ───────────────────────────────────────────────────────────────
export const eyebrow: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: S.fgFaint }
export const eyebrowSm: CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgSub }
export const heroEyebrow: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: OG }
export const dateVal: CSSProperties = { fontSize: 14, fontWeight: 800, color: S.fg, marginTop: 4, fontFeatureSettings: '"tnum"' }
export const statLine: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: S.fgMuted }
export const statNum: CSSProperties = { color: S.fg, fontWeight: 800, fontFeatureSettings: '"tnum"' }
export const swatch: CSSProperties = { width: 9, height: 9, borderRadius: 2, flexShrink: 0 }
/** Centered "why" line under a quick-action button. */
export const actionCaption: CSSProperties = { marginTop: 7, fontSize: 11, fontWeight: 600, lineHeight: 1.3, color: S.fgMuted, textAlign: 'center' }

// ── Components ───────────────────────────────────────────────────────────────

/** The page column — single vertical flow, 14px rhythm, Montserrat. */
export function MobileColumn({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: BODY, ...style }}>{children}</div>
}

export type StatusTone = 'active' | 'paused' | 'scheduled' | 'off'

/** Status pill. Green is reserved for the live ACTIVE state; every other state
 *  wears a quiet cream chip so the pill can never lie green again. */
export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  const active = tone === 'active'
  const t = active
    ? { bg: 'rgba(29,138,48,0.16)', bd: 'rgba(29,138,48,0.4)', fg: '#7ee29a', dot: '#37d167' }
    : { bg: 'rgba(245,240,232,0.10)', bd: 'rgba(245,240,232,0.30)', fg: 'rgba(245,240,232,0.82)', dot: 'rgba(245,240,232,0.6)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: t.bg, border: `1px solid ${t.bd}`, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.fg }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: t.dot, boxShadow: active ? '0 0 8px rgba(55,209,103,0.8)' : 'none' }} />
      {label}
    </span>
  )
}

/** Dark hero card. Optional eyebrow (orange, left) + status pill (right) header,
 *  then caller content (HeroTitle, description, meta, actions). */
export function HeroCard({ eyebrow: eb, status, children, style }: { eyebrow?: ReactNode; status?: { label: string; tone: StatusTone }; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ ...HERO, ...style }}>
      {(eb != null || status) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          {eb != null ? <span style={heroEyebrow}>{eb}</span> : <span />}
          {status && <StatusPill label={status.label} tone={status.tone} />}
        </div>
      )}
      {children}
    </section>
  )
}

/** Hero H1 — warm top-lit cream gradient so letters read as lit, not a flat
 *  max-bright blast. 26/700 (deliberately not maxed). Trailing orange period. */
export function HeroTitle({ children, dot = true, style }: { children: ReactNode; dot?: boolean; style?: CSSProperties }) {
  return (
    <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1.18, letterSpacing: '-0.02em', backgroundImage: 'linear-gradient(180deg, #fbf6ec 0%, #f0e6cf 60%, #dccdac 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent', ...style }}>
      {children}
      {dot && <span style={{ color: OG, WebkitTextFillColor: OG, backgroundImage: 'none' }}>.</span>}
    </h1>
  )
}

/** A light section title H2 (sheet/card headings on cream surfaces). Navy ink,
 *  trailing orange period — the dish-sheet headline pattern. */
export function SectionTitle({ children, size = 21, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return (
    <h2 style={{ margin: 0, fontSize: size, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.02em', color: S.fg, ...style }}>
      {children}<span style={{ color: OG }}>.</span>
    </h2>
  )
}

/** Recessed reward/optional tile. Becomes a ≥44px button when onClick is set. */
export function RecessedTile({ children, onClick, ariaLabel, style }: { children: ReactNode; onClick?: () => void; ariaLabel?: string; style?: CSSProperties }) {
  const base: CSSProperties = { ...RECESSED, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textAlign: 'left', fontFamily: BODY, ...style }
  return onClick
    ? <button type="button" onClick={onClick} aria-label={ariaLabel} style={{ ...base, appearance: 'none', cursor: 'pointer' }}>{children}</button>
    : <div style={base}>{children}</div>
}

/** Inline "why" line — the touch substitute for a desktop hover tooltip. Sits
 *  under a control; `onDark` variants for use inside the hero. */
export function InlineCaption({ children, tone = 'muted', icon, style }: { children: ReactNode; tone?: 'muted' | 'accent' | 'onDark' | 'onDarkFaint'; icon?: ReactNode; style?: CSSProperties }) {
  const color =
    tone === 'accent' ? OG
    : tone === 'onDark' ? 'rgba(245,240,232,0.6)'
    : tone === 'onDarkFaint' ? 'rgba(245,240,232,0.5)'
    : S.fgMuted
  return (
    <div style={{ marginTop: 9, fontSize: 11.5, fontWeight: tone === 'accent' ? 700 : 600, lineHeight: 1.3, color, display: 'inline-flex', alignItems: 'center', gap: 5, ...style }}>
      {icon}{children}
    </div>
  )
}

// ── Button factories ─────────────────────────────────────────────────────────

/** Hero buttons — a PAIR of secondary pills on the dark surface. Same cream ink
 *  + visible border so neither looks disabled; only the fill differs. Disabled =
 *  dashed faint outline (the anti-affordance), reason carried by InlineCaption. */
export function heroBtn(kind: 'ghost' | 'outline', disabled = false): CSSProperties {
  const base: CSSProperties = {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '13px 16px', borderRadius: 999, fontFamily: BODY, fontSize: 14, fontWeight: 700,
    letterSpacing: '0.02em', cursor: 'pointer', transition: 'background 150ms, border-color 150ms',
  }
  if (disabled) return { ...base, background: 'rgba(237,232,218,0.04)', color: 'rgba(245,240,232,0.4)', border: '1px dashed rgba(237,232,218,0.26)', cursor: 'default' }
  return kind === 'outline'
    ? { ...base, background: 'rgba(237,232,218,0.14)', color: CR, border: '1px solid rgba(237,232,218,0.42)' }
    : { ...base, background: 'rgba(237,232,218,0.06)', color: CR, border: '1px solid rgba(237,232,218,0.34)' }
}

/** Primary action on the light page — a raised CARD pill, navy ink, orange
 *  icon. Disabled → dashed, no lift. */
export function primaryRaisedBtn(disabled = false): CSSProperties {
  const base: CSSProperties = {
    ...CARD, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    padding: '15px 14px', fontFamily: BODY, fontSize: 13.5, fontWeight: 800, color: NV, cursor: 'pointer',
  }
  if (disabled) return { ...base, color: S.fgFaint, cursor: 'default', boxShadow: 'none', border: '1px dashed rgba(9,24,37,0.18)', background: '#f6f3ec' }
  return base
}

/** Solid navy pill — the sheet's primary CTA ("Got it" / confirm). Full width. */
export const solidNavyBtn: CSSProperties = {
  width: '100%', padding: '13px', borderRadius: 999, background: NV, color: '#fff',
  border: 'none', fontFamily: BODY, fontSize: 14, fontWeight: 800, cursor: 'pointer',
}
