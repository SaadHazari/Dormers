import type { CSSProperties } from 'react'

// ── Helpers ───────────────────────────────────────────────────────────────────
// Legacy subscriptions in the DB carry decoration on `plan_name` (e.g.
// "Monthly Premium 💎"). Dashboard text-renders must always pipe through this
// so the surface stays clean — single source of truth across pages.
export function cleanPlanName(s: string): string {
  return s.replace(/\p{Emoji}/gu, '').trim()
}

// ── Brand colors ──────────────────────────────────────────────────────────────
export const OG  = '#f57f20'
export const OG3 = '#ffaa00'
// Deep orange-brown for SMALL text sitting on og-wash / cream surfaces.
// Brand orange #f57f20 only reaches ~2.3:1 contrast there (WCAG AA needs
// 4.5:1); this hits ~6.4:1 while staying in the orange family. Already the
// de-facto convention in the Now tray + wrap banners — keep OG itself for
// large text, fills, gradients and graphics.
export const OG_DEEP = '#8c4214'
export const NV  = '#091825'
export const NV2 = '#1e3a4f'
export const CR  = '#ede8da'

// ── Typography ────────────────────────────────────────────────────────────────
export const BODY    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'
export const DISPLAY = 'var(--font-montserrat), Arial, Helvetica, sans-serif'
export const MONO    = 'var(--font-jetbrains), ui-monospace, monospace'

// ── Surface tokens ────────────────────────────────────────────────────────────
export const BG          = '#ede8da'
export const BG_GRADIENT = 'linear-gradient(160deg, #f5f0e8 0%, #ede8da 60%, #e4dfd6 100%)'

export const S = {
  surface2: '#ffffff',
  border:   'rgba(9,24,37,0.09)',
  border2:  'rgba(9,24,37,0.15)',
  fg:       NV,
  fgMuted:  'rgba(9,24,37,0.65)',
  fgSub:    'rgba(9,24,37,0.62)',
  fgFaint:  'rgba(9,24,37,0.45)',
}

// ── Tier surfaces ─────────────────────────────────────────────────────────────
export const TIER_POP: CSSProperties = {
  background: 'linear-gradient(135deg, #1a3e4f 0%, #091825 100%)',
  border:    '1px solid rgba(26,62,79,0.60)',
  boxShadow: '0 8px 32px rgba(9,24,37,0.22), 0 2px 8px rgba(9,24,37,0.14)',
}

// Text tokens for TIER_POP surfaces (dark navy). These intentionally do NOT
// flip — TIER_POP stays dark navy in light mode too, so cream text is always
// the correct contrast pair.
export const TIER_POP_TEXT = {
  primary: '#f5f0e8',
  muted:   'rgba(245,240,232,0.65)',
  faint:   'rgba(245,240,232,0.40)',
}

export const TIER1: CSSProperties = {
  background: '#fcf8ee',
  border:    '1px solid rgba(9,24,37,0.10)',
  boxShadow: '0 6px 18px rgba(9,24,37,0.07), 0 1px 3px rgba(9,24,37,0.04)',
}

export const TIER2: CSSProperties = {
  background: '#f8f3e6',
  border:    '1px solid rgba(9,24,37,0.07)',
  boxShadow: '0 1px 3px rgba(9,24,37,0.035)',
}

export const TIER3: CSSProperties = {
  background: '#f3eedf',
  border:    '1px solid rgba(9,24,37,0.05)',
  boxShadow: 'none',
}
