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
export const NV  = '#091825'
export const NV2 = '#1e3a4f'
export const CR  = '#ede8da'

// Modal / inset surface — flat, matches the dashboard layout's content rectangle.
// Use this anywhere the cream tone is needed inside a card or popover.
export const BG = '#ede8da'

// ── Typography ────────────────────────────────────────────────────────────────
// Single typeface — Montserrat — for everything. Hierarchy is carried by
// scale + weight + color, not by font swaps.
export const BODY = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

// ── Surface tokens — opacities tuned for AA contrast on light surfaces ────────
export const S = {
  surface2: '#ffffff',                  // solid white card surface
  border:   'rgba(9,24,37,0.09)',
  border2:  'rgba(9,24,37,0.15)',
  fg:       NV,
  fgMuted:  'rgba(9,24,37,0.65)',
  fgSub:    'rgba(9,24,37,0.62)',
  fgFaint:  'rgba(9,24,37,0.45)',
}

// ── Tier surfaces — visual hierarchy through layered weight ───────────────────
// T1 = focal moments (Hero, QuickActions, TodaySpotlight). Stronger surface +
// shadow so the eye lands here first. T2 = supporting info (StatRow tiles,
// PlanProgress, this-week calendar cells) — medium weight. T3 = tertiary /
// preview (next-week cells) — flat, near-flush with the page; recedes so the
// user instantly reads it as "supporting", not "primary".
export const TIER1: CSSProperties = {
  background: '#fcf8ee',
  border: '1px solid rgba(9,24,37,0.10)',
  boxShadow: '0 6px 18px rgba(9,24,37,0.07), 0 1px 3px rgba(9,24,37,0.04)',
}
export const TIER2: CSSProperties = {
  background: '#f8f3e6',
  border: '1px solid rgba(9,24,37,0.07)',
  boxShadow: '0 1px 3px rgba(9,24,37,0.035)',
}
export const TIER3: CSSProperties = {
  background: '#f3eedf',
  border: '1px solid rgba(9,24,37,0.05)',
  boxShadow: 'none',
}
